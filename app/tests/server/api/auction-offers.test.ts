import { beforeEach, expect, it } from "bun:test";
import { eq } from "drizzle-orm";
import { actionLog, auctionOffer, farmCollectionLog, farmPlot, item, userData, userItem, userItemImbuement, storeUserIdAlias } from "@/drizzle/schema";
import { occupationRouter } from "@/server/api/routers/occupation";
import { auctionRouter } from "@/server/api/routers/auction";
import { farmingRouter } from "@/server/api/routers/farming";
import { beforeStatements, failStatements } from "../../setup/statements";
import type { DrizzleClient } from "@/server/db";
import { insertItems, insertUserItems, insertUsers } from "../../setup/factories";
import { callerFor, callerForDatabase, describeWithDatabase, getTestDatabase, resetTables } from "../../setup/testDatabase";

describeWithDatabase("Auction House fixed-term requests and trades", () => {
  beforeEach(async () => {
    await resetTables(storeUserIdAlias, actionLog, auctionOffer, farmCollectionLog, farmPlot, userItemImbuement, userItem, item, userData);
    await insertUsers([
      { userId: "owner", username: "Requester", level: 50, bank: 1000 },
      { userId: "supplier", username: "Supplier", level: 50, bank: 100 },
      { userId: "rival", username: "Rival", level: 50, bank: 100 },
    ]);
    await insertItems([
      { id: "ore", name: "Silver ore", canBeTraded: true, canStack: true, stackSize: 100, auctionMinPrice: 1, auctionMaxPrice: 100 },
      { id: "gem", name: "Unobtanium", canBeTraded: true, canStack: true, stackSize: 100 },
      { id: "sword", name: "Sword", itemType: "WEAPON", canBeTraded: true, canStack: false },
      { id: "bound", name: "Bound material", canBeTraded: false, canStack: true },
    ]);
    await insertUserItems([
      { id: "owner-gems", userId: "owner", itemId: "gem", quantity: 50, activeVariantId: "cosmetic" },
      { id: "supplier-ore", userId: "supplier", itemId: "ore", quantity: 100 },
      { id: "rival-ore", userId: "rival", itemId: "ore", quantity: 100 },
      { id: "supplier-sword", userId: "supplier", itemId: "sword", level: 8, experience: 123, durability: 60, activeVariantId: "cosmetic" },
    ]);
  });

  const postRequest = async (ryo = 300, quantity = 10) => {
    const api = await callerFor(auctionRouter, "owner");
    const result = await api.createAuctionOffer({ offerType: "REQUEST", requestedItemId: "ore", requestedQuantity: quantity, ryo });
    expect(result.success).toBe(true);
    const rows = await (await getTestDatabase()).select().from(auctionOffer);
    return rows[0]!;
  };
  const postTrade = async (quantity = 20, requestedItemId = "ore", requestedQuantity = 10) => {
    const api = await callerFor(auctionRouter, "owner");
    const result = await api.createAuctionOffer({ offerType: "TRADE", requestedItemId, requestedQuantity, offeredUserItemId: "owner-gems", offeredQuantity: quantity });
    expect(result.success).toBe(true);
    const rows = await (await getTestDatabase()).select().from(auctionOffer);
    return rows[0]!;
  };
  const balances = async () => {
    const rows = await (await getTestDatabase()).select().from(userData);
    return Object.fromEntries(rows.map((row) => [row.userId, row.bank]));
  };

  it("reserves a request's bank funds, transfers only the requested quantity and pays once", async () => {
    const offer = await postRequest();
    expect(await balances()).toMatchObject({ owner: 700, supplier: 100 });
    const supplier = await callerFor(auctionRouter, "supplier");
    expect((await supplier.acceptAuctionOffer({ offerId: offer.id, userItemId: "supplier-ore" })).success).toBe(true);
    expect((await supplier.acceptAuctionOffer({ offerId: offer.id, userItemId: "supplier-ore" })).success).toBe(false);
    expect(await balances()).toMatchObject({ owner: 700, supplier: 400 });
    const rows = await (await getTestDatabase()).select().from(userItem).where(eq(userItem.itemId, "ore"));
    expect(rows.find((row) => row.userId === "owner")?.quantity).toBe(10);
    expect(rows.find((row) => row.id === "supplier-ore")?.quantity).toBe(90);
    const logs = await (await getTestDatabase()).select().from(actionLog);
    expect(logs).toHaveLength(2);
  });

  it("refunds cancellation exactly once and requires ownership", async () => {
    const offer = await postRequest();
    const rival = await callerFor(auctionRouter, "rival");
    expect((await rival.cancelAuctionOffer({ offerId: offer.id })).success).toBe(false);
    const owner = await callerFor(auctionRouter, "owner");
    const results = await Promise.all([owner.cancelAuctionOffer({ offerId: offer.id }), owner.cancelAuctionOffer({ offerId: offer.id })]);
    expect(results.filter((result) => result.success)).toHaveLength(1);
    expect((await balances()).owner).toBe(1000);
  });

  it("cannot overspend when two requests compete for the bank balance", async () => {
    const api = await callerFor(auctionRouter, "owner");
    const input = { offerType: "REQUEST" as const, requestedItemId: "ore", requestedQuantity: 10, ryo: 800 };
    const results = await Promise.all([api.createAuctionOffer(input), api.createAuctionOffer(input)]);
    expect(results.filter((result) => result.success)).toHaveLength(1);
    expect((await balances()).owner).toBe(200);
    expect(await (await getTestDatabase()).select().from(auctionOffer)).toHaveLength(1);
  });

  it("two suppliers racing for one request exchange exactly once", async () => {
    const offer = await postRequest();
    const [supplier, rival] = await Promise.all([callerFor(auctionRouter, "supplier"), callerFor(auctionRouter, "rival")]);
    const results = await Promise.all([supplier.acceptAuctionOffer({ offerId: offer.id, userItemId: "supplier-ore" }), rival.acceptAuctionOffer({ offerId: offer.id, userItemId: "rival-ore" })]);
    expect(results.filter((result) => result.success)).toHaveLength(1);
    const bank = await balances();
    expect(bank.owner).toBe(700);
    expect((bank.supplier ?? 0) + (bank.rival ?? 0)).toBe(500);
    const rows = await (await getTestDatabase()).select().from(userItem).where(eq(userItem.itemId, "ore"));
    expect(rows.filter((row) => row.userId === "owner").reduce((sum, row) => sum + row.quantity, 0)).toBe(10);
    expect(rows.reduce((sum, row) => sum + row.quantity, 0)).toBe(200);
  });

  it("accept racing cancellation either refunds or pays, without losing or duplicating value", async () => {
    const offer = await postRequest();
    const [owner, supplier] = await Promise.all([callerFor(auctionRouter, "owner"), callerFor(auctionRouter, "supplier")]);
    const [cancel, accept] = await Promise.all([owner.cancelAuctionOffer({ offerId: offer.id }), supplier.acceptAuctionOffer({ offerId: offer.id, userItemId: "supplier-ore" })]);
    expect(Number(cancel.success) + Number(accept.success)).toBe(1);
    const bank = await balances();
    expect((bank.owner ?? 0) + (bank.supplier ?? 0)).toBe(1100);
    expect(bank.owner).toBe(cancel.success ? 1000 : 700);
    const rows = await (await getTestDatabase()).select().from(userItem).where(eq(userItem.userId, "owner"));
    expect(rows.some((row) => row.itemId === "ore")).toBe(accept.success);
  });

  it("reserves a partial trade stack and transfers both sides while clearing cosmetics", async () => {
    const offer = await postTrade();
    const db = await getTestDatabase();
    const initial = await db.select().from(userItem).where(eq(userItem.userId, "owner"));
    expect(initial.find((row) => row.id === "owner-gems")?.quantity).toBe(30);
    expect(initial.find((row) => row.id === offer.offeredUserItemId)).toMatchObject({ quantity: 20, isInAuction: true, activeVariantId: "cosmetic" });
    const supplier = await callerFor(auctionRouter, "supplier");
    expect((await supplier.acceptAuctionOffer({ offerId: offer.id, userItemId: "supplier-ore" })).success).toBe(true);
    const transferred = await db.select().from(userItem).where(eq(userItem.id, offer.offeredUserItemId!));
    expect(transferred[0]).toMatchObject({ userId: "supplier", quantity: 20, isInAuction: false, activeVariantId: null });
    expect(await balances()).toMatchObject({ owner: 1000, supplier: 100 });
  });

  it("releases the reserved trade stack on cancellation", async () => {
    const offer = await postTrade();
    const owner = await callerFor(auctionRouter, "owner");
    expect((await owner.cancelAuctionOffer({ offerId: offer.id })).success).toBe(true);
    const rows = await (await getTestDatabase()).select().from(userItem).where(eq(userItem.userId, "owner"));
    expect(rows.reduce((sum, row) => sum + row.quantity, 0)).toBe(50);
    expect(rows.every((row) => !row.isInAuction)).toBe(true);
  });

  it("reclaims a trade stack changed by an in-flight farm harvest without accepting changed terms", async () => {
    const db = await getTestDatabase();
    await db.update(item).set({ farmSellValue: 40 }).where(eq(item.id, "gem"));
    await insertItems([{ id: "seed", name: "Seed", canStack: true, isFarmSeed: true, farmYieldItemId: "gem" }]);
    await db.insert(farmPlot).values({ id: "ready-plot", userId: "owner", slotIndex: 0, seedItemId: "seed", plantedAt: new Date(0), finishAt: new Date(0) });
    // Reserve the full stack after harvest snapshots the inventory, before its fill writes.
    const harvestDb = beforeStatements(db, userItem, [() => postTrade(50)]);
    const farmer = callerForDatabase(farmingRouter, "owner", harvestDb);
    expect((await farmer.harvestPlot({ plotId: "ready-plot" })).success).toBe(true);
    const [offer] = await db.select().from(auctionOffer);
    expect(offer?.offeredQuantity).toBe(50);
    expect((await db.select().from(userItem).where(eq(userItem.id, "owner-gems")))[0]).toMatchObject({ quantity: 51, isInAuction: true });
    const supplier = await callerFor(auctionRouter, "supplier");
    expect(await supplier.acceptAuctionOffer({ offerId: offer!.id, userItemId: "supplier-ore" })).toMatchObject({ success: false, message: "Offered item is no longer available" });
    const rival = await callerFor(auctionRouter, "rival");
    expect((await rival.cancelAuctionOffer({ offerId: offer!.id })).success).toBe(false);
    expect((await db.select().from(auctionOffer))[0]?.status).toBe("ACTIVE");
    const owner = await callerFor(auctionRouter, "owner");
    expect((await owner.cancelAuctionOffer({ offerId: offer!.id })).success).toBe(true);
    expect((await owner.cancelAuctionOffer({ offerId: offer!.id })).success).toBe(false);
    expect((await db.select().from(auctionOffer))[0]?.status).toBe("CANCELLED");
    expect((await db.select().from(userItem).where(eq(userItem.id, "owner-gems")))[0]).toMatchObject({ userId: "owner", quantity: 51, isInAuction: false, activeVariantId: "cosmetic" });
    expect((await db.select().from(userItem).where(eq(userItem.id, "supplier-ore")))[0]?.quantity).toBe(100);
    expect(await balances()).toMatchObject({ owner: 1000, supplier: 100, rival: 100 });
    expect(await db.select().from(actionLog)).toHaveLength(2);
  });

  it("can trade materials for equipment while preserving progression, durability and imbuements", async () => {
    const db = await getTestDatabase();
    await db.insert(userItemImbuement).values({ id: "imbuement", userItemId: "supplier-sword", imbuementItemId: "gem", craftingFinishedAt: new Date(0) });
    const offer = await postTrade(50, "sword", 1);
    const supplier = await callerFor(auctionRouter, "supplier");
    expect((await supplier.acceptAuctionOffer({ offerId: offer.id, userItemId: "supplier-sword" })).success).toBe(true);
    const rows = await db.select().from(userItem).where(eq(userItem.id, "supplier-sword"));
    expect(rows[0]).toMatchObject({ userId: "owner", level: 8, experience: 123, durability: 60, activeVariantId: null });
    expect(await db.select().from(userItemImbuement)).toHaveLength(1);
  });

  it("rejects unavailable inventory, insufficient quantities and mismatched items", async () => {
    const offer = await postRequest();
    const db = await getTestDatabase();
    const supplier = await callerFor(auctionRouter, "supplier");
    for (const changes of [{ equipped: "ITEM_1" as const }, { storedAtHome: true }, { isInAuction: true }, { quantity: 9 }, { quantity: -100 }, { craftingFinishedAt: new Date(Date.now() + 60000) }]) {
      await db.update(userItem).set({ equipped: "NONE", storedAtHome: false, isInAuction: false, quantity: 100, craftingFinishedAt: null, ...changes }).where(eq(userItem.id, "supplier-ore"));
      expect((await supplier.acceptAuctionOffer({ offerId: offer.id, userItemId: "supplier-ore" })).success).toBe(false);
    }
    expect((await supplier.acceptAuctionOffer({ offerId: offer.id, userItemId: "supplier-sword" })).success).toBe(false);
    expect((await balances()).supplier).toBe(100);
  });

  it("rejects active imbuements and does not split completed imbuements", async () => {
    const db = await getTestDatabase();
    await db.insert(userItemImbuement).values({ id: "imbuement", userItemId: "owner-gems", imbuementItemId: "ore", craftingFinishedAt: new Date(Date.now() + 60000) });
    const owner = await callerFor(auctionRouter, "owner");
    const input = { offerType: "TRADE" as const, requestedItemId: "ore", requestedQuantity: 1, offeredUserItemId: "owner-gems", offeredQuantity: 20 };
    expect((await owner.createAuctionOffer(input)).success).toBe(false);
    await db.update(userItemImbuement).set({ craftingFinishedAt: new Date(0) }).where(eq(userItemImbuement.id, "imbuement"));
    expect((await owner.createAuctionOffer(input)).success).toBe(false);
  });

  it("rejects self-acceptance, banned accounts and low-level users, but allows refunds", async () => {
    const offer = await postRequest();
    const db = await getTestDatabase();
    const owner = await callerFor(auctionRouter, "owner");
    expect((await owner.acceptAuctionOffer({ offerId: offer.id, userItemId: "owner-gems" })).success).toBe(false);
    const supplier = await callerFor(auctionRouter, "supplier");
    for (const changes of [{ isTradeBanned: true }, { isBanned: true }, { level: 1 }]) {
      await db.update(userData).set({ isTradeBanned: false, isBanned: false, level: 50, ...changes }).where(eq(userData.userId, "supplier"));
      expect((await supplier.acceptAuctionOffer({ offerId: offer.id, userItemId: "supplier-ore" })).success).toBe(false);
    }
    await db.update(userData).set({ isTradeBanned: true }).where(eq(userData.userId, "owner"));
    expect((await owner.cancelAuctionOffer({ offerId: offer.id })).success).toBe(true);
    expect((await balances()).owner).toBe(1000);
  });

  it("enforces tradability, material-only requests, price bounds and stack quantities", async () => {
    const owner = await callerFor(auctionRouter, "owner");
    const input = { offerType: "REQUEST" as const, requestedItemId: "ore", requestedQuantity: 10, ryo: 300 };
    for (const changes of [{ requestedItemId: "bound" }, { requestedItemId: "sword" }, { ryo: 9 }, { ryo: 1001 }]) expect((await owner.createAuctionOffer({ ...input, ...changes })).success).toBe(false);
    expect((await owner.createAuctionOffer({ offerType: "TRADE", requestedItemId: "sword", requestedQuantity: 2, offeredUserItemId: "owner-gems", offeredQuantity: 20 })).success).toBe(false);
    expect(await (await getTestDatabase()).select().from(auctionOffer)).toHaveLength(0);
    expect((await balances()).owner).toBe(1000);
  });

  it("rolls back acceptance if the reserved trade item is no longer tradable", async () => {
    const offer = await postTrade();
    const db = await getTestDatabase();
    await db.update(item).set({ canBeTraded: false }).where(eq(item.id, "gem"));
    const supplier = await callerFor(auctionRouter, "supplier");
    expect((await supplier.acceptAuctionOffer({ offerId: offer.id, userItemId: "supplier-ore" })).success).toBe(false);
    const rows = await db.select().from(userItem).where(eq(userItem.id, "supplier-ore"));
    expect(rows[0]?.quantity).toBe(100);
    expect((await db.select().from(auctionOffer))[0]?.status).toBe("ACTIVE");
  });

  it("rolls back a split, offer claim and payment if delivery fails", async () => {
    const offer = await postTrade();
    const db = await getTestDatabase();
    const failed = new Proxy(db, {
      get(target, key, receiver) {
        if (key === "transaction") return (work: Parameters<DrizzleClient["transaction"]>[0]) => target.transaction((tx) => work(failStatements(tx as DrizzleClient, actionLog) as typeof tx));
        return Reflect.get(target, key, receiver);
      },
    });
    const supplier = callerForDatabase(auctionRouter, "supplier", failed);
    await expect(supplier.acceptAuctionOffer({ offerId: offer.id, userItemId: "supplier-ore" })).rejects.toThrow("Statement failed on purpose");
    expect((await db.select().from(auctionOffer))[0]?.status).toBe("ACTIVE");
    expect(await db.select().from(userItem)).toHaveLength(5);
    expect(await balances()).toMatchObject({ owner: 1000, supplier: 100 });
    expect((await db.select().from(userItem).where(eq(userItem.id, "supplier-ore")))[0]?.quantity).toBe(100);
    expect((await db.select().from(userItem).where(eq(userItem.id, offer.offeredUserItemId ?? "")))[0]?.isInAuction).toBe(true);
  });

  it("rolls back a bank reservation if creating the offer fails", async () => {
    const db = await getTestDatabase();
    const failed = new Proxy(db, {
      get(target, key, receiver) {
        if (key === "transaction") return (work: Parameters<DrizzleClient["transaction"]>[0]) => target.transaction((tx) => work(failStatements(tx as DrizzleClient, auctionOffer) as typeof tx));
        return Reflect.get(target, key, receiver);
      },
    });
    const owner = callerForDatabase(auctionRouter, "owner", failed);
    await expect(owner.createAuctionOffer({ offerType: "REQUEST", requestedItemId: "ore", requestedQuantity: 10, ryo: 300 })).rejects.toThrow("Statement failed on purpose");
    expect((await balances()).owner).toBe(1000);
    expect(await db.select().from(auctionOffer)).toHaveLength(0);
  });

  it("blocks imbuement removal from reserved items", async () => {
    const db = await getTestDatabase();
    await db.insert(userItemImbuement).values({ id: "reserved-imbuement", userItemId: "owner-gems", imbuementItemId: "ore", craftingFinishedAt: new Date(0) });
    await postTrade(50);
    const owner = await callerFor(occupationRouter, "owner");
    expect((await owner.removeImbuement({ userItemImbuementId: "reserved-imbuement" })).success).toBe(false);
    expect(await db.select().from(userItemImbuement)).toHaveLength(1);
  });

  it("rejects a retired account identity while allowing its escrow refund", async () => {
    const offer = await postRequest();
    const db = await getTestDatabase();
    await db.insert(storeUserIdAlias).values([{ oldUserId: "supplier", newUserId: "renamed" }, { oldUserId: "owner", newUserId: "renamed-owner" }]);
    const supplier = await callerFor(auctionRouter, "supplier");
    expect((await supplier.acceptAuctionOffer({ offerId: offer.id, userItemId: "supplier-ore" })).success).toBe(false);
    expect((await db.select().from(auctionOffer))[0]?.status).toBe("ACTIVE");
    const owner = await callerFor(auctionRouter, "owner");
    expect((await owner.cancelAuctionOffer({ offerId: offer.id })).success).toBe(true);
    expect((await balances()).owner).toBe(1000);
  });

  it("filters by requested name, offer type, status, ownership and paginates", async () => {
    await postRequest();
    await postTrade();
    const owner = await callerFor(auctionRouter, "owner");
    expect((await owner.getAuctionOffers({ offerType: "REQUEST", search: "Silver" })).data).toHaveLength(1);
    expect((await owner.getAuctionOffers({ offerType: "REQUEST", search: "no match" })).data).toHaveLength(0);
    const supplier = await callerFor(auctionRouter, "supplier");
    expect((await supplier.getAuctionOffers({ offerType: "REQUEST", onlyMine: true })).data).toHaveLength(0);
    await postRequest();
    const page = await owner.getAuctionOffers({ offerType: "REQUEST", limit: 1 });
    expect(page.nextCursor).toBe(1);
    expect((await owner.getAuctionOffers({ offerType: "REQUEST", limit: 1, cursor: 1 })).nextCursor).toBeNull();
    expect((await owner.getAuctionOffers({ offerType: "REQUEST", status: "SOLD" })).data).toHaveLength(0);
  });
});
