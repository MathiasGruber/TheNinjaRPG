import { z } from "zod";
import { UserRoles } from "@/drizzle/constants";
import type { LetterRank, QuestType } from "@/drizzle/constants";
import type { UserWithRelations } from "@/server/api/routers/profile";
import type { ElementName } from "@/drizzle/constants";
import type { ZodAllTags } from "@/libs/combat/types";

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

export const getUserElements = (user: UserWithRelations) => {
  // Natural elements
  const userElements: ElementName[] = [];
  if (user?.primaryElement) userElements.push(user.primaryElement);
  if (user?.secondaryElement) userElements.push(user.secondaryElement);
  // Bloodline elements
  const bloodlineElements: ElementName[] = [];
  user?.bloodline?.effects.map((effect) => {
    if ("elements" in effect && effect.elements) {
      if (isBloodlineEffectBeneficial(effect)) {
        bloodlineElements.push(...effect.elements);
      }
    }
  });
  if (bloodlineElements.length > 0) {
    return Array.from(new Set(bloodlineElements));
  } else {
    return Array.from(new Set(userElements));
  }
};

export const isBloodlineEffectBeneficial = (effect: ZodAllTags) => {
  // Default to beneficial, as should be true for most bloodline effects
  let isStrength = true;
  // Certains tags are negative in a bloodline context
  if (
    [
      "decreasearmor",
      "decreasedamagegiven",
      "increasedamagetaken",
      "decreaseheal",
      "decreasestat",
      "damage",
    ].includes(effect.type)
  )
    isStrength = false;
  return isStrength;
};
