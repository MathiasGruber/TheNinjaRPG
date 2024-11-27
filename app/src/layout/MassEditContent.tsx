import React, { useState } from "react";
import Modal from "@/layout/Modal";
import Loader from "@/layout/Loader";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { EditContent } from "@/layout/EditContent";
import { EffectFormWrapper } from "@/layout/EditContent";
import { api } from "@/app/_trpc/client";
import { effectFilters } from "@/libs/train";
import { JutsuValidator } from "@/libs/combat/types";
import { BloodlineValidator } from "@/libs/combat/types";
import { ItemValidator } from "@/libs/combat/types";
import { useJutsuEditForm } from "@/libs/jutsu";
import { useQuestEditForm } from "@/hooks/quest";
import { useBloodlineEditForm } from "@/hooks/bloodline";
import { useItemEditForm } from "@/hooks/item";
import { useBackgroundSchemaEditForm } from "@/hooks/backgroundSchema";
import { tagTypes } from "@/libs/combat/types";
import { statFilters } from "@/libs/train";
import { QuestTypes } from "@/drizzle/constants";
import { QuestValidator, ObjectiveReward } from "@/validators/objectives";
import type { QuestType } from "@/drizzle/constants";
import type { StatGenType } from "@/libs/train";
import type { EffectType } from "@/libs/train";
import type { Jutsu } from "@/drizzle/schema";
import type { Bloodline } from "@/drizzle/schema";
import type { Item } from "@/drizzle/schema";
import type { Quest } from "@/drizzle/schema";
import type { BackgroundSchema } from "@/drizzle/schema";
import { BackgroundSchemaValidator } from "@/validators/backgroundSchema";

interface MassEditContentProps {
  title: string;
  type: "jutsu" | "bloodline" | "item" | "quest" | "backgroundSchema";
  button: React.ReactNode;
  onAccept?: (
    e:
      | React.MouseEvent<HTMLButtonElement, MouseEvent>
      | React.KeyboardEvent<KeyboardEvent>,
  ) => void;
}

const MassEditContent: React.FC<MassEditContentProps> = (props) => {
  const [showModal, setShowModal] = useState<boolean>(false);
  // For quests
  const [questType, setQuestType] = useState<QuestType>(QuestTypes[0]);
  // For AI, item, jutsus
  const [tagType, setTagType] = useState<EffectType>(effectFilters[0]!);
  const [stat, setStat] = useState<StatGenType | undefined>(undefined);

  // Data queries
  const {
    data: jutsus,
    refetch: refetchJutsus,
    isFetching: fetchingJutsu,
  } = api.jutsu.getAll.useInfiniteQuery(
    { limit: 500, effect: [tagType], stat: stat ? [stat] : undefined },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      placeholderData: (previousData) => previousData,
      enabled: props.type === "jutsu" && showModal,
    },
  );

  const {
    data: bloodlines,
    refetch: refetchBloodlines,
    isFetching: fetchingBloodline,
  } = api.bloodline.getAll.useInfiniteQuery(
    {
      limit: 500,
      effect: [tagType],
      ...(stat ? { stat: [stat] } : {}),
      hidden: true,
    },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      placeholderData: (previousData) => previousData,
      enabled: props.type === "bloodline" && showModal,
    },
  );

  const {
    data: items,
    refetch: refetchItems,
    isFetching: fetchingItem,
  } = api.item.getAll.useInfiniteQuery(
    { limit: 500, effect: tagType, stat: stat },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      placeholderData: (previousData) => previousData,
      enabled: props.type === "item" && showModal,
    },
  );

  const {
    data: quests,
    refetch: refetchQuests,
    isFetching: fetchingQuest,
  } = api.quests.getAll.useInfiniteQuery(
    { limit: 500, questType: questType },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      placeholderData: (previousData) => previousData,
      enabled: props.type === "quest" && showModal,
    },
  );

  const {
    data: backgroundSchema,
    refetch: refetchBackgroundSchema,
    isFetching: fetchingBackgroundSchema,
  } = api.backgroundSchema.getAll.useQuery(undefined, {
    enabled: props.type === "backgroundSchema" && showModal,
  });

  // Get the data
  const getTableData = (
    type: "jutsu" | "bloodline" | "item" | "quest" | "backgroundSchema",
  ) => {
    switch (type) {
      case "jutsu":
        return {
          data: jutsus?.pages.map((page) => page.data).flat(),
          refetch: () => refetchJutsus(),
        };
      case "bloodline":
        return {
          data: bloodlines?.pages.map((page) => page.data).flat(),
          refetch: () => refetchBloodlines(),
        };
      case "item":
        return {
          data: items?.pages.map((page) => page.data).flat(),
          refetch: () => refetchItems(),
        };
      case "quest":
        return {
          data: quests?.pages.map((page) => page.data).flat(),
          refetch: () => refetchQuests(),
        };
      case "backgroundSchema":
        return {
          data: backgroundSchema,
          refetch: () => refetchBackgroundSchema(),
        };
    }
  };

  // Get all the data
  const { data, refetch } = getTableData(props.type);

  // Post-filter, in case we're filtering by stat, since we need to account for the fact that
  // it may have found the entries based on stats from other tags
  const postFiltered = data?.filter((entry) => {
    // Situations where we do not need this
    if (!stat) return true;
    if (!("effects" in entry)) return true;
    // Filter on effects
    const effect = entry.effects.find((e) => e.type === tagType);
    if (effect) {
      const c1 =
        "statTypes" in effect &&
        effect.statTypes &&
        (effect.statTypes as string[]).includes(stat);
      const c2 =
        "generalTypes" in effect &&
        effect.generalTypes &&
        (effect.generalTypes as string[]).includes(stat);
      return c1 || c2;
    }
    return false;
  });

  // Loader
  const loading =
    fetchingJutsu ||
    fetchingBloodline ||
    fetchingItem ||
    fetchingQuest ||
    fetchingBackgroundSchema;

  if (showModal) {
    return (
      <Modal title={props.title} setIsOpen={setShowModal} onAccept={props.onAccept}>
        {["jutsu", "bloodline", "item"].includes(props.type) && (
          <div className="flex flex-col">
            <Select
              onValueChange={(e) => setTagType(e as EffectType)}
              defaultValue={tagType}
              value={tagType}
            >
              <Label htmlFor="tag_name">Tag Name</Label>
              <SelectTrigger>
                <SelectValue placeholder={`None`} />
              </SelectTrigger>
              <SelectContent id="tag_name">
                {effectFilters.map((effect) => (
                  <SelectItem key={effect} value={effect}>
                    {effect}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              onValueChange={(e) => setStat(e as StatGenType)}
              defaultValue={stat}
              value={stat}
            >
              <Label htmlFor="stat_name">Stat Name</Label>
              <SelectTrigger>
                <SelectValue placeholder={`None`} />
              </SelectTrigger>
              <SelectContent id="stat_name">
                {statFilters.map((stat) => (
                  <SelectItem key={stat} value={stat}>
                    {stat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        {props.type === "quest" && (
          <Select
            onValueChange={(e) => setQuestType(e as QuestType)}
            defaultValue={questType}
            value={questType}
          >
            <Label htmlFor="quest_name">Quest Name</Label>
            <SelectTrigger>
              <SelectValue placeholder={`None`} />
            </SelectTrigger>
            <SelectContent id="quest_name">
              {QuestTypes.map((type) => (
                <SelectItem key={type} value={type}>
                  {type}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <p className="font-bold py-3">
          {postFiltered?.length === 0 && (
            <>-- No entries found for this filter. Please adjust filters! --</>
          )}
          {postFiltered?.length !== 0 && (
            <>NOTE: Push Enter button after changing a field to submit ALL changes!</>
          )}
        </p>
        {loading ? (
          <Loader explanation="Loading data..." />
        ) : (
          <div>
            {postFiltered?.map((entry, i) => {
              return (
                <div key={i}>
                  {props.type === "jutsu" && (
                    <MassEditJutsuRow
                      tagType={tagType}
                      jutsu={entry as Jutsu}
                      idx={i}
                      refetch={refetch}
                    />
                  )}
                  {props.type === "bloodline" && (
                    <MassEditBloodlineRow
                      tagType={tagType}
                      bloodline={entry as Bloodline}
                      idx={i}
                      refetch={refetch}
                    />
                  )}
                  {props.type === "item" && (
                    <MassEditItemRow
                      tagType={tagType}
                      item={entry as Item}
                      idx={i}
                      refetch={refetch}
                    />
                  )}
                  {props.type === "quest" && (
                    <MassEditQuestRow
                      quest={entry as Quest}
                      idx={i}
                      refetch={refetch}
                    />
                  )}
                  {props.type === "backgroundSchema" && (
                    <MassEditBackgroundSchemaRow
                      backgroundSchema={entry as BackgroundSchema}
                      idx={i}
                      refetch={refetch}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Modal>
    );
  } else {
    return (
      <div
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setShowModal(true);
        }}
      >
        {props.button}
      </div>
    );
  }
};
export default MassEditContent;

interface MassEditQuestRowProps {
  quest: Quest;
  idx: number;
  refetch: () => void;
}

const MassEditQuestRow: React.FC<MassEditQuestRowProps> = (props) => {
  // Form handling
  const { form, formData, handleQuestSubmit } = useQuestEditForm(
    props.quest,
    props.refetch,
  );

  // Background color for this row
  const bgColor = props.idx % 2 == 0 ? "bg-slate-600" : "";

  // Show the form
  return (
    <div className={`flex items-center`}>
      <EditContent
        schema={QuestValidator._def.schema.merge(ObjectiveReward)}
        form={form}
        formData={formData}
        formClassName="flex flex-row w-screen"
        showSubmit={false}
        buttonTxt="Save to Database"
        allowImageUpload={false}
        fixedWidths="basis-96"
        bgColor={bgColor}
        onEnter={handleQuestSubmit}
      />
    </div>
  );
};

interface MassEditJutsuRowProps {
  tagType: EffectType;
  jutsu: Jutsu;
  idx: number;
  refetch: () => void;
}

const MassEditJutsuRow: React.FC<MassEditJutsuRowProps> = (props) => {
  // Form handling
  const { effects, form, formData, setEffects, handleJutsuSubmit } = useJutsuEditForm(
    props.jutsu,
    props.refetch,
  );

  // Fetch the tag in question
  const idx = effects.findIndex((e) => e.type === props.tagType);
  const tag = effects[idx];

  // Background color for this row
  const bgColor = props.idx % 2 == 0 ? "bg-slate-600" : "";

  // Show the form
  return (
    <div className={`flex flex-col`}>
      <EditContent
        schema={JutsuValidator._def.schema._def.schema}
        form={form}
        formData={formData}
        formClassName="flex flex-row w-screen"
        showSubmit={false}
        buttonTxt="Save to Database"
        allowImageUpload={false}
        fixedWidths="basis-96"
        bgColor={bgColor}
        onEnter={handleJutsuSubmit}
      />
      {tag && (
        <EffectFormWrapper
          idx={idx}
          type="jutsu"
          formClassName="flex flex-row w-screen"
          tag={tag}
          hideTagType={true}
          fixedWidths="basis-96"
          bgColor={bgColor}
          availableTags={tagTypes}
          effects={effects}
          setEffects={setEffects}
        />
      )}
    </div>
  );
};

interface MassEditBloodlineRowProps {
  tagType: EffectType;
  bloodline: Bloodline;
  idx: number;
  refetch: () => void;
}

const MassEditBloodlineRow: React.FC<MassEditBloodlineRowProps> = (props) => {
  // Form handling
  const { effects, form, formData, setEffects, handleBloodlineSubmit } =
    useBloodlineEditForm(props.bloodline, props.refetch);

  // Fetch the tag in question
  const idx = effects.findIndex((e) => e.type === props.tagType);
  const tag = effects[idx];

  // Background color for this row
  const bgColor = props.idx % 2 == 0 ? "bg-slate-600" : "";

  // Show the form
  return (
    <div className="flex flex-col">
      <EditContent
        schema={BloodlineValidator}
        form={form}
        formData={formData}
        formClassName="flex flex-row w-screen"
        showSubmit={false}
        buttonTxt="Save to Database"
        allowImageUpload={false}
        fixedWidths="basis-96"
        bgColor={bgColor}
        onEnter={handleBloodlineSubmit}
      />
      {tag && (
        <EffectFormWrapper
          idx={idx}
          type="bloodline"
          formClassName="flex flex-row w-screen"
          tag={tag}
          hideTagType={true}
          fixedWidths="basis-96"
          bgColor={bgColor}
          availableTags={tagTypes}
          effects={effects}
          setEffects={setEffects}
        />
      )}
    </div>
  );
};

interface MassEditItemRowProps {
  tagType: EffectType;
  item: Item;
  idx: number;
  refetch: () => void;
}

const MassEditItemRow: React.FC<MassEditItemRowProps> = (props) => {
  // Form handling
  const { effects, form, formData, setEffects, handleItemSubmit } = useItemEditForm(
    props.item,
    props.refetch,
  );

  // Fetch the tag in question
  const idx = effects.findIndex((e) => e.type === props.tagType);
  const tag = effects[idx];

  // Background color for this row
  const bgColor = props.idx % 2 == 0 ? "bg-slate-600" : "";

  // Show the form
  return (
    <div className={`flex flex-col`}>
      <EditContent
        schema={ItemValidator._def.schema._def.schema}
        form={form}
        formData={formData}
        formClassName="flex flex-row w-screen"
        showSubmit={false}
        buttonTxt="Save to Database"
        allowImageUpload={false}
        fixedWidths="basis-96"
        bgColor={bgColor}
        onEnter={handleItemSubmit}
      />
      {tag && (
        <EffectFormWrapper
          idx={idx}
          type="item"
          formClassName="flex flex-row w-screen"
          tag={tag}
          hideTagType={true}
          fixedWidths="basis-96"
          bgColor={bgColor}
          availableTags={tagTypes}
          effects={effects}
          setEffects={setEffects}
        />
      )}
    </div>
  );
};
interface MassEditBackgroundSchemaRowProps {
  backgroundSchema: BackgroundSchema;
  idx: number;
  refetch: () => void;
}
const MassEditBackgroundSchemaRow: React.FC<MassEditBackgroundSchemaRowProps> = (
  props,
) => {
  // Define your form handling logic here
  const { form, formData, handleBackgroundSchemaSubmit } = useBackgroundSchemaEditForm(
    props.backgroundSchema,
    props.refetch,
  );

  // Background color for this row
  const bgColor = props.idx % 2 === 0 ? "bg-slate-600" : "";

  return (
    <div className={`flex flex-col`}>
      <EditContent
        schema={BackgroundSchemaValidator}
        form={form}
        formData={formData}
        formClassName="flex flex-row w-screen"
        showSubmit={false}
        buttonTxt="Save to Database"
        allowImageUpload={false}
        fixedWidths="basis-96"
        bgColor={bgColor}
        onEnter={handleBackgroundSchemaSubmit}
      />
      {/* If you have additional fields or effects, you can add them here */}
    </div>
  );
};
