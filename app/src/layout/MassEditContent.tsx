import React, { useState } from "react";
import Modal from "@/layout/Modal";
import SelectField from "@/layout/SelectField";
import Loader from "@/layout/Loader";
import { EditContent } from "@/layout/EditContent";
import { TagFormWrapper } from "@/layout/EditContent";
import { api } from "@/utils/api";
import { effectFilters } from "@/libs/train";
import { JutsuValidator } from "@/libs/combat/types";
import { BloodlineValidator } from "@/libs/combat/types";
import { ItemValidator } from "@/libs/combat/types";
import { useJutsuEditForm } from "@/libs/jutsu";
import { useBloodlineEditForm } from "@/libs/bloodline";
import { useItemEditForm } from "@/libs/item";
import { tagTypes } from "@/libs/combat/types";
import type { EffectType } from "@/libs/train";
import type { Jutsu } from "@/drizzle/schema";
import type { Bloodline } from "@/drizzle/schema";
import type { Item } from "@/drizzle/schema";

interface MassEditContentProps {
  title: string;
  type: "jutsu" | "bloodline" | "item";
  button: React.ReactNode;
  onAccept?: (e: React.MouseEvent<HTMLInputElement, MouseEvent>) => void;
}

const MassEditContent: React.FC<MassEditContentProps> = (props) => {
  const [showModal, setShowModal] = useState<boolean>(false);
  const [tagType, setTagType] = useState<EffectType>(effectFilters[0]);

  // Data queries
  const {
    data: jutsus,
    refetch: refetchJutsus,
    isFetching: isFetchingJutsu,
  } = api.jutsu.getAll.useInfiniteQuery(
    { limit: 500, effect: tagType },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      keepPreviousData: true,
      staleTime: Infinity,
      enabled: props.type === "jutsu" && showModal,
    }
  );

  const {
    data: bloodlines,
    refetch: refetchBloodlines,
    isFetching: isFetchingBloodlines,
  } = api.bloodline.getAll.useInfiniteQuery(
    { limit: 500, effect: tagType, showHidden: true },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      keepPreviousData: true,
      staleTime: Infinity,
      enabled: props.type === "bloodline" && showModal,
    }
  );

  const {
    data: items,
    refetch: refetchItems,
    isFetching: isFetchingItems,
  } = api.item.getAll.useInfiniteQuery(
    { limit: 500, effect: tagType },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      keepPreviousData: true,
      staleTime: Infinity,
      enabled: props.type === "item" && showModal,
    }
  );

  // Get the data
  const getTableData = (type: "jutsu" | "bloodline" | "item") => {
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
    }
  };

  // Get all the data
  const { data, refetch } = getTableData(props.type);

  // Loader
  const loading = isFetchingJutsu || isFetchingBloodlines || isFetchingItems;

  if (showModal) {
    return (
      <Modal title={props.title} setIsOpen={setShowModal} onAccept={props.onAccept}>
        <SelectField
          id="filter"
          label="Select Tag"
          onChange={(e) => setTagType(e.target.value as EffectType)}
        >
          {effectFilters.map((effect) => {
            return (
              <option key={effect} value={effect}>
                {effect}
              </option>
            );
          })}
        </SelectField>
        <p className="font-bold py-3">
          NOTE: Push Enter button after changing a field to submit ALL changes!
        </p>
        {loading ? (
          <Loader explanation="Loading data..." />
        ) : (
          <div className="overflow-auto">
            {data?.map((entry, i) => {
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

interface MassEditJutsuRowProps {
  tagType: EffectType;
  jutsu: Jutsu;
  idx: number;
  refetch: () => void;
}

const MassEditJutsuRow: React.FC<MassEditJutsuRowProps> = (props) => {
  // Form handling
  const {
    effects,
    form: {
      setValue,
      register,
      formState: { errors },
    },
    formData,
    setEffects,
    handleJutsuSubmit,
  } = useJutsuEditForm(props.jutsu, props.refetch);

  // Fetch the tag in question
  const idx = effects.findIndex((e) => e.type === props.tagType);
  const tag = effects[idx];

  // Background color for this row
  const bgColor = props.idx % 2 == 0 ? "bg-slate-600" : "";

  // Show the form
  return (
    <div className={`flex items-center`}>
      <EditContent
        schema={JutsuValidator._def.schema}
        showSubmit={false}
        buttonTxt="Save to Database"
        allowImageUpload={false}
        fixedWidths="basis-32"
        bgColor={bgColor}
        setValue={setValue}
        register={register}
        errors={errors}
        formData={formData}
        onEnter={handleJutsuSubmit}
      />
      {tag && (
        <TagFormWrapper
          idx={idx}
          tag={tag}
          hideTagType={true}
          fixedWidths="basis-32"
          bgColor={bgColor}
          limitSelectHeight={true}
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
  const {
    effects,
    form: {
      setValue,
      register,
      formState: { errors },
    },
    formData,
    setEffects,
    handleBloodlineSubmit,
  } = useBloodlineEditForm(props.bloodline, props.refetch);

  // Fetch the tag in question
  const idx = effects.findIndex((e) => e.type === props.tagType);
  const tag = effects[idx];

  // Background color for this row
  const bgColor = props.idx % 2 == 0 ? "bg-slate-600" : "";

  // Show the form
  return (
    <div className={`flex items-center`}>
      <EditContent
        schema={BloodlineValidator}
        showSubmit={false}
        buttonTxt="Save to Database"
        allowImageUpload={false}
        fixedWidths="basis-32"
        bgColor={bgColor}
        setValue={setValue}
        register={register}
        errors={errors}
        formData={formData}
        onEnter={handleBloodlineSubmit}
      />
      {tag && (
        <TagFormWrapper
          idx={idx}
          tag={tag}
          hideTagType={true}
          fixedWidths="basis-32"
          bgColor={bgColor}
          limitSelectHeight={true}
          availableTags={tagTypes}
          hideRounds={true}
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
  const {
    effects,
    form: {
      setValue,
      register,
      formState: { errors },
    },
    formData,
    setEffects,
    handleItemSubmit,
  } = useItemEditForm(props.item, props.refetch);

  // Fetch the tag in question
  const idx = effects.findIndex((e) => e.type === props.tagType);
  const tag = effects[idx];

  // Background color for this row
  const bgColor = props.idx % 2 == 0 ? "bg-slate-600" : "";

  // Show the form
  return (
    <div className={`flex items-center`}>
      <EditContent
        schema={ItemValidator._def.schema}
        showSubmit={false}
        buttonTxt="Save to Database"
        allowImageUpload={false}
        fixedWidths="basis-32"
        bgColor={bgColor}
        setValue={setValue}
        register={register}
        errors={errors}
        formData={formData}
        onEnter={handleItemSubmit}
      />
      {tag && (
        <TagFormWrapper
          idx={idx}
          tag={tag}
          hideTagType={true}
          fixedWidths="basis-32"
          bgColor={bgColor}
          limitSelectHeight={true}
          availableTags={tagTypes}
          effects={effects}
          setEffects={setEffects}
        />
      )}
    </div>
  );
};
