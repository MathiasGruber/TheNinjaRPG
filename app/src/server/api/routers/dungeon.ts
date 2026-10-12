import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { DUNGEON_PARTY_SIZE, DUNGEON_RUN_SECONDS } from "@/drizzle/constants";
import {
  actionLog,
  battle,
  dungeon,
  dungeonMember,
  dungeonRun,
  item,
  jutsu,
  userData,
} from "@/drizzle/schema";
import { transitionCoopParty } from "@/libs/coop";
import { dungeonFloorAt } from "@/libs/dungeon";
import { initiateBattle } from "@/routers/combat";
import { updateRewards } from "@/routers/quests";
import {
  createTRPCRouter,
  errorResponse,
  protectedProcedure,
  ratelimitMiddleware,
} from "@/server/api/trpc";
import type { DrizzleClient } from "@/server/db";
import { launchCoopEncounter } from "@/server/utils/coop";
import { expireDungeonRun, rollbackDungeonStart } from "@/server/utils/dungeon";
import { isMysqlDuplicateKeyError, retryOnDeadlock } from "@/server/utils/mysqlErrors";
import { canChangeContent } from "@/utils/permissions";
import { secondsFromNow } from "@/utils/time";
import {
  dungeonActionSchema,
  dungeonContentSchema,
  dungeonIdSchema,
  dungeonSectorSchema,
  saveDungeonSchema,
} from "@/validators/dungeon";
import { ObjectiveReward } from "@/validators/rewards";

/** Party state is versioned; active membership and completion receipts guard cross-run effects. */
export const dungeonRouter = createTRPCRouter({
  /** List visible, unexpired definitions only for the player's current sector. */
  getAvailable: protectedProcedure
    .input(dungeonSectorSchema)
    .query(async ({ ctx, input }) => {
      const [user, definitions] = await Promise.all([
        ctx.drizzle.query.userData.findFirst({
          where: eq(userData.userId, ctx.userId),
          columns: { sector: true },
        }),
        ctx.drizzle.query.dungeon.findMany(),
      ]);
      if (user?.sector !== input.sector) return [];
      return definitions.filter(
        (d) =>
          !d.content.hidden &&
          d.content.sector === user?.sector &&
          (!d.content.expiresAt ||
            new Date(d.content.expiresAt).getTime() > Date.now()),
      );
    }),
  /** Load parties and receipts, expiring deadlines and recovering interrupted floor starts. */
  getState: protectedProcedure.query(async ({ ctx }) => {
    const runs = await ctx.drizzle
      .select()
      .from(dungeonRun)
      .where(
        or(
          and(
            sql`EXISTS (SELECT 1 FROM ${dungeonMember} WHERE ${dungeonMember.runId} = ${dungeonRun.id} AND ${dungeonMember.userId} = ${ctx.userId})`,
            sql`JSON_CONTAINS(${dungeonRun.state}, ${JSON.stringify(ctx.userId)}, '$.memberIds')`,
          ),
          and(
            eq(dungeonRun.status, "LOBBY"),
            sql`JSON_CONTAINS(${dungeonRun.state}, ${JSON.stringify(ctx.userId)}, '$.invitedIds')`,
          ),
        ),
      )
      .orderBy(
        // Keep the player's party, unclaimed rewards and invitations ahead of paid history.
        desc(
          sql`EXISTS (SELECT 1 FROM ${dungeonMember} WHERE ${dungeonMember.runId} = ${dungeonRun.id} AND ${dungeonMember.activeUserId} = ${ctx.userId})`,
        ),
        desc(eq(dungeonRun.status, "LOBBY")),
        desc(dungeonRun.createdAt),
      )
      .limit(20);
    await Promise.all(runs.map((run) => expireDungeonRun(ctx.drizzle, run)));
    const ids = [
      ...new Set(runs.flatMap((r) => [...r.state.memberIds, ...r.state.invitedIds])),
    ];
    const [users, members, refreshedRuns] = await Promise.all([
      ids.length
        ? ctx.drizzle.query.userData.findMany({
            where: inArray(userData.userId, ids),
            columns: { userId: true, username: true, status: true, isBanned: true },
          })
        : [],
      runs.length
        ? ctx.drizzle.query.dungeonMember.findMany({
            where: inArray(
              dungeonMember.runId,
              runs.map((r) => r.id),
            ),
          })
        : [],
      runs.length
        ? ctx.drizzle.query.dungeonRun.findMany({
            where: inArray(
              dungeonRun.id,
              runs.map((r) => r.id),
            ),
            orderBy: desc(dungeonRun.createdAt),
          })
        : [],
    ]);
    let currentRuns = refreshedRuns;
    const interrupted = currentRuns.filter(
      (r) =>
        r.status === "FIGHTING" &&
        r.battleId &&
        r.state.entryStartedAt &&
        Date.now() - r.state.entryStartedAt > 60000,
    );
    if (interrupted.length) {
      const battles = await ctx.drizzle.query.battle.findMany({
        where: inArray(
          battle.id,
          interrupted.map((r) => r.battleId as string),
        ),
        columns: { id: true },
      });
      const missing = interrupted.filter(
        (r) => !battles.some((b) => b.id === r.battleId),
      );
      await Promise.all(
        missing.map((r) =>
          rollbackDungeonStart(
            ctx.drizzle,
            {
              ...r,
              expiresAt: r.state.entryPreviousDeadline
                ? new Date(r.state.entryPreviousDeadline)
                : null,
            },
            r.battleId as string,
            r.version,
          ),
        ),
      );
      if (missing.length)
        currentRuns = await ctx.drizzle.query.dungeonRun.findMany({
          where: inArray(
            dungeonRun.id,
            currentRuns.map((r) => r.id),
          ),
          orderBy: desc(dungeonRun.createdAt),
        });
    }
    return {
      runs: currentRuns,
      users,
      members: members.filter((m) => m.userId === ctx.userId),
      serverTime: new Date(),
    };
  }),
  /** Staff may inspect hidden and expired definitions when authoring dungeon content. */
  getAll: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.drizzle.query.userData.findFirst({
      where: eq(userData.userId, ctx.userId),
      columns: { role: true },
    });
    return user && canChangeContent(user.role)
      ? ctx.drizzle.query.dungeon.findMany()
      : [];
  }),
  /** Validate referenced enemies and rewards before saving content and its audit entry. */
  save: protectedProcedure
    .use(ratelimitMiddleware)
    .input(saveDungeonSchema)
    .mutation(async ({ ctx, input }) => {
      const aiIds = [
        ...new Set(
          input.content.tiers.flatMap((tier) =>
            tier.flatMap((floor) => floor.waves.flatMap((w) => w.aiIds)),
          ),
        ),
      ];
      const drops = input.content.rewards.drops;
      const [user, ais, items, jutsus] = await Promise.all([
        ctx.drizzle.query.userData.findFirst({
          where: eq(userData.userId, ctx.userId),
          columns: { role: true },
        }),
        ctx.drizzle.query.userData.findMany({
          where: and(inArray(userData.userId, aiIds), eq(userData.isAi, true)),
          columns: { userId: true },
        }),
        drops.some((d) => d.type === "item")
          ? ctx.drizzle.query.item.findMany({
              where: inArray(
                item.id,
                drops.filter((d) => d.type === "item").map((d) => d.id),
              ),
              columns: { id: true },
            })
          : [],
        drops.some((d) => d.type === "jutsu")
          ? ctx.drizzle.query.jutsu.findMany({
              where: inArray(
                jutsu.id,
                drops.filter((d) => d.type === "jutsu").map((d) => d.id),
              ),
              columns: { id: true },
            })
          : [],
      ]);
      if (!user || !canChangeContent(user.role))
        return errorResponse("You cannot edit dungeons.");
      if (
        ais.length !== aiIds.length ||
        drops.some(
          (d) => !(d.type === "item" ? items : jutsus).some((row) => row.id === d.id),
        )
      )
        return errorResponse("An enemy or reward no longer exists.");
      const id = input.id ?? nanoid();
      await Promise.all([
        ctx.drizzle
          .insert(dungeon)
          .values({ id, content: input.content, updatedAt: new Date() })
          .onDuplicateKeyUpdate({
            set: { content: input.content, updatedAt: new Date() },
          }),
        ctx.drizzle.insert(actionLog).values({
          id: nanoid(),
          userId: ctx.userId,
          relatedId: id,
          tableName: "dungeon",
          relatedMsg: "Updated dungeon",
          changes: [JSON.stringify(input.content)],
        }),
      ]);
      return { success: true, message: "Dungeon saved.", id };
    }),
  /** Snapshot an available definition and reserve the leader's sole active membership. */
  create: protectedProcedure
    .use(ratelimitMiddleware)
    .input(dungeonIdSchema)
    .mutation(async ({ ctx, input }) => {
      const [user, definition, active] = await Promise.all([
        ctx.drizzle.query.userData.findFirst({
          where: eq(userData.userId, ctx.userId),
        }),
        ctx.drizzle.query.dungeon.findFirst({ where: eq(dungeon.id, input.id) }),
        ctx.drizzle.query.dungeonMember.findFirst({
          where: eq(dungeonMember.activeUserId, ctx.userId),
        }),
      ]);
      if (user?.status !== "AWAKE" || user.isBanned || user.isAi)
        return errorResponse(
          "You must be awake and out of combat to create a dungeon lobby.",
        );
      if (active) return errorResponse("Finish or leave your current dungeon first.");
      const content = definition && dungeonContentSchema.parse(definition.content);
      if (
        !definition ||
        !content ||
        content.hidden ||
        (content.expiresAt && content.expiresAt.getTime() <= Date.now())
      )
        return errorResponse("This dungeon is unavailable.");
      if (user.sector !== content.sector)
        return errorResponse("Travel to the dungeon's sector to create a lobby.");
      const id = nanoid();
      // The unique activeUserId prevents two parties for this account. A crash between
      // inserts can leave only an empty, unreferenced run, which support can remove.
      await ctx.drizzle.insert(dungeonRun).values({
        id,
        dungeonId: definition.id,
        leaderId: ctx.userId,
        content,
        status: "LOBBY",
        createdAt: new Date(),
        state: {
          memberIds: [ctx.userId],
          invitedIds: [],
          readyIds: [],
          floor: 0,
          clearedFloors: [],
          message: `Invite ${DUNGEON_PARTY_SIZE - 1} players to begin.`,
        },
      });
      try {
        await ctx.drizzle
          .insert(dungeonMember)
          .values({ runId: id, userId: ctx.userId, activeUserId: ctx.userId });
      } catch (error) {
        // Never remove a run if membership committed despite an ambiguous driver failure.
        await ctx.drizzle
          .delete(dungeonRun)
          .where(
            and(
              eq(dungeonRun.id, id),
              eq(dungeonRun.version, 0),
              eq(dungeonRun.status, "LOBBY"),
              sql`NOT EXISTS (SELECT 1 FROM ${dungeonMember} WHERE ${dungeonMember.runId} = ${dungeonRun.id})`,
            ),
          );
        if (isMysqlDuplicateKeyError(error))
          return errorResponse("You already joined another dungeon.");
        throw error;
      }
      return { success: true, message: "Lobby created.", id };
    }),
  /** Apply one party version; membership changes also commit their cross-run reservation. */
  act: protectedProcedure
    .use(ratelimitMiddleware)
    .input(dungeonActionSchema)
    .mutation(async ({ ctx, input }) => {
      const [run, user, target, active] = await Promise.all([
        ctx.drizzle.query.dungeonRun.findFirst({ where: eq(dungeonRun.id, input.id) }),
        ctx.drizzle.query.userData.findFirst({
          where: eq(userData.userId, ctx.userId),
        }),
        input.userId
          ? ctx.drizzle.query.userData.findFirst({
              where: eq(userData.userId, input.userId),
            })
          : undefined,
        ctx.drizzle.query.dungeonMember.findMany({
          where: inArray(dungeonMember.activeUserId, [
            ctx.userId,
            ...(input.userId ? [input.userId] : []),
          ]),
        }),
      ]);
      if (!run || !user) return errorResponse("Dungeon not found.");
      if (run.expiresAt && run.expiresAt.getTime() <= Date.now()) {
        await expireDungeonRun(ctx.drizzle, run);
        return errorResponse("The dungeon deadline expired.");
      }
      const { action } = input;
      const transition = transitionCoopParty(
        "dungeon",
        {
          ...run.state,
          leaderId: run.leaderId,
          isPublic: false,
          phase: run.status,
        },
        ctx.userId,
        action === "accept" ? "join" : action,
        input.userId,
      );
      if (!transition.success) return errorResponse(transition.message);
      if (action === "invite") {
        if (!target || target.isAi || target.isBanned || target.status !== "AWAKE")
          return errorResponse("Invite someone who is awake and out of combat.");
        if (active.some((m) => m.activeUserId === target.userId))
          return errorResponse("That player is already in a dungeon.");
      }
      if (
        ["accept", "ready", "unready"].includes(action) &&
        (user.status !== "AWAKE" || user.isBanned || user.isAi)
      )
        return errorResponse(
          "You must be awake and out of combat to join or ready up.",
        );
      if (action === "accept" && active.some((m) => m.activeUserId === ctx.userId))
        return errorResponse("You are already in a dungeon.");
      const { party, removedUserId: removedUser, ended: ending } = transition;
      const joined = !!transition.joinedUserId;
      const state = {
        ...run.state,
        memberIds: party.memberIds,
        invitedIds: party.invitedIds,
        readyIds: party.readyIds,
        ...(ending ? { message: "A party member abandoned the dungeon." } : {}),
      };
      const status =
        party.phase === "STARTING" || party.phase === "ACTIVE"
          ? run.status
          : party.phase;
      if (action === "start") {
        const floor = dungeonFloorAt(run.content, state.floor);
        if (!floor) return errorResponse("This floor is unavailable.");
        const expiresAt = run.expiresAt ?? secondsFromNow(DUNGEON_RUN_SECONDS);
        return launchCoopEncounter({
          reserve: async ({ battleId }) => {
            const claimed = await ctx.drizzle
              .update(dungeonRun)
              .set({
                status: "FIGHTING",
                battleId,
                expiresAt,
                version: run.version + 1,
                state: {
                  ...state,
                  entryStartedAt: Date.now(),
                  entryPreviousDeadline: run.expiresAt?.getTime() ?? null,
                },
              })
              .where(
                and(eq(dungeonRun.id, run.id), eq(dungeonRun.version, run.version)),
              );
            return claimed.rowsAffected === 1;
          },
          initiate: ({ battleId }) =>
            initiateBattle(
              {
                client: ctx.drizzle,
                userIds: state.memberIds,
                targetIds: floor.waves.flatMap((w) => w.aiIds),
                biome: run.content.background,
                forceKeepPools: true,
                coop: {
                  kind: "dungeon",
                  battleId,
                  runId: run.id,
                  runVersion: run.version + 1,
                  runState: state,
                  totalFloors: run.content.tiers.flat().length,
                  roomKind: floor.kind,
                  expiresAt: expiresAt.getTime(),
                  waves: floor.waves,
                },
              },
              "QUEST",
              0,
            ),
          recover: ({ battleId }) =>
            rollbackDungeonStart(ctx.drizzle, run, battleId, run.version + 1),
        });
      }

      /** Keep the run's member list consistent with each member's unique active reservation. */
      const updateParty = async (
        client: Pick<DrizzleClient, "update" | "insert" | "delete">,
      ) => {
        const claim = await client
          .update(dungeonRun)
          .set({ state, status, version: sql`${dungeonRun.version} + 1` })
          .where(and(eq(dungeonRun.id, run.id), eq(dungeonRun.version, run.version)));
        if (claim.rowsAffected !== 1) return false;
        if (joined)
          await client.insert(dungeonMember).values({
            runId: run.id,
            userId: ctx.userId,
            activeUserId: ctx.userId,
          });
        if (removedUser)
          await client
            .delete(dungeonMember)
            .where(
              and(
                eq(dungeonMember.runId, run.id),
                eq(dungeonMember.userId, removedUser),
              ),
            );
        if (ending)
          await client
            .update(dungeonMember)
            .set({ activeUserId: null })
            .where(eq(dungeonMember.runId, run.id));
        return true;
      };
      try {
        // Accept/remove/end touch reservations too: a partial commit could put a player
        // in two parties or release an account still present in another party's state.
        const saved = await retryOnDeadlock(() =>
          joined || removedUser || ending
            ? ctx.drizzle.transaction(updateParty)
            : updateParty(ctx.drizzle),
        );
        return saved
          ? { success: true, message: "Party updated." }
          : errorResponse("The party changed. Refresh and try again.");
      } catch (error) {
        if (isMysqlDuplicateKeyError(error))
          return errorResponse("That player joined another dungeon.");
        throw error;
      }
    }),
  /** Deliver the complete pyramid's independent reward roll once per member. */
  claim: protectedProcedure
    .use(ratelimitMiddleware)
    .input(dungeonIdSchema)
    .mutation(async ({ ctx, input }) => {
      const [run, member, user] = await Promise.all([
        ctx.drizzle.query.dungeonRun.findFirst({ where: eq(dungeonRun.id, input.id) }),
        ctx.drizzle.query.dungeonMember.findFirst({
          where: and(
            eq(dungeonMember.runId, input.id),
            eq(dungeonMember.userId, ctx.userId),
          ),
        }),
        ctx.drizzle.query.userData.findFirst({
          where: eq(userData.userId, ctx.userId),
        }),
      ]);
      if (!run || !member || !user || !run.state.memberIds.includes(ctx.userId))
        return errorResponse("You are not in this party.");
      if (member.reward)
        return {
          success: true,
          message: "Rewards already delivered.",
          reward: member.reward,
        };
      if (
        run.status !== "COMPLETED" ||
        run.state.clearedFloors.length !== run.content.tiers.flat().length
      )
        return errorResponse("Clear the entire dungeon to collect rewards.");
      const rewards = run.content.rewards;
      const drops = rewards.drops.filter((d) => Math.random() * 100 < d.chance);
      const rolled = {
        ...ObjectiveReward.parse({
          reward_money: rewards.money,
          reward_exp: rewards.experience,
          reward_tokens: rewards.tokens,
          reward_prestige: rewards.prestige,
        }),
        reward_items: drops.filter((d) => d.type === "item").map((d) => d.id),
        reward_jutsus: drops.filter((d) => d.type === "jutsu").map((d) => d.id),
      };
      const receipt = {
        money: rewards.money,
        experience: rewards.experience,
        tokens: rewards.tokens,
        prestige: rewards.prestige,
        items: rolled.reward_items,
        jutsus: rolled.reward_jutsus,
      };
      // The receipt, scalar grants and item/jutsu inserts must commit together: recording
      // the receipt first loses rewards on failure, while granting first permits duplicates.
      const paid = await retryOnDeadlock(() =>
        ctx.drizzle.transaction(async (tx) => {
          const claim = await tx
            .update(dungeonMember)
            .set({ reward: receipt, activeUserId: null })
            .where(
              and(
                eq(dungeonMember.runId, run.id),
                eq(dungeonMember.userId, ctx.userId),
                isNull(dungeonMember.reward),
              ),
            );
          if (claim.rowsAffected === 0) return false;
          // Reward tasks execute serially inside the driver's rotating transaction session.
          await updateRewards({
            client: tx as unknown as DrizzleClient,
            user,
            rewards: rolled,
            reason: `Dungeon: ${run.content.name}`,
            inTransaction: true,
            persistQuestData: false,
            pvpBoostApplied: true,
          });
          return true;
        }),
      );
      return paid
        ? { success: true, message: "Completion rewards delivered.", reward: receipt }
        : errorResponse("Rewards were already claimed. Refresh to view your receipt.");
    }),
});
