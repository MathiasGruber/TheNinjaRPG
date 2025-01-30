import { z } from "zod";
import { TimeFrames, LetterRanks, QuestTypes } from "@/drizzle/constants";
import { allObjectiveTasks } from "@/validators/objectives";

export const searchQuestSchema = z.object({
  name: z.string().min(0).max(256).optional(),
  userLevel: z.number().min(0).max(150).optional(),
});

export type SearchQuestSchema = z.infer<typeof searchQuestSchema>;

export const questFilteringSchema = z.object({
  name: z.string().min(0).max(256).optional(),
  objectives: z.array(z.enum(allObjectiveTasks)).optional(),
  questType: z.enum(QuestTypes).optional(),
  rank: z.enum(LetterRanks).optional(),
  timeframe: z.enum(TimeFrames).optional(),
  userLevel: z.coerce.number().min(0).max(150).optional(),
  village: z.string().optional(),
  hidden: z.boolean().optional(),
  prerequisiteQuestId: z.string().optional(),
});

export type QuestFilteringSchema = z.infer<typeof questFilteringSchema>;
