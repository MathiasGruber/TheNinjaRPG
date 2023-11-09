import { StatType, GeneralType } from "./combat/constants";
import { tagTypes } from "./combat/types";
import { LetterRanks } from "../../drizzle/constants";
import type { Jutsu, JutsuRank } from "../../drizzle/schema";
import type { UserData, UserRank, FederalStatus } from "../../drizzle/schema";

export const ENERGY_SPENT_PER_SECOND = 0.1;

const sufficientJutsuRank = (rank: JutsuRank, userrank: UserRank) => {
  switch (userrank) {
    case "STUDENT":
      return rank === "D";
    case "GENIN":
      return "DC".includes(rank);
    case "CHUNIN":
      return "DCB".includes(rank);
    case "JONIN":
      return "DCBA".includes(rank);
    case "COMMANDER":
      return "DCBAS".includes(rank);
  }
};

export const canTrainJutsu = (jutsu: Jutsu, userdata: UserData) => {
  const sufficientRank = sufficientJutsuRank(jutsu.jutsuRank, userdata.rank);
  const villageCheck = !jutsu.villageId || jutsu.villageId === userdata.villageId;
  const bloodCheck = !jutsu.bloodlineId || jutsu.bloodlineId === userdata.bloodlineId;
  return sufficientRank && villageCheck && bloodCheck;
};

export const calcJutsuTrainTime = (jutsu: Jutsu, level: number) => {
  let base = 20;
  if (jutsu.jutsuRank === "C") {
    base = 22;
  } else if (jutsu.jutsuRank === "B") {
    base = 24;
  } else if (jutsu.jutsuRank === "A") {
    base = 26;
  } else if (jutsu.jutsuRank === "S") {
    base = 28;
  }
  return Math.pow(base, 1 + level / 10) * 1000;
};

export const calcJutsuTrainCost = (jutsu: Jutsu, level: number) => {
  let base = 50;
  if (jutsu.jutsuRank === "C") {
    base = 100;
  } else if (jutsu.jutsuRank === "B") {
    base = 150;
  } else if (jutsu.jutsuRank === "A") {
    base = 200;
  } else if (jutsu.jutsuRank === "S") {
    base = 250;
  }
  return Math.floor(Math.pow(base, 1 + level / 20));
};

export const calcForgetReturn = (jutsu: Jutsu, level: number) => {
  const discount = 0.9;
  let result = 0;
  for (let i = 0; i < level; i++) {
    result += calcJutsuTrainCost(jutsu, i);
  }
  return result * discount;
};

export const calcJutsuEquipLimit = (userdata: UserData) => {
  const rankContrib = (rank: UserRank) => {
    switch (rank) {
      case "GENIN":
        return 5;
      case "CHUNIN":
        return 6;
      case "JONIN":
        return 7;
      case "COMMANDER":
        return 8;
    }
    return 4;
  };
  const fedContrib = (status: FederalStatus) => {
    switch (status) {
      case "NORMAL":
        return 1;
      case "SILVER":
        return 2;
      case "GOLD":
        return 3;
    }
    return 0;
  };
  return 1 + rankContrib(userdata.rank) + fedContrib(userdata.federalStatus);
};

// For categorizing jutsu
export const mainFilters = [
  "No Filter",
  "Name",
  "Bloodline",
  "Stat",
  "Effect",
  "AppearAnimation",
  "StaticAnimation",
  "DisappearAnimation",
] as const;
export const statFilters = [...StatType, ...GeneralType] as const;
export const effectFilters = tagTypes;
export const rarities = ["ALL", ...LetterRanks] as const;
export type FilterType = typeof mainFilters[number];
export type StatType = typeof statFilters[number];
export type EffectType = typeof effectFilters[number];
export type RarityType = typeof rarities[number];
