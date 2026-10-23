import { afterEach, beforeEach, expect, it, spyOn } from "bun:test";
import { eq } from "drizzle-orm";
import * as headers from "next/headers";
import { GET } from "@/app/api/transactions/route";
import { paypalTransaction, recruitmentRewards, userData, webStoreOrder } from "@/drizzle/schema";
import * as gamesettings from "@/libs/gamesettings";
import type { syncTransactions } from "@/server/api/routers/paypal";
import { reserveStoreOrder } from "@/server/utils/webStore";
import { dollars2reps } from "@/utils/paypal";
import { insertUsers } from "../../../setup/factories";
import { resetServerModuleStubs, stubCronAuth } from "../../../setup/serverModules";
import { describeWithDatabase, getTestDatabase, resetTables } from "../../../setup/testDatabase";

describeWithDatabase("PayPal transaction reconciliation", () => {
  const spies: { mockRestore: () => void }[] = [];
  beforeEach(async () => {
    await resetTables(webStoreOrder, paypalTransaction, recruitmentRewards, userData);
    stubCronAuth(() => null);
    spies.push(spyOn(headers, "cookies").mockResolvedValue({} as never));
    spies.push(spyOn(gamesettings, "lockWithGameTimer").mockResolvedValue(false));
  });
  afterEach(() => {
    for (const spy of spies.splice(0)) spy.mockRestore();
    resetServerModuleStubs();
  });

  it("keeps failed deliveries in the report while processing other payments and referrals once", async () => {
    const db = await getTestDatabase();
    await insertUsers([
      { userId: "recruiter", username: "Recruiter", reputationPoints: 0, reputationPointsTotal: 0 },
      { userId: "buyer", username: "Buyer", reputationPoints: 0, reputationPointsTotal: 0, recruiterId: "recruiter", createdAt: new Date(Date.now() - 86400_000) },
      { userId: "recipient", username: "Recipient", reputationPoints: 0, reputationPointsTotal: 0, money: 0 },
      { userId: "missing", username: "Missing" },
    ]);
    const offer = { name: "Supplies", priceCents: 1250, contents: { reputationPoints: 20, money: 500, items: [] } };
    const failed = await reserveStoreOrder(db, "buyer", "missing", offer);
    const paid = await reserveStoreOrder(db, "buyer", "recipient", offer);
    if (!failed.success || !paid.success) throw new Error("Checkout reservation failed");
    await db.delete(userData).where(eq(userData.userId, "missing"));
    const transactions: Parameters<typeof syncTransactions>[1] = [failed.order.id, paid.order.id, "legacy"].map(id => ({
      transaction_info: {
        transaction_id: `capture-${id}`,
        transaction_initiation_date: new Date().toISOString(),
        transaction_updated_date: new Date().toISOString(),
        paypal_reference_id: `provider-${id}`,
        paypal_reference_id_type: "ODR",
        transaction_event_code: "T0006",
        transaction_subject: offer.name,
        transaction_amount: { currency_code: "USD", value: "12.50" },
        transaction_status: "S",
        custom_field: id === "legacy" ? "buyer-buyer" : `store:${id}`,
        invoice_id: id,
      },
      cart_info: { item_details: [] },
    }));
    spies.push(spyOn(globalThis, "fetch").mockImplementation(async url => {
      if (String(url).endsWith("/v1/oauth2/token")) return Response.json({ access_token: "test-only" });
      return Response.json({ transaction_details: transactions });
    }));

    const response = await GET(new Request("https://example.com/api/transactions"));
    expect(response.status).toBe(200);
    const report = await response.json();
    expect(report).toContain(`Transaction ID capture-${failed.order.id}: Recipient unavailable.`);
    expect(report).toContain("Supplies delivered");
    expect(report).toContain("Transaction ID capture-legacy synced!");
    expect(report).toContain("Add 2 ref reps");
    const referralReps = 2 + Math.floor(dollars2reps(12.5) * 0.1);
    expect(await db.query.userData.findFirst({ where: eq(userData.userId, "recruiter") })).toMatchObject({ reputationPoints: referralReps, reputationPointsTotal: referralReps });
    expect(await db.query.userData.findFirst({ where: eq(userData.userId, "recipient") })).toMatchObject({ reputationPoints: 20, reputationPointsTotal: 20, money: 500 });
    expect(await db.query.userData.findFirst({ where: eq(userData.userId, "buyer") })).toMatchObject({ reputationPoints: dollars2reps(12.5) });
    expect(await db.query.paypalTransaction.findMany()).toHaveLength(4);
    expect(await db.query.recruitmentRewards.findMany()).toHaveLength(2);
    expect(await db.query.webStoreOrder.findFirst({ where: eq(webStoreOrder.id, failed.order.id) })).toMatchObject({ grantedAt: null, captureId: null });

    const retry = await GET(new Request("https://example.com/api/transactions"));
    expect(retry.status).toBe(200);
    expect(await retry.json()).toBe(`OK. Transaction ID capture-${failed.order.id}: Recipient unavailable. Contact support with your payment receipt., Purchase already delivered, Transaction ID capture-legacy already processed`);
    expect(await db.query.userData.findFirst({ where: eq(userData.userId, "recruiter") })).toMatchObject({ reputationPoints: referralReps, reputationPointsTotal: referralReps });
    expect(await db.query.paypalTransaction.findMany()).toHaveLength(4);
    expect(await db.query.recruitmentRewards.findMany()).toHaveLength(2);
  });
});
