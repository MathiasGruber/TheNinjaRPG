export const HP_PER_LVL = 50;
export const SP_PER_LVL = 50;
export const CP_PER_LVL = 50;
export const COST_CHANGE_USERNAME = 5;
export const MAX_ATTRIBUTES = 5;

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
