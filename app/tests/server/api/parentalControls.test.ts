import { afterEach, beforeEach, expect, it, vi } from "bun:test";
import { eq } from "drizzle-orm";
import { Moderations } from "openai/resources/moderations";
import { conversation, conversationComment, parentalControl, user2conversation, userData } from "@/drizzle/schema";
import { parentalControlsRouter } from "@/server/api/routers/parentalControls";
import { commentsRouter, fetchUsersToNotify } from "@/server/api/routers/comments";
import { Pusher } from "@/libs/pusher";
import { hashParentalPin, renameParentalContact } from "@/server/utils/parentalControls";
import { insertUsers } from "../../setup/factories";
import { callerFor, callerForDatabase, describeWithDatabase, getTestDatabase, resetTables } from "../../setup/testDatabase";

const settings = { enabled: true, tavernDisabled: true, privateMessages: "APPROVED" as const,
  approvedUserIds: ["friend"], pin: "012345", version: 0 };

const stubRateLimitTransport = () => {
  const realFetch = globalThis.fetch;
  // Keep the middleware active without requiring Redis in SQL tests.
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    if (typeof init?.body !== "string" || !init.body.includes("trpc-ratelimit")) {
      return realFetch(input, init);
    }
    const commands = JSON.parse(init.body) as unknown[];
    const resultFor = (command: unknown[]) => ({
      result: command[0] === "evalsha" || command[0] === "eval" ? [59, 60] : 1,
    });
    return Response.json(Array.isArray(commands[0])
      ? commands.map((command) => resultFor(command as unknown[]))
      : resultFor(commands));
  });
};

describeWithDatabase("parental controls", () => {
  beforeEach(async () => {
    stubRateLimitTransport();
    vi.spyOn(Pusher.prototype, "trigger").mockResolvedValue(undefined);
    await resetTables(parentalControl, conversationComment, user2conversation, conversation, userData);
    await insertUsers([{ userId: "child", level: 50 }, { userId: "friend", level: 50 }, { userId: "stranger", level: 50 }]);
  });
  afterEach(() => vi.restoreAllMocks());
  it("requires the parent PIN, never returns its hash, and rejects stale settings", async () => {
    const api = await callerFor(parentalControlsRouter, "child");
    expect((await api.save(settings)).success).toBe(true);
    const saved = await api.get();
    expect(saved.hasPin).toBe(true);
    expect(saved).not.toHaveProperty("pinHash");
    expect((await api.save({ ...settings, version: 1, enabled: false, pin: "654321" })).success).toBe(false);
    expect((await api.get()).enabled).toBe(true);
    expect((await api.save(settings)).success).toBe(false);
    expect((await api.save({ ...settings, version: 1, enabled: false })).success).toBe(true);
    expect((await api.get()).hasPin).toBe(false);
  });
  it("keeps PIN credentials out of expired-session errors", async () => {
    const api = parentalControlsRouter.createCaller({
      drizzle: await getTestDatabase(), userId: null, userIp: "127.0.0.1",
      userAgent: undefined, abLemuReplacementVariant: undefined, wallpaperVariant: undefined,
    });
    try {
      await api.save({ ...settings, newPin: "654321" });
      throw new Error("Expected an authentication rejection");
    } catch (error) {
      expect(String(error)).toContain("Unauthorized");
      expect(String(error)).not.toContain(settings.pin);
      expect(String(error)).not.toContain("654321");
      expect(JSON.stringify(error)).not.toContain(settings.pin);
      expect(JSON.stringify(error)).not.toContain("654321");
    }
  });
  it("allows exactly one concurrent first-time setup and retains the winning PIN", async () => {
    const api = await callerFor(parentalControlsRouter, "child");
    const results = await Promise.all([api.save(settings), api.save({ ...settings, pin: "654321", tavernDisabled: false })]);
    expect(results.filter((r) => r.success)).toHaveLength(1);
    expect((await api.get()).version).toBe(1);
  });
  it("sanitizes database errors containing PIN-derived credentials", async () => {
    const db = await getTestDatabase();
    const leakedHash = "synthetic-salt:synthetic-pin-hash";
    const failingDb = new Proxy(db, {
      get(target, property, receiver) {
        if (property === "insert") return () => ({
          ignore: () => ({ values: () => Promise.reject(new Error(`Failed query params: ${leakedHash}`)) }),
        });
        return Reflect.get(target, property, receiver);
      },
    });
    const api = callerForDatabase(parentalControlsRouter, "child", failingDb);
    try {
      await api.save(settings);
      throw new Error("Expected a database rejection");
    } catch (error) {
      expect(String(error)).toContain("Could not save parental controls");
      expect(String(error)).not.toContain(leakedHash);
      expect(JSON.stringify(error)).not.toContain(leakedHash);
    }
  });
  it("retains approvals when an administrator moves an identity", async () => {
    const api = await callerFor(parentalControlsRouter, "child");
    await api.save(settings);
    const db = await getTestDatabase();
    await renameParentalContact(db, "friend", "renamed-friend");
    const row = await db.query.parentalControl.findFirst({ where: eq(parentalControl.userId, "child") });
    expect(row?.approvedUserIds).toEqual(["renamed-friend"]);
    expect(row?.version).toBe(2);
  });
  it("limits concurrent PIN guesses and opens a new window after 15 minutes", async () => {
    const api = await callerFor(parentalControlsRouter, "child");
    await api.save(settings);
    const guesses = await Promise.all(Array.from({ length: 8 }, () => api.save({ ...settings, version: 1, pin: "654321", enabled: false })));
    expect(guesses.every((r) => !r.success)).toBe(true);
    const db = await getTestDatabase();
    let row = await db.query.parentalControl.findFirst({ where: eq(parentalControl.userId, "child") });
    expect(row?.failedAttempts).toBe(5);
    expect((await api.save({ ...settings, version: 1 })).success).toBe(false);
    await db.update(parentalControl).set({ attemptWindowStart: new Date(Date.now() - 16 * 60 * 1000) }).where(eq(parentalControl.userId, "child"));
    expect((await api.save({ ...settings, version: 1 })).success).toBe(true);
    row = await db.query.parentalControl.findFirst({ where: eq(parentalControl.userId, "child") });
    expect(row?.failedAttempts).toBe(0);
  });
  it("hides restricted history, blocks direct message IDs, and keeps approved/support conversations", async () => {
    const db = await getTestDatabase();
    await db.insert(parentalControl).values({ userId: "child", ...settings, pinHash: await hashParentalPin(settings.pin) });
    const convos = [
      { id: "tavern", title: "Global", isPublic: true, users: [] },
      { id: "approved", title: "Approved", isPublic: false, users: ["child", "friend"] },
      { id: "old", title: "Old stranger", isPublic: false, users: ["child", "stranger"] },
      { id: "group", title: "Mixed group", isPublic: false, users: ["child", "friend", "stranger"] },
      { id: "support", title: "Help", isPublic: false, isStaffAvailable: true, users: ["child", "stranger"] },
    ];
    for (const convo of convos) {
      const { users, ...values } = convo;
      await db.insert(conversation).values({ ...values, createdById: "child" });
      if (users.length) await db.insert(user2conversation).values(users.map((userId) => ({ userId, conversationId: convo.id })));
      await db.insert(conversationComment).values({ id: `${convo.id}-message`, conversationId: convo.id, content: "Original", userId: convo.id === "support" ? "stranger" : "child", authorId: convo.id === "support" ? "stranger" : "child" });
    }
    const api = await callerFor(commentsRouter, "child");
    expect((await api.getUserConversations({})).map((c) => c.id).sort()).toEqual(["approved", "support"]);
    for (const id of ["tavern", "old", "group"]) {
      const page = await api.getConversationComments({ convo_id: id, limit: 10 });
      expect(page.data).toEqual([]);
      expect(page.restrictionMessage).toBeTruthy();
      expect(await api.fetchConversationComment({ commentId: `${id}-message` })).toBeNull();
      expect((await api.reactConversationComment({ commentId: `${id}-message`, emoji: "👍" })).success).toBe(false);
    }
    for (const id of ["approved", "support"]) {
      expect((await api.getConversationComments({ convo_id: id, limit: 10 })).data).toHaveLength(1);
      expect(await api.fetchConversationComment({ commentId: `${id}-message` })).not.toBeNull();
    }
    const outsider = await callerFor(commentsRouter, "stranger");
    expect(await outsider.fetchConversationComment({ commentId: "approved-message" })).toBeNull();
    expect((await outsider.reactConversationComment({ commentId: "approved-message", emoji: "👍" })).success).toBe(false);
    expect((await outsider.exitConversation({ convo_id: "support" })).success).toBe(true);
    await db.update(parentalControl).set({ privateMessages: "NONE" }).where(eq(parentalControl.userId, "child"));
    expect((await api.getConversationComments({ convo_id: "support", limit: 10 })).data).toHaveLength(1);
    expect(await api.fetchConversationComment({ commentId: "support-message" })).not.toBeNull();
  });
  for (const mode of ["NONE", "APPROVED"] as const) {
    it(`keeps retained stranger history restricted after leaving (${mode})`, async () => {
      const db = await getTestDatabase();
      const participants = mode === "NONE" ? ["child", "stranger"] : ["child", "friend", "stranger"];
      await db.insert(conversation).values({ id: "retained", title: "Retained history", isPublic: false, createdById: "child" });
      await db.insert(user2conversation).values(participants.map((userId) => ({ userId, conversationId: "retained" })));
      await db.insert(conversationComment).values({ id: "retained-message", conversationId: "retained", content: "Original stranger message", userId: "stranger", authorId: "stranger" });
      const parent = await callerFor(parentalControlsRouter, "child");
      expect((await parent.save({ ...settings, privateMessages: mode })).success).toBe(true);
      const child = await callerFor(commentsRouter, "child");
      expect((await child.getConversationComments({ convo_id: "retained", limit: 10 })).restrictionMessage).toBeTruthy();
      const stranger = await callerFor(commentsRouter, "stranger");
      expect((await stranger.exitConversation({ convo_id: "retained" })).success).toBe(true);
      const page = await child.getConversationComments({ convo_id: "retained", limit: 10 });
      expect(page.data).toEqual([]);
      expect(page.restrictionMessage).toBeTruthy();
      expect(await child.fetchConversationComment({ commentId: "retained-message" })).toBeNull();
      expect(await child.getUserConversations({})).toEqual([]);
      expect((await child.reactConversationComment({ commentId: "retained-message", emoji: "👍" })).success).toBe(false);
      expect((await child.sendTypingIndicator({ conversationId: "retained" })).success).toBe(false);
      const sender = mode === "APPROVED" ? await callerFor(commentsRouter, "friend") : child;
      expect((await sender.createConversationComment({ object_id: "retained", comment: "Additional conversation reply", quoteIds: null, senderId: null })).success).toBe(false);
      expect((await db.query.userData.findFirst({ where: eq(userData.userId, "child") }))?.inboxNews).toBe(0);
      if (mode === "APPROVED") {
        expect((await sender.getConversationComments({ convo_id: "retained", limit: 10 })).data).toHaveLength(1);
      }
      expect((await parent.save({ ...settings, version: 1, privateMessages: mode === "NONE" ? "EVERYONE" : mode, approvedUserIds: ["friend", "stranger"] })).success).toBe(true);
      expect((await child.getConversationComments({ convo_id: "retained", limit: 10 })).data).toHaveLength(1);
      expect(await child.fetchConversationComment({ commentId: "retained-message" })).not.toBeNull();
      expect((await child.getUserConversations({})).map((c) => c.id)).toEqual(["retained"]);
      expect(await stranger.fetchConversationComment({ commentId: "retained-message" })).toBeNull();
      await db.insert(user2conversation).values({ userId: "stranger", conversationId: "retained" });
      expect((await child.getConversationComments({ convo_id: "retained", limit: 10 })).data).toHaveLength(1);
    });
  }
  it("rejects an unapproved AI reply before changing the approved thread or notifying its child", async () => {
    const db = await getTestDatabase();
    await insertUsers([{ userId: "staff", username: "Staff", level: 50, role: "EVENT" }, { userId: "ai", username: "AI", level: 50, isAi: true }]);
    const parent = await callerFor(parentalControlsRouter, "child");
    expect((await parent.save({ ...settings, approvedUserIds: ["staff"] })).success).toBe(true);
    const staff = await callerFor(commentsRouter, "staff");
    const created = await staff.createConversation({ users: ["child"], title: "Approved staff", comment: "Normal approved message", senderId: null });
    const convoId = created.conversationId!;
    expect(created.success).toBe(true);
    const child = await callerFor(commentsRouter, "child");
    const before = await child.getConversationComments({ convo_id: convoId, limit: 10 });
    expect(before.data).toHaveLength(1);
    const childBefore = await db.query.userData.findFirst({ where: eq(userData.userId, "child") });
    const events = vi.spyOn(Pusher.prototype, "trigger");
    events.mockClear();
    const reply = await staff.createConversationComment({ object_id: convoId, comment: "Roleplay from the AI", quoteIds: null, senderId: "ai" });
    expect(reply.success).toBe(false);
    expect(reply.message).toContain("approved");
    expect(await db.query.conversationComment.findMany({ where: eq(conversationComment.conversationId, convoId) })).toHaveLength(1);
    expect((await db.query.userData.findFirst({ where: eq(userData.userId, "child") }))?.inboxNews).toBe(childBefore?.inboxNews);
    expect((await db.query.conversation.findFirst({ where: eq(conversation.id, convoId) }))?.updatedAt).toEqual(before.convo?.updatedAt);
    expect(events).not.toHaveBeenCalled();
    expect((await child.getConversationComments({ convo_id: convoId, limit: 10 })).data).toHaveLength(1);
    expect(await child.fetchConversationComment({ commentId: before.data[0]!.id })).not.toBeNull();
    expect((await child.getUserConversations({})).map((c) => c.id)).toEqual([convoId]);

    expect((await staff.createConversationComment({ object_id: convoId, comment: "Normal approved reply", quoteIds: null, senderId: null })).success).toBe(true);
    // A non-AI override resolves to the real author and must not require another approval.
    expect((await staff.createConversationComment({ object_id: convoId, comment: "Reply with ignored sender", quoteIds: null, senderId: "stranger" })).success).toBe(true);
    expect((await child.getConversationComments({ convo_id: convoId, limit: 10 })).data).toHaveLength(3);
  });
  it("allows an approved AI reply while preserving its real author and membership guards", async () => {
    const db = await getTestDatabase();
    await insertUsers([{ userId: "staff", username: "Staff", level: 50, role: "EVENT" }, { userId: "ai", username: "AI", level: 50, isAi: true }, { userId: "outsider", username: "Outsider", level: 50, role: "EVENT" }]);
    const parent = await callerFor(parentalControlsRouter, "child");
    expect((await parent.save({ ...settings, approvedUserIds: ["staff", "ai"] })).success).toBe(true);
    const staff = await callerFor(commentsRouter, "staff");
    const created = await staff.createConversation({ users: ["child"], title: "Approved AI", comment: "Normal approved message", senderId: null });
    expect(created.success).toBe(true);
    const convoId = created.conversationId!;
    const reply = await staff.createConversationComment({ object_id: convoId, comment: "Roleplay from approved AI", quoteIds: null, senderId: "ai" });
    expect(reply.success).toBe(true);
    const row = await db.query.conversationComment.findFirst({ where: eq(conversationComment.id, reply.commentId!) });
    expect(row?.userId).toBe("ai");
    expect(row?.authorId).toBe("staff");
    const child = await callerFor(commentsRouter, "child");
    expect((await child.getConversationComments({ convo_id: convoId, limit: 10 })).data).toHaveLength(2);
    expect(await child.fetchConversationComment({ commentId: reply.commentId! })).not.toBeNull();
    expect((await child.getUserConversations({})).map((c) => c.id)).toEqual([convoId]);
    const outsider = await callerFor(commentsRouter, "outsider");
    expect((await outsider.createConversationComment({ object_id: convoId, comment: "Nonmember AI reply", quoteIds: null, senderId: "ai" })).success).toBe(false);
    const fallback = await child.createConversationComment({ object_id: convoId, comment: "Ordinary player cannot post as AI", quoteIds: null, senderId: "ai" });
    expect(fallback.success).toBe(true);
    expect((await db.query.conversationComment.findFirst({ where: eq(conversationComment.id, fallback.commentId!) }))?.userId).toBe("child");
  });
  for (const isPublic of [false, true]) {
    it(`preserves Post as AI in ${isPublic ? "public" : "support"} conversations`, async () => {
      const db = await getTestDatabase();
      if (isPublic) {
        vi.spyOn(Moderations.prototype, "create").mockResolvedValue({ id: "test", model: "omni-moderation-latest", results: [] });
      }
      await insertUsers([{ userId: "staff", username: "Staff", level: 50, role: "EVENT" }, { userId: "ai", username: "AI", level: 50, isAi: true }]);
      expect((await (await callerFor(parentalControlsRouter, "child")).save({ ...settings, privateMessages: "NONE" })).success).toBe(true);
      await db.insert(conversation).values({ id: "exempt", title: "Exempt conversation", isPublic, isStaffAvailable: !isPublic, createdById: "child" });
      await db.insert(user2conversation).values({ userId: "child", conversationId: "exempt" });
      const staff = await callerFor(commentsRouter, "staff");
      const reply = await staff.createConversationComment({ object_id: "exempt", comment: "Exempt roleplay reply", quoteIds: null, senderId: "ai" });
      expect(reply.success).toBe(true);
      const row = await db.query.conversationComment.findFirst({ where: eq(conversationComment.id, reply.commentId!) });
      expect(row?.userId).toBe("ai");
      expect(row?.authorId).toBe("staff");
      if (!isPublic) {
        expect((await (await callerFor(commentsRouter, "child")).getConversationComments({ convo_id: "exempt", limit: 10 })).data).toHaveLength(1);
      }
    });
  }
  it("preserves approved/private and support notifications while restricting tavern notifications", async () => {
    const db = await getTestDatabase();
    await db.insert(parentalControl).values({ userId: "child", ...settings, pinHash: await hashParentalPin(settings.pin) });
    const context = { isPublic: false, isStaffAvailable: false };
    const notify = (convo: typeof context) => fetchUsersToNotify(db, "friend", [], ["child"], convo);
    expect(await notify(context)).toEqual([{ userId: "child", type: "quoted" }]);
    expect(await notify({ ...context, isPublic: true })).toEqual([]);
    await db.update(parentalControl).set({ tavernDisabled: false, privateMessages: "NONE" }).where(eq(parentalControl.userId, "child"));
    expect(await notify(context)).toEqual([]);
    expect(await notify({ ...context, isPublic: true })).toHaveLength(1);
    expect(await notify({ ...context, isStaffAvailable: true })).toHaveLength(1);
  });
});
