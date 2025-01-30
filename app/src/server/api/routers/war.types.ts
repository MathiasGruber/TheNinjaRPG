import type { InferSelectModel } from "drizzle-orm";
import type {
  war,
  warFaction,
  warStat,
  village,
  villageDefense,
  villageDefenseWall,
  warDefenseTarget,
} from "@/drizzle/schema";

export type War = InferSelectModel<typeof war>;
export type WarStat = InferSelectModel<typeof warStat>;
export type WarFaction = InferSelectModel<typeof warFaction>;
export type Village = InferSelectModel<typeof village>;
export type VillageDefense = InferSelectModel<typeof villageDefense>;
export type VillageDefenseWall = InferSelectModel<typeof villageDefenseWall>;
export type WarDefenseTarget = InferSelectModel<typeof warDefenseTarget>;

export type VillageDefenseType = VillageDefense["type"];
export type WarDefenseTargetType = WarDefenseTarget["structureType"];

export type MutationResponse = {
  success: boolean;
  message: string;
  warId?: string;
};

export type WarStatus = {
  id: string;
  attackerVillageId: string;
  defenderVillageId: string;
  startedAt: Date;
  endedAt: Date | null;
  status: string;
  dailyTokenReduction: number;
  lastTokenReductionAt: Date;
};

export type WarStructure = {
  type: VillageDefenseType;
  defenseLevel: number;
  hp: number;
};

export type WarWall = {
  level: number;
};

export type WarTarget = {
  villageId: string;
  structureType: WarDefenseTargetType;
};

export type UserData = {
  userId: string;
  villageId: string | null;
  anbuId: string | null;
  rank: string | null;
};
