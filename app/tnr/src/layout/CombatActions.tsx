import { useState } from "react";
import Image from "next/image";
import ContentImage from "./ContentImage";
import type { AttackTarget, ItemRarity } from "@prisma/client";
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

interface ActionSelectorProps {
  items?: {
    id: string;
    name: string;
    image: string;
    rarity?: ItemRarity;
  }[];
  counts?: {
    id: string;
    quantity: number;
  }[];
  showBgColor: boolean;
  showLabels: boolean;
  selectedId?: string;
  labelSingles?: boolean;
  onClick: (id: string) => void;
}

export const ActionSelector: React.FC<ActionSelectorProps> = (props) => {
  return (
    <>
      <div className={`grid grid-cols-6 gap-1 text-xs md:grid-cols-8`}>
        {props.items?.map((item, i) => {
          const isGreyed =
            props.selectedId !== undefined && props.selectedId !== item.id;
          return (
            <ActionOption
              key={i}
              className={`${props.showBgColor ? "bg-orange-200" : ""} ${
                isGreyed ? "opacity-20" : ""
              }`}
              src={item.image}
              isGreyed={isGreyed}
              alt="sp"
              rarity={item.rarity}
              txt={props.showLabels ? item.name : ""}
              count={props.counts?.find((c) => c.id === item.id)?.quantity}
              labelSingles={props.labelSingles}
              onClick={() => {
                props.onClick(item.id);
              }}
            />
          );
        })}
      </div>
      {props.items?.length === 0 && (
        <span className="flex flex-row text-base">Nothing Available</span>
      )}
    </>
  );
};

interface ActionOptionProps {
  src: string;
  alt: string;
  txt: string;
  rarity?: ItemRarity;
  count?: number;
  isGreyed: boolean;
  className?: string;
  labelSingles?: boolean;
  onClick?: () => void;
}

export const ActionOption: React.FC<ActionOptionProps> = (props) => {
  return (
    <div
      className={`relative text-center leading-5 ${
        props.className ?? ""
      } flex cursor-pointer flex-col items-center ${
        props.isGreyed ? "hover:opacity-80" : "hover:opacity-90"
      }`}
    >
      <div className="relative">
        <ContentImage
          image={props.src}
          alt={props.alt}
          rarity={props.rarity}
          className=""
          onClick={props.onClick}
        />
        {props.count && (props.labelSingles || props.count > 1) && (
          <div className="absolute bottom-0 right-0 flex h-8 w-8 flex-row items-center justify-center rounded-md border-2 border-slate-400 bg-slate-500 text-base font-bold text-white">
            {props.count}
          </div>
        )}
      </div>
      {props.txt}
    </div>
  );
};

export default CombatActions;
