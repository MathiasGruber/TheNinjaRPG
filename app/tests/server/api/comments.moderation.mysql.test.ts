import { afterEach, beforeEach, expect, it, vi } from "bun:test";
import { eq } from "drizzle-orm";
import OpenAI from "openai";
import { FORUM_MIN_LEVEL } from "@/drizzle/constants";
import { forumPost, forumThread, moderationScan, userData } from "@/drizzle/schema";
import { classifyNsfwImage, moderateContent } from "@/libs/moderator";
import { commentsRouter } from "@/server/api/routers/comments";
import { insertUsers } from "../../setup/factories";
import { unflaggedModeration } from "../../setup/moderation";
import { resetServerModuleStubs, stubProfile } from "../../setup/serverModules";
import {
  callerForDatabase,
  describeWithDatabase,
  getTestDatabase,
  resetTables,
} from "../../setup/testDatabase";

const providerError = (status: number) =>
  Response.json({ error: { message: "Provider unavailable" } }, {
    status,
    headers: { "retry-after-ms": "1" },
  });

describeWithDatabase("comment and image moderation provider recovery", () => {
  beforeEach(async () => {
    // Keep rate limiting active while isolating all HTTP from real services.
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      if (typeof init?.body !== "string" || !init.body.includes("trpc-ratelimit")) {
        throw new Error("Unexpected HTTP request in moderation tests");
      }
      const commands = JSON.parse(init.body) as unknown[];
      const resultFor = (command: unknown[]) => ({
        result: command[0] === "evalsha" || command[0] === "eval" ? [59, 60] : 1,
      });
      return Response.json(Array.isArray(commands[0])
        ? commands.map((command) => resultFor(command as unknown[]))
        : resultFor(commands));
    });
    const db = await getTestDatabase();
    await resetTables(moderationScan, forumPost, forumThread, userData);
    await insertUsers([{ userId: "poster", level: FORUM_MIN_LEVEL }]);
    await db.insert(forumThread).values({
      id: "thread", title: "Game discussion", userId: "poster", boardId: "board",
    });
    stubProfile("fetchUser", async (_client: unknown, id: string) =>
      db.query.userData.findFirst({ where: eq(userData.userId, id) }));
  });
  afterEach(() => { resetServerModuleStubs(); vi.restoreAllMocks(); });

  it.each([429, 503])("posts once when moderation recovers from HTTP %i", async (status) => {
    // Stub HTTP responses, preserving the module's real SDK client and retry handling.
    const provider = vi.spyOn(OpenAI.prototype, "fetchWithTimeout")
      .mockResolvedValueOnce(providerError(status))
      .mockImplementation(async () => Response.json(unflaggedModeration()));
    const db = await getTestDatabase();
    const result = await callerForDatabase(commentsRouter, "poster", db)
      .createForumComment({ object_id: "thread", comment: "A normal game conversation", quoteIds: null, senderId: null });
    expect(result.success).toBe(true);
    expect(provider).toHaveBeenCalledTimes(2);
    const posts = await db.query.forumPost.findMany();
    expect(posts).toHaveLength(1);
    expect(posts[0]?.content).toBe("A normal game conversation");
    expect((await db.query.forumThread.findFirst())?.nPosts).toBe(1);
    const scans = await db.query.moderationScan.findMany();
    expect(scans).toHaveLength(1);
    expect(scans[0]?.relationId).toBe(posts[0]?.id);
    expect(scans[0]?.outcome).toBe("GATE_CLEAR");
    expect(scans[0]?.flagged).toBe(false);
    expect(scans[0]?.completedAt).toBeInstanceOf(Date);
    expect(scans[0]?.errorStage).toBeNull();
  });

  it.each([{ status: 503, attempts: 3 }, { status: 400, attempts: 1 }])(
    "records and propagates a terminal HTTP $status gate failure",
    async ({ status, attempts }) => {
      const provider = vi.spyOn(OpenAI.prototype, "fetchWithTimeout")
        .mockImplementation(async () => providerError(status));
      const db = await getTestDatabase();
      await expect(moderateContent(db, {
        userId: "poster", relationId: "post", relationType: "forumPost", content: "Game discussion",
      })).rejects.toThrow("Provider unavailable");
      expect(provider).toHaveBeenCalledTimes(attempts);
      const scans = await db.query.moderationScan.findMany();
      expect(scans).toHaveLength(1);
      expect(scans[0]?.outcome).toBe("ERROR");
      expect(scans[0]?.errorStage).toBe("gate");
      expect(scans[0]?.flagged).toBeNull();
      expect(scans[0]?.completedAt).toBeInstanceOf(Date);
    },
  );

  it.each([{ isNsfw: false }, { isNsfw: true }])("uses the recovered image decision (isNsfw=$isNsfw)", async ({ isNsfw }) => {
    const moderation = unflaggedModeration();
    moderation.results[0]!.categories.sexual = isNsfw;
    const provider = vi.spyOn(OpenAI.prototype, "fetchWithTimeout")
      .mockResolvedValueOnce(providerError(503))
      .mockImplementation(async () => Response.json(moderation));
    expect((await classifyNsfwImage("https://example.invalid/image.png")).isNsfw).toBe(isNsfw);
    expect(provider).toHaveBeenCalledTimes(2);
  });

  it("propagates an image provider failure after retries are exhausted", async () => {
    const provider = vi.spyOn(OpenAI.prototype, "fetchWithTimeout")
      .mockImplementation(async () => providerError(503));
    await expect(classifyNsfwImage("https://example.invalid/image.png"))
      .rejects.toThrow("Provider unavailable");
    expect(provider).toHaveBeenCalledTimes(3);
  });
});
