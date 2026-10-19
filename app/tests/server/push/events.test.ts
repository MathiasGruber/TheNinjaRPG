import { afterEach, beforeEach, describe, expect, it, vi } from "bun:test";
import * as Sentry from "@sentry/nextjs";
import * as next from "next/server";
import { completeAuctionInternal } from "@/server/api/routers/auction";
import type { DrizzleClient } from "@/server/db";
import * as push from "@/server/utils/push";
import { notifyWarVillages } from "@/server/utils/push/war";

const deferred: Array<() => unknown> = [];
const send = vi.fn();
const enabled = vi.fn();
beforeEach(() => {
  deferred.length = 0;
  send.mockReset().mockResolvedValue({ sent: 1, failed: 0, expiredTokens: [] });
  enabled.mockReset().mockReturnValue(true);
  vi.spyOn(push, "isPushEnabled").mockImplementation(enabled);
  vi.spyOn(push, "sendPushToUsers").mockImplementation(send);
  vi.spyOn(next, "after").mockImplementation((callback) => {
    deferred.push(callback as () => unknown);
  });
  vi.spyOn(Sentry, "captureException").mockReturnValue("test-event");
});
afterEach(() => vi.restoreAllMocks());

describe("war native alerts", () => {
  it("loads village recipients and fans out only after the response", async () => {
    const where = vi.fn().mockResolvedValue([{ userId: "native-member" }]);
    const selectDistinct = vi.fn(() => ({ from: () => ({ innerJoin: () => ({ where }) }) }));
    const client = { selectDistinct } as unknown as DrizzleClient;
    notifyWarVillages(client, ["attacker", "defender", "attacker"], "war-one");
    expect(selectDistinct).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
    await deferred[0]?.();
    expect(where).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(client, ["native-member"], expect.objectContaining({
      category: "war", url: "/townhall", collapseId: "war-war-one",
    }));
  });
  it("does not schedule empty villages or unconfigured transports", () => {
    const client = {} as DrizzleClient;
    notifyWarVillages(client, [], "one");
    enabled.mockReturnValue(false);
    notifyWarVillages(client, ["village"], "one");
    expect(deferred).toHaveLength(0);
  });
  it("contains roster-read failures without failing the committed game action", async () => {
    const client = { selectDistinct: () => { throw new Error("database unavailable"); } } as unknown as DrizzleClient;
    notifyWarVillages(client, ["village"], "one");
    await deferred[0]?.();
    expect(send).not.toHaveBeenCalled();
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  });
});

describe("auction result native alerts", () => {
  const auction = {
    id: "auction-one", sellerId: "seller", userItemId: "item-one", currencyType: "MONEY",
    bids: [
      { id: "bid-one", bidderId: "winner", amount: 200 },
      { id: "bid-two", bidderId: "refunded", amount: 100 },
    ],
  } as Parameters<typeof completeAuctionInternal>[1];
  it("waits for delivery, seller credit and refund writes before notifying participants", async () => {
    const resolvers: Array<() => void> = [];
    const client = { update: () => ({ set: () => ({
      where: () => new Promise<void>((resolve) => resolvers.push(resolve)),
    }) }) } as unknown as DrizzleClient;
    const finishing = completeAuctionInternal(client, auction);
    expect(deferred).toHaveLength(0);
    for (const resolve of resolvers) resolve();
    expect(await finishing).toEqual(auction.bids[0] ?? null);
    expect(deferred).toHaveLength(1);
    await deferred[0]?.();
    expect(send).toHaveBeenCalledWith(client, ["seller", "winner", "refunded"], expect.objectContaining({
      category: "trade", url: "/auctionhouse", collapseId: "trade-auction-one",
    }));
  });
  it("notifies only the seller for an expired listing with no bids", async () => {
    const client = { update: () => ({ set: () => ({ where: () => Promise.resolve() }) }) } as unknown as DrizzleClient;
    expect(await completeAuctionInternal(client, { ...auction, bids: [] })).toBeNull();
    await deferred[0]?.();
    expect(send.mock.calls[0]?.[1]).toEqual(["seller"]);
  });
  it("does not announce completion when any delivery write fails", async () => {
    const client = { update: () => ({ set: () => ({ where: () => Promise.reject(new Error("write failed")) }) }) } as unknown as DrizzleClient;
    await expect(completeAuctionInternal(client, auction)).rejects.toThrow("write failed");
    expect(deferred).toHaveLength(0);
  });
});
