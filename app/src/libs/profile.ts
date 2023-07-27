export const HP_PER_LVL = 10;
export const SP_PER_LVL = 10;
export const CP_PER_LVL = 10;

export function calcLevelRequirements(level: number): number {
  const prevLvl = level - 1;
  const cost = 500 + prevLvl * 500;
  const prevCost = prevLvl > 0 ? calcLevelRequirements(prevLvl) : 0;
  return cost + prevCost;
}

export const calcHP = (level: number) => {
  return 100 + HP_PER_LVL * level;
};

export const calcSP = (level: number) => {
  return 100 + SP_PER_LVL * level;
};

export const calcCP = (level: number) => {
  return 100 + CP_PER_LVL * level;
};
