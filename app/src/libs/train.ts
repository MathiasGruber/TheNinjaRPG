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
  return Math.floor(Math.pow(base, 1 + level / 10) * 10);
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
