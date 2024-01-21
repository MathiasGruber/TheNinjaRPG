import { z } from "zod";
import { useForm } from "react-hook-form";
import Image from "next/image";
import React, { useEffect } from "react";
import Button from "@/layout/Button";
import InputField from "@/layout/InputField";
import SelectField from "@/layout/SelectField";
import AvatarImage from "@/layout/Avatar";
import RichInput from "@/layout/RichInput";
import Loader from "@/layout/Loader";
import { objectKeys } from "@/utils/typeutils";
import { ArrowPathIcon } from "@heroicons/react/24/outline";
import { getTagSchema } from "@/libs/combat/types";
import { zodResolver } from "@hookform/resolvers/zod";
import { show_toast } from "@/libs/toast";
import { UploadButton } from "@/utils/uploadthing";
import { api } from "@/utils/api";
import { getObjectiveSchema } from "@/validators/objectives";
import { sleep } from "@/utils/time";
import type { Control } from "react-hook-form";
import type { AllObjectivesType } from "@/validators/objectives";
import type { CombatAssetName } from "@/libs//travel/constants";
import type { AnimationName } from "@/libs/combat/types";
import type { ZodAllTags } from "@/libs/combat/types";
import type { FieldErrors } from "react-hook-form";
import type { UseFormRegister, UseFormSetValue } from "react-hook-form";

export type FormDbValue = { id: string; name: string };
export type FormEntry<K> = {
  id: K;
  label?: string;
  doubleWidth?: boolean;
} & (
  | { type: "text" }
  | { type: "richinput" }
  | { type: "date" }
  | { type: "number" }
  | { type: "db_values"; values: FormDbValue[] | undefined; multiple?: boolean }
  | { type: "str_array"; values: readonly string[]; multiple?: boolean }
  | { type: "animation_array"; values: readonly string[]; current: AnimationName }
  | { type: "statics_array"; values: readonly string[]; current: CombatAssetName }
  | { type: "avatar"; href?: string | null }
);

interface EditContentProps<T, K, S> {
  schema: T;
  currentValues?: S;
  formData: FormEntry<K>[];
  errors: FieldErrors;
  showSubmit: boolean;
  buttonTxt?: string;
  allowImageUpload?: boolean;
  limitSelectHeight?: boolean;
  fixedWidths?: "basis-32";
  type?: "jutsu" | "bloodline" | "item" | "quest" | "ai" | "badge";
  bgColor?: "bg-slate-600" | "";
  control?: Control<any>;
  setValue: UseFormSetValue<any>;
  register: UseFormRegister<any>;
  onAccept?: (
    e: React.BaseSyntheticEvent<object, any, any> | undefined
  ) => Promise<void>;
  onEnter?: () => Promise<void>;
}

/**
 * Generic edit content component, used for creating and editing e.g. jutsu, bloodline, item, AI
 * @returns JSX.Element
 */
export const EditContent = <
  T extends z.AnyZodObject,
  K extends keyof T["shape"],
  S extends z.infer<T>
>(
  props: EditContentProps<T, K, S>
) => {
  // Destructure
  const { formData, errors, showSubmit, buttonTxt, control, currentValues } = props;
  const { register, setValue } = props;

  // Event listener for submitting on enter click
  const onDocumentKeyDown = (event: KeyboardEvent) => {
    if (props.onEnter) {
      switch (event.key) {
        case "Enter":
          void props.onEnter();
          break;
      }
    }
  };
  useEffect(() => {
    document.addEventListener("keydown", onDocumentKeyDown);
    return () => {
      document.removeEventListener("keydown", onDocumentKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mutations
  const { mutate: removeBg, isLoading: load1 } = api.openai.removeBg.useMutation({
    onSuccess: (data, variables) => {
      show_toast("Remove Background", "Now processing...", "info");
      fetchImg({
        replicateId: data.replicateId,
        field: variables.field,
        removeBg: false,
      });
    },
    onError: (error) => {
      show_toast("Error removing background", error.message, "error");
    },
  });

  const { mutate: fetchImg, isLoading: load2 } = api.openai.fetchImg.useMutation({
    onSuccess: async (data, variables) => {
      if (data.status !== "failed") {
        if (data.url) {
          setValue(variables.field, data.url, { shouldDirty: true });
          if (variables.removeBg) {
            removeBg({ url: data.url, field: variables.field });
          }
        } else {
          await sleep(5000);
          fetchImg(variables);
        }
      }
    },
    onError: (error) => {
      show_toast("Error fetching", error.message, "error");
    },
  });

  const { mutate: createImg, isLoading: load3 } = api.openai.createImg.useMutation({
    onSuccess: (data, variables) => {
      show_toast("Starting Text2Image", "Now processing...", "info");
      fetchImg({
        replicateId: data.replicateId,
        field: variables.field,
        removeBg: variables.removeBg,
      });
    },
    onError: (error) => {
      show_toast("Error creating", error.message, "error");
    },
  });

  const load = load1 || load2 || load3;

  return (
    <>
      {formData.map((formEntry) => {
        const id = formEntry.id as string;
        return (
          <div
            key={id}
            className={`${formEntry.type === "avatar" ? "row-span-5" : ""} ${
              formEntry.doubleWidth ? "col-span-2" : ""
            } ${
              props.fixedWidths ? `grow-0 shrink-0 pt-3 h-32 ${props.fixedWidths}` : ""
            } ${props.bgColor ? props.bgColor : ""}`}
          >
            {formEntry.type === "text" && (
              <InputField
                id={id}
                label={formEntry.label ? formEntry.label : id}
                register={register}
                error={errors[id]?.message as string}
              />
            )}
            {formEntry.type === "richinput" && control && currentValues && (
              <RichInput
                id={id}
                height="200"
                placeholder={currentValues[id] as string}
                label={formEntry.label ? formEntry.label : id}
                control={control}
                error={errors[id]?.message as string}
              />
            )}
            {formEntry.type === "date" && (
              <InputField
                id={id}
                placeholder="YYYY-MM-DD"
                label={formEntry.label ? formEntry.label : id}
                register={register}
                error={errors[id]?.message as string}
              />
            )}
            {formEntry.type === "number" && (
              <InputField
                key={id}
                id={id}
                type="number"
                label={formEntry.label ? formEntry.label : id}
                register={register}
                error={errors[id]?.message as string}
              />
            )}
            {(formEntry.type === "str_array" || formEntry.type === "db_values") && (
              <SelectField
                key={id}
                id={id}
                label={formEntry.label ? formEntry.label : id}
                register={register}
                error={errors[id]?.message as string}
                multiple={formEntry.multiple}
                limitSelectHeight={props.limitSelectHeight}
              >
                {formEntry.type === "str_array" &&
                  formEntry.values.map((target) => (
                    <option key={target} value={target}>
                      {target}
                    </option>
                  ))}
                {formEntry.type === "db_values" &&
                  formEntry.values?.map((target) => (
                    <option key={target.id} value={target.id}>
                      {target.name}
                    </option>
                  ))}
                {formEntry.type === "db_values" && (
                  <option key={undefined} value={""}>
                    None
                  </option>
                )}
              </SelectField>
            )}
            {(formEntry.type === "animation_array" ||
              formEntry.type === "statics_array") && (
              <div className="flex flex-row">
                <div className="grow">
                  <SelectField
                    key={id}
                    id={id}
                    label={formEntry.label ? formEntry.label : id}
                    register={register}
                    error={errors[id]?.message as string}
                    limitSelectHeight={props.limitSelectHeight}
                  >
                    {formEntry.values.map((target) => (
                      <option key={target} value={target}>
                        {target}
                      </option>
                    ))}
                  </SelectField>
                </div>
                <div className="w-20">
                  {formEntry.current && (
                    <Image
                      src={
                        formEntry.type === "animation_array"
                          ? `/animations/${formEntry.current}.gif`
                          : `/combat/staticAssets/${formEntry.current}.png`
                      }
                      alt={id}
                      width={100}
                      height={100}
                      priority
                    />
                  )}
                </div>
              </div>
            )}
            {formEntry.type === "avatar" && props.allowImageUpload && (
              <>
                <AvatarImage
                  href={formEntry.href}
                  alt={id}
                  size={100}
                  hover_effect={true}
                  priority
                />
                <br />
                <div className="flex flex-row justify-center">
                  <Button
                    className="text-sm"
                    marginClass="mr-1"
                    paddingClass="p-1"
                    id="create"
                    color="blue"
                    label="AI"
                    image={
                      load ? (
                        <Loader noPadding={true} size={25} />
                      ) : (
                        <ArrowPathIcon className="mr-1 h-8 w-8" />
                      )
                    }
                    onClick={() => {
                      let prompt = "";
                      // Generate based on name, title and description
                      if (currentValues?.["name"]) {
                        prompt += `${currentValues?.["name"]} `;
                      }
                      if (currentValues?.["username"]) {
                        prompt += `${currentValues?.["username"]} `;
                      }
                      if (currentValues?.["title"]) {
                        prompt += `${currentValues?.["title"]} `;
                      }
                      if (prompt && !load) {
                        // Different qualifiers for different content types
                        if (props.type === "quest") {
                          prompt +=
                            ", epic composition, cinematic, vibrant background, by greg rutkowski and thomas kinkade, Trending on artstation, 8k, hyperrealistic, extremely detailed";
                        } else if (props.type === "item") {
                          prompt = `Miniature Icon Object for Videogame User Interface, ${prompt}, white background, concept art design, Ubisoft Inspiration, WoW Style Icon, MOORPG Items, Profesional Videogame Design, Indi Studio, High Quality, 4k, Photoshop.`;
                        } else if (props.type === "badge") {
                          prompt = `Miniature Icon Object for Videogame User Interface, ${prompt}, white background, concept art design, Ubisoft Inspiration, WoW Style Icon, MOORPG Items, Profesional Videogame Design, Indi Studio, High Quality, 4k, Photoshop.`;
                        } else if (props.type === "jutsu") {
                          prompt += `, epic composition, cinematic, fantasy, trending on artstation, extremely detailed`;
                        } else if (props.type === "bloodline") {
                          prompt += `, epic composition, cinematic, fantasy, trending on artstation, extremely detailed`;
                        } else if (props.type === "ai") {
                          prompt = `front view, unique tiny ${prompt} figurine, standing character, as supercell character, soft smooth lighting, soft shadows, skottie young, 3d blender render, polycount, modular constructivism, square image​, blue background, centered, pop surrealistic, emotional face`;
                        }
                        // Send of the request for content image
                        createImg({
                          prompt: prompt,
                          field: id,
                          removeBg: ["item", "ai"].includes(props.type ?? ""),
                        });
                      }
                    }}
                  />
                  <UploadButton
                    endpoint="imageUploader"
                    onClientUploadComplete={(res) => {
                      const url = res?.[0]?.url;
                      if (url) {
                        setValue(id, url, { shouldDirty: true });
                      }
                    }}
                    onUploadError={(error: Error) => {
                      show_toast("Error uploading", error.message, "error");
                    }}
                  />
                </div>
              </>
            )}
            {formEntry.type === "avatar" && !props.allowImageUpload && (
              <AvatarImage
                href={formEntry.href}
                alt={id}
                size={100}
                hover_effect={true}
                priority
              />
            )}
          </div>
        );
      })}
      {showSubmit && props.onAccept && (
        <div className="col-span-2 items-center mt-3">
          <Button id="create" label={buttonTxt ?? "Save"} onClick={props.onAccept} />
        </div>
      )}
    </>
  );
};

interface EffectFormWrapperProps {
  idx: number;
  type: "jutsu" | "bloodline" | "item";
  availableTags: readonly string[];
  hideTagType?: boolean;
  limitSelectHeight?: boolean;
  tag: ZodAllTags;
  fixedWidths?: "basis-32";
  bgColor?: "bg-slate-600" | "";
  effects: ZodAllTags[];
  setEffects: (effects: ZodAllTags[]) => void;
}

/**
 * A wrapper component around EditContent for creating a form for a single tag
 * @returns JSX.Element
 */
export const EffectFormWrapper: React.FC<EffectFormWrapperProps> = (props) => {
  // Destructure props
  const { tag, idx, effects, setEffects } = props;

  // Get the schema & parse the tag
  const tagSchema = getTagSchema(tag.type);
  const parsedTag = tagSchema.safeParse(tag);
  const shownTag = parsedTag.success ? parsedTag.data : tag;

  // Queries
  const { data: aiData } = api.profile.getAllAiNames.useQuery(undefined, {
    staleTime: Infinity,
    enabled: Object.keys(shownTag).includes("aiId"),
  });

  // Form for handling the specific tag
  const {
    register,
    setValue,
    trigger,
    watch,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<typeof tag>({
    values: shownTag,
    resolver: zodResolver(tagSchema),
    mode: "all",
  });

  // A few fields we need to watch
  const watchType = watch("type");
  const watchStaticPath = watch("staticAssetPath");
  const watchAppear = watch("appearAnimation");
  const watchStatic = watch("staticAnimation");
  const watchDisappear = watch("disappearAnimation");

  // When user changes type, we need to update the effects array to re-render form
  useEffect(() => {
    if (watchType && watchType !== tag.type) {
      const newEffects = [...effects];
      const curTag = newEffects?.[idx];
      if (curTag) {
        const tagSchema = getTagSchema(watchType);
        const parsedTag = tagSchema.safeParse({ type: watchType });
        const shownTag = parsedTag.success ? parsedTag.data : tag;
        // For all typed keys in shownTag, if the key exists in curTag, keep the value, except for type
        objectKeys(shownTag).map((key) => {
          if (!["type", "calculation", "direction"].includes(key) && key in curTag) {
            // @ts-ignore
            shownTag[key] = curTag[key];
          }
        });
        newEffects[idx] = shownTag;
      }
      setEffects(newEffects);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tag, watchType, idx, effects, trigger]);

  // Trigger re-validation after type changes
  useEffect(() => {
    void trigger(undefined, { shouldFocus: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tag.type]);

  // Automatically update the effects whenever dirty
  useEffect(() => {
    if (isDirty) {
      void handleTagupdate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDirty]);

  // Form submission
  const handleTagupdate = handleSubmit((data) => {
    const newEffects = [...effects];
    newEffects[idx] = data;
    setEffects(newEffects);
  });

  // Attributes on this tag, each of which we should show a form field for
  type Attribute = keyof typeof tag;
  const attributes = Object.keys(tagSchema.shape) as Attribute[];

  /** Unwrap zod types to get inner-most type */
  const getInner = (type: z.ZodTypeAny): z.ZodTypeAny => {
    if (
      type instanceof z.ZodDefault ||
      type instanceof z.ZodOptional ||
      type instanceof z.ZodNullable
    ) {
      return getInner(type._def.innerType as z.ZodTypeAny);
    }
    return type;
  };

  // Parse how to present the tag form
  const ignore = ["timeTracker", "type", "direction"];
  if (props.type === "bloodline") {
    ignore.push(...["rounds", "friendlyFire"]);
  }
  const formData: FormEntry<Attribute>[] = attributes
    .filter((value) => !ignore.includes(value))
    .map((value) => {
      const innerType = getInner(tagSchema.shape[value]);
      if ((value as string) === "aiId" && aiData) {
        return {
          id: value,
          label: "AI",
          values: aiData
            .filter((ai) => ai.isSummon)
            .sort((a, b) => a.level - b.level)
            .map((ai) => ({
              id: ai.userId,
              name: `lvl ${ai.level}: ${ai.username}`,
            })),
          type: "db_values",
        };
      } else if (
        innerType instanceof z.ZodEnum &&
        ["appearAnimation", "staticAnimation", "disappearAnimation"].includes(value)
      ) {
        return {
          id: value,
          type: "animation_array",
          values: innerType._def.values as string[],
          current:
            value === "appearAnimation"
              ? watchAppear
              : value === "staticAnimation"
              ? watchStatic
              : watchDisappear,
        };
      } else if (innerType instanceof z.ZodEnum && value === "staticAssetPath") {
        return {
          id: value,
          type: "statics_array",
          values: innerType._def.values as string[],
          current: watchStaticPath,
        };
      } else if (
        innerType instanceof z.ZodLiteral ||
        innerType instanceof z.ZodString
      ) {
        return { id: value, label: value, type: "text" };
      } else if (innerType instanceof z.ZodNumber) {
        return { id: value, label: value, type: "number" };
      } else if (innerType instanceof z.ZodEnum) {
        return {
          id: value,
          type: "str_array",
          values: innerType._def.values as string[],
        };
      } else if (innerType instanceof z.ZodNativeEnum) {
        return {
          id: value,
          type: "str_array",
          values: Object.keys(innerType._def.values as Record<string, string>),
        };
      } else if (
        innerType instanceof z.ZodArray &&
        innerType._def.type instanceof z.ZodEnum
      ) {
        const values = innerType._def.type._def.values as string[];
        return { id: value, type: "str_array", values: values, multiple: true };
      } else {
        return { id: value, label: value, type: "text" };
      }
    });

  // Add tag type as first entry
  if (!props.hideTagType) {
    formData.unshift({
      id: "type",
      type: "str_array",
      values: props.availableTags,
    });
  }

  // Re-used EditContent component for actually showing the form
  return (
    <EditContent
      schema={tagSchema}
      showSubmit={false}
      buttonTxt="Confirm Changes (No database sync)"
      fixedWidths={props.fixedWidths}
      bgColor={props.bgColor}
      limitSelectHeight={props.limitSelectHeight}
      setValue={setValue}
      register={register}
      errors={errors}
      formData={formData}
      onAccept={handleTagupdate}
    />
  );
};

interface ObjectiveFormWrapperProps {
  idx: number;
  availableTags: readonly string[];
  hideTagType?: boolean;
  hideRounds?: boolean;
  limitSelectHeight?: boolean;
  objective: AllObjectivesType;
  fixedWidths?: "basis-32";
  bgColor?: "bg-slate-600" | "";
  objectives: AllObjectivesType[];
  setObjectives: (content: AllObjectivesType[]) => void;
}

/**
 * A wrapper component around EditContent for creating a form for a single tag
 * @returns JSX.Element
 */
export const ObjectiveFormWrapper: React.FC<ObjectiveFormWrapperProps> = (props) => {
  // Destructure props
  const { idx, objective, objectives, setObjectives } = props;

  // Get the schema & parse the tag
  const objectiveSchema = getObjectiveSchema(objective.task as string);
  const parsedTag = objectiveSchema.safeParse(objective);
  const shownTag = parsedTag.success ? parsedTag.data : objective;

  // Queries
  const fields = Object.keys(shownTag);
  const hasAIs = fields.includes("attackerAIs") || fields.includes("opponent_ai");
  const { data: aiData } = api.profile.getAllAiNames.useQuery(undefined, {
    staleTime: Infinity,
    enabled: hasAIs,
  });

  const { data: jutsuData } = api.jutsu.getAllNames.useQuery(undefined, {
    staleTime: Infinity,
    enabled: fields.includes("reward_jutsus"),
  });

  const { data: itemData } = api.item.getAllNames.useQuery(undefined, {
    staleTime: Infinity,
    enabled: fields.includes("reward_items") || fields.includes("collect_item_id"),
  });

  // Form for handling the specific tag
  const {
    register,
    setValue,
    trigger,
    watch,
    formState: { errors, isDirty, isValid },
  } = useForm<AllObjectivesType>({
    values: shownTag,
    resolver: zodResolver(objectiveSchema),
    mode: "all",
    reValidateMode: "onBlur",
  });

  // A few fields we need to watch
  const watchTask = watch("task");
  const watchAll = watch();

  // When user changes type, we need to update the effects array to re-render form
  useEffect(() => {
    if (watchTask && watchTask !== objective.task) {
      const newObjectives = [...objectives];
      const curObjective = newObjectives?.[idx];
      if (curObjective && watchTask) {
        const tagSchema = getObjectiveSchema(watchTask);
        const parsedTag = tagSchema.safeParse({ id: objective.id, task: watchTask });
        const shownTag = parsedTag.success ? parsedTag.data : objective;
        newObjectives[idx] = shownTag;
      }
      setObjectives(newObjectives);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [objective, watchTask, idx, objectives]);

  // Trigger re-validation after type changes
  useEffect(() => {
    void trigger(undefined, { shouldFocus: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [objective.task]);

  // Automatically update the effects whenever dirty
  useEffect(() => {
    if (objective.task === watchTask) {
      if (isDirty) {
        void trigger();
      }
      if (isValid) {
        const newObjectives = [...objectives];
        newObjectives[idx] = watchAll;
        setObjectives(newObjectives);
      }
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDirty, isValid]);

  // Attributes on this tag, each of which we should show a form field for
  type Attribute = keyof AllObjectivesType;
  const attributes = Object.keys(objectiveSchema.shape) as Attribute[];

  /** Unwrap zod types to get inner-most type */
  const getInner = (type: z.ZodTypeAny): z.ZodTypeAny => {
    if (
      type instanceof z.ZodDefault ||
      type instanceof z.ZodOptional ||
      type instanceof z.ZodNullable
    ) {
      return getInner(type._def.innerType as z.ZodTypeAny);
    }
    return type;
  };

  // Parse how to present the tag form
  const formData: FormEntry<Attribute>[] = attributes
    .filter(
      (value) =>
        ![
          "task",
          "id",
          "image",
          "item_name",
          "opponent_name",
          "reward",
          "completed",
        ].includes(value)
    )
    .map((value) => {
      const innerType = getInner(objectiveSchema.shape[value]);
      if ((value as string) === "opponent_ai" && aiData) {
        return {
          id: value,
          values: aiData
            .sort((a, b) => a.level - b.level)
            .map((ai) => ({
              id: ai.userId,
              name: `lvl ${ai.level}: ${ai.username}`,
            })),
          multiple: false,
          type: "db_values",
        };
      } else if ((value as string) === "attackers" && aiData) {
        return {
          id: value,
          values: aiData
            .sort((a, b) => a.level - b.level)
            .map((ai) => ({
              id: ai.userId,
              name: `lvl ${ai.level}: ${ai.username}`,
            })),
          multiple: true,
          type: "db_values",
        };
      } else if (value === "reward_jutsus" && jutsuData) {
        return {
          id: value,
          values: jutsuData,
          multiple: true,
          type: "db_values",
        };
      } else if (value === "reward_items" && itemData) {
        return {
          id: value,
          values: itemData,
          multiple: true,
          type: "db_values",
        };
      } else if ((value as string) === "collect_item_id" && itemData) {
        return {
          id: value,
          values: itemData,
          multiple: false,
          type: "db_values",
        };
      } else if (
        innerType instanceof z.ZodLiteral ||
        innerType instanceof z.ZodString
      ) {
        return { id: value, label: value, type: "text" };
      } else if (innerType instanceof z.ZodNumber) {
        return { id: value, label: value, type: "number" };
      } else if (innerType instanceof z.ZodEnum) {
        return {
          id: value,
          type: "str_array",
          values: innerType._def.values as string[],
        };
      } else if (innerType instanceof z.ZodNativeEnum) {
        return {
          id: value,
          type: "str_array",
          values: Object.keys(innerType._def.values as Record<string, string>),
        };
      } else if (
        innerType instanceof z.ZodArray &&
        innerType._def.type instanceof z.ZodEnum
      ) {
        const values = innerType._def.type._def.values as string[];
        return { id: value, type: "str_array", values: values, multiple: true };
      } else {
        return { id: value, label: value, type: "text" };
      }
    });

  // Add tag type as first entry
  if (!props.hideTagType) {
    formData.unshift({
      id: "task",
      type: "str_array",
      values: props.availableTags,
    });
  }

  // Re-used EditContent component for actually showing the form
  return (
    <EditContent
      schema={objectiveSchema}
      showSubmit={false}
      buttonTxt="Confirm Changes (No database sync)"
      fixedWidths={props.fixedWidths}
      bgColor={props.bgColor}
      limitSelectHeight={props.limitSelectHeight}
      setValue={setValue}
      register={register}
      errors={errors}
      formData={formData}
    />
  );
};
