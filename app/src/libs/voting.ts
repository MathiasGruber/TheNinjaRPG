import type { ACTIVE_VOTING_SITES } from "@/drizzle/constants";
import type { UserVote } from "@/drizzle/schema";

export const getVotingLink = (
  site: (typeof ACTIVE_VOTING_SITES)[number],
  current: UserVote,
) => {
  switch (site) {
    case "top100Arena":
      return `https://www.top100arena.com/listing/101116/vote?incentive=${current.secret}-top100arena`;
    case "mmoHub":
      return `https://mmohub.com/site/1054/vote/${current.secret}-mmohub`;
    case "arenaTop100":
      return `https://www.arena-top100.com/index.php?a=in&u=Terriator&incentive=${current.secret}-arenaTop100`;
  }
};
