import { beforeEach, expect, it } from "bun:test";
import { eq } from "drizzle-orm";
import { conversation, conversationComment, parentalControl, user2conversation, userData } from "@/drizzle/schema";
import { parentalControlsRouter } from "@/server/api/routers/parentalControls";
import { commentsRouter, fetchUsersToNotify } from "@/server/api/routers/comments";
import { hashParentalPin, renameParentalContact } from "@/server/utils/parentalControls";
import { insertUsers } from "../../setup/factories";
import { callerFor, callerForDatabase, describeWithDatabase, getTestDatabase, resetTables } from "../../setup/testDatabase";

const settings = { enabled: true, tavernDisabled: true, privateMessages: "APPROVED" as const,
  approvedUserIds: ["friend"], pin: "012345", version: 0 };

describeWithDatabase("parental controls", () => {
  beforeEach(async () => {
    await resetTables(parentalControl, conversationComment, user2conversation, conversation, userData);
    await insertUsers([{ userId: "child", level: 50 }, { userId: "friend", level: 50 }, { userId: "stranger", level: 50 }]);
  });
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
      await db.insert(conversationComment).values({ id: `${convo.id}-message`, conversationId: convo.id, content: "Original", userId: "child", authorId: "child" });
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
  });
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
