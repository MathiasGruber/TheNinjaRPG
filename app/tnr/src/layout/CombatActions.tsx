import ContentImage from "./ContentImage";
import type { ItemRarity } from "@prisma/client";

interface ActionSelectorProps {
  items?: {
    id: string;
    name: string;
    image: string;
    rarity?: ItemRarity;
    type?: "jutsu" | "item" | "basic";
    highlight?: boolean;
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
      <div
        className={`grid grid-cols-6 text-xs md:grid-cols-8 ${
          props.showBgColor ? "bg-slate-50" : ""
        }`}
      >
        {props.items?.map((item, i) => {
          let bgColor = "";
          if (item.type === "jutsu") {
            bgColor = "bg-blue-100";
          } else if (item.type === "item") {
            console.log("item", item);
            if ("itemType" in item) {
              console.log(item);
              if (item.itemType === "weapon") {
                bgColor = "bg-red-100";
              } else if (item.itemType === "armor") {
                bgColor = "bg-green-100";
              } else if (item.itemType === "consumable") {
                bgColor = "bg-yellow-100";
              } else {
                bgColor = "bg-purple-100";
              }
            } else {
              bgColor = "bg-purple-100";
            }
          } else if (item.type === "basic") {
            bgColor = "bg-orange-200";
          }
          const isGreyed =
            props.selectedId !== undefined && props.selectedId !== item.id;
          const isHighlight = item.highlight ?? false;
          return (
            <ActionOption
              key={i}
              className={`pr-1 ${
                isHighlight ? "rounded-xl border-4 border-amber-500 bg-amber-300" : ""
              } ${bgColor} ${isGreyed ? "opacity-20" : ""}`}
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
