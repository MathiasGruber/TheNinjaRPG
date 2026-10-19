import { afterEach, beforeEach, describe, expect, it, vi } from "bun:test";
import * as next from "next/server";
import { createConvo } from "@/server/api/routers/comments";
import type { DrizzleClient } from "@/server/db";
import { Pusher } from "@/libs/pusher";
import { getRaidChatConversationId } from "@/libs/raids";
import * as push from "@/server/utils/push";
import { privateMessage } from "@/server/utils/push/messages";
import { notifyPrivateConversation } from "@/server/utils/push/social";

const deferred: Array<() => unknown> = [];
const send = vi.fn();
const configured = vi.fn();
const info = {
  conversationId: "conversation-one", isPublic: false,
  senderId: "sender", authorId: "author", recipientIds: ["receiver", "receiver", "sender", "author"],
};
const client = {} as DrizzleClient;
beforeEach(() => {
  deferred.length = 0;
  send.mockReset().mockResolvedValue({ sent: 1, failed: 0, expiredTokens: [] });
  vi.spyOn(push, "sendPushToUsers").mockImplementation(send);
  configured.mockReset().mockReturnValue(true);
  vi.spyOn(push, "isPushEnabled").mockImplementation(configured);
  vi.spyOn(next, "after").mockImplementation((callback) => { deferred.push(callback as () => unknown); });
  vi.spyOn(Pusher.prototype, "trigger").mockResolvedValue(undefined);
});
afterEach(() => vi.restoreAllMocks());

describe("private-message ordinary push", () => {
  it("defers one fan-out to unique recipients, excluding sender and author", async () => {
    notifyPrivateConversation(client, info);
    expect(send).not.toHaveBeenCalled();
    expect(deferred).toHaveLength(1);
    await deferred[0]?.();
    expect(send).toHaveBeenCalledWith(client, ["receiver"], privateMessage(info.conversationId));
    expect(privateMessage(info.conversationId)).toMatchObject({ category: "social", url: "/inbox" });
    expect(privateMessage(info.conversationId).body).not.toContain("receiver");
  });
  it("does not notify a public conversation or ephemeral raid chat", () => {
    notifyPrivateConversation(client, { ...info, isPublic: true });
    notifyPrivateConversation(client, { ...info, conversationId: getRaidChatConversationId("test") });
    expect(deferred).toHaveLength(0);
  });
  it("does not notify self-only conversations or unconfigured environments", () => {
    notifyPrivateConversation(client, { ...info, recipientIds: ["sender", "author"] });
    configured.mockReturnValue(false);
    notifyPrivateConversation(client, info);
    expect(deferred).toHaveLength(0);
  });
  it("schedules a new private conversation only after every message write completes", async () => {
    const resolvers: Array<() => void> = [];
    const pending = () => new Promise<void>(resolve => resolvers.push(resolve));
    const fake = {
      insert: () => ({ values: pending }),
      update: () => ({ set: () => ({ where: pending }) }),
    } as unknown as DrizzleClient;
    const creating = createConvo({ client: fake, authorUserId: "author", senderUserId: "sender",
      receiverUserIds: ["receiver"], title: "Private title", content: "Private content", convoId: info.conversationId });
    expect(deferred).toHaveLength(0);
    for (const resolve of resolvers) resolve();
    expect(await creating).toBe(info.conversationId);
    expect(deferred).toHaveLength(1);
    await deferred[0]?.();
    const payload = send.mock.calls[0]?.[2];
    expect(JSON.stringify(payload)).not.toContain("Private content");
    expect(JSON.stringify(payload)).not.toContain("Private title");
  });
  it("schedules no native delivery when a conversation write fails", async () => {
    const fake = {
      insert: () => ({ values: () => Promise.reject(new Error("write failed")) }),
      update: () => ({ set: () => ({ where: () => Promise.resolve() }) }),
    } as unknown as DrizzleClient;
    await expect(createConvo({ client: fake, authorUserId: "author", senderUserId: "sender",
      receiverUserIds: ["receiver"], title: "Private title", content: "Private content" })).rejects.toThrow("write failed");
    expect(deferred).toHaveLength(0);
  });
});
