import Image from "next/image";

interface ActionTimerProps {
  perc: number;
}

const ActionTimer: React.FC<ActionTimerProps> = (props) => {
  let label = "";
  if (props.perc === 100) {
    label = "Action Enabled";
  } else if (props.perc > 95) {
    label = "Pre-action enabled";
  } else if (props.perc > 50) {
    label = "Movement Enabled";
  } else if (props.perc > 45) {
    label = "Pre-move Enabled";
  }
  return (
    <div className="pl-5">
      <div className="relative flex flex-row">
        <Image
          className="relative"
          src="/combat/actionTimer/background.webp"
          alt="Action Timer"
          width={768}
          height={62}
        />
        <Image
          className="absolute"
          style={{
            clipPath: `polygon(0 0%, ${props.perc}% 0%, ${props.perc}% 100%, 0% 100%)`,
          }}
          src="/combat/actionTimer/blue.webp"
          alt="Action Timer"
          width={768}
          height={62}
        />
        <Image
          className="absolute "
          src="/combat/actionTimer/overlay.webp"
          alt="Action Timer"
          width={768}
          height={62}
        />
        {label && (
          <p className="absolute bottom-0 left-0 right-0 top-0 flex items-center justify-center text-xs font-bold text-white">
            {label}
          </p>
        )}
      </div>
    </div>
  );
};

export default ActionTimer;
