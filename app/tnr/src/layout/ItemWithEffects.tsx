import React from "react";
import ContentImage from "./ContentImage";
import type { Bloodline, Item, Jutsu } from "@prisma/client/edge";
import { AttackTarget } from "@prisma/client/edge";
import { type ZodAllTags } from "../libs/combat/types";

export interface ItemWithEffectsProps {
  item: Bloodline | Item | Jutsu;
  imageBorder?: boolean;
}

const ItemWithEffects: React.FC<ItemWithEffectsProps> = (props) => {
  const { item } = props;
  const effects = props.item.effects as ZodAllTags[];

  // Elements, which we show a bit differently on different screens
  const baseProperties = (
    <div>
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
  );
  const image = (
    <div className="relative flex flex-row">
      <ContentImage
        image={item.image}
        alt={item.name}
        rarity={"rarity" in item ? item.rarity : undefined}
        className=""
      />
    </div>
  );

  return (
    <div className="mb-3 flex flex-row items-center rounded-lg border bg-orange-50 p-2 align-middle shadow ">
      <div className="basis-1/ mx-3 hidden md:block">
        {image}
        <div className="ml-3 text-left text-sm">{baseProperties}</div>
      </div>
      <div className="basis-full text-sm md:basis-2/3">
        <div className="flex flex-row">
          <div className="relative block md:hidden md:basis-1/3">{image}</div>
          <div className="flex basis-full flex-col pl-5 md:basis-2/3 md:pl-0">
            <h3 className="text-xl font-bold tracking-tight text-gray-900">
              {item.name}
            </h3>
            <p>
              <b>Created: </b>
              {item.createdAt.toLocaleDateString()}, <b>Updated: </b>
              {item.updatedAt.toLocaleDateString()}
            </p>
            <hr className="py-1" />
            <div>{item.description}</div>
          </div>
        </div>
        <div>
          <div className="my-2 grid grid-cols-2 rounded-lg bg-orange-100 p-2">
            {"canStack" in item && "stackSize" in item && item.canStack && (
              <p>
                <b>Stackable</b>: {item.stackSize}
              </p>
            )}
            {"range" in item && item.target !== AttackTarget.SELF && (
              <p>
                <b>Range</b>: {item.range}
              </p>
            )}
            {"chakraCostPerc" in item && item.chakraCostPerc > 0 && (
              <p>
                <b>CP Use</b>: {item.chakraCostPerc}%
              </p>
            )}
            {"staminaCostPerc" in item && item.staminaCostPerc > 0 && (
              <p>
                <b>SP Use</b>: {item.staminaCostPerc}%
              </p>
            )}
            {"target" in item && (
              <p>
                <b>Target</b>: {item.target.toLowerCase()}
              </p>
            )}
            {"weaponType" in item && item.weaponType && (
              <p>
                <b>Weapon</b>: {item.weaponType.toLowerCase()}
              </p>
            )}
            {"slot" in item && item.slot && (
              <p>
                <b>Equip</b>: {item.slot.toLowerCase()}
              </p>
            )}
            <div className="block md:hidden">{baseProperties}</div>
          </div>
          {effects.map((effect, i) => {
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

export default ItemWithEffects;
