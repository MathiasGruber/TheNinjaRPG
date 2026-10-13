import { afterEach, describe, expect, it, vi } from "bun:test";
import { questsRouter } from "@/routers/quests";
import { resetServerModuleStubs, stubProfile } from "../../setup/serverModules";

type Goal = { id: string; done: boolean; recentlyDied: boolean };

/** Caller whose user has one quest tracker; any database access fails the test. */
const makeCaller = (goals: Goal[] | null) => {
  const user =
    goals === null
      ? undefined
      : { userId: "u1", questData: [{ id: "quest-1", startAt: new Date(), goals }] };
  const fetchUpdatedUser = vi.fn().mockResolvedValue({ user });
  stubProfile("fetchUpdatedUser", fetchUpdatedUser as never);
  const drizzle = new Proxy(
    {},
    {
      get: (_target, prop) => {
        throw new Error(`unexpected database access: ${String(prop)}`);
      },
    },
  );
  const caller = questsRouter.createCaller({ drizzle, userId: "u1" } as never);
  return { caller, fetchUpdatedUser };
};

describe("quests.retryBattle", () => {
  afterEach(resetServerModuleStubs);

  it("rejects a retry once the loss has routed the quest into its fail branch", async () => {
    const { caller } = makeCaller([{ id: "battle", done: true, recentlyDied: true }]);

    const result = await caller.retryBattle({ questId: "quest-1" });

    expect(result.success).toBe(false);
    expect(result.message).toBe("There is no lost battle to retry in this quest");
  });

  it("rejects a retry for a quest the user is not tracking", async () => {
    const { caller } = makeCaller([{ id: "battle", done: false, recentlyDied: true }]);

    const result = await caller.retryBattle({ questId: "other-quest" });

    expect(result.success).toBe(false);
    expect(result.message).toBe("There is no lost battle to retry in this quest");
  });

  it("rejects a retry when no battle was lost", async () => {
    const { caller } = makeCaller([{ id: "battle", done: false, recentlyDied: false }]);

    const result = await caller.retryBattle({ questId: "quest-1" });

    expect(result.success).toBe(false);
  });

  it("rejects a retry for a missing user", async () => {
    const { caller } = makeCaller(null);

    const result = await caller.retryBattle({ questId: "quest-1" });

    expect(result).toMatchObject({ success: false, message: "User does not exist" });
  });
});
