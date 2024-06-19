import HumanDiff from "human-object-diff";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { api } from "@/utils/api";
import { UserRoles, UserRanks } from "@/drizzle/constants";
import { showMutationToast, showFormErrorsToast } from "@/libs/toast";
import { updateUserSchema } from "@/validators/user";
import type { UpdateUserSchema } from "@/validators/user";
import type { UserData } from "@/drizzle/schema";
import type { FormEntry } from "@/layout/EditContent";
import { USER_CAPS, HP_PER_LVL, SP_PER_LVL, CP_PER_LVL } from "@/drizzle/constants";
import { capitalizeFirstLetter } from "@/utils/sanitize";
import type { UserRank } from "@/drizzle/constants";

export function calcLevelRequirements(level: number): number {
  const prevLvl = level - 1;
  const cost = 500 + prevLvl * 500;
  const prevCost = prevLvl > 0 ? calcLevelRequirements(prevLvl) : 0;
  return cost + prevCost;
}

export const calcLevel = (experience: number) => {
  let level = 1;
  let exp = 0;
  while (exp < experience) {
    exp += 500 + level * 500;
    if (exp < experience) {
      level += 1;
    }
  }
  return level;
};

export const calcHP = (level: number) => {
  return 100 + HP_PER_LVL * (level - 1);
};

export const calcSP = (level: number) => {
  return 100 + SP_PER_LVL * (level - 1);
};

export const calcCP = (level: number) => {
  return 100 + CP_PER_LVL * (level - 1);
};

type StatDistribution = {
  ninjutsuOffence: number;
  ninjutsuDefence: number;
  genjutsuOffence: number;
  genjutsuDefence: number;
  taijutsuOffence: number;
  taijutsuDefence: number;
  bukijutsuOffence: number;
  bukijutsuDefence: number;
  strength: number;
  intelligence: number;
  willpower: number;
  speed: number;
};

export function capUserStats(user: UserData) {
  const stats_cap = USER_CAPS[user.rank].STATS_CAP;
  const gens_cap = USER_CAPS[user.rank].GENS_CAP;
  if (user.ninjutsuOffence > stats_cap) user.ninjutsuOffence = stats_cap;
  if (user.genjutsuOffence > stats_cap) user.genjutsuOffence = stats_cap;
  if (user.taijutsuOffence > stats_cap) user.taijutsuOffence = stats_cap;
  if (user.bukijutsuOffence > stats_cap) user.bukijutsuOffence = stats_cap;
  if (user.ninjutsuDefence > stats_cap) user.ninjutsuDefence = stats_cap;
  if (user.genjutsuDefence > stats_cap) user.genjutsuDefence = stats_cap;
  if (user.taijutsuDefence > stats_cap) user.taijutsuDefence = stats_cap;
  if (user.bukijutsuDefence > stats_cap) user.bukijutsuDefence = stats_cap;
  if (user.strength > gens_cap) user.strength = gens_cap;
  if (user.speed > gens_cap) user.speed = gens_cap;
  if (user.intelligence > gens_cap) user.intelligence = gens_cap;
  if (user.willpower > gens_cap) user.willpower = gens_cap;
}

/** Scale stats of user, and return total number of experience / stat points */
export function scaleUserStats(user: UserData) {
  // Pools
  user["curHealth"] = calcHP(user.level);
  user["maxHealth"] = calcHP(user.level);
  user["curStamina"] = calcSP(user.level);
  user["maxStamina"] = calcSP(user.level);
  user["curChakra"] = calcCP(user.level);
  user["maxChakra"] = calcCP(user.level);
  // Stats
  const exp = calcLevelRequirements(user.level) - 500;
  user["experience"] = exp;
  const sum = [
    user.ninjutsuOffence ?? 0,
    user.ninjutsuDefence ?? 0,
    user.genjutsuOffence ?? 0,
    user.genjutsuDefence ?? 0,
    user.taijutsuOffence ?? 0,
    user.taijutsuDefence ?? 0,
    user.bukijutsuOffence ?? 0,
    user.bukijutsuDefence ?? 0,
    user.strength ?? 0,
    user.intelligence ?? 0,
    user.willpower ?? 0,
    user.speed ?? 0,
  ].reduce((a, b) => a + b, 0);
  const calcStat = (stat: keyof StatDistribution) => {
    return 10 + Math.floor(((user[stat] ?? 0) / sum) * exp * 100) / 100;
  };
  user["ninjutsuOffence"] = calcStat("ninjutsuOffence");
  user["ninjutsuDefence"] = calcStat("ninjutsuDefence");
  user["genjutsuOffence"] = calcStat("genjutsuOffence");
  user["genjutsuDefence"] = calcStat("genjutsuDefence");
  user["taijutsuOffence"] = calcStat("taijutsuOffence");
  user["taijutsuDefence"] = calcStat("taijutsuDefence");
  user["bukijutsuOffence"] = calcStat("bukijutsuOffence");
  user["bukijutsuDefence"] = calcStat("bukijutsuDefence");
  user["strength"] = calcStat("strength");
  user["intelligence"] = calcStat("intelligence");
  user["willpower"] = calcStat("willpower");
  user["speed"] = calcStat("speed");
}

/**
 * Hook used when creating frontend forms for editing AIs
 * @param data
 */
export const useUserEditForm = (
  userId: string,
  user: UpdateUserSchema,
  refetch: () => void,
) => {
  // Form handling
  const form = useForm<UpdateUserSchema>({
    mode: "all",
    criteriaMode: "all",
    values: user,
    defaultValues: user,
    resolver: zodResolver(updateUserSchema),
  });

  // Mutation for updating item
  const { mutate: updateUser, isPending: loading } = api.profile.updateUser.useMutation(
    {
      onSuccess: (data) => {
        showMutationToast(data);
        refetch();
      },
    },
  );

  // Form submission
  const handleUserSubmit = form.handleSubmit(
    (data) => {
      const diff = new HumanDiff({}).diff(user, data);
      if (diff.length > 0) {
        updateUser({ id: userId, data: data });
      }
    },
    (errors) => showFormErrorsToast(errors),
  );

  // Object for form values
  const formData: FormEntry<keyof UpdateUserSchema>[] = [
    { id: "role", type: "str_array", values: UserRoles },
    { id: "rank", type: "str_array", values: UserRanks },
  ];

  return { user, loading, form, formData, handleUserSubmit };
};

export const activityStreakRewards = (streak: number) => {
  const rewards = { money: streak * 100, reputationPoints: 0 };
  if (streak % 10 === 0) {
    rewards["reputationPoints"] = Math.floor(streak / 10);
  }
  return rewards;
};

export const showUserRank = (user: { rank: UserRank; isOutlaw: boolean }) => {
  if (!user) return "Unknown";
  if (user.isOutlaw) {
    switch (user.rank) {
      case "CHUNIN":
        return "Lower Outlaw";
      case "JONIN":
        return "Higher Outlaw";
      case "COMMANDER":
        return "Special Outlaw";
      case "ELDER":
        return "Outlaw Council";
    }
  }
  return capitalizeFirstLetter(user.rank);
};
