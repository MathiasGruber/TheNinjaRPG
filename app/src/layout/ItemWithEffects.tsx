import React from "react";
import Link from "next/link";
import Image from "next/image";
import ContentImage from "@/layout/ContentImage";
import Confirm from "@/layout/Confirm";
import ReactHtmlParser from "react-html-parser";
import { canChangeContent } from "@/utils/permissions";
import { useUserData } from "@/utils/UserContext";
import { PencilSquareIcon, TrashIcon, ChartBarIcon } from "@heroicons/react/24/outline";
import { getTagSchema } from "@/libs/combat/types";
import { capitalizeFirstLetter } from "@/utils/sanitize";
import { getObjectiveImage } from "@/libs/objectives";
import { ObjectiveReward } from "@/validators/objectives";
import type { ItemRarity } from "@/drizzle/schema";
import type { Bloodline, Item, Jutsu, Quest } from "@/drizzle/schema";
import type { ZodAllTags } from "@/libs/combat/types";

export type GenericObject = {
  id: string;
  name: string;
  description: string;
  image?: string;
  rarity?: ItemRarity;
  level?: number;
  sector?: number;
  createdAt: Date;
  updatedAt: Date;
  attacks?: string[];
  effects?: ZodAllTags[];
  href?: string;
};

export interface ItemWithEffectsProps {
  item: Bloodline | Item | Jutsu | Quest | GenericObject;
  imageBorder?: boolean;
  showEdit?: "bloodline" | "item" | "jutsu" | "ai" | "quest" | "badge";
  showStatistic?: "bloodline" | "item" | "jutsu" | "ai";
  onDelete?: (id: string) => void;
}

const ItemWithEffects: React.FC<ItemWithEffectsProps> = (props) => {
  const { item, showEdit, showStatistic, onDelete } = props;
  const { data: userData } = useUserData();

  // Extract effects if they exist
  const effects =
    "effects" in props.item
      ? (props.item.effects as Omit<ZodAllTags, "description">[])
      : [];

  // Extract objectives if they exist
  const objectives = "content" in props.item ? props.item.content.objectives : [];

  // Define image
  let image = (
    <div className="relative flex flex-row items-center justify-center">
      <ContentImage
        image={item.image}
        alt={item.name}
        rarity={"rarity" in item ? item.rarity : undefined}
        className=""
      />
    </div>
  );
  if ("href" in item && item.href) {
    image = <Link href={item.href}>{image}</Link>;
  }

  // Define rewards from quests if they are there
  const rewards: string[] = [];
  if ("content" in item) {
    const questReward = ObjectiveReward.parse(item.content?.reward);
    if (questReward.reward_items.length > 0) {
      rewards.push(`${item.content.reward.reward_items.length} items`);
    }
    if (questReward.reward_jutsus.length > 0) {
      rewards.push(`${item.content.reward.reward_jutsus.length} jutsus`);
    }
    if (questReward.reward_badges.length > 0) {
      rewards.push(`${item.content.reward.reward_badges.length} badges`);
    }
    if (questReward.reward_rank && questReward.reward_rank !== "NONE") {
      rewards.push(`rank of ${item.content.reward.reward_rank.toLowerCase()}`);
    }
    if (questReward.reward_money) {
      rewards.push(`${item.content.reward.reward_money} ryo`);
    }
  }

  return (
    <div className="mb-3 flex flex-row items-center rounded-lg border bg-orange-50 p-2 align-middle shadow ">
      <div className="mx-3 hidden basis-1/3  md:block">{image}</div>
      <div className="basis-full text-sm md:basis-2/3">
        <div className="flex flex-row">
          <div className="relative block md:hidden md:basis-1/3">{image}</div>
          <div className="flex basis-full flex-col pl-5 md:pl-0">
            <h3 className="text-xl font-bold tracking-tight text-gray-900">
              {item.name}
            </h3>
            <div className="flex flex-row gap-2">
              {item.createdAt && (
                <div>
                  <b>Created: </b>
                  {item.createdAt.toLocaleDateString()}
                </div>
              )}
              {item.updatedAt && (
                <div>
                  <b>Updated: </b>
                  {item.updatedAt.toLocaleDateString()}
                </div>
              )}
            </div>
            <div className="absolute right-6 flex flex-row">
              {showStatistic && (
                <Link
                  href={`/cpanel/${showStatistic}/statistics/${item.id}`}
                  className="mr-1"
                >
                  <ChartBarIcon className="h-6 w-6 hover:fill-orange-500" />
                </Link>
              )}
              {showEdit && userData && canChangeContent(userData.role) && (
                <>
                  <Link href={`/cpanel/${showEdit}/edit/${item.id}`}>
                    <PencilSquareIcon className="h-6 w-6 hover:fill-orange-500" />
                  </Link>
                  <Confirm
                    title="Confirm Deletion"
                    button={
                      <TrashIcon className="h-6 w-6 hover:fill-orange-500 hover:cursor-pointer" />
                    }
                    onAccept={(e) => {
                      e.preventDefault();
                      onDelete && onDelete(item.id);
                    }}
                  >
                    You are about to delete this. Are you sure?
                  </Confirm>
                </>
              )}
            </div>

            <hr className="py-1" />
            {item.description && <div>{ReactHtmlParser(item.description)}</div>}
          </div>
        </div>
        <div>
          <div className="my-2 grid grid-cols-2 rounded-lg bg-orange-100 p-2">
            {"bloodline" in item && item.bloodline !== null && (
              <p className="col-span-2">
                <b>Bloodline</b>: {(item?.bloodline as Bloodline)?.name}
              </p>
            )}
            {"attacks" in item && item.attacks && (
              <p className="col-span-2">
                <b>Attacks</b>: {item.attacks.join(", ")}
              </p>
            )}
            {"sector" in item && item.sector !== undefined && item.sector > 0 && (
              <p className="col-span-2">
                <b>Sector</b>: {item.sector}
              </p>
            )}
            {"jutsuType" in item && (
              <p>
                <b>Jutsu Type</b>: {capitalizeFirstLetter(item?.jutsuType)}
              </p>
            )}
            {"rarity" in item && (
              <p>
                <b>Rarity</b>: {item.rarity}
              </p>
            )}
            {"level" in item && (
              <p>
                <b>Level</b>: {item.level}
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
            {"canStack" in item && "stackSize" in item && item.canStack && (
              <p>
                <b>Stackable</b>: {item.stackSize}
              </p>
            )}
            {"range" in item && item.target !== "CHARACTER" && (
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
            {"method" in item && (
              <p>
                <b>Method</b>: {item.method.toLowerCase()}
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
            {"requiredRank" in item && item.requiredRank && (
              <p>
                <b>Required Rank</b>: {item.requiredRank}
              </p>
            )}
            {"requiredLevel" in item && item.requiredLevel && (
              <p>
                <b>Required Level</b>: {item.requiredLevel}
              </p>
            )}
            {"timeFrame" in item && item.timeFrame && (
              <p>
                <b>Time Frame</b>: {item.timeFrame}
              </p>
            )}
            {"questType" in item && item.questType && (
              <p>
                <b>Quest Type</b>: {item.questType}
              </p>
            )}
            {"expiresAt" in item && item.expiresAt && (
              <p>
                <b>Expires At</b>: {item.expiresAt}
              </p>
            )}
            {"content" in item && item.content && (
              <div className="col-span-2">
                <b>Reward:</b> {rewards.join(", ")}
              </div>
            )}
          </div>
          {objectives.length > 0 && (
            <div className={`my-2 rounded-lg bg-orange-100 p-2`}>
              <p className="font-bold">Objectives</p>
              <div className="flex flex-row gap-3 p-2">
                {objectives.map((objective, i) => {
                  const { image, title } = getObjectiveImage(objective);
                  return (
                    <div
                      key={objective.task + i.toString()}
                      className={`flex flex-col items-center`}
                    >
                      <Image
                        className="basis-1/4"
                        alt={objective.task}
                        src={image}
                        width={60}
                        height={60}
                      />
                      {title}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {effects?.map((effect, i) => {
            // Get schema for parsing effect
            const schema = getTagSchema(effect.type);
            // Delete description, so that we get the default one
            if ("description" in effect) delete effect["description"];
            const result = schema.safeParse(effect);
            const parsedEffect = result.success ? result.data : undefined;

            return (
              <div
                key={effect.type + i.toString()}
                className={`my-2 rounded-lg ${
                  parsedEffect ? "bg-orange-100" : "bg-red-100"
                } p-2`}
              >
                {!parsedEffect && (
                  <div className="pb-1">
                    <b>Effect {i + 1}: </b> <i>{effect.type}</i> - PLEASE REPORT!
                  </div>
                )}
                {parsedEffect && (
                  <>
                    <div className="pb-1">
                      <b>Effect {i + 1}: </b> <i>{parsedEffect.description}</i>
                    </div>
                    <div className="grid grid-cols-2">
                      {parsedEffect.rounds !== undefined && (
                        <span>
                          <b>Rounds: </b> {parsedEffect.rounds}
                        </span>
                      )}
                      {parsedEffect.calculation && (
                        <span>
                          <b>Calculation: </b>
                          {parsedEffect.calculation}
                        </span>
                      )}
                      {"power" in parsedEffect && (
                        <span>
                          <b>Effect Power: </b>
                          {parsedEffect.power}
                        </span>
                      )}
                      {"aiHp" in parsedEffect && (
                        <span>
                          <b>Health Points: </b>
                          {parsedEffect.aiHp}
                        </span>
                      )}
                      {"target" in parsedEffect &&
                        parsedEffect.target &&
                        (!("target" in item) ||
                          parsedEffect.target !== item?.target) && (
                          <span>
                            <b>Target: </b>
                            {parsedEffect.target.toLowerCase()}
                          </span>
                        )}
                      {"powerPerLevel" in parsedEffect && (
                        <span>
                          <b>Effect Power / Lvl: </b>
                          {parsedEffect.powerPerLevel}
                        </span>
                      )}
                      {"generalTypes" in parsedEffect &&
                        parsedEffect.generalTypes &&
                        parsedEffect.generalTypes.length > 0 && (
                          <span>
                            <b>Generals: </b>
                            {parsedEffect.generalTypes.join(", ")}
                          </span>
                        )}
                      {"statTypes" in parsedEffect &&
                        parsedEffect.statTypes &&
                        parsedEffect.statTypes.length > 0 && (
                          <span>
                            <b>Stats: </b>
                            {parsedEffect.statTypes.join(", ")}
                          </span>
                        )}
                      {"elements" in parsedEffect &&
                        parsedEffect.elements &&
                        parsedEffect.elements.length > 0 && (
                          <span>
                            <b>Elements: </b>
                            {parsedEffect.elements.join(", ")}
                          </span>
                        )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default ItemWithEffects;
