import { z } from "zod";
import { UserRoles, UserRanks } from "@/drizzle/constants";
import { usernameSchema } from "@/validators/register";
import type { LetterRank, QuestType } from "@/drizzle/constants";
import type { UserWithRelations } from "@/server/api/routers/profile";
import type { ElementName } from "@/drizzle/constants";
import type { ZodAllTags } from "@/libs/combat/types";

export const updateUserSchema = z.object({
  username: usernameSchema,
  customTitle: z.string().min(0).max(199).optional(),
  bloodlineId: z.string().nullable(),
  role: z.enum(UserRoles),
  rank: z.enum(UserRanks),
  jutsus: z.array(z.string()).optional(),
  items: z.array(z.string()).optional(),
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
export type QuestCounterFieldName = ReturnType<typeof getQuestCounterFieldName>;

export const getUserElements = (user: UserWithRelations) => {
  // Natural elements
  const userElements: ElementName[] = [];
  if (user?.primaryElement) userElements.push(user.primaryElement);
  if (user?.secondaryElement) userElements.push(user.secondaryElement);
  // Bloodline elements
  const bloodlineElements = getBloodlineElements(user);
  // Create final list of elements
  const finalElements = bloodlineElements.length > 0 ? bloodlineElements : userElements;
  if (bloodlineElements.length === 1 && userElements.length === 2) {
    finalElements.push(userElements[1] as ElementName);
  }
  finalElements.push("None");
  return Array.from(new Set(finalElements));
};

export const getBloodlineElements = (user: UserWithRelations) => {
  const bloodlineElements: ElementName[] = [];
  user?.bloodline?.effects.map((effect) => {
    if ("elements" in effect && effect.elements) {
      if (isBloodlineEffectBeneficial(effect)) {
        bloodlineElements.push(...effect.elements);
      }
    }
  });
  return bloodlineElements;
};

export const isBloodlineEffectBeneficial = (effect: ZodAllTags) => {
  // Default to beneficial, as should be true for most bloodline effects
  let isStrength = true;
  // Certains tags are negative in a bloodline context
  if (
    [
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

export const getPublicUsersSchema = z.object({
  cursor: z.number().nullish(),
  limit: z.number().min(1).max(100),
  isAi: z.boolean().default(false),
  orderBy: z.enum(["Online", "Strongest", "Weakest", "PvP", "Staff"]),
  username: z
    .string()
    .regex(new RegExp("^[a-zA-Z0-9\\s]*$"), {
      message: "Must only contain alphanumeric characters and no spaces",
    })
    .optional(),
  ip: z.string().optional(),
  village: z.string().optional(),
  bloodline: z.string().optional(),
  recruiterId: z.string().optional(),
  inArena: z.boolean().optional(),
  isEvent: z.boolean().optional(),
  isSummon: z.boolean().optional(),
});
export type GetPublicUsersSchema = z.infer<typeof getPublicUsersSchema>;
