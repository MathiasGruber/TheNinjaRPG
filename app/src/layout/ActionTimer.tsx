import { useEffect, useState } from "react";
import Image from "next/image";
import Loader from "./Loader";
import { COMBAT_SECONDS } from "../libs/combat/constants";
import { useUserData } from "../utils/UserContext";
import { getDaysHoursMinutesSeconds } from "../utils/time";
import type { CombatAction } from "../libs/combat/types";
import type { ReturnedUserState } from "../libs/combat/types";
import type { ReturnedBattle } from "../libs/combat/types";

interface ActionTimerProps {
  action: CombatAction | undefined;
  user: ReturnedUserState;
  battle: ReturnedBattle;
  isLoading: boolean;
}

const ActionTimer: React.FC<ActionTimerProps> = (props) => {
  // Destructure props
  const { action, user, battle, isLoading } = props;

  // Data from the DB
  const { timeDiff } = useUserData();

  // State
  const [state, setState] = useState<{ label: string; actionPerc: number }>({
    label: "",
    actionPerc: user.actionPoints,
  });

  // Derived values
  const cost = action?.actionCostPerc ?? 0;
  const actionPerc = state.actionPerc;
  const actionAfter = actionPerc - cost;

  // Calculate label and color
  const yellow = "/combat/actionTimer/yellow.webp";
  // const green = "/combat/actionTimer/green.webp";
  const red = "/combat/actionTimer/red.webp";
  const blue = "/combat/actionTimer/blue.webp";

  // Active updating of this component
  useEffect(() => {
    const interval = setInterval(() => {
      // Set label
      const mseconds = Date.now() - timeDiff - new Date(battle.createdAt).getTime();
      const round = Math.floor(mseconds / 1000 / COMBAT_SECONDS);
      const left = (1 + round) * 1000 * COMBAT_SECONDS - mseconds;
      const [, , , seconds] = getDaysHoursMinutesSeconds(left);
      // Are we in a new round, or same round as previous database update
      const lastUserUpdate = new Date(user.updatedAt);
      const latestRoundAt = new Date(
        battle.createdAt.getTime() + round * COMBAT_SECONDS * 1000
      );
      const actionPerc = lastUserUpdate < latestRoundAt ? 100 : user.actionPoints;
      // Update state
      if (round >= 0) {
        setState({ label: `Round: ${round} - Next: ${seconds}s`, actionPerc });
      } else {
        setState({ label: `Waiting in Lobby`, actionPerc });
      }
      // Set action points
    }, 100);
    return () => clearInterval(interval);
  }, [battle, user, timeDiff, state, setState]);

  return (
    <div className="pl-5">
      <div className="relative flex flex-row justify-center pt-1">
        <Image
          className="relative"
          src="/combat/actionTimer/background.webp"
          alt="Action Timer"
          width={768}
          height={62}
        />
        {actionPerc > 0 && (
          <>
            <Image
              className="absolute"
              style={{
                clipPath: `polygon(0 0%, ${actionPerc}% 0%, ${actionPerc}% 100%, 0% 100%)`,
              }}
              src={actionAfter >= 0 ? yellow : red}
              alt="Action Timer"
              width={768}
              height={62}
            />
            <Image
              className="absolute"
              style={{
                clipPath: `polygon(0 0%, ${actionAfter}% 0%, ${actionAfter}% 100%, 0% 100%)`,
              }}
              src={blue}
              alt="Action Timer"
              width={768}
              height={62}
            />
          </>
        )}
        <Image
          className="absolute "
          src="/combat/actionTimer/overlay.webp"
          alt="Action Timer"
          width={768}
          height={62}
        />
        {(isLoading || !user) && (
          <div className="absolute">
            <Loader noPadding={true} />
          </div>
        )}
        {state.label && !isLoading && (
          <p className="absolute bottom-0 left-0 right-0 top-0 flex justify-center text-xs font-bold text-black">
            {state.label}
          </p>
        )}
      </div>
    </div>
  );
};

export default ActionTimer;
