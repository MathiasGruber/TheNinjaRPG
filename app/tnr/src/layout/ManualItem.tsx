import React from "react";
import Image from "next/image";
import { type Bloodline, type Item, type Jutsu } from "@prisma/client/edge";
import { type ZodAllTags } from "../libs/combat/types";

export interface ManualItemProps {
  item: Bloodline | Item | Jutsu;
  folderPrefix: string;
  imageBorder?: boolean;
}

const ManualItem: React.FC<ManualItemProps> = (props) => {
  const { item, folderPrefix } = props;
  const effects = props.item.effects as ZodAllTags[];

  return (
    <div className="mb-3 flex flex-row items-center rounded-lg border bg-orange-50 p-2 pl-6 align-middle shadow ">
      <div className="mr-3 basis-4/12 sm:basis-3/12">
        <Image
          className={`my-2 mr-3 w-5/6 rounded-2xl ${
            props.imageBorder ? "border-2 border-black" : ""
          }`}
          src={folderPrefix + item.image}
          alt={item.name}
          width={256}
          height={256}
          priority={true}
        />
        <div className="ml-3 text-left text-sm">
          {"rarity" in item && (
            <p>
              <b>Rarity</b>: {item.rarity}
            </p>
          )}
          {"regenIncrease" in item && item.regenIncrease > 0 && (
            <p>
              <b>Regen</b>: +{item.regenIncrease}
            </p>
          )}
          {"village" in item && (
            <p>
              <b>Village</b>: {item.village}
            </p>
          )}
        </div>
      </div>
      <div className="grow basis-1/2">
        <h3 className="text-xl font-bold tracking-tight text-gray-900">{item.name}</h3>
        <div className="text-sm">
          <p>
            <b>Created: </b>
            {item.createdAt.toLocaleDateString()}, <b>Updated: </b>
            {item.updatedAt.toLocaleDateString()}
          </p>
          <hr className="py-1" />
          <div>{item.description}</div>
          {effects.map((effect, i) => {
            console.log(effect);
            return (
              <div
                key={effect.type + i.toString()}
                className="my-2 rounded-lg bg-orange-100 p-2"
              >
                <b>Effect {i + 1}: </b> {effect.description}
                <div className="grid grid-cols-2">
                  {"timing" in effect && (
                    <span>
                      <b>Timing: </b>
                      {effect.timing}
                    </span>
                  )}
                  {"adjustUp" in effect && (
                    <span>
                      <b>Adjustment: </b>
                      {effect.adjustUp ? "Positive" : "Negative"}
                    </span>
                  )}
                  {"minRounds" in effect && "maxRounds" in effect && (
                    <span>
                      <b>Rounds: </b>
                      {effect.minRounds} - {effect.maxRounds}
                    </span>
                  )}
                  {"calculation" in effect && (
                    <span>
                      <b>Calculation: </b>
                      {effect.calculation}
                    </span>
                  )}
                  {"power" in effect && (
                    <span>
                      <b>Effect Power: </b>
                      {effect.power}
                    </span>
                  )}
                  {"generalTypes" in effect && effect.generalTypes && (
                    <span>
                      <b>Generals: </b>
                      {effect.generalTypes.join(", ")}
                    </span>
                  )}
                  {"statTypes" in effect && effect.statTypes && (
                    <span>
                      <b>Stats: </b>
                      {effect.statTypes.join(", ")}
                    </span>
                  )}
                  {"elements" in effect && effect.elements && (
                    <span>
                      <b>Elements: </b>
                      {effect.elements.join(", ")}
                    </span>
                  )}
                  {"chance" in effect && (
                    <span>
                      <b>Chance: </b>
                      {effect.chance}
                    </span>
                  )}
                  {"aoe" in effect && "aoeRange" in effect && (
                    <span>
                      <b>AOE: </b>
                      {effect.aoeRange} squares
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default ManualItem;
