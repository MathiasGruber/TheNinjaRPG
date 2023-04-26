import type { UserData, Jutsu } from "@prisma/client/edge";
import { UserRank, LetterRank } from "@prisma/client/edge";

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
