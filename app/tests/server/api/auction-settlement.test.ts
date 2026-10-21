import { afterEach, beforeEach, expect, it, vi } from "bun:test";
import { eq } from "drizzle-orm";
import { actionLog, auctionBid, auctionListing, item, notification, userData, userItem } from "@/drizzle/schema";
import { auctionRouter, completeAuctionInternal } from "@/server/api/routers/auction";
import type { DrizzleClient } from "@/server/db";
import * as nativePush from "@/server/utils/push/defer";
import { insertItems, insertUserItems, insertUsers } from "../../setup/factories";
import { beforeStatements, failStatements } from "../../setup/statements";
import { callerFor, callerForDatabase, describeWithDatabase, getTestDatabase, resetTables } from "../../setup/testDatabase";

describeWithDatabase("auction settlement", () => {
  const queuePush = vi.fn();
  afterEach(() => vi.restoreAllMocks());
  beforeEach(async () => {
    queuePush.mockReset();
    vi.spyOn(nativePush, "deferPushToUsers").mockImplementation(queuePush);
    await resetTables(actionLog, notification, auctionBid, auctionListing, userItem, item, userData);
    // Balances are what remains after the winning 100 and losing 70 are escrowed.
    await insertUsers([
      { userId: "seller", username: "Seller", level: 50, bank: 1000, reputationPoints: 1000 },
      { userId: "winner", username: "Winner", level: 50, bank: 900, reputationPoints: 900 },
      { userId: "loser", username: "Loser", level: 50, bank: 930, reputationPoints: 930 },
    ]);
    await insertItems([{ id: "lot", name: "Auction lot", canBeTraded: true }]);
    await insertUserItems([{ id: "escrow", itemId: "lot", userId: "seller", isInAuction: true, activeVariantId: "seller-skin", storedAtHome: true, homeX: 2, homeY: 3, homeRotation: 90 }]);
  });

  const seedAuction = async (currencyType: "MONEY" | "REPUTATION", withBids = true, isExpired = true) => {
    const db = await getTestDatabase();
    await db.insert(auctionListing).values({ id: "auction", sellerId: "seller", userItemId: "escrow", listingType: "AUCTION", startingPrice: 1, currentPrice: withBids ? 100 : 1, buyoutPrice: 150, currencyType, expiresAt: new Date(Date.now() + (isExpired ? -60000 : 60000)) });
    if (withBids) await db.insert(auctionBid).values([
      { id: "winning-bid", auctionId: "auction", bidderId: "winner", amount: 100 },
      { id: "losing-bid", auctionId: "auction", bidderId: "loser", amount: 70 },
    ]);
  };

  const balances = async (currency: "bank" | "reputationPoints") => Object.fromEntries(
    (await (await getTestDatabase()).select().from(userData)).map((user) => [user.userId, user[currency]]),
  );

  for (const currency of ["MONEY", "REPUTATION"] as const) {
    const balance = currency === "MONEY" ? "bank" : "reputationPoints";
    it(`settles concurrent cron and explicit completions once in ${currency}`, async () => {
      await seedAuction(currency);
      const db = await getTestDatabase();
      const api = await callerFor(auctionRouter, "seller");
      const results = await Promise.all([
        completeAuctionInternal(db, "auction"),
        api.completeAuction({ auctionId: "auction" }),
      ]);
      expect(results.filter((result) => result.success)).toHaveLength(1);
      expect(results.filter((result) => !result.success)).toHaveLength(1);
      expect(await balances(balance)).toEqual({ seller: 1100, winner: 900, loser: 1000 });
      expect((await db.select().from(auctionListing))[0]).toMatchObject({ status: "SOLD", buyerId: "winner" });
      expect((await db.select().from(userItem))[0]).toMatchObject({ userId: "winner", isInAuction: false, activeVariantId: null, storedAtHome: false, homeX: null, homeY: null, homeRotation: 0 });
      expect((await db.select().from(auctionBid).where(eq(auctionBid.id, "winning-bid")))[0]?.status).toBe("WON");
      expect((await db.select().from(auctionBid).where(eq(auctionBid.id, "losing-bid")))[0]?.status).toBe("REFUNDED");
      expect(queuePush).toHaveBeenCalledTimes(1);
      expect((await completeAuctionInternal(db, "auction")).success).toBe(false);
      expect(await balances(balance)).toEqual({ seller: 1100, winner: 900, loser: 1000 });
    });

    it(`rolls back delivery, credits and the listing claim if a later ${currency} write fails`, async () => {
      await seedAuction(currency);
      const db = await getTestDatabase();
      const failed = new Proxy(db, {
        get(target, key, receiver) {
          if (key === "transaction") return (work: Parameters<DrizzleClient["transaction"]>[0]) => target.transaction((tx) => work(failStatements(tx as DrizzleClient, auctionBid) as typeof tx));
          return Reflect.get(target, key, receiver);
        },
      });
      await expect(completeAuctionInternal(failed, "auction")).rejects.toThrow("Statement failed on purpose");
      expect(await balances(balance)).toEqual({ seller: 1000, winner: 900, loser: 930 });
      expect((await db.select().from(auctionListing))[0]?.status).toBe("ACTIVE");
      expect((await db.select().from(userItem))[0]).toMatchObject({ userId: "seller", isInAuction: true, activeVariantId: "seller-skin", storedAtHome: true });
      expect((await db.select().from(auctionBid)).every((bid) => bid.status === "ACTIVE")).toBe(true);
      expect(queuePush).not.toHaveBeenCalled();
      expect((await completeAuctionInternal(db, "auction")).success).toBe(true);
      expect(await balances(balance)).toEqual({ seller: 1100, winner: 900, loser: 1000 });
    });

    it(`rolls back the buyout debit, bid, log and notification if ${currency} delivery fails`, async () => {
      await seedAuction(currency, true, false);
      const db = await getTestDatabase();
      const failed = wrapTransactions(db, (tx) => failStatements(tx, userItem));
      const buyer = callerForDatabase(auctionRouter, "loser", failed);
      await expect(buyer.placeBid({ auctionId: "auction", amount: 150 })).rejects.toThrow("Statement failed on purpose");
      expect(await balances(balance)).toEqual({ seller: 1000, winner: 900, loser: 930 });
      expect((await db.select().from(auctionListing))[0]).toMatchObject({ status: "ACTIVE", currentPrice: 100 });
      expect((await db.select().from(auctionBid).where(eq(auctionBid.id, "losing-bid")))[0]).toMatchObject({ status: "ACTIVE", amount: 70 });
      expect((await db.select().from(userItem))[0]).toMatchObject({ userId: "seller", isInAuction: true });
      expect(await db.select().from(actionLog)).toHaveLength(0);
      expect(await db.select().from(notification)).toHaveLength(0);
      expect(queuePush).not.toHaveBeenCalled();
    });

    it(`commits one of two simultaneous buyout bids in ${currency}`, async () => {
      await seedAuction(currency, true, false);
      const db = await getTestDatabase();
      let arrivals = 0;
      let release!: () => void;
      const ready = new Promise<void>((resolve) => { release = resolve; });
      const synchronized = new Proxy(db, {
        get(target, key, receiver) {
          if (key !== "transaction") return Reflect.get(target, key, receiver);
          return async (work: Parameters<DrizzleClient["transaction"]>[0]) => {
            if (++arrivals === 2) release();
            await ready;
            return target.transaction(work);
          };
        },
      });
      const winner = callerForDatabase(auctionRouter, "winner", synchronized);
      const loser = callerForDatabase(auctionRouter, "loser", synchronized);
      const results = await Promise.all([
        winner.placeBid({ auctionId: "auction", amount: 150 }),
        loser.placeBid({ auctionId: "auction", amount: 180 }),
      ]);
      expect(results.filter((result) => result.success)).toHaveLength(1);
      const [listing] = await db.select().from(auctionListing);
      expect(listing?.status).toBe("SOLD");
      expect(await balances(balance)).toEqual(listing?.buyerId === "winner"
        ? { seller: 1150, winner: 850, loser: 1000 }
        : { seller: 1180, winner: 1000, loser: 820 });
      expect(queuePush).toHaveBeenCalledTimes(1);
    });

    it(`serializes buyout against expiration in ${currency}`, async () => {
      await seedAuction(currency);
      const db = await getTestDatabase();
      await db.update(auctionBid).set({ amount: 150 }).where(eq(auctionBid.id, "winning-bid"));
      const results = await Promise.all([
        completeAuctionInternal(db, "auction", "winner"),
        completeAuctionInternal(db, "auction"),
      ]);
      expect(results.filter((result) => result.success)).toHaveLength(1);
      expect(await balances(balance)).toEqual({ seller: 1150, winner: 900, loser: 1000 });
      expect(queuePush).toHaveBeenCalledTimes(1);
    });
  }

  it("expires a no-bid listing only once and returns the seller's item", async () => {
    await seedAuction("MONEY", false);
    const db = await getTestDatabase();
    const results = await Promise.all([completeAuctionInternal(db, "auction"), completeAuctionInternal(db, "auction")]);
    expect(results.filter((result) => result.success)).toHaveLength(1);
    expect((await db.select().from(auctionListing))[0]).toMatchObject({ status: "EXPIRED", buyerId: null });
    expect((await db.select().from(userItem))[0]).toMatchObject({ userId: "seller", isInAuction: false, activeVariantId: "seller-skin" });
    expect(await balances("bank")).toEqual({ seller: 1000, winner: 900, loser: 930 });
  });

  it("rolls back a no-bid expiration when releasing the item fails", async () => {
    await seedAuction("MONEY", false);
    const db = await getTestDatabase();
    const failed = new Proxy(db, {
      get(target, key, receiver) {
        if (key === "transaction") return (work: Parameters<DrizzleClient["transaction"]>[0]) => target.transaction((tx) => work(failStatements(tx as DrizzleClient, userItem) as typeof tx));
        return Reflect.get(target, key, receiver);
      },
    });
    await expect(completeAuctionInternal(failed, "auction")).rejects.toThrow("Statement failed on purpose");
    expect((await db.select().from(auctionListing))[0]?.status).toBe("ACTIVE");
    expect((await db.select().from(userItem))[0]?.isInAuction).toBe(true);
    expect(queuePush).not.toHaveBeenCalled();
  });

  it("does not settle inconsistent bid escrow", async () => {
    await seedAuction("MONEY");
    const db = await getTestDatabase();
    await db.update(auctionBid).set({ status: "REFUNDED" }).where(eq(auctionBid.id, "losing-bid"));
    expect((await completeAuctionInternal(db, "auction")).success).toBe(false);
    expect((await db.select().from(auctionListing))[0]?.status).toBe("ACTIVE");
    expect(await balances("bank")).toEqual({ seller: 1000, winner: 900, loser: 930 });
    expect(queuePush).not.toHaveBeenCalled();
  });

  it("retries a deadlock only after rolling back the entire settlement", async () => {
    await seedAuction("MONEY");
    const db = await getTestDatabase();
    let attempts = 0;
    const retrying = new Proxy(db, {
      get(target, key, receiver) {
        if (key === "transaction") return (work: Parameters<DrizzleClient["transaction"]>[0]) => {
          attempts++;
          return target.transaction((tx) => work(beforeStatements(tx as DrizzleClient, auctionBid, [async () => {
            if (attempts === 1) throw new Error("Deadlock found when trying to get lock");
          }]) as typeof tx));
        };
        return Reflect.get(target, key, receiver);
      },
    });
    expect((await completeAuctionInternal(retrying, "auction")).success).toBe(true);
    expect(attempts).toBe(2);
    expect(await balances("bank")).toEqual({ seller: 1100, winner: 900, loser: 1000 });
    expect(queuePush).toHaveBeenCalledTimes(1);
  });

  it("rejects an in-flight buyout if expiration settles before its listing claim", async () => {
    await seedAuction("MONEY", true, false);
    const db = await getTestDatabase();
    const expired = wrapTransactions(db, (tx) => beforeStatements(tx, auctionListing, [async () => {
      await db.update(auctionListing).set({ expiresAt: new Date(0) }).where(eq(auctionListing.id, "auction"));
      expect((await completeAuctionInternal(db, "auction")).success).toBe(true);
    }]));
    const buyer = callerForDatabase(auctionRouter, "loser", expired);
    expect((await buyer.placeBid({ auctionId: "auction", amount: 150 })).success).toBe(false);
    expect(await balances("bank")).toEqual({ seller: 1100, winner: 900, loser: 1000 });
    expect((await db.select().from(auctionListing))[0]).toMatchObject({ status: "SOLD", buyerId: "winner" });
    expect(queuePush).toHaveBeenCalledTimes(1);
  });

  it("rejects early completion and invalid buyouts without consuming the claim", async () => {
    await seedAuction("MONEY", true, false);
    const db = await getTestDatabase();
    expect((await completeAuctionInternal(db, "auction")).success).toBe(false);
    expect((await completeAuctionInternal(db, "auction", "loser")).success).toBe(false);
    expect((await completeAuctionInternal(db, "auction", "winner")).success).toBe(false);
    expect((await db.select().from(auctionListing))[0]?.status).toBe("ACTIVE");
    expect(queuePush).not.toHaveBeenCalled();
  });

  it("rolls back when the reserved item or a refund account has disappeared", async () => {
    await seedAuction("MONEY");
    const db = await getTestDatabase();
    await db.update(userItem).set({ isInAuction: false }).where(eq(userItem.id, "escrow"));
    expect((await completeAuctionInternal(db, "auction")).success).toBe(false);
    await db.update(userItem).set({ isInAuction: true }).where(eq(userItem.id, "escrow"));
    await db.delete(userData).where(eq(userData.userId, "loser"));
    expect((await completeAuctionInternal(db, "auction")).success).toBe(false);
    expect((await db.select().from(auctionListing))[0]?.status).toBe("ACTIVE");
    expect((await db.select().from(userItem))[0]).toMatchObject({ userId: "seller", isInAuction: true });
    expect((await balances("bank")).seller).toBe(1000);
    expect(queuePush).not.toHaveBeenCalled();
  });
});

const wrapTransactions = (db: DrizzleClient, wrap: (tx: DrizzleClient) => DrizzleClient) =>
  new Proxy(db, {
    get(target, key, receiver) {
      if (key !== "transaction") return Reflect.get(target, key, receiver);
      return (work: Parameters<DrizzleClient["transaction"]>[0]) =>
        target.transaction((tx) => work(wrap(tx as unknown as DrizzleClient) as unknown as typeof tx));
    },
  });
