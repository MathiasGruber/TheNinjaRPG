import React, { useState, useEffect } from "react";
import ContentImage from "./ContentImage";
import { useUserData } from "@/utils/UserContext";
import { COMBAT_SECONDS } from "@/libs/combat/constants";
import { Info } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { ItemRarity } from "@/drizzle/schema";

interface ActionSelectorProps {
  items?: {
    id: string;
    name: string;
    image: string;
    warning?: string;
    rarity?: ItemRarity;
    type?: "jutsu" | "item" | "basic" | "village";
    highlight?: boolean;
    hidden?: boolean | number;
    updatedAt?: number | Date;
    cooldown?: number;
  }[];
  counts?: {
    id: string;
    quantity: number;
  }[];
  roundFull?: boolean;
  hideBorder?: boolean;
  showBgColor: boolean;
  showLabels: boolean;
  selectedId?: string;
  greyedIds?: string[];
  labelSingles?: boolean;
  onClick: (id: string) => void;
  emptyText?: string;
  lastElement?: HTMLDivElement | null;
  setLastElement?: (el: HTMLDivElement | null) => void;
}

export const ActionSelector: React.FC<ActionSelectorProps> = (props) => {
  const filtered = props.items?.filter((i) => !i.hidden);
  return (
    <>
      <div
        className={`grid gap-1 grid-cols-6 md:grid-cols-8 text-xs ${
          props.showBgColor
            ? "border-b-2 border-l-2 border-r-2 bg-slate-50 text-black"
            : ""
        }`}
      >
        {filtered?.map((item, i) => {
          let bgColor = "";
          if (item.type === "jutsu") {
            bgColor = "bg-blue-100";
          } else if (item.type === "item") {
            if ("itemType" in item) {
              if (item.itemType === "WEAPON") {
                bgColor = "bg-red-200";
              } else if (item.itemType === "CONSUMABLE") {
                bgColor = "bg-green-200";
              } else {
                bgColor = "bg-purple-200";
              }
            } else {
              bgColor = "bg-purple-100";
            }
          } else if (item.type === "basic") {
            bgColor = "bg-orange-200";
          }
          const isGreyed =
            (props.selectedId !== undefined && props.selectedId !== item.id) ||
            (props.greyedIds !== undefined && props.greyedIds.includes(item.id));
          const isHighlight = item.highlight ?? false;

          return (
            <div key={i} ref={i === filtered.length - 1 ? props.setLastElement : null}>
              <ActionOption
                className={`pr-1 h-full  ${
                  isHighlight ? "rounded-xl border-2 border-amber-500 bg-amber-300" : ""
                } ${bgColor} ${isGreyed ? "opacity-20" : ""}`}
                src={item.image}
                isGreyed={isGreyed}
                alt="sp"
                warning={item?.warning}
                roundFull={props.roundFull}
                hideBorder={props.hideBorder}
                rarity={item.rarity}
                updatedAt={item.updatedAt}
                cooldown={item.cooldown}
                txt={props.showLabels ? item.name : ""}
                count={props.counts?.find((c) => c.id === item.id)?.quantity}
                labelSingles={props.labelSingles}
                onClick={() => {
                  props.onClick(item.id);
                }}
              />
            </div>
          );
        })}
      </div>
      {props.items?.length === 0 && (
        <span className="flex flex-row text-base">
          {props.emptyText ? props.emptyText : "Nothing Available"}
        </span>
      )}
    </>
  );
};

interface ActionOptionProps {
  src: string;
  alt: string;
  txt: string;
  warning?: string;
  rarity?: ItemRarity;
  count?: number;
  isGreyed: boolean;
  className?: string;
  roundFull?: boolean;
  hideBorder?: boolean;
  labelSingles?: boolean;
  updatedAt?: number | Date;
  cooldown?: number;
  onClick?: () => void;
}

export const ActionOption: React.FC<ActionOptionProps> = (props) => {
  const { timeDiff } = useUserData();
  const { cooldown, updatedAt } = props;
  const [cooldownPerc, setCooldownPerc] = useState<number>(0);

  // If cooldown, how much of the component is filled with cone
  useEffect(() => {
    if (cooldown && updatedAt) {
      const interval = setInterval(() => {
        // Calculate how much time left for cooldown
        const syncedTime = new Date().getTime() - timeDiff;
        const t = updatedAt instanceof Date ? updatedAt.getTime() : updatedAt;
        const cooldownSeconds = COMBAT_SECONDS * cooldown;
        const secondsLeft = (cooldownSeconds * 1000 + t - syncedTime) / 1000;
        // Calculate percentage of cooldown
        setCooldownPerc(Math.max((secondsLeft / cooldownSeconds) * 100, 0));
        // Clear interval if cooldown is over
        if (secondsLeft < 0) {
          clearInterval(interval);
        }
      }, 500);
      return () => clearInterval(interval);
    }
  }, [updatedAt, cooldown, timeDiff]);

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
          roundFull={props.roundFull}
          hideBorder={props.hideBorder}
          onClick={props.onClick}
        />
        {props.count !== undefined && (props.labelSingles || props.count > 1) && (
          <div className="absolute bottom-0 right-0 flex h-7 w-7 flex-row items-center justify-center rounded-full border-2 border-amber-300 bg-slate-300 text-black text-base font-bold">
            {props.count}
          </div>
        )}
        {props.warning !== undefined && props.warning && (
          <div className="absolute top-0 right-0">
            <TooltipProvider delayDuration={50}>
              <Tooltip>
                <TooltipTrigger>
                  <Info className="h-7 w-7 cursor-pointer hover:text-orange-500 fill-red-600 text-white" />
                </TooltipTrigger>
                <TooltipContent>{props.warning}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        )}
        {cooldownPerc > 0 && (
          <div
            className="absolute top-0 right-0 left-0 bottom-0 opacity-80 hover:cursor-none"
            style={{
              background: `conic-gradient(#ededed ${cooldownPerc}%, rgba(0, 0, 0, 0.1) 0deg)`,
            }}
          ></div>
        )}
      </div>
      {props.txt}
    </div>
  );
};
