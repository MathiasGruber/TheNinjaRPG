import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import {
  actionLog,
  huntingHabitat,
  huntingProgress,
  huntingSession,
  item,
  sectorMap,
  userData,
} from "@/drizzle/schema";
import { huntingAllowance, huntingEligibility } from "@/libs/hunting/contracts";
import { findNearestReachableCoordinate } from "@/libs/sector-map/validation";
import { initiateBattle } from "@/routers/combat";
import {
  createTRPCRouter,
  errorResponse,
  protectedProcedure,
  ratelimitMiddleware,
} from "@/server/api/trpc";
import type { DrizzleClient } from "@/server/db";
import { isMysqlDuplicateKeyError, retryOnDeadlock } from "@/server/utils/mysqlErrors";
import { canChangeContent } from "@/utils/permissions";
import {
  acceptHuntingContractSchema,
  huntingIdSchema,
  huntingSessionActionSchema,
  saveHuntingHabitatSchema,
} from "@/validators/hunting";

/** Staff-authored definitions and version-guarded, personal hunting sessions. */
export const huntingRouter = createTRPCRouter({
  /**
   * Load only the caller's encounter for travel/dashboard polling in one joined read.
   * Missing accepted terms leave a null contract so legacy sessions can still be finished.
   */
  getSession: protectedProcedure.query(async ({ ctx }) => {
    const [row] = await ctx.drizzle
      .select({
        session: huntingSession,
        progress: huntingProgress,
      })
      .from(huntingSession)
      .leftJoin(
        huntingProgress,
        and(
          eq(huntingProgress.userId, huntingSession.userId),
          eq(huntingProgress.contractId, huntingSession.contractId),
        ),
      )
      .where(eq(huntingSession.userId, ctx.userId));
    if (!row) return null;
    const contract = row.session.content?.contracts.find(
      (c) => c.id === row.session.contractId,
    );
    const serverTime = new Date();
    return {
      session: row.session,
      contract: contract ?? null,
      allowance: contract
        ? huntingAllowance(contract, row.progress ?? undefined, serverTime.getTime())
        : null,
      serverTime,
    };
  }),
  /** Load the visible board and session together; filter independent catalogs after parallel reads. */
  getBoard: protectedProcedure.query(async ({ ctx }) => {
    const [user, habitats, session, progress, materials, creatures] = await Promise.all(
      [
        ctx.drizzle.query.userData.findFirst({
          where: eq(userData.userId, ctx.userId),
          columns: {
            occupation: true,
            huntingExperience: true,
            sector: true,
            status: true,
          },
        }),
        ctx.drizzle.query.huntingHabitat.findMany(),
        ctx.drizzle.query.huntingSession.findFirst({
          where: eq(huntingSession.userId, ctx.userId),
        }),
        ctx.drizzle.query.huntingProgress.findMany({
          where: eq(huntingProgress.userId, ctx.userId),
        }),
        ctx.drizzle.query.item.findMany({
          columns: { id: true, name: true, canStack: true, stackSize: true },
          where: eq(item.canBeHunted, true),
        }),
        ctx.drizzle.query.userData.findMany({
          where: eq(userData.isAi, true),
          columns: { userId: true, username: true, level: true },
        }),
      ],
    );
    const visibleHabitats =
      user?.occupation === "HUNTER"
        ? habitats
            .filter((h) => h.content.enabled)
            .map((h) => ({
              ...h,
              content: {
                ...h.content,
                contracts: h.content.contracts.filter((c) => c.enabled),
              },
            }))
        : [];
    // Accepted AI and reward references remain visible after their live contracts change.
    const contracts = [
      ...visibleHabitats.flatMap((h) => h.content.contracts),
      ...(session?.content?.contracts ?? []),
    ];
    const aiIds = new Set(contracts.map((c) => c.aiId));
    const itemIds = new Set(contracts.flatMap((c) => c.rewards.map((r) => r.itemId)));
    return {
      user,
      habitats: visibleHabitats,
      session,
      progress,
      materials: materials.filter((m) => itemIds.has(m.id)),
      creatures: creatures.filter((c) => aiIds.has(c.userId)),
      serverTime: new Date(),
    };
  }),
  /** Return disabled and enabled definitions only to staff with content-edit permission. */
  getAll: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.drizzle.query.userData.findFirst({
      where: eq(userData.userId, ctx.userId),
      columns: { role: true },
    });
    return user && canChangeContent(user.role)
      ? ctx.drizzle.query.huntingHabitat.findMany()
      : [];
  }),
  /** Validate authored references and locations before publishing rules to future contracts. */
  save: protectedProcedure
    .use(ratelimitMiddleware)
    .input(saveHuntingHabitatSchema)
    .mutation(async ({ ctx, input }) => {
      const aiIds = [...new Set(input.content.contracts.map((c) => c.aiId))];
      const itemIds = [
        ...new Set(
          input.content.contracts.flatMap((c) => c.rewards.map((r) => r.itemId)),
        ),
      ];
      const [user, ais, materials, maps, habitats] = await Promise.all([
        ctx.drizzle.query.userData.findFirst({
          where: eq(userData.userId, ctx.userId),
          columns: { role: true },
        }),
        aiIds.length
          ? ctx.drizzle.query.userData.findMany({
              where: and(inArray(userData.userId, aiIds), eq(userData.isAi, true)),
              columns: { userId: true },
            })
          : [],
        itemIds.length
          ? ctx.drizzle.query.item.findMany({
              where: and(inArray(item.id, itemIds), eq(item.canBeHunted, true)),
              columns: { id: true },
            })
          : [],
        ctx.drizzle.query.sectorMap.findMany({
          where: and(
            inArray(sectorMap.sector, input.content.sectors),
            eq(sectorMap.status, "PUBLISHED"),
          ),
        }),
        ctx.drizzle.query.huntingHabitat.findMany(),
      ]);
      if (!user || !canChangeContent(user.role))
        return errorResponse("You cannot edit hunting habitats.");
      if (ais.length !== aiIds.length || materials.length !== itemIds.length)
        return errorResponse("Choose existing AI creatures and huntable materials.");
      if (
        input.content.sectors.some(
          (s) =>
            !maps.some(
              (m) =>
                m.sector === s &&
                findNearestReachableCoordinate(m.normalizedJson, { x: 0, y: 0 }),
            ),
        )
      )
        return errorResponse("Every habitat sector needs a published, reachable map.");
      if (
        habitats.some(
          (h) =>
            h.id !== input.id &&
            h.content.contracts.some((c) =>
              input.content.contracts.some((next) => next.id === c.id),
            ),
        )
      )
        return errorResponse("A contract ID is already used by another habitat.");
      const id = input.id ?? nanoid();
      const existingIds = new Set(
        habitats.find((h) => h.id === input.id)?.content.contracts.map((c) => c.id),
      );
      // New contracts get server IDs so concurrent habitat saves cannot share progress.
      const content = {
        ...input.content,
        contracts: input.content.contracts.map((c) => ({
          ...c,
          id: existingIds.has(c.id) ? c.id : nanoid(),
        })),
      };
      const missing = new Error("Habitat not found. Refresh the editor.");
      // Rules and affected allowances must commit together: a reduced limit can exhaust
      // progress with no cooldown, and an interleaved save must not apply superseded rules.
      // One guarded UPDATE cannot also reconcile the separate progress rows.
      try {
        await retryOnDeadlock(() =>
          ctx.drizzle.transaction(async (tx) => {
            if (input.id) {
              const saved = await tx
                .update(huntingHabitat)
                .set({
                  content,
                  // Same-millisecond saves must invalidate admission's captured revision.
                  updatedAt: sql`GREATEST(CURRENT_TIMESTAMP(3), TIMESTAMPADD(MICROSECOND, 1000, ${huntingHabitat.updatedAt}))`,
                })
                .where(eq(huntingHabitat.id, id));
              if (saved.rowsAffected !== 1) throw missing;
            } else
              await tx
                .insert(huntingHabitat)
                .values({ id, content, updatedAt: new Date() });
            for (const contract of content.contracts) {
              // A reduced allowance that is already exhausted must replenish after its cooldown.
              await tx
                .update(huntingProgress)
                .set({
                  cooldownUntil: new Date(Date.now() + contract.cooldownSeconds * 1000),
                  version: sql`${huntingProgress.version} + 1`,
                })
                .where(
                  and(
                    eq(huntingProgress.contractId, contract.id),
                    sql`${huntingProgress.used} >= ${contract.hunts}`,
                    isNull(huntingProgress.cooldownUntil),
                    // Active contracts keep their allowance and settlement version.
                    sql`NOT EXISTS (SELECT 1 FROM ${huntingSession} WHERE ${huntingSession.userId} = ${huntingProgress.userId} AND ${huntingSession.contractId} = ${huntingProgress.contractId})`,
                  ),
                );
            }
          }),
        );
      } catch (error) {
        if (error === missing) return errorResponse(missing.message);
        throw error;
      }
      await ctx.drizzle.insert(actionLog).values({
        id: nanoid(),
        userId: ctx.userId,
        relatedId: id,
        tableName: "huntingHabitat",
        relatedMsg: "Updated hunting habitat",
        changes: [JSON.stringify(content)],
      });
      return { success: true, message: "Habitat saved.", id, content };
    }),
  /** Active sessions retain their habitat; staff can disable it instead of deleting it. */
  delete: protectedProcedure.input(huntingIdSchema).mutation(async ({ ctx, input }) => {
    const user = await ctx.drizzle.query.userData.findFirst({
      where: eq(userData.userId, ctx.userId),
      columns: { role: true },
    });
    if (!user || !canChangeContent(user.role))
      return errorResponse("You cannot edit hunting habitats.");
    const removed = await ctx.drizzle
      .delete(huntingHabitat)
      .where(
        and(
          eq(huntingHabitat.id, input.id),
          sql`NOT EXISTS (SELECT 1 FROM ${huntingSession} WHERE ${huntingSession.habitatId} = ${input.id})`,
        ),
      );
    if (!removed.rowsAffected) {
      const exists = await ctx.drizzle.query.huntingHabitat.findFirst({
        where: eq(huntingHabitat.id, input.id),
        columns: { id: true },
      });
      return errorResponse(
        exists
          ? "This habitat has active sessions. Disable it instead."
          : "Habitat not found. Refresh the editor.",
      );
    }
    await ctx.drizzle.insert(actionLog).values({
      id: nanoid(),
      userId: ctx.userId,
      relatedId: input.id,
      tableName: "huntingHabitat",
      relatedMsg: "Deleted hunting habitat",
      changes: [],
    });
    return { success: true, message: "Habitat deleted." };
  }),
  /** Capture accepted terms and a reachable sector; atomically reconcile usage when switching. */
  accept: protectedProcedure
    .use(ratelimitMiddleware)
    .input(acceptHuntingContractSchema)
    .mutation(async ({ ctx, input }) => {
      const [user, habitats, session, progress] = await Promise.all([
        ctx.drizzle.query.userData.findFirst({
          where: eq(userData.userId, ctx.userId),
        }),
        ctx.drizzle.query.huntingHabitat.findMany(),
        ctx.drizzle.query.huntingSession.findFirst({
          where: eq(huntingSession.userId, ctx.userId),
        }),
        ctx.drizzle.query.huntingProgress.findFirst({
          where: and(
            eq(huntingProgress.userId, ctx.userId),
            eq(huntingProgress.contractId, input.contractId),
          ),
        }),
      ]);
      const habitat = habitats.find((h) => h.id === input.habitatId);
      const contract = habitat?.content.contracts.find(
        (c) => c.id === input.contractId,
      );
      if (!user || user.isAi || user.isBanned || user.status !== "AWAKE")
        return errorResponse(
          "You must be awake and out of combat to select a contract.",
        );
      if (
        !contract ||
        !habitat?.content.enabled ||
        !contract.enabled ||
        !huntingEligibility(user.occupation, user.huntingExperience, contract)
      )
        return errorResponse("This contract is unavailable at your hunting rank.");
      const allowance = huntingAllowance(contract, progress);
      if (allowance.cooling || !allowance.remaining)
        return errorResponse("This contract is on cooldown.");
      if ((session?.version ?? null) !== input.version || session?.battleId)
        return errorResponse("Your hunting session changed. Refresh the board.");
      if (session?.contractId === contract.id)
        return { success: true, message: "Your existing encounter is still assigned." };
      // Maps carry large JSON payloads; load only the contract's sectors after
      // eligibility and session guards pass.
      const maps = await ctx.drizzle.query.sectorMap.findMany({
        columns: { sector: true, normalizedJson: true },
        where: and(
          inArray(sectorMap.sector, contract.sectors),
          eq(sectorMap.status, "PUBLISHED"),
        ),
      });
      const locations = contract.sectors.filter(
        (s) =>
          habitat.content.sectors.includes(s) &&
          maps.some(
            (m) =>
              m.sector === s &&
              findNearestReachableCoordinate(m.normalizedJson, { x: 0, y: 0 }),
          ),
      );
      const sector = locations[Math.floor(Math.random() * locations.length)];
      if (sector === undefined)
        return errorResponse(
          "There are no approved reachable locations for this contract.",
        );
      // Retain habitat metadata for the board, but freeze only the selected contract.
      const next = {
        id: nanoid(),
        habitatId: habitat.id,
        contractId: contract.id,
        content: { ...habitat.content, contracts: [contract] },
        sector,
        startedAt: new Date(),
        version: (session?.version ?? -1) + 1,
      };
      // An unused zero-allowance row is harmless if another session wins the following CAS.
      await ctx.drizzle
        .insert(huntingProgress)
        .values({ userId: ctx.userId, contractId: contract.id })
        .onDuplicateKeyUpdate({ set: { contractId: contract.id } });
      const previousHabitat = habitats.find((h) => h.id === session?.habitatId);
      const previousContract = previousHabitat?.content.contracts.find(
        (c) => c.id === session?.contractId,
      );
      // A save may reconcile the target allowance before admission; accept only
      // the same habitat version that supplied this session's terms.
      const targetHabitatGuard = and(
        eq(huntingHabitat.id, habitat.id),
        eq(huntingHabitat.updatedAt, habitat.updatedAt),
      );
      try {
        // Switching and reconciling the old allowance share one guarded statement.
        const saved = await retryOnDeadlock(() =>
          ctx.drizzle.execute(
            session
              ? sql`
              UPDATE ${huntingSession} AS s
              LEFT JOIN ${huntingProgress} AS p
                ON p.userId = s.userId AND p.contractId = s.contractId
              SET s.id = ${next.id}, s.habitatId = ${next.habitatId},
                  s.contractId = ${next.contractId}, s.content = ${JSON.stringify(next.content)},
                  s.sector = ${next.sector}, s.readyAt = NULL, s.battleId = NULL,
                  s.lastResult = NULL, s.startedAt = ${next.startedAt}, s.version = ${next.version},
                  p.version = p.version + 1,
                  p.cooldownUntil = ${
                    previousContract
                      ? sql`CASE WHEN p.used >= ${previousContract.hunts} AND p.cooldownUntil IS NULL
                        THEN ${new Date(Date.now() + previousContract.cooldownSeconds * 1000)}
                        ELSE p.cooldownUntil END`
                      : sql`p.cooldownUntil`
                  }
              WHERE s.userId = ${ctx.userId} AND s.id = ${session.id}
                AND s.version = ${session.version} AND s.battleId IS NULL
                AND EXISTS (SELECT 1 FROM ${huntingHabitat} WHERE ${targetHabitatGuard})
                AND ${
                  previousHabitat
                    ? sql`EXISTS (SELECT 1 FROM ${huntingHabitat} WHERE ${huntingHabitat.id} = ${session.habitatId} AND ${huntingHabitat.updatedAt} = ${previousHabitat.updatedAt})`
                    : sql`NOT EXISTS (SELECT 1 FROM ${huntingHabitat} WHERE ${huntingHabitat.id} = ${session.habitatId})`
                }
            `
              : sql`
                INSERT INTO ${huntingSession}
                  (userId, id, habitatId, contractId, content, sector, readyAt,
                   battleId, version, startedAt, lastResult)
                SELECT ${ctx.userId}, ${next.id}, ${next.habitatId}, ${next.contractId},
                       ${JSON.stringify(next.content)}, ${next.sector}, NULL, NULL,
                       ${next.version}, ${next.startedAt}, NULL
                FROM ${huntingHabitat} WHERE ${targetHabitatGuard}
              `,
          ),
        );
        if (saved.rowsAffected === 0)
          return errorResponse("Your hunting session changed. Refresh the board.");
      } catch (error) {
        if (!isMysqlDuplicateKeyError(error)) throw error;
        return errorResponse("You already have an active contract. Refresh the board.");
      }
      return {
        success: true,
        message: `Contract accepted. Travel to sector ${sector}.`,
      };
    }),
  /** Prepare accepted terms once, or finish the displayed session and reconcile reduced limits. */
  sessionAction: protectedProcedure
    .input(huntingSessionActionSchema)
    .mutation(async ({ ctx, input }) => {
      const [user, session] = await Promise.all([
        ctx.drizzle.query.userData.findFirst({
          where: eq(userData.userId, ctx.userId),
        }),
        ctx.drizzle.query.huntingSession.findFirst({
          where: eq(huntingSession.userId, ctx.userId),
        }),
      ]);
      if (
        !session ||
        session.id !== input.id ||
        session.version !== input.version ||
        session.battleId
      )
        return errorResponse(
          "Your session changed or is in combat. Refresh the board.",
        );
      const guard = and(
        eq(huntingSession.userId, ctx.userId),
        eq(huntingSession.id, input.id),
        eq(huntingSession.version, input.version),
        isNull(huntingSession.battleId),
      );
      if (input.action === "finish") {
        // A joined UPDATE can switch contracts, but MySQL cannot DELETE this session
        // and UPDATE its allowance in one statement. Separate writes could release it
        // without starting an exhausted allowance's cooldown if reconciliation fails.
        // Keep this transaction confined to finish so both writes commit or retry together.
        const saved = await retryOnDeadlock(() =>
          ctx.drizzle.transaction(async (tx) => {
            const deleted = await tx.delete(huntingSession).where(guard);
            if (deleted.rowsAffected === 1)
              await reconcileInactiveAllowance(
                tx as unknown as DrizzleClient,
                ctx.userId,
                session.habitatId,
                session.contractId,
              );
            return deleted;
          }),
        );
        return saved.rowsAffected === 1
          ? {
              success: true,
              message: "Hunting finished. Your contract allowance is preserved.",
            }
          : errorResponse("Your session changed.");
      }
      const contract = session.content?.contracts.find(
        (c) => c.id === session.contractId,
      );
      if (
        !user ||
        user.status !== "AWAKE" ||
        user.isBanned ||
        user.sector !== session.sector ||
        !contract ||
        !huntingEligibility(user.occupation, user.huntingExperience, contract)
      )
        return errorResponse(
          "Travel to the assigned sector as an eligible Hunter before preparing.",
        );
      if (session.readyAt)
        return { success: true, message: "Preparation has already started." };
      const saved = await ctx.drizzle
        .update(huntingSession)
        .set({
          readyAt: new Date(Date.now() + contract.preparationSeconds * 1000),
          version: sql`${huntingSession.version} + 1`,
        })
        .where(guard);
      return saved.rowsAffected === 1
        ? { success: true, message: "Preparation started." }
        : errorResponse("Your session changed.");
    }),
  /** Validate accepted terms and preload combat data before guarded encounter admission. */
  start: protectedProcedure
    .use(ratelimitMiddleware)
    .input(huntingIdSchema)
    .mutation(async ({ ctx, input }) => {
      const [user, session, progressRows, materials] = await Promise.all([
        ctx.drizzle.query.userData.findFirst({
          where: eq(userData.userId, ctx.userId),
        }),
        ctx.drizzle.query.huntingSession.findFirst({
          where: eq(huntingSession.userId, ctx.userId),
        }),
        ctx.drizzle.query.huntingProgress.findMany({
          where: eq(huntingProgress.userId, ctx.userId),
        }),
        ctx.drizzle.query.item.findMany({
          where: eq(item.canBeHunted, true),
          columns: { id: true, name: true, canStack: true, stackSize: true },
        }),
      ]);
      const contract = session?.content?.contracts.find(
        (c) => c.id === session?.contractId,
      );
      if (!session || session.id !== input.id || session.battleId || !contract)
        return errorResponse("This hunting session is unavailable. Refresh the board.");
      const progress = progressRows.find((p) => p.contractId === contract.id);
      const allowance = huntingAllowance(contract, progress);
      if (
        !user ||
        user.status !== "AWAKE" ||
        user.isBanned ||
        user.isAi ||
        user.battleId ||
        user.sector !== session.sector ||
        !huntingEligibility(user.occupation, user.huntingExperience, contract)
      )
        return errorResponse(
          "You must be an eligible, awake Hunter in the assigned sector.",
        );
      if (!session.readyAt || session.readyAt.getTime() > Date.now())
        return errorResponse("Finish preparing before starting combat.");
      if (!progress || allowance.cooling || allowance.remaining < 1)
        return errorResponse("This contract is on cooldown.");
      // Maps carry large JSON payloads; load only the assigned sector after
      // eligibility and session guards pass.
      const maps = await ctx.drizzle.query.sectorMap.findMany({
        columns: { sector: true, normalizedJson: true },
        where: and(
          eq(sectorMap.sector, session.sector),
          eq(sectorMap.status, "PUBLISHED"),
        ),
      });
      if (
        !contract.sectors.includes(session.sector) ||
        !maps.some(
          (m) =>
            m.sector === session.sector &&
            findNearestReachableCoordinate(m.normalizedJson, { x: 0, y: 0 }),
        )
      )
        return errorResponse(
          "The encounter location is no longer approved. Select another contract.",
        );
      if (contract.rewards.some((r) => !materials.some((m) => m.id === r.itemId)))
        return errorResponse(
          "A contract material is unavailable. Please contact staff.",
        );
      return initiateBattle(
        {
          client: ctx.drizzle,
          userIds: [ctx.userId],
          targetIds: [contract.aiId],
          sector: user.sector,
          hunting: {
            userId: ctx.userId,
            sessionId: session.id,
            sessionVersion: session.version,
            habitatId: session.habitatId,
            contract,
            used: allowance.used,
            progressVersion: progress.version,
            huntingExperience: user.huntingExperience,
            materialNames: Object.fromEntries(materials.map((m) => [m.id, m.name])),
            materialStacks: Object.fromEntries(
              materials.map((m) => [m.id, m.canStack ? Math.max(1, m.stackSize) : 1]),
            ),
          },
        },
        "HUNTING",
        0,
      );
    }),
});

/**
 * Start a reduced allowance's cooldown without changing its consumed hunts.
 * The caller must release the session on this same transaction client first; failures
 * must roll back both operations. Habitat revisions and active-session guards prevent
 * applying superseded rules or changing another accepted contract's allowance.
 */
const reconcileInactiveAllowance = async (
  client: DrizzleClient,
  userId: string,
  habitatId: string,
  contractId: string,
) => {
  // This read depends on releasing the session: a concurrent save must see the
  // allowance as inactive, or finish before we read its updated terms.
  const habitat = await client.query.huntingHabitat.findFirst({
    where: eq(huntingHabitat.id, habitatId),
  });
  const contract = habitat?.content.contracts.find((c) => c.id === contractId);
  if (!habitat || !contract) return;
  await client
    .update(huntingProgress)
    .set({
      cooldownUntil: new Date(Date.now() + contract.cooldownSeconds * 1000),
      version: sql`${huntingProgress.version} + 1`,
    })
    .where(
      and(
        eq(huntingProgress.userId, userId),
        sql`EXISTS (SELECT 1 FROM ${huntingHabitat} WHERE ${huntingHabitat.id} = ${habitatId} AND ${huntingHabitat.updatedAt} = ${habitat.updatedAt})`,
        eq(huntingProgress.contractId, contract.id),
        sql`${huntingProgress.used} >= ${contract.hunts}`,
        isNull(huntingProgress.cooldownUntil),
        sql`NOT EXISTS (SELECT 1 FROM ${huntingSession} WHERE ${huntingSession.userId} = ${userId} AND ${huntingSession.contractId} = ${contract.id})`,
      ),
    );
};
