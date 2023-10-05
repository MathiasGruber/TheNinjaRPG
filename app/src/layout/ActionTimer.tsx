import { useEffect, useState } from "react";
import Image from "next/image";
import Loader from "./Loader";
import { COMBAT_SECONDS } from "../libs/combat/constants";
import { useUserData } from "../utils/UserContext";
import { calcActiveUser } from "../libs/combat/actions";
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
  const [state, setState] = useState<{
    label: string;
    canAct: boolean;
    waiting: boolean;
  }>({
    label: "",
    canAct: false,
    waiting: false,
  });

  // Derived values
  const cost = action?.actionCostPerc ?? 0;
  const actionNow = user.actionPoints;
  const actionAfter = actionNow - cost;

  // Calculate label and color
  const yellow = "/combat/actionTimer/yellow.webp";
  const red = "/combat/actionTimer/red.webp";
  const blue = "/combat/actionTimer/blue.webp";

  // Active updating of this component
  useEffect(() => {
    const interval = setInterval(() => {
      // Set label
      const {
        actor,
        mseconds,
        secondsLeft: left,
      } = calcActiveUser(battle, user.userId, timeDiff);
      // Is it the user in question
      const canAct = actor.userId === user.userId;
      const waiting = user.userId !== actor.userId;
      // Update state
      if (mseconds >= 0) {
        const inform = !waiting ? "Your turn" : `${actor.username}'s turn`;
        const info = left > 0 ? `${inform}: ${left.toFixed(1)}s` : "Finished!";
        setState({ label: `Round: ${battle.round} - ${info}`, canAct, waiting });
      } else {
        setState({ label: `Waiting in Lobby`, canAct, waiting });
      }
      // Set action points
    }, 100);
    return () => clearInterval(interval);
  }, [isLoading, battle, user, timeDiff, state, setState]);

  return (
    <div className="pl-5">
      <div className="relative flex flex-row justify-center pt-2">
        <Image
          className="relative"
          src="/combat/actionTimer/background.webp"
          alt="Action Timer"
          width={768}
          height={62}
        />
        {actionNow > 0 && (
          <>
            <Image
              className={`absolute ${!state.canAct ? "grayscale" : ""}`}
              style={{
                clipPath: `polygon(0 0%, ${actionNow}% 0%, ${actionNow}% 100%, 0% 100%)`,
              }}
              src={actionAfter >= 0 ? yellow : red}
              alt="Action Timer"
              width={768}
              height={62}
            />
            <Image
              className={`absolute ${!state.canAct ? "grayscale" : ""}`}
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
          className="absolute"
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
          <p
            className={`absolute bottom-0 left-0 right-0 top-0 flex justify-center text-sm font-bold ${
              state.waiting ? "text-red-800" : "text-green-800 "
            }`}
          >
            {state.label}
          </p>
        )}
      </div>
    </div>
  );
};

export default ActionTimer;
