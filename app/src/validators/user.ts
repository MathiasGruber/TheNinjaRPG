import { z } from "zod";
import { UserRoles } from "@/drizzle/constants";
import type { LetterRank, QuestType } from "@/drizzle/constants";

export const updateUserSchema = z.object({
  role: z.enum(UserRoles),
});

export type UpdateUserSchema = z.infer<typeof updateUserSchema>;

export const getQuestCounterFieldName = (
  type: QuestType | undefined,
  rank: LetterRank | undefined,
) => {
  if (type === undefined || rank === undefined) return undefined;
  switch (type) {
    case "errand":
      return "errands";
    case "mission":
      return `missions${rank}` as const;
    case "crime":
      return `crimes${rank}` as const;
    default:
      return undefined;
  }
};
