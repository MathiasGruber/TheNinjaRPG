import { beforeEach, describe, expect, it, spyOn } from "bun:test";
import { eq } from "drizzle-orm";
import { actionLog, item, paypalTransaction, recruitmentRewards, userData, userItem, webStoreBundle, webStoreOrder, storeUserIdAlias } from "@/drizzle/schema";
import { staffRouter, deleteUser } from "@/server/api/routers/staff";
import { paypalRouter, syncTransactions } from "@/server/api/routers/paypal";
import { itemRouter } from "@/server/api/routers/item";
import { authorizeStoreCapture, deliverStoreOrder, reserveStoreOrder } from "@/server/utils/webStore";
import { buyRepsSchema, storeBundleSchema } from "@/validators/points";
import { dynamicMonthlyRepCap } from "@/utils/paypal";
import { insertItems, insertUsers } from "../../setup/factories";
import { callerFor, describeWithDatabase, getTestDatabase, resetTables } from "../../setup/testDatabase";

const contents = {reputationPoints:20, money:500, items:[{id:"store-item",quantity:7}]};
const offer = {name:"Seichi supplies", priceCents:1250, contents};
const capture = (id:string) => ({snapshotId:id, captureId:`capture-${id}`, orderId:`provider-${id}`, invoiceId:id, currency:"USD", value:"12.50", raw:{status:"COMPLETED"}});
const reportingTransaction = (id: string): Parameters<typeof syncTransactions>[1][number] => ({
  transaction_info: {
    transaction_id: capture(id).captureId,
    transaction_initiation_date: new Date().toISOString(),
    transaction_updated_date: new Date().toISOString(),
    paypal_reference_id: capture(id).orderId,
    paypal_reference_id_type: "ODR",
    transaction_event_code: "T0006",
    transaction_subject: offer.name,
    transaction_amount: { currency_code: "USD", value: "12.50" },
    transaction_status: "S",
    custom_field: `store:${id}`,
    invoice_id: id,
  },
  cart_info: { item_details: [] },
});

async function reserve() {
  const result = await reserveStoreOrder(await getTestDatabase(), "buyer", "recipient", offer);
  if (!result.success) throw new Error(result.message);
  return result.order;
}

describe("web store validation", () => {
  it("requires whole custom quantities within checkout bounds", () => {
    for (const value of [NaN, Infinity, 4, 5.5, 1001]) expect(buyRepsSchema.safeParse({reputationPoints:value}).success).toBe(false);
    expect(buyRepsSchema.parse({reputationPoints:73}).reputationPoints).toBe(73);
  });
  it("rejects empty bundles, fractional prices and duplicate items", () => {
    const input = {...offer, description:"Supplies", isActive:false};
    expect(storeBundleSchema.safeParse(input).success).toBe(true);
    expect(storeBundleSchema.safeParse({...input, priceCents:1250.5}).success).toBe(false);
    expect(storeBundleSchema.safeParse({...input, contents:{reputationPoints:0,money:0,items:[]}}).success).toBe(false);
    expect(storeBundleSchema.safeParse({...input, contents:{...contents,items:[...contents.items,...contents.items]}}).success).toBe(false);
  });
});

describeWithDatabase("web store payments", () => {
  beforeEach(async () => {
    await resetTables(webStoreOrder, webStoreBundle, paypalTransaction, recruitmentRewards, userItem, item, userData, actionLog, storeUserIdAlias);
    await insertUsers([{userId:"buyer",username:"Buyer",role:"OWNER", reputationPoints:0, money:0}, {userId:"recipient",username:"Recipient",reputationPoints:0,reputationPointsTotal:0,money:0}]);
    await insertItems([{id:"store-item",name:"Supplies",canStack:true,stackSize:3}]);
  });
  it("delivers the saved snapshot once under concurrent capture retries", async () => {
    const order = await reserve();
    const db = await getTestDatabase();
    await db.insert(webStoreBundle).values({id:"edited", ...offer, description:"changed", isActive:true, contents:{...contents,reputationPoints:999}});
    const results = await Promise.all(Array.from({length:5},() => deliverStoreOrder(db,capture(order.id))));
    expect(results.every(result => result.success)).toBe(true);
    expect(await db.query.userData.findFirst({where:eq(userData.userId,"recipient")})).toMatchObject({reputationPoints:20,reputationPointsTotal:20,money:500});
    expect(await db.query.paypalTransaction.findMany()).toHaveLength(1);
    const items = await db.query.userItem.findMany();
    expect(items.map(item => item.quantity).sort()).toEqual([1,3,3]);
    expect((await db.query.webStoreOrder.findFirst())?.grantedAt).not.toBeNull();
  });
  it("rejects changed amount, currency and invoice without consuming the receipt", async () => {
    const order = await reserve(); const db = await getTestDatabase();
    for (const patch of [{value:"0.01"},{currency:"EUR"},{invoiceId:"another"},{value:"12.50junk"}]) await expect(deliverStoreOrder(db,{...capture(order.id), ...patch})).rejects.toThrow("does not match");
    expect((await db.query.webStoreOrder.findFirst())?.grantedAt).toBeNull();
    expect(await db.query.paypalTransaction.findMany()).toHaveLength(0);
  });
  it("skips store refunds while reconciling valid captures and retries", async () => {
    const db = await getTestDatabase();
    const refunded = await reserve();
    await deliverStoreOrder(db, capture(refunded.id));
    const paid = await reserve();
    const pending = await reserve();
    const refund = reportingTransaction(refunded.id);
    Object.assign(refund.transaction_info, {
      transaction_id: "store-refund",
      paypal_reference_id: capture(refunded.id).captureId,
      paypal_reference_id_type: "TXN",
      transaction_event_code: "T1107",
      transaction_amount: { currency_code: "USD", value: "-12.50" },
    });
    const incomplete = reportingTransaction(pending.id);
    incomplete.transaction_info.transaction_status = "P";
    const batch = [refund, reportingTransaction(paid.id), incomplete];
    expect(await syncTransactions(db, batch, "test-only")).toEqual([
      "Transaction ID store-refund invalid value",
      `${offer.name} delivered`,
    ]);
    expect(await syncTransactions(db, batch, "test-only")).toEqual([
      "Transaction ID store-refund invalid value",
      "Purchase already delivered",
    ]);
    expect(await db.query.userData.findFirst({ where: eq(userData.userId, "recipient") })).toMatchObject({
      reputationPoints: 40, reputationPointsTotal: 40, money: 1000,
    });
    const receipts = await db.query.paypalTransaction.findMany();
    expect(receipts.map(receipt => receipt.transactionId).sort()).toEqual([
      capture(refunded.id).captureId, capture(paid.id).captureId,
    ].sort());
    expect(await db.query.userItem.findMany()).toHaveLength(6);
    expect(await db.query.recruitmentRewards.findMany()).toHaveLength(0);
    expect(await db.query.webStoreOrder.findFirst({ where: eq(webStoreOrder.id, pending.id) })).toMatchObject({ grantedAt: null });
  });
  it("continues to skip negative legacy payments without granting rewards", async () => {
    const db = await getTestDatabase();
    const refund = reportingTransaction("legacy-refund");
    Object.assign(refund.transaction_info, {
      custom_field: "buyer-recipient",
      transaction_event_code: "T1107",
      transaction_amount: { currency_code: "USD", value: "-12.50" },
    });
    await expect(syncTransactions(db, [refund], "test-only")).resolves.toEqual([
      "Transaction ID capture-legacy-refund invalid value",
    ]);
    expect(await db.query.paypalTransaction.findMany()).toHaveLength(0);
    expect(await db.query.userItem.findMany()).toHaveLength(0);
    expect(await db.query.recruitmentRewards.findMany()).toHaveLength(0);
    expect(await db.query.userData.findFirst({ where: eq(userData.userId, "recipient") })).toMatchObject({
      reputationPoints: 0, reputationPointsTotal: 0, money: 0,
    });
  });
  it("rolls back the claim when a recipient disappears, allowing retry", async () => {
    const order = await reserve(); const db = await getTestDatabase();
    await db.delete(userData).where(eq(userData.userId,"recipient"));
    await expect(deliverStoreOrder(db,capture(order.id))).rejects.toThrow("Recipient unavailable");
    expect((await db.query.webStoreOrder.findFirst())?.grantedAt).toBeNull();
    expect(await db.query.userItem.findMany()).toHaveLength(0);
    await insertUsers([{userId:"recipient",username:"Recipient",reputationPoints:0,money:0}]);
    expect((await deliverStoreOrder(db,capture(order.id))).success).toBe(true);
  });
  it("rolls back balances and items if the provider receipt conflicts", async () => {
    const first = await reserve(); const second = await reserve(); const db = await getTestDatabase();
    await deliverStoreOrder(db,capture(first.id));
    await expect(deliverStoreOrder(db,{...capture(second.id),orderId:capture(first.id).orderId})).rejects.toThrow();
    expect(await db.query.userData.findFirst({where:eq(userData.userId,"recipient")})).toMatchObject({reputationPoints:20,money:500});
    expect((await db.query.webStoreOrder.findFirst({where:eq(webStoreOrder.id,second.id)}))?.grantedAt).toBeNull();
    expect(await db.query.userItem.findMany()).toHaveLength(3);
  });
  it("serializes simultaneous reservations against one monthly allowance", async () => {
    const db = await getTestDatabase(); const buyer = await db.query.userData.findFirst({where:eq(userData.userId,"buyer")});
    const cap = dynamicMonthlyRepCap(buyer);
    const large = {...offer,contents:{...contents,reputationPoints:Math.floor(cap*0.6)}};
    const results = await Promise.all(Array.from({length:3},()=>reserveStoreOrder(db,"buyer","recipient",large)));
    expect(results.filter(result => result.success)).toHaveLength(1);
  });
  it("accepts an expired reservation's verified payment and respects paid history", async () => {
    const db = await getTestDatabase(); const order = await reserve();
    await db.update(webStoreOrder).set({expiresAt:new Date(0)}).where(eq(webStoreOrder.id,order.id));
    expect((await deliverStoreOrder(db,capture(order.id))).success).toBe(true);
    const buyer = await db.query.userData.findFirst({where:eq(userData.userId,"buyer")});
    expect((await reserveStoreOrder(db,"buyer","recipient",{...offer,contents:{...contents,reputationPoints:dynamicMonthlyRepCap(buyer)}})).success).toBe(false);
  });
  it("rechecks expired allowance before capture without taking payment", async () => {
    const db = await getTestDatabase(); const old = await reserve();
    await db.update(webStoreOrder).set({expiresAt:new Date(0)}).where(eq(webStoreOrder.id,old.id));
    const buyer = await db.query.userData.findFirst({where:eq(userData.userId,"buyer")});
    await reserveStoreOrder(db,"buyer","recipient",{...offer,contents:{...contents,reputationPoints:dynamicMonthlyRepCap(buyer)}});
    expect(await authorizeStoreCapture(db,old.id,"buyer")).toContain("No payment was captured");
    expect((await db.query.webStoreOrder.findFirst({where:eq(webStoreOrder.id,old.id)}))?.grantedAt).toBeNull();
  });
  it("creates server-priced provider orders and captures/reconciles exactly once", async () => {
    const owner = await callerFor(paypalRouter,"buyer"); const db = await getTestDatabase();
    let provider:any; let captures=0; let requestedRepresentation=false;
    const fetchMock = spyOn(globalThis,"fetch").mockImplementation(async (url,options) => {
      const path=String(url);
      if (path.endsWith("/v1/oauth2/token")) return Response.json({access_token:"test-only"});
      if (path.endsWith("/v2/checkout/orders")) {provider={...JSON.parse(String(options?.body)),id:"TESTORDER123456789",status:"APPROVED"}; return Response.json(provider);}
      if (path.endsWith("/capture")) {captures++;requestedRepresentation=new Headers(options?.headers).get("Prefer")==="return=representation";provider.status="COMPLETED";provider.purchase_units[0].payments={captures:[{id:"CAPTURE1",status:"COMPLETED",amount:provider.purchase_units[0].amount}]};return Response.json({id:provider.id,status:provider.status});}
      return Response.json(provider);
    });
    try {
      const result=await owner.createStoreOrder({recipientId:"recipient",selection:{type:"custom",reputationPoints:73}});
      expect(result.success).toBe(true); expect(provider.purchase_units[0].amount).toEqual({currency_code:"USD",value:"26.80"});
      const firstCapture=await owner.captureStoreOrder({orderId:provider.id});
      expect(firstCapture.success).toBe(true);expect(firstCapture.purchase).toMatchObject({value:26.8,transactionId:"CAPTURE1",currency:"USD"});
      const repeatCapture=await owner.captureStoreOrder({orderId:provider.id});
      expect(repeatCapture.success).toBe(true);expect(repeatCapture.purchase).toBeUndefined();expect(requestedRepresentation).toBe(true);
      expect(captures).toBe(1);
      expect(await db.query.userData.findFirst({where:eq(userData.userId,"recipient")})).toMatchObject({reputationPoints:73});
      expect(await db.query.paypalTransaction.findMany()).toHaveLength(1);
    } finally {fetchMock.mockRestore();}
  });
  it("refuses a mismatched order before calling the provider capture API", async () => {
    const owner = await callerFor(paypalRouter,"buyer"); const order=await reserve(); let captures=0;
    const fetchMock=spyOn(globalThis,"fetch").mockImplementation(async (url) => {
      if (String(url).endsWith("/v1/oauth2/token")) return Response.json({access_token:"test-only"});
      if (String(url).endsWith("/capture")) captures++;
      return Response.json({id:"TESTORDER123456789",status:"APPROVED",purchase_units:[{custom_id:`store:${order.id}`,invoice_id:order.id,amount:{currency_code:"USD",value:"0.01"}}]});
    });
    try {expect((await owner.captureStoreOrder({orderId:"TESTORDER123456789"})).success).toBe(false);expect(captures).toBe(0);} finally {fetchMock.mockRestore();}
  });
  it("refuses to capture after the recipient or bundle items disappear", async () => {
    const owner=await callerFor(paypalRouter,"buyer");const db=await getTestDatabase();const order=await reserve();let captures=0;
    const fetchMock=spyOn(globalThis,"fetch").mockImplementation(async url=>{
      if(String(url).endsWith("/v1/oauth2/token"))return Response.json({access_token:"test-only"});
      if(String(url).endsWith("/capture"))captures++;
      return Response.json({id:"TESTORDER123456789",status:"APPROVED",purchase_units:[{custom_id:`store:${order.id}`,invoice_id:order.id,amount:{currency_code:"USD",value:"12.50"}}]});
    });
    try {
      await db.delete(item).where(eq(item.id,"store-item"));
      expect((await owner.captureStoreOrder({orderId:"TESTORDER123456789"})).success).toBe(false);
      await insertItems([{id:"store-item",name:"Supplies"}]);await db.delete(userData).where(eq(userData.userId,"recipient"));
      expect((await owner.captureStoreOrder({orderId:"TESTORDER123456789"})).success).toBe(false);
      expect(captures).toBe(0);
    }finally{fetchMock.mockRestore();}
  });
  it("allows only the owner to author or inspect hidden offers", async () => {
    const player = await callerFor(paypalRouter,"recipient");
    expect((await player.saveStoreBundle({data:{...offer,description:"",isActive:false}})).success).toBe(false);
    await expect(player.getStoreBundles({includeInactive:true})).rejects.toThrow();
    const owner = await callerFor(paypalRouter,"buyer");
    expect((await owner.saveStoreBundle({data:{...offer,description:"",isActive:false}})).success).toBe(true);
    expect((await player.getStoreBundles()).bundles).toHaveLength(0);
    const catalog = await owner.getStoreBundles({includeInactive:true});
    expect(catalog.bundles).toHaveLength(1);
    expect((await player.prepareStoreOrder({recipientId:"recipient",selection:{type:"bundle",bundleId:catalog.bundles[0]!.id}})).success).toBe(false);
    expect(await dbAuditCount()).toBe(1);
  });
  it("rejects published bundles containing hidden items before opening checkout", async () => {
    const owner = await callerFor(paypalRouter,"buyer"); const db = await getTestDatabase();
    await db.update(item).set({hidden:true}).where(eq(item.id,"store-item"));
    expect((await owner.saveStoreBundle({data:{...offer,description:"",isActive:true,contents:{reputationPoints:0,money:0,items:[{id:"store-item",quantity:1}]}}})).success).toBe(true);
    const bundle = (await owner.getStoreBundles()).bundles[0]!;
    const player = await callerFor(paypalRouter,"recipient");
    const input = {recipientId:"recipient",selection:{type:"bundle" as const,bundleId:bundle.id}};
    const fetchMock = spyOn(globalThis,"fetch").mockImplementation(async () => Response.json({access_token:"test-only",id:"TESTORDER123456789"}));
    try {
      const prepared = await player.prepareStoreOrder(input);
      const created = await player.createStoreOrder(input);
      expect({prepared:prepared.success,created:created.success,providerCalls:fetchMock.mock.calls.length,orders:(await db.query.webStoreOrder.findMany()).length}).toEqual({prepared:false,created:false,providerCalls:0,orders:0});
      expect(prepared.message).toBe("This bundle contains an unavailable item. Contact staff.");
      expect(created.message).toBe(prepared.message);
    } finally {fetchMock.mockRestore();}
  });
  it("rechecks hidden items before capture while preserving completed payment recovery", async () => {
    const owner = await callerFor(paypalRouter,"buyer"); const db = await getTestDatabase();
    await owner.saveStoreBundle({data:{...offer,description:"",isActive:true,contents:{reputationPoints:0,money:0,items:[{id:"store-item",quantity:1}]}}});
    const bundle = (await owner.getStoreBundles()).bundles[0]!;
    const player = await callerFor(paypalRouter,"recipient");
    const inventory = await callerFor(itemRouter,"recipient");
    let provider:any; let captures=0;
    const completePayment = () => {
      provider.status="COMPLETED";
      provider.purchase_units[0].payments={captures:[{id:"HIDDENITEMCAPTURE",status:"COMPLETED",amount:provider.purchase_units[0].amount}]};
    };
    const fetchMock = spyOn(globalThis,"fetch").mockImplementation(async (url,options) => {
      const path=String(url);
      if(path.endsWith("/v1/oauth2/token"))return Response.json({access_token:"test-only"});
      if(path.endsWith("/v2/checkout/orders")){provider={...JSON.parse(String(options?.body)),id:"TESTORDER123456789",status:"APPROVED"};return Response.json(provider);}
      if(path.endsWith("/capture")){captures++;completePayment();}
      return Response.json(provider);
    });
    try {
      expect((await player.createStoreOrder({recipientId:"recipient",selection:{type:"bundle",bundleId:bundle.id}})).success).toBe(true);
      await db.update(item).set({hidden:true}).where(eq(item.id,"store-item"));
      const result=await player.captureStoreOrder({orderId:provider.id});
      expect({success:result.success,captures,receipts:(await db.query.paypalTransaction.findMany()).length,inventoryRows:(await db.query.userItem.findMany()).length,visibleItems:(await inventory.getUserItems()).length,visibleVariants:(await inventory.getUserItemsWithVariants()).length}).toEqual({success:false,captures:0,receipts:0,inventoryRows:0,visibleItems:0,visibleVariants:0});
      expect(result.message).toBe("An item in this checkout is no longer available. No payment was captured.");
      expect(provider.status).toBe("APPROVED");
      completePayment();
      expect((await player.captureStoreOrder({orderId:provider.id})).success).toBe(true);
      expect((await player.captureStoreOrder({orderId:provider.id})).success).toBe(true);
      expect(captures).toBe(0);
      expect(await db.query.paypalTransaction.findMany()).toHaveLength(1);
      expect(await db.query.userItem.findMany()).toHaveLength(1);
      await db.update(item).set({hidden:false}).where(eq(item.id,"store-item"));
      expect(await inventory.getUserItems()).toHaveLength(1);
      expect(await inventory.getUserItemsWithVariants()).toHaveLength(1);
    } finally {fetchMock.mockRestore();}
  });
  it("assigns fresh checkout identities to repeated purchases of a published bundle", async () => {
    const owner = await callerFor(paypalRouter,"buyer");
    await owner.saveStoreBundle({data:{...offer,description:"",isActive:true}});
    const bundle = (await owner.getStoreBundles()).bundles[0]!;
    const orders = await Promise.all(Array.from({length:2},()=>owner.prepareStoreOrder({recipientId:"recipient", selection:{type:"bundle",bundleId:bundle.id}})));
    expect(orders.every(order => order.success)).toBe(true);
    const rows = await (await getTestDatabase()).query.webStoreOrder.findMany();
    expect(new Set(rows.map(row => row.id)).size).toBe(2);
    expect(rows.some(row => row.id === bundle.id)).toBe(false);
  });
  it("rejects AI/banned recipients and unavailable items before payment", async () => {
    const owner = await callerFor(paypalRouter,"buyer"); const db = await getTestDatabase();
    await db.update(userData).set({isAi:true}).where(eq(userData.userId,"recipient"));
    expect((await owner.prepareStoreOrder({recipientId:"recipient",selection:{type:"custom",reputationPoints:20}})).success).toBe(false);
    expect((await owner.saveStoreBundle({data:{...offer,description:"",isActive:true,contents:{...contents,items:[{id:"missing",quantity:1}]}}})).success).toBe(false);
    expect(await db.query.webStoreOrder.findMany()).toHaveLength(0);
  });
  it("keeps pending delivery working after staff repair a recipient's account ID", async () => {
    const db=await getTestDatabase(); const order=await reserve();
    await db.update(userData).set({username:"Terriator"}).where(eq(userData.userId,"buyer"));
    const staff=await callerFor(staffRouter,"buyer");
    expect((await staff.updateUserId({userId:"recipient",newUserId:"recipient-repaired"})).success).toBe(true);
    expect((await deliverStoreOrder(db,capture(order.id))).success).toBe(true);
    expect(await db.query.userData.findFirst({where:eq(userData.userId,"recipient-repaired")})).toMatchObject({reputationPoints:20,money:500});
  });
  it("does not deliver an old checkout to a recreated character after deletion", async () => {
    const db=await getTestDatabase(); const order=await reserve();
    await deleteUser(db,"recipient");
    await insertUsers([{userId:"recipient",username:"Recreated",reputationPoints:0,money:0}]);
    await expect(deliverStoreOrder(db,capture(order.id))).rejects.toThrow("Recipient unavailable");
    expect(await db.query.userData.findFirst({where:eq(userData.userId,"recipient")})).toMatchObject({reputationPoints:0,money:0});
  });
  it("delivers item-only packs and rep-only packs", async () => {
    const db = await getTestDatabase();
    for (const contents of [{reputationPoints:0,money:0,items:[{id:"store-item",quantity:1}]},{reputationPoints:73,money:0,items:[]}]) {
      const result = await reserveStoreOrder(db,"buyer","recipient",{...offer,contents});
      if (!result.success) throw new Error(result.message);
      expect((await deliverStoreOrder(db,capture(result.order.id))).success).toBe(true);
    }
  });
});
const dbAuditCount = async () => (await (await getTestDatabase()).query.actionLog.findMany()).length;
