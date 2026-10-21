import { afterEach, beforeEach, expect, it, vi } from "bun:test";
import { eq } from "drizzle-orm";
import {
  actionLog,
  auctionBid,
  auctionListing,
  item,
  notification,
  userData,
  userItem,
} from "@/drizzle/schema";
import { auctionRouter } from "@/server/api/routers/auction";
import type { DrizzleClient } from "@/server/db";
import * as nativePush from "@/server/utils/push/defer";
import { insertItems, insertUserItems, insertUsers } from "../../setup/factories";
import { beforeStatements, failStatements } from "../../setup/statements";
import {
  callerFor,
  callerForDatabase,
  describeWithDatabase,
  getTestDatabase,
  resetTables,
} from "../../setup/testDatabase";

describeWithDatabase("auction bid atomicity", () => {
  beforeEach(async () => {
    vi.spyOn(nativePush, "deferPushToUsers").mockImplementation(() => {});
    await resetTables(actionLog, notification, auctionBid, auctionListing, userItem, item, userData);
    await insertUsers([
      { userId: "seller", level: 50, bank: 1000, reputationPoints: 1000 },
      { userId: "bidder", level: 50, bank: 1000, reputationPoints: 1000 },
      { userId: "rival", level: 50, bank: 1000, reputationPoints: 1000 },
    ]);
    await insertItems([{ id: "lot", name: "Auction lot", canBeTraded: true }]);
    await insertUserItems([{ id: "lot-instance", itemId: "lot", userId: "seller", isInAuction: true }]);
    await (await getTestDatabase()).insert(auctionListing).values({
      id: "auction", sellerId: "seller", userItemId: "lot-instance", listingType: "AUCTION",
      startingPrice: 10, currentPrice: 10, expiresAt: new Date(Date.now() + 3600000),
    });
  });
  afterEach(() => vi.restoreAllMocks());

  const saved = async () => {
    const db = await getTestDatabase();
    const [users, bids, listings, logs, notifications] = await Promise.all([
      db.select().from(userData), db.select().from(auctionBid), db.select().from(auctionListing),
      db.select().from(actionLog), db.select().from(notification),
    ]);
    return { users: Object.fromEntries(users.map((user) => [user.userId, user])), bids, listing: listings[0]!, logs, notifications };
  };
  const seedBid = async (currency: "MONEY" | "REPUTATION" = "MONEY") => {
    const db = await getTestDatabase();
    await db.update(auctionListing).set({ currencyType: currency, currentPrice: 50 }).where(eq(auctionListing.id, "auction"));
    await db.insert(auctionBid).values({ id: "existing", auctionId: "auction", bidderId: "bidder", amount: 50 });
  };

  it.each(["MONEY", "REPUTATION"] as const)("charges a duplicate 50→100 raise only once in %s", async (currency) => {
    await seedBid(currency);
    const api = callerForDatabase(auctionRouter, "bidder", synchronizeAuctionReads(await getTestDatabase()));
    const results = await Promise.all([api.placeBid({ auctionId: "auction", amount: 100 }), api.placeBid({ auctionId: "auction", amount: 100 })]);
    expect(results.filter((result) => result.success)).toHaveLength(1);
    const state = await saved();
    expect(state.users.bidder?.[currency === "MONEY" ? "bank" : "reputationPoints"]).toBe(950);
    expect(state.bids).toHaveLength(1);
    expect(state.bids[0]?.amount).toBe(100);
    expect(state.listing.currentPrice).toBe(100);
    expect(state.logs).toHaveLength(1);
  });

  it("creates one first bid when the same bidder submits different amounts together", async () => {
    const api = callerForDatabase(auctionRouter, "bidder", synchronizeAuctionReads(await getTestDatabase()));
    const results = await Promise.all([api.placeBid({ auctionId: "auction", amount: 100 }), api.placeBid({ auctionId: "auction", amount: 150 })]);
    expect(results.filter((result) => result.success)).toHaveLength(1);
    const state = await saved();
    expect(state.bids).toHaveLength(1);
    expect(state.users.bidder?.bank).toBe(1000 - state.listing.currentPrice);
    expect(state.bids[0]?.amount).toBe(state.listing.currentPrice);
  });

  it("rejects a stale competing bidder without lowering the price or debiting the loser", async () => {
    const db = synchronizeAuctionReads(await getTestDatabase());
    const bidder = callerForDatabase(auctionRouter, "bidder", db);
    const rival = callerForDatabase(auctionRouter, "rival", db);
    const results = await Promise.all([bidder.placeBid({ auctionId: "auction", amount: 100 }), rival.placeBid({ auctionId: "auction", amount: 150 })]);
    expect(results.filter((result) => result.success)).toHaveLength(1);
    const state = await saved();
    expect(state.bids).toHaveLength(1);
    expect(state.bids[0]?.amount).toBe(state.listing.currentPrice);
    expect((state.users.bidder?.bank ?? 0) + (state.users.rival?.bank ?? 0)).toBe(2000 - state.listing.currentPrice);
    expect(state.notifications).toHaveLength(0);
  });

  it("can raise again after refreshing, charging only each increment", async () => {
    await seedBid();
    const api = await callerFor(auctionRouter, "bidder");
    expect(await api.placeBid({ auctionId: "auction", amount: 100 })).toMatchObject({ success: true, amountToDeduct: 50 });
    expect(await api.placeBid({ auctionId: "auction", amount: 150 })).toMatchObject({ success: true, amountToDeduct: 50 });
    const state = await saved();
    expect(state.users.bidder?.bank).toBe(900);
    expect(state.bids).toHaveLength(1);
    expect(state.bids[0]?.amount).toBe(150);
  });

  it.each([auctionBid, actionLog, notification])("rolls back the debit and listing if a later write fails", async (table) => {
    await seedBid();
    const db = await getTestDatabase();
    const failing = wrapTransactions(db, (tx) => failStatements(tx, table));
    const api = callerForDatabase(auctionRouter, "rival", failing);
    await expect(api.placeBid({ auctionId: "auction", amount: 100 })).rejects.toThrow("Statement failed on purpose");
    const state = await saved();
    expect(state.users.rival?.bank).toBe(1000);
    expect(state.listing.currentPrice).toBe(50);
    expect(state.bids).toHaveLength(1);
    expect(state.bids[0]?.amount).toBe(50);
    expect(state.logs).toHaveLength(0);
    expect(state.notifications).toHaveLength(0);
    expect(state.users.bidder?.unreadNotifications).toBe(0);
  });

  it.each(["CANCELLED", "SOLD", "EXPIRED"] as const)("rejects an in-flight bid after the listing becomes %s", async (status) => {
    const db = await getTestDatabase();
    const changed = wrapTransactions(db, (tx) => beforeStatements(tx, auctionListing, [async () => {
      await db.update(auctionListing).set({ status }).where(eq(auctionListing.id, "auction"));
    }]));
    const api = callerForDatabase(auctionRouter, "bidder", changed);
    expect((await api.placeBid({ auctionId: "auction", amount: 100 })).success).toBe(false);
    const state = await saved();
    expect(state.listing.status).toBe(status);
    expect(state.users.bidder?.bank).toBe(1000);
    expect(state.bids).toHaveLength(0);
    expect(state.logs).toHaveLength(0);
  });

  it("does not charge when the seller cancels before the bid claim", async () => {
    const db = await getTestDatabase();
    const seller = await callerFor(auctionRouter, "seller");
    const cancelled = wrapTransactions(db, (tx) => beforeStatements(tx, auctionListing, [async () => {
      expect((await seller.cancelAuction({ auctionId: "auction" })).success).toBe(true);
    }]));
    const api = callerForDatabase(auctionRouter, "bidder", cancelled);
    expect((await api.placeBid({ auctionId: "auction", amount: 100 })).success).toBe(false);
    const state = await saved();
    expect(state.listing.status).toBe("CANCELLED");
    expect(state.users.bidder?.bank).toBe(1000);
    expect(state.bids).toHaveLength(0);
    expect((await db.select().from(userItem))[0]?.isInAuction).toBe(false);
  });

  it("prevents cancellation after a bid commits", async () => {
    const bidder = await callerFor(auctionRouter, "bidder");
    const seller = await callerFor(auctionRouter, "seller");
    expect((await bidder.placeBid({ auctionId: "auction", amount: 100 })).success).toBe(true);
    expect((await seller.cancelAuction({ auctionId: "auction" })).success).toBe(false);
    const state = await saved();
    expect(state.listing.status).toBe("ACTIVE");
    expect(state.bids).toHaveLength(1);
  });

  it("rejects a non-raise even if a stale listing price is below the existing bid", async () => {
    await seedBid();
    const db = await getTestDatabase();
    await db.update(auctionListing).set({ currentPrice: 10 }).where(eq(auctionListing.id, "auction"));
    const api = await callerFor(auctionRouter, "bidder");
    expect((await api.placeBid({ auctionId: "auction", amount: 25 })).success).toBe(false);
    expect((await saved()).users.bidder?.bank).toBe(1000);
  });

  it("cannot publish after the deadline passes between the read and claim", async () => {
    const db = await getTestDatabase();
    const expired = wrapTransactions(db, (tx) => beforeStatements(tx, auctionListing, [async () => {
      await db.update(auctionListing).set({ expiresAt: new Date(0) }).where(eq(auctionListing.id, "auction"));
    }]));
    const api = callerForDatabase(auctionRouter, "bidder", expired);
    expect((await api.placeBid({ auctionId: "auction", amount: 100 })).success).toBe(false);
    expect((await saved()).users.bidder?.bank).toBe(1000);
  });

  it("rolls the listing claim back if the available balance changes", async () => {
    const db = await getTestDatabase();
    const spent = wrapTransactions(db, (tx) => beforeStatements(tx, userData, [async () => {
      await db.update(userData).set({ bank: 0 }).where(eq(userData.userId, "bidder"));
    }]));
    const api = callerForDatabase(auctionRouter, "bidder", spent);
    expect((await api.placeBid({ auctionId: "auction", amount: 100 })).success).toBe(false);
    const state = await saved();
    expect(state.listing.currentPrice).toBe(10);
    expect(state.bids).toHaveLength(0);
    expect(state.users.bidder?.bank).toBe(0);
  });

  it("atomically logs a successful outbid and increments the previous bidder's unread count", async () => {
    await seedBid();
    const api = await callerFor(auctionRouter, "rival");
    expect((await api.placeBid({ auctionId: "auction", amount: 100 })).success).toBe(true);
    const state = await saved();
    expect(state.users.rival?.bank).toBe(900);
    expect(state.users.bidder?.unreadNotifications).toBe(1);
    expect(state.notifications).toHaveLength(1);
    expect(state.notifications[0]?.content).toContain("outbid");
    expect(state.logs).toHaveLength(1);
  });

  it("settles a buyout with the committed raised amount", async () => {
    await seedBid();
    const db = await getTestDatabase();
    await db.update(auctionListing).set({ buyoutPrice: 100 }).where(eq(auctionListing.id, "auction"));
    const api = await callerFor(auctionRouter, "bidder");
    expect((await api.placeBid({ auctionId: "auction", amount: 100 })).success).toBe(true);
    const state = await saved();
    expect(state.listing.status).toBe("SOLD");
    expect(state.users.bidder?.bank).toBe(950);
    expect(state.users.seller?.bank).toBe(1100);
    expect(state.bids[0]).toMatchObject({ amount: 100, status: "WON" });
  });

  it("does not overtake a buyout awaiting settlement", async () => {
    await seedBid();
    const db = await getTestDatabase();
    await db.update(auctionListing).set({ buyoutPrice: 50 }).where(eq(auctionListing.id, "auction"));
    const api = await callerFor(auctionRouter, "rival");
    expect((await api.placeBid({ auctionId: "auction", amount: 100 })).success).toBe(false);
    const state = await saved();
    expect(state.users.rival?.bank).toBe(1000);
    expect(state.listing.currentPrice).toBe(50);
  });
});

/** Both resolvers must finish the same listing snapshot before either can mutate it. */
const synchronizeAuctionReads = (db: DrizzleClient) => {
  let arrivals = 0;
  let release: () => void = () => {};
  const ready = new Promise<void>((resolve) => { release = resolve; });
  return new Proxy(db, {
    get(target, key, receiver) {
      if (key !== "query") return Reflect.get(target, key, receiver);
      return {
        ...target.query,
        auctionListing: {
          ...target.query.auctionListing,
          findFirst: async (...args: Parameters<typeof db.query.auctionListing.findFirst>) => {
            const snapshot = await target.query.auctionListing.findFirst(...args);
            if (++arrivals === 2) release();
            await ready;
            return snapshot;
          },
        },
      };
    },
  }) as DrizzleClient;
};

const wrapTransactions = (db: DrizzleClient, wrap: (tx: DrizzleClient) => DrizzleClient) =>
  new Proxy(db, {
    get(target, key, receiver) {
      if (key !== "transaction") return Reflect.get(target, key, receiver);
      return (work: Parameters<DrizzleClient["transaction"]>[0]) =>
        target.transaction((tx) => work(wrap(tx as unknown as DrizzleClient) as unknown as typeof tx));
    },
  });
