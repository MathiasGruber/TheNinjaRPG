import Image from "next/image";
import Loader from "./Loader";
import type { CombatAction } from "../libs/combat/types";
import { COMBAT_PREMOVE_SECONDS, COMBAT_SECONDS } from "../libs/combat/constants";

interface ActionTimerProps {
  action: CombatAction | undefined;
  actionPerc: number | undefined;
  isLoading: boolean;
}

const ActionTimer: React.FC<ActionTimerProps> = (props) => {
  const { action, actionPerc, isLoading } = props;
  let label = "Select Action";
  let color = "/combat/actionTimer/green.webp";
  if (actionPerc && action) {
    const preMovePerc = COMBAT_PREMOVE_SECONDS / COMBAT_SECONDS;
    const cost = action.actionCostPerc;
    if (actionPerc > cost) {
      label = "Action Enabled";
      color = "/combat/actionTimer/blue.webp";
    } else if (actionPerc > cost - preMovePerc * 100) {
      label = "Pre-action enabled";
      color = "/combat/actionTimer/yellow.webp";
    } else {
      label = "Please wait...";
      color = "/combat/actionTimer/red.webp";
    }
  }

  return (
    <div className="pl-5">
      <div className="relative flex flex-row justify-center">
        <Image
          className="relative"
          src="/combat/actionTimer/background.webp"
          alt="Action Timer"
          width={768}
          height={62}
        />
        {actionPerc && (
          <Image
            className="absolute"
            style={{
              clipPath: `polygon(0 0%, ${actionPerc}% 0%, ${actionPerc}% 100%, 0% 100%)`,
            }}
            src={color}
            alt="Action Timer"
            width={768}
            height={62}
          />
        )}
        <Image
          className="absolute "
          src="/combat/actionTimer/overlay.webp"
          alt="Action Timer"
          width={768}
          height={62}
        />
        {(isLoading || !actionPerc) && (
          <div className="absolute">
            <Loader noPadding={true} />
          </div>
        )}
        {label && !isLoading && (
          <p className="absolute bottom-0 left-0 right-0 top-0 flex items-center justify-center text-xs font-bold text-white">
            {label}
          </p>
        )}
      </div>
    </div>
  );
};

export default ActionTimer;
