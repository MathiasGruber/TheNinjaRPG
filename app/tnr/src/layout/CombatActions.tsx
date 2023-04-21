import { useState } from "react";
import Image from "next/image";
import type { AttackTarget } from "@prisma/client";
import type { UserBattle } from "../utils/UserContext";

interface Action {
  src: string;
  alt: string;
  txt: string;
  attackTarget: AttackTarget;
  range: number;
  category: "basic" | "jutsu" | "weapon" | "consumable";
}

interface CombatActionsProps {
  battle: UserBattle;
}

const CombatActions: React.FC<CombatActionsProps> = (props) => {
  const [selectedAction, setSelectedAction] = useState<string | null>(null);
  return (
    <div className="grid grid-cols-6 border-b-2 border-l-2 border-r-2 bg-slate-50 text-xs sm:grid-cols-8">
      <ActionOption
        className="bg-orange-200"
        src="/combat/basicActions/stamina.png"
        alt="sp"
        txt="Stamina Attack"
      />
      <ActionOption
        className="bg-orange-200"
        src="/combat/basicActions/chakra.png"
        alt="cp"
        txt="Chakra Attack"
      />
      <ActionOption
        className="bg-orange-200"
        src="/combat/basicActions/move.png"
        alt="move"
        txt="Move"
      />
      <ActionOption
        className="bg-orange-200"
        src="/combat/basicActions/flee.png"
        alt="flee"
        txt="Flee"
      />

      <ActionOption
        className="bg-blue-100"
        src="/jutsus/clone_technique.png"
        alt="temp1"
        txt="Clone Technique"
      />
      <ActionOption
        className="bg-blue-100"
        src="/jutsus/soul_shackles.png"
        alt="temp2"
        txt="Soul Shackles"
      />
      <ActionOption
        className="bg-blue-100"
        src="/jutsus/sonic_slash.png"
        alt="temp3"
        txt="Sonic Slash"
      />
      <ActionOption
        className="bg-blue-100"
        src="/jutsus/searing_intimidation.png"
        alt="temp4"
        txt="Searing Intimidation"
      />

      <ActionOption
        className="bg-red-200"
        src="/items/shuriken.png"
        alt="temp3"
        txt="Shuriken"
      />
      <ActionOption
        className="bg-slate-300"
        src="/items/water.png"
        alt="temp3"
        txt="Normal Water"
      />
      <ActionOption
        className="bg-slate-300"
        src="/items/chakra_water.png"
        alt="temp3"
        txt="Chakra Water"
      />
    </div>
  );
};

interface ActionOptionProps {
  src: string;
  alt: string;
  txt: string;
  className?: string;
}

const ActionOption: React.FC<ActionOptionProps> = (props) => {
  return (
    <div
      className={`p-1  text-center leading-5 ${
        props.className ?? ""
      } flex flex-col items-center`}
    >
      <Image
        className="rounded-xl border-2"
        src={props.src}
        width={64}
        height={64}
        alt={props.alt}
      ></Image>
      {props.txt}
    </div>
  );
};

export default CombatActions;
