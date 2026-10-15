import { z } from "zod";
import {
  EVENT_TOURNAMENT_MAX_CAPACITY,
  EVENT_TOURNAMENT_MIN_CAPACITY,
} from "@/drizzle/constants";
import { ObjectiveReward } from "@/validators/rewards";

export const tournamentCreateSchema = z.object({
  id: z.string(),
  name: z.string().trim().min(3).max(88),
  image: z.string(),
  description: z.string().trim().min(3).max(500),
  type: z.literal("CLAN"),
  rewards: ObjectiveReward,
});

export type TournamentCreateSchema = z.infer<typeof tournamentCreateSchema>;
export type TournamentCreateSchemaInput = z.input<typeof tournamentCreateSchema>;

const seriesLength = z.union([z.literal(1), z.literal(3), z.literal(5)]);
export const eventTournamentConfigSchema = z
  .object({
    name: z.string().trim().min(3).max(88),
    description: z.string().trim().min(3).max(500),
    registration: z.enum(["OPEN", "INVITE_ONLY"]),
    format: z.enum(["SINGLE_ELIMINATION", "DOUBLE_ELIMINATION", "ROUND_ROBIN"]),
    seeding: z.enum(["RANDOM", "PVP_WINS"]),
    rules: z.enum(["OPEN", "RANKED", "AI"]),
    scheduling: z.enum(["SIMULTANEOUS", "SEQUENTIAL"]),
    capacity: z
      .number()
      .int()
      .min(EVENT_TOURNAMENT_MIN_CAPACITY)
      .max(EVENT_TOURNAMENT_MAX_CAPACITY),
    bestOf: seriesLength,
    roundBestOf: z.array(seriesLength).max(64),
    minBracket: z.number().int().min(0).max(7),
    maxBracket: z.number().int().min(0).max(7),
    minPvpWins: z.number().int().min(0),
    minWinRate: z.number().min(0).max(100),
    minMasteredJutsu: z.number().int().min(0),
    registrationClosesAt: z.number().int().positive(),
    endsAt: z.number().int().positive(),
    rewards: z.object({
      winner: ObjectiveReward,
      runnerUp: ObjectiveReward,
      semifinalist: ObjectiveReward,
      participation: ObjectiveReward,
      perWin: ObjectiveReward,
    }),
  })
  .refine((v) => v.minBracket <= v.maxBracket, "Minimum bracket exceeds maximum")
  .refine(
    (v) => v.endsAt > v.registrationClosesAt,
    "Tournament must end after registration",
  );

export const eventTournamentIdSchema = z.object({ tournamentId: z.string().min(1) });
export const eventTournamentSaveSchema = z.object({
  tournamentId: z.string().optional(),
  config: eventTournamentConfigSchema,
});
export const eventTournamentActionSchema = eventTournamentIdSchema.extend({
  action: z.enum([
    "PUBLISH",
    "SEED",
    "BEGIN",
    "CANCEL",
    "INVITE",
    "REMOVE_INVITE",
    "SUBSTITUTE",
    "RECOVER",
  ]),
  userId: z.string().optional(),
  seatId: z.string().optional(),
  seriesId: z.string().optional(),
  scheduledAt: z.number().int().positive().optional(),
  payRewards: z.boolean().optional(),
});
export const eventTournamentPlayerSchema = eventTournamentIdSchema.extend({
  action: z.enum(["JOIN", "WITHDRAW", "DECLINE", "ACCEPT"]),
  seriesId: z.string().optional(),
});

export type EventTournamentConfig = z.infer<typeof eventTournamentConfigSchema>;
export type EventParticipant = {
  id: string;
  userId: string;
  username: string;
  invited: boolean;
  accepted: boolean;
  withdrawn: boolean;
  seed: number;
  snapshot: {
    bracket: number;
    pvpWins: number;
    winRate: number;
    masteredJutsu: number;
  };
  previousUsers: { userId: string; username: string }[];
};
export type EventSlot =
  | { seatId: string }
  | { seriesId: string; result: "WINNER" | "LOSER" }
  | null;
export type EventGame = {
  id: string;
  battleId: string;
  status: "READY" | "STARTING" | "FIGHTING" | "COMPLETE";
  opensAt: number;
  deadline: number;
  accepted: string[];
  userIds: string[];
  winnerId: string | null;
  outcome: "BATTLE" | "NO_SHOW" | "DOUBLE_NO_SHOW" | "DRAW" | null;
};
export type EventSeries = {
  id: string;
  round: number;
  bracket: "WINNERS" | "LOSERS" | "FINAL" | "LEAGUE";
  slots: [EventSlot, EventSlot];
  seats: [string | null, string | null];
  resolved: boolean;
  complete: boolean;
  winnerId: string | null;
  loserId: string | null;
  winnerUserId: string | null;
  bestOf: 1 | 3 | 5;
  scores: [number, number];
  dodges: [number, number];
  games: EventGame[];
  begun: boolean;
  scheduledAt: number | null;
};
export type EventTournamentState = {
  config: EventTournamentConfig;
  status: "DRAFT" | "REGISTRATION" | "PREPARED" | "RUNNING" | "COMPLETED" | "CANCELLED";
  participants: EventParticipant[];
  series: EventSeries[];
  activeRound: number | null;
  scheduledRoundAt: number | null;
  finishedAt: number | null;
  payRewards: boolean;
  standings: (string | null)[];
  audit: { userId: string; action: string; at: number }[];
};
