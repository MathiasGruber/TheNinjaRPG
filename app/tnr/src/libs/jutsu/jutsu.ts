import type { UserData, Jutsu } from "@prisma/client";
import { UserRank, FederalStatus, LetterRank } from "@prisma/client";

const hasRank = (rank: LetterRank, userrank: UserRank) => {
  switch (userrank) {
    case UserRank.STUDENT:
      return rank === "D";
    case UserRank.GENIN:
      return "DC".includes(rank);
    case UserRank.CHUNIN:
      return "DCB".includes(rank);
    case UserRank.JONIN:
      return "DCBA".includes(rank);
    case UserRank.COMMANDER:
      return "DCBAS".includes(rank);
  }
};

export const canTrainJutsu = (jutsu: Jutsu, userdata: UserData) => {
  const sufficientRank = hasRank(jutsu.jutsuRank, userdata.rank);
  const villageCheck = !jutsu.villageId || jutsu.villageId === userdata.villageId;
  const bloodCheck = !jutsu.bloodlineId || jutsu.bloodlineId === userdata.bloodlineId;
  return sufficientRank && villageCheck && bloodCheck;
};

export const calcTrainTime = (jutsu: Jutsu, level: number) => {
  let base = 20;
  if (jutsu.jutsuRank === LetterRank.C) {
    base = 22;
  } else if (jutsu.jutsuRank === LetterRank.B) {
    base = 24;
  } else if (jutsu.jutsuRank === LetterRank.A) {
    base = 26;
  } else if (jutsu.jutsuRank === LetterRank.S) {
    base = 28;
  }
  return Math.pow(base, 1 + level / 10) * 1000;
};

export const calcTrainCost = (jutsu: Jutsu, level: number) => {
  let base = 20;
  if (jutsu.jutsuRank === LetterRank.C) {
    base = 22;
  } else if (jutsu.jutsuRank === LetterRank.B) {
    base = 24;
  } else if (jutsu.jutsuRank === LetterRank.A) {
    base = 26;
  } else if (jutsu.jutsuRank === LetterRank.S) {
    base = 28;
  }
  return Math.floor(Math.pow(base, 1 + level / 10) * 10);
};

export const calcJutsuEquipLimit = (userdata: UserData) => {
  const rankContrib = (rank: UserRank) => {
    switch (rank) {
      case UserRank.GENIN:
        return 1;
      case UserRank.CHUNIN:
        return 2;
      case UserRank.JONIN:
        return 3;
      case UserRank.COMMANDER:
        return 4;
    }
    return 0;
  };
  const fedContrib = (status: FederalStatus) => {
    switch (status) {
      case FederalStatus.NORMAL:
        return 1;
      case FederalStatus.SILVER:
        return 2;
      case FederalStatus.GOLD:
        return 3;
    }
    return 0;
  };
  return 1 + rankContrib(userdata.rank) + fedContrib(userdata.federalStatus);
};
