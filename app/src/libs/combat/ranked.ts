import { RankedDivisions } from "@/drizzle/constants";
import type { BattleUserState } from "./types";

const K_FACTOR_BASE = 32;
const STREAK_BONUS = 5;

function getKFactor(lp: number): number {
  // Higher K-factor for lower ranked players to help them climb faster
  if (lp < 300) return K_FACTOR_BASE * 1.5;
  if (lp < 600) return K_FACTOR_BASE * 1.25;
  if (lp < 900) return K_FACTOR_BASE;
  return K_FACTOR_BASE * 0.75; // Lower K-factor for higher ranked players
}

function getRank(lp: number): string {
  for (let i = RankedDivisions.length - 1; i >= 0; i--) {
    if (lp >= RankedDivisions[i].rankedLp) {
      return RankedDivisions[i].name;
    }
  }
  return "UNRANKED";
}

function getRankIndex(rank: string): number {
  return RankedDivisions.findIndex(d => d.name === rank);
}

export function calculateLPChange(
  player: BattleUserState,
  opponent: BattleUserState,
  playerWon: boolean,
): number {
  const kFactor = getKFactor(player.rankedLp);
  const expectedScore = 1 / (1 + Math.pow(10, (opponent.rankedLp - player.rankedLp) / 400));
  const actualScore = playerWon ? 1 : 0;

  let lpChange = kFactor * (actualScore - expectedScore);

  // Get ranks of both players
  const playerRank = getRank(player.rankedLp);
  const opponentRank = getRank(opponent.rankedLp);
  const playerRankIndex = getRankIndex(playerRank);
  const opponentRankIndex = getRankIndex(opponentRank);
  const rankDifference = opponentRankIndex - playerRankIndex;

  // Bonus LP for beating a higher-ranked opponent
  if (playerWon && rankDifference > 0) {
    lpChange += rankDifference * 10;
  }

  // LP Protection: Reduce loss if losing to an opponent 2+ ranks above
  if (!playerWon && rankDifference <= -2) {
    lpChange *= 0.5;
  }

  // Apply streak bonus
  if (playerWon && player.pvpStreak > 0) {
    lpChange += STREAK_BONUS * player.pvpStreak;
  }

  return Math.round(lpChange);
} 
