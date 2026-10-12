import { and, eq, getTableColumns, or, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import {
  IMG_DEFAULT_PROFILE_PICTURE,
  TUTORIAL_STARTER_QUEST_ID,
} from "@/drizzle/constants";
import {
  bloodline,
  bloodlineRolls,
  emailReminder,
  historicalIp,
  paypalSubscription,
  questHistory,
  recruitReferral,
  referralSource,
  storePurchase,
  storeUserIdAlias,
  userAttribute,
  userData,
  userReport,
  userItem,
  village,
  visitorLog,
} from "@/drizzle/schema";
import {
  baseServerResponse,
  createTRPCRouter,
  errorResponse,
  protectedProcedure,
} from "@/server/api/trpc";
import { createStarterHomeItems } from "@/server/utils/homeFurniture";
import { hashIp } from "@/server/utils/ipHash";
import { isMysqlDuplicateKeyError, retryOnDeadlock } from "@/server/utils/mysqlErrors";
import {
  isDeletedStoreUserId,
  settleRecordedLedger,
} from "@/server/utils/purchases/grant";
import { checkRecruitSignupEligibility } from "@/server/utils/recruitment";
import {
  carryoverReportId,
  discardUnpublishedSanctions,
  fetchActiveSanctionTombstones,
  fetchSanctionIdentity,
  matchSanctionTombstones,
  reapplySanctions,
} from "@/server/utils/sanctionTombstone";
import { checkForBadWords } from "@/utils/profanity";
import { secondsFromNow } from "@/utils/time";
import { registrationSchema, utmSourceSchema } from "@/validators/register";

export const registerRouter = createTRPCRouter({
  // Set referral source on sign-in (before character creation)
  setReferralSource: protectedProcedure
    .meta({ mcp: { description: "Set referral source for analytics" } })
    .input(z.object({ utmSource: utmSourceSchema }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      // If already set, no-op
      const existing = await ctx.drizzle.query.referralSource.findFirst({
        where: eq(referralSource.userId, ctx.userId),
      });
      if (existing) {
        return { success: true, message: "Referral source already set" };
      }

      // Determine source: provided utmSource or fallback from visitorLog by IP
      const provided = (input?.utmSource ?? "").trim();
      let source = provided;
      if (!source) {
        const ip = ctx.userIp ?? "unknown";
        if (ip !== "unknown") {
          const visit = await ctx.drizzle.query.visitorLog.findFirst({
            where: eq(visitorLog.ipHash, hashIp(ip)),
          });
          source = (visit?.utmSource ?? "").trim();
        }
      }

      if (!source) {
        return { success: true, message: "No UTM source found to set" };
      }

      // Ensure we map IP -> user for later analytics joins
      const ip = ctx.userIp ?? "unknown";
      if (ip !== "unknown") {
        const currentIp = await ctx.drizzle.query.historicalIp.findFirst({
          where: and(eq(historicalIp.ip, ip), eq(historicalIp.userId, ctx.userId)),
        });
        if (!currentIp) {
          await ctx.drizzle
            .insert(historicalIp)
            .values({ userId: ctx.userId, ip, ipHash: hashIp(ip) });
        }
      }

      await ctx.drizzle.insert(referralSource).values({
        id: nanoid(),
        userId: ctx.userId,
        source,
      });
      return { success: true, message: "Referral source set" };
    }),
  // Create Character
  createCharacter: protectedProcedure
    .meta({ mcp: { description: "Create a new character" } })
    .input(registrationSchema)
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      // Query
      const [
        villageData,
        existingUser,
        usernameTaken,
        reminder,
        selectedBloodline,
        currentIp,
        moderationResult,
        storeAlias,
        storeHistory,
        paypalHistory,
        recruitEligibility,
        tombstones,
        carryoverReports,
      ] = await Promise.all([
        ctx.drizzle.query.village.findFirst({
          where: eq(village.name, "Horizon"),
        }),
        ctx.drizzle.query.userData.findFirst({
          where: eq(userData.userId, ctx.userId),
        }),
        ctx.drizzle.query.userData.findFirst({
          where: eq(userData.username, input.username),
        }),
        ctx.drizzle.query.emailReminder.findFirst({
          where: eq(emailReminder.userId, ctx.userId),
        }),
        ctx.drizzle.query.bloodline.findFirst({
          where: eq(bloodline.id, input.bloodlineId),
        }),
        ctx.drizzle.query.historicalIp.findFirst({
          where: and(
            eq(historicalIp.ip, ctx.userIp ?? ""),
            eq(historicalIp.userId, ctx.userId),
          ),
        }),
        checkForBadWords(input.username),
        ctx.drizzle.query.storeUserIdAlias.findFirst({
          columns: { newUserId: true },
          where: eq(storeUserIdAlias.oldUserId, ctx.userId),
        }),
        ctx.drizzle.query.storePurchase.findFirst({
          columns: { id: true },
          where: eq(storePurchase.userId, ctx.userId),
        }),
        ctx.drizzle.query.paypalSubscription.findFirst({
          columns: { id: true },
          where: eq(paypalSubscription.affectedUserId, ctx.userId),
        }),
        input.recruiter_userid
          ? checkRecruitSignupEligibility({
              client: ctx.drizzle,
              recruitUserId: ctx.userId,
              recruiterId: input.recruiter_userid,
              signupIp: ctx.userIp,
            })
          : Promise.resolve(null),
        fetchActiveSanctionTombstones(ctx.drizzle),
        ctx.drizzle.query.userReport.findMany({
          columns: { id: true },
          where: and(
            eq(userReport.reportedUserId, ctx.userId),
            eq(userReport.system, "sanction_carryover"),
          ),
        }),
      ]);
      // Whatever the ledger holds for this identity is settled once a character row exists,
      // on every path that reaches one. A tombstone seen here means receipts can still be
      // landing under it until it is removed below; store or PayPal history means there is
      // a tier or a delivery to derive. A plain first registration has none of these.
      const hasLedger = Boolean(storeAlias || storeHistory || paypalHistory);

      // Guard
      if (!moderationResult.success) return moderationResult;
      if (existingUser) {
        // A retry after registration failed part-way settles what it did not get to.
        if (hasLedger) await settleRecordedLedger(ctx.drizzle, ctx.userId);
        return errorResponse("Character already created for this account");
      }
      if (usernameTaken) return errorResponse("Username already taken");
      if (!villageData) return errorResponse("Horizon village not found");
      if (villageData.type !== "VILLAGE")
        return errorResponse("Can only join villages");
      if (!selectedBloodline) return errorResponse("Bloodline not found");
      if (selectedBloodline.rank !== "D")
        return errorResponse("Only D-ranked bloodlines are allowed for new users");
      if (selectedBloodline.hidden)
        return errorResponse("Hidden bloodlines are not allowed for new users");

      // Mutate. Sorted so concurrent inserts for the same account take the
      // UserAttribute unique-index locks in the same order and cannot deadlock.
      const unique_attributes = [
        ...new Set([
          input.attribute_1,
          input.attribute_2,
          input.attribute_3,
          `${input.hair_color} hair`,
          `${input.eye_color} eyes`,
          `${input.skin_color} skin`,
        ]),
      ].sort();
      // Deleting a character retires the Clerk identity in the store ledger, so events for a
      // character that no longer exists are recorded without being delivered. The identity
      // coming back to make another character is the ordinary flow, and the web delete
      // deliberately leaves the player signed in for it, so the tombstone goes, and what the
      // ledger recorded meanwhile -- a renewal, an expiry, a transfer -- is settled as soon
      // as the character row exists, whichever request that turns out to be. Reputation points delivered to the deleted character stay
      // with it; every receipt is idempotent by transactionId, so nothing is delivered
      // twice. A rename alias is different: its target is a live character that this
      // identity's receipts route to, so it refuses.
      //
      // The tombstone delete and the insert are two statements rather than a guard folded
      // into one. Deletion writes its tombstone first and removes the account row last,
      // dozens of statements apart, so slipping a character past the alias read would take
      // the same identity deleting and registering at once, with the whole deletion landing
      // in between. The ledger records around a tombstone rather than dropping, so what that
      // would cost is push registration until the alias row is removed; closing it would
      // take an insert the builder cannot express.
      if (storeAlias && !isDeletedStoreUserId(storeAlias.newUserId)) {
        return errorResponse(
          "This account is linked to another character and cannot create a new one",
        );
      }
      // A ban or silence still running on a deleted account carries over to this one. The
      // Clerk lookup is only needed while some deleted account has a running sanction.
      const sanctionIdentity = tombstones.length
        ? await fetchSanctionIdentity(ctx.userId)
        : undefined;
      const sanctions = matchSanctionTombstones(
        tombstones,
        ctx.userId,
        sanctionIdentity ?? null,
      );
      const sanctionGuard = await reapplySanctions(
        ctx.drizzle,
        ctx.userId,
        sanctions,
        carryoverReports.map((report) => report.id),
        sanctionIdentity,
      );
      const values = {
        userId: ctx.userId,
        lastIp: ctx.userIp,
        recruiterId: input.recruiter_userid,
        username: input.username,
        gender: input.gender,
        avatar: IMG_DEFAULT_PROFILE_PICTURE,
        villageId: villageData.id,
        bloodlineId: selectedBloodline.id,
        approvedTos: true,
        sector: villageData.sector,
        extraJutsuSlots: 0,
        immunityUntil: secondsFromNow(24 * 3600),
        musicOn: input.musicOn ?? true,
        sfxOn: input.sfxOn ?? true,
        buttonSfxOn: input.buttonSfxOn ?? true,
        isBanned: sanctions.some((match) => match.sanction === "BAN"),
        isSilenced: sanctions.some((match) => match.sanction === "SILENCE"),
        ...(reminder ? { earnedExperience: 10000 } : {}),
      } satisfies typeof userData.$inferInsert;
      const columns = getTableColumns(userData);
      const keys = Object.keys(values) as (keyof typeof values)[];
      // INSERT SELECT publishes flags only with durable cases and unchanged sources.
      // Drizzle's builder requires every table column for SELECT, including defaults.
      const createdUser = await retryOnDeadlock(() =>
        ctx.drizzle.execute(sql`
        INSERT INTO ${userData} (${sql.join(
          keys.map((key) => sql.identifier(columns[key].name)),
          sql`, `,
        )})
        SELECT ${sql.join(
          keys.map((key) => sql.param(values[key] ?? null, columns[key])),
          sql`, `,
        )}
        WHERE ${sanctionGuard} AND NOT EXISTS (SELECT 1 FROM ${userData} WHERE ${eq(userData.username, input.username)})
      `),
      ).catch(async (error: unknown) => {
        if (isMysqlDuplicateKeyError(error)) return { rowsAffected: 0 };
        await discardUnpublishedSanctions(
          ctx.drizzle,
          ctx.userId,
          sanctions.map((match) => carryoverReportId(ctx.userId, match)),
        );
        throw error;
      });
      if (createdUser.rowsAffected === 0) {
        const currentUser = await ctx.drizzle.query.userData.findFirst({
          columns: { userId: true },
          where: or(
            eq(userData.userId, ctx.userId),
            eq(userData.username, input.username),
          ),
        });
        if (!currentUser || currentUser.userId !== ctx.userId) {
          await discardUnpublishedSanctions(
            ctx.drizzle,
            ctx.userId,
            sanctions.map((match) => carryoverReportId(ctx.userId, match)),
          );
          return errorResponse(
            currentUser
              ? "Username already taken"
              : "Account sanctions changed, please try again",
          );
        }
      }
      if (storeAlias) {
        await ctx.drizzle
          .delete(storeUserIdAlias)
          .where(
            and(
              eq(storeUserIdAlias.oldUserId, ctx.userId),
              eq(storeUserIdAlias.newUserId, storeAlias.newUserId),
            ),
          );
      }
      // The row exists either way now, so settle before answering a duplicate.
      if (hasLedger) await settleRecordedLedger(ctx.drizzle, ctx.userId);
      if (createdUser.rowsAffected === 0) {
        return errorResponse("Character already created for this account");
      }
      await ctx.drizzle
        .delete(userAttribute)
        .where(eq(userAttribute.userId, ctx.userId));
      await Promise.all([
        ctx.drizzle.insert(userItem).values(createStarterHomeItems(ctx.userId)),
        ctx.drizzle
          .insert(questHistory)
          .values({
            id: nanoid(),
            userId: ctx.userId,
            questId: TUTORIAL_STARTER_QUEST_ID,
            questType: "starter",
            startedAt: new Date(),
            endAt: null,
            completed: 0,
            previousCompletes: 0,
            previousAttempts: 1,
          })
          .onDuplicateKeyUpdate({ set: { id: sql`id` } }),
        ctx.drizzle
          .insert(userAttribute)
          .values(
            unique_attributes.map((attribute) => ({
              id: nanoid(),
              attribute: attribute,
              userId: ctx.userId,
            })),
          )
          .onDuplicateKeyUpdate({ set: { id: sql`id` } }),
        ctx.drizzle.insert(bloodlineRolls).values({
          id: nanoid(),
          userId: ctx.userId,
          type: "REGISTRATION",
          bloodlineId: selectedBloodline.id,
          goal: selectedBloodline.rank,
          used: 1,
          pityRolls: 0,
        }),
        ...(ctx.userIp && !currentIp
          ? [
              ctx.drizzle.insert(historicalIp).values({
                userId: ctx.userId,
                ip: ctx.userIp,
                ipHash: hashIp(ctx.userIp),
              }),
            ]
          : []),
        ...(input.recruiter_userid
          ? [
              ctx.drizzle
                .update(userData)
                .set({ nRecruited: sql`${userData.nRecruited} + 1` })
                .where(eq(userData.userId, input.recruiter_userid)),
            ]
          : []),
        // Every recruit counts as a recruit; eligibility only gates rank milestone rewards.
        ...(input.recruiter_userid && recruitEligibility
          ? [
              ctx.drizzle
                .insert(recruitReferral)
                .values({
                  recruitUserId: ctx.userId,
                  recruiterId: input.recruiter_userid,
                  isEligible: recruitEligibility.isEligible,
                  eligibilityReason: recruitEligibility.reason,
                  eligibilityCheckedAt: new Date(),
                })
                .onDuplicateKeyUpdate({
                  set: {
                    recruiterId: input.recruiter_userid,
                    isEligible: recruitEligibility.isEligible,
                    eligibilityReason: recruitEligibility.reason,
                    eligibilityCheckedAt: new Date(),
                  },
                }),
            ]
          : []),
      ]);
      return { success: true, message: "Character created" };
    }),
});
