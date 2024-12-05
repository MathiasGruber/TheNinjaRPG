import { z } from "zod";
import { calculateContentDiff } from "@/utils/diff";
import { useForm } from "react-hook-form";
import Image from "next/image";
import React, { useEffect } from "react";
import AvatarImage from "@/layout/Avatar";
import RichInput from "@/layout/RichInput";
import Loader from "@/layout/Loader";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { objectKeys } from "@/utils/typeutils";
import { RefreshCw } from "lucide-react";
import { getTagSchema } from "@/libs/combat/types";
import { zodResolver } from "@hookform/resolvers/zod";
import { showMutationToast } from "@/libs/toast";
import { UploadButton } from "@/utils/uploadthing";
import { api } from "@/app/_trpc/client";
import { getObjectiveSchema } from "@/validators/objectives";
import { sleep } from "@/utils/time";
import { Button } from "@/components/ui/button";
import { MultiSelect, type OptionType } from "@/components/ui/multi-select";
import { X } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import type { Path, PathValue } from "react-hook-form";
import type { AllObjectivesType } from "@/validators/objectives";
import type { ZodAllTags } from "@/libs/combat/types";
import type { FieldValues } from "react-hook-form";
import type { UseFormReturn } from "react-hook-form";

export type FormDbValue = { id: string; name: string };
export type FormEntry<K> = {
  id: K;
  label?: string;
  doubleWidth?: boolean;
  resetButton?: boolean;
} & (
  | { type: "text" }
  | { type: "richinput" }
  | { type: "date" }
  | { type: "number" }
  | { type: "boolean" }
  | { type: "str_array"; values: readonly string[]; multiple?: boolean }
  | { type: "animation_array"; values: readonly string[] }
  | { type: "statics_array"; values: readonly string[] }
  | { type: "avatar"; href?: string | null }
  | {
      type: "db_values";
      values: FormDbValue[] | undefined;
      multiple?: boolean;
      current?: string;
    }
);

interface EditContentProps<T, K, S extends FieldValues> {
  schema: T;
  form: UseFormReturn<S, any>;
  formData: FormEntry<K>[];
  showSubmit: boolean;
  formClassName?: string;
  buttonTxt?: string;
  allowImageUpload?: boolean;
  fixedWidths?: "basis-32" | "basis-64" | "basis-96";
  type?: "jutsu" | "bloodline" | "item" | "quest" | "ai" | "badge" | "asset";
  bgColor?: "bg-slate-600" | "";
  onAccept?: (
    e: React.BaseSyntheticEvent<object, any, any> | undefined,
  ) => Promise<void>;
  onEnter?: () => Promise<void>;
}

/**
 * Generic edit content component, used for creating and editing e.g. jutsu, bloodline, item, AI
 * @returns React.ReactNode
 */
export const EditContent = <
  T extends z.AnyZodObject,
  K extends Path<S>,
  S extends z.infer<T>,
>(
  props: EditContentProps<T, K, S>,
) => {
  // Destructure
  const { formData, formClassName, form, showSubmit, buttonTxt } = props;
  const currentValues = form.getValues();

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
  const { mutate: removeBg, isPending: load1 } = api.openai.removeBg.useMutation({
    onSuccess: (data, variables) => {
      showMutationToast({ success: true, message: "Background removed" });
      fetchImg({
        replicateId: data.replicateId,
        field: variables.field,
        removeBg: false,
      });
    },
  });

  const { mutate: fetchImg, isPending: load2 } = api.openai.fetchImg.useMutation({
    onSuccess: async (data, variables) => {
      if (data.status !== "failed") {
        if (data.url) {
          form.setValue(variables.field as Path<S>, data.url as PathValue<S, Path<S>>, {
            shouldDirty: true,
          });
          if (variables.removeBg) {
            removeBg({ url: data.url, field: variables.field });
          }
        } else {
          await sleep(5000);
          fetchImg(variables);
        }
      }
    },
  });

  const { mutate: createImg, isPending: load3 } = api.openai.createImg.useMutation({
    onSuccess: (data, variables) => {
      showMutationToast({ success: true, message: "Image generated. Now fetching" });
      fetchImg({
        replicateId: data.replicateId,
        field: variables.field,
        removeBg: variables.removeBg,
      });
    },
  });

  const load = load1 || load2 || load3;
  return (
    <Form {...form}>
      <form
        onSubmit={props.onAccept}
        className={
          formClassName ?? "grid grid-cols-1 md:grid-cols-2 items-center gap-2"
        }
      >
        {formData.map((formEntry) => {
          // Derived
          const id = formEntry.id;
          let type = formEntry.type;

          // Options for select & multi-select
          let options: OptionType[] = [];
          if (
            formEntry.type === "animation_array" ||
            formEntry.type === "statics_array" ||
            formEntry.type === "str_array"
          ) {
            options.push(...formEntry.values?.map((v) => ({ label: v, value: v })));
          } else if (formEntry.type === "db_values" && formEntry.values) {
            options.push(
              ...formEntry.values?.map((v) => ({ label: v.name, value: v.id })),
            );
          }
          options = options.map((o) => ({
            label: o.label !== "" ? o.label : "None",
            value: o.value !== "" ? o.value : "None",
          }));

          // Show richInputs as text if fixedWidths
          if (props.fixedWidths && formEntry.type === "richinput") {
            type = "text";
          }

          // Render
          return (
            <div
              key={`formEntry-${id}`}
              className={`${type === "avatar" ? "row-span-5" : ""} ${
                formEntry.doubleWidth ? "md:col-span-2" : ""
              } ${
                props.fixedWidths
                  ? `grow-0 shrink-0 px-2 pt-3 h-32 ${props.fixedWidths}`
                  : ""
              } ${props.bgColor ? props.bgColor : ""}`}
            >
              {["text", "number", "date"].includes(type) && (
                <FormField
                  control={form.control}
                  name={id}
                  render={({ field, fieldState }) => {
                    return (
                      <FormItem>
                        <FormLabel>{formEntry.label ? formEntry.label : id}</FormLabel>
                        <FormControl>
                          <Input
                            id={id}
                            type={type}
                            isDirty={fieldState.isDirty}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    );
                  }}
                />
              )}
              {"boolean" === type && (
                <FormField
                  control={form.control}
                  name={id}
                  render={({ field, fieldState }) => {
                    return (
                      <FormItem>
                        <FormLabel>{formEntry.label ? formEntry.label : id}</FormLabel>
                        <br />
                        <FormControl>
                          <Switch
                            checked={field.value}
                            isDirty={fieldState.isDirty}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    );
                  }}
                />
              )}
              {type === "richinput" && currentValues && (
                <FormField
                  control={form.control}
                  name={id}
                  render={({ fieldState }) => {
                    return (
                      <FormItem>
                        <FormControl>
                          <RichInput
                            id={id}
                            height="200"
                            placeholder={currentValues[id] as string}
                            label={formEntry.label ? formEntry.label : id}
                            control={form.control}
                            isDirty={fieldState.isDirty}
                            error={form.formState.errors[id]?.message as string}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    );
                  }}
                />
              )}
              {(type === "str_array" ||
                type === "db_values" ||
                type === "animation_array" ||
                type === "statics_array") && (
                <div className="flex flex-row items-end">
                  <div className="grow">
                    <FormField
                      control={form.control}
                      name={id}
                      render={({ field, fieldState }) => (
                        <FormItem>
                          <FormLabel>
                            {formEntry.label ? formEntry.label : id}
                          </FormLabel>

                          {"multiple" in formEntry && formEntry.multiple ? (
                            <MultiSelect
                              selected={field.value ? field.value : []}
                              isDirty={fieldState.isDirty}
                              options={options}
                              onChange={field.onChange}
                            />
                          ) : (
                            <Select
                              onValueChange={field.onChange}
                              defaultValue={field.value}
                              value={field.value}
                            >
                              <FormControl>
                                <SelectTrigger isDirty={fieldState.isDirty}>
                                  <SelectValue placeholder={`None`} />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {options.map((option) => (
                                  <SelectItem
                                    key={`select-${option.label}`}
                                    value={option.value}
                                  >
                                    {option.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}

                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  {formEntry.resetButton && (
                    <Button
                      className="w-8 p-0 ml-1"
                      type="button"
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        form.setValue(id, "" as PathValue<S, K>, {
                          shouldDirty: true,
                        });
                      }}
                    >
                      <X className="h-5 w-5 stroke-1" />
                    </Button>
                  )}
                  {"current" in formEntry && formEntry.current && (
                    <div className="w-12 ml-1 h-12 overflow-y-auto">
                      <Image
                        src={formEntry.current}
                        alt={id}
                        width={100}
                        height={100}
                        priority
                      />
                    </div>
                  )}
                </div>
              )}
              {type === "avatar" && props.allowImageUpload && "href" in formEntry && (
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
                      id="create"
                      className="h-10 mr-1 bg-blue-600"
                      onClick={() => {
                        let prompt = "";
                        // Generate based on name, title and description
                        if (currentValues?.name) {
                          prompt += `${currentValues?.name} `;
                        }
                        if (currentValues?.username) {
                          prompt += `${currentValues?.username} `;
                        }
                        if (currentValues?.title) {
                          prompt += `${currentValues?.title} `;
                        }
                        if (prompt && !load) {
                          // Different qualifiers for different content types
                          if (props.type === "quest") {
                            prompt = `Epic composition, cinematic ${prompt}, vibrant background, pixel art evoking the charm of 8-bit/16-bit era games with modern shading techniques, Trending on artstation, 8k, Japanese inspiration, extremely detailed.`;
                          } else if (props.type === "item") {
                            prompt = `Miniature Icon Object for Videogame User Interface, ${prompt}, white background, concept art design, Japanese inspiration, pixel art evoking the charm of 8-bit/16-bit era games with modern shading techniques, MOORPG Items, professional videogame Design, Indi Studio, High Quality, 4k, Photoshop.`;
                          } else if (props.type === "badge") {
                            prompt = `${prompt} round badge Japanese inspiration, white background, pixel art evoking the charm of 8-bit/16-bit era games with modern shading techniques, professional videogame Design, High Quality, 4k, Photoshop.`;
                          } else if (props.type === "jutsu") {
                            prompt = `epic composition, symbolic representing the action: ${prompt},Japanese inspiration, fantasy pixel art evoking the charm of 8-bit/16-bit era games with modern shading techniques, trending on artstation, extremely detailed.`;
                          } else if (props.type === "bloodline") {
                            prompt = `epic composition, symbolic representing the heritage: ${prompt},Japanese inspiration, fantasy pixel art evoking the charm of 8-bit/16-bit era games with modern shading techniques, trending on artstation, extremely detailed.`;
                          } else if (props.type === "ai") {
                            prompt = `A full-body anime-style pixel art ${prompt} in a 3D-like, standing in a balanced, central position. The ${prompt} is rendered with clean, sharp pixel details and modern shading techniques, evoking the style of retro 8-bit/16-bit games but with a polished, high-quality finish. The background is a simple, solid color highlighting the character, allowing them to stand out clearly. Dynamic pose, extremely detailed.`;
                          }
                          // Send of the request for content image
                          createImg({
                            prompt: prompt,
                            field: id,
                            removeBg: ["item", "ai"].includes(props.type ?? ""),
                          });
                        }
                      }}
                    >
                      {load ? (
                        <Loader noPadding={true} size={25} />
                      ) : (
                        <RefreshCw className="mr-1 p-2 h-10 w-10" />
                      )}
                      AI
                    </Button>
                    <UploadButton
                      endpoint="imageUploader"
                      onClientUploadComplete={(res) => {
                        const url = res?.[0]?.url;
                        if (url) {
                          form.setValue(id, url as PathValue<S, K>, {
                            shouldDirty: true,
                          });
                        }
                      }}
                      onUploadError={(error: Error) => {
                        showMutationToast({ success: false, message: error.message });
                      }}
                    />
                  </div>
                </>
              )}
              {type === "avatar" && !props.allowImageUpload && "href" in formEntry && (
                <div className="w-32">
                  <AvatarImage
                    href={formEntry.href}
                    alt={id}
                    size={100}
                    hover_effect={true}
                    priority
                  />
                </div>
              )}
            </div>
          );
        })}
        {showSubmit && props.onAccept && (
          <div className="col-span-2 items-center mt-3">
            <Button id="create" className="w-full" onClick={props.onAccept}>
              {buttonTxt ?? "Save"}
            </Button>
          </div>
        )}
      </form>
    </Form>
  );
};

interface EffectFormWrapperProps {
  idx: number;
  type: "jutsu" | "bloodline" | "item";
  availableTags: readonly string[];
  formClassName?: string;
  hideTagType?: boolean;
  tag: ZodAllTags;
  fixedWidths?: "basis-32" | "basis-64" | "basis-96";
  bgColor?: "bg-slate-600" | "";
  effects: ZodAllTags[];
  setEffects: (effects: ZodAllTags[]) => void;
}

/**
 * A wrapper component around EditContent for creating a form for a single tag
 * @returns React.ReactNode
 */
export const EffectFormWrapper: React.FC<EffectFormWrapperProps> = (props) => {
  // Destructure props
  const { tag, idx, effects, formClassName, setEffects } = props;

  // Get the schema & parse the tag
  const tagSchema = getTagSchema(tag.type);
  const parsedTag = tagSchema.safeParse(tag);
  const shownTag = parsedTag.success ? parsedTag.data : tag;
  const fields = Object.keys(shownTag);

  // Queries
  const { data: aiData } = api.profile.getAllAiNames.useQuery(undefined, {
    enabled: Object.keys(shownTag).includes("aiId"),
  });

  const { data: jutsuData } = api.jutsu.getAllNames.useQuery(undefined, {
    enabled: fields.includes("jutsus"),
  });

  const { data: itemData } = api.item.getAllNames.useQuery(undefined, {
    enabled: fields.includes("items"),
  });

  const { data: assetData } = api.misc.getAllGameAssetNames.useQuery(undefined, {
    enabled:
      fields.includes("staticAssetPath") ||
      fields.includes("appearAnimation") ||
      fields.includes("staticAnimation") ||
      fields.includes("disappearAnimation"),
  });

  // Form for handling the specific tag
  const form = useForm<typeof tag>({
    defaultValues: shownTag,
    values: shownTag,
    resolver: zodResolver(tagSchema),
    mode: "all",
  });

  // A few fields we need to watch
  const watchType = form.watch("type");
  const watchStaticPath = form.watch("staticAssetPath");
  const watchAppear = form.watch("appearAnimation");
  const watchStatic = form.watch("staticAnimation");
  const watchDisappear = form.watch("disappearAnimation");
  const watchAll = form.watch();

  // Get images for the different animations and statics
  const statics = assetData?.filter((a) => a.type === "STATIC");
  const animations = assetData?.filter((a) => a.type === "ANIMATION");
  const staticImage = statics?.find((a) => a.id === watchStaticPath)?.image;
  const appearAnimImage = animations?.find((a) => a.id === watchAppear)?.image;
  const disappearAnimImage = animations?.find((a) => a.id === watchDisappear)?.image;
  const staticAnimImage = animations?.find((a) => a.id === watchStatic)?.image;

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
            // @ts-expect-error - we know this is a key of the object
            shownTag[key] = curTag[key];
          }
        });
        newEffects[idx] = shownTag;
        form.reset(shownTag);
      }
      setEffects(newEffects);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tag, watchType, idx, effects]);

  // Trigger re-validation after type changes
  useEffect(() => {
    void form.trigger(undefined, { shouldFocus: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tag.type]);

  // Automatically update the effects whenever new data
  useEffect(() => {
    // Calculate diff
    const newEffects = [...effects];
    const tagSchema = getTagSchema(watchType);
    const parsedTag = tagSchema.safeParse(watchAll);
    const shownTag = parsedTag.success ? parsedTag.data : tag;
    newEffects[idx] = shownTag;
    const diff = calculateContentDiff(effects, newEffects);
    if (diff.length > 0) {
      if (tag.type === watchType) {
        if (form.formState.isDirty) {
          void form.trigger();
        }
        if (form.formState.isValid) {
          setEffects(newEffects);
          form.reset(watchAll);
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchAll]);

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
      } else if ((value as string) === "items" && itemData) {
        return {
          id: value,
          values: itemData,
          multiple: true,
          type: "db_values",
        };
      } else if ((value as string) === "jutsus" && jutsuData) {
        return {
          id: value,
          values: jutsuData,
          multiple: true,
          type: "db_values",
        };
      } else if ((value as string) === "description") {
        return { id: value, label: value, type: "richinput", doubleWidth: true };
      } else if (innerType instanceof z.ZodString && value === "appearAnimation") {
        return {
          id: value,
          values: animations,
          multiple: false,
          type: "db_values",
          current: appearAnimImage,
        };
      } else if (innerType instanceof z.ZodString && value === "disappearAnimation") {
        return {
          id: value,
          values: animations,
          multiple: false,
          type: "db_values",
          current: disappearAnimImage,
        };
      } else if (innerType instanceof z.ZodString && value === "staticAnimation") {
        return {
          id: value,
          values: animations,
          multiple: false,
          type: "db_values",
          current: staticAnimImage,
        };
      } else if (innerType instanceof z.ZodString && value === "staticAssetPath") {
        return {
          id: value,
          values: statics,
          multiple: false,
          type: "db_values",
          current: staticImage,
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
      form={form}
      formData={formData}
      formClassName={formClassName}
      showSubmit={false}
      buttonTxt="Confirm Changes (No database sync)"
      fixedWidths={props.fixedWidths}
      bgColor={props.bgColor}
    />
  );
};

interface ObjectiveFormWrapperProps {
  idx: number;
  availableTags: readonly string[];
  hideTagType?: boolean;
  hideRounds?: boolean;
  objective: AllObjectivesType;
  formClassName?: string;
  fixedWidths?: "basis-32" | "basis-64" | "basis-96";
  bgColor?: "bg-slate-600" | "";
  objectives: AllObjectivesType[];
  setObjectives: (content: AllObjectivesType[]) => void;
}

/**
 * A wrapper component around EditContent for creating a form for a single tag
 * @returns React.ReactNode
 */
export const ObjectiveFormWrapper: React.FC<ObjectiveFormWrapperProps> = (props) => {
  // Destructure props
  const { idx, objective, objectives, formClassName, setObjectives } = props;

  // Get the schema & parse the tag
  const objectiveSchema = getObjectiveSchema(objective.task as string);
  const parsedTag = objectiveSchema.safeParse(objective);
  const shownTag = parsedTag.success ? parsedTag.data : objective;

  // Queries
  const fields = Object.keys(shownTag);
  const hasAIs = fields.includes("attackerAIs") || fields.includes("opponent_ai");
  const { data: aiData } = api.profile.getAllAiNames.useQuery(undefined, {
    enabled: hasAIs,
  });

  const { data: jutsuData } = api.jutsu.getAllNames.useQuery(undefined, {
    enabled: fields.includes("reward_jutsus"),
  });

  const { data: badgeData } = api.badge.getAll.useQuery(undefined, {
    enabled: fields.includes("reward_badges"),
  });

  const { data: itemData } = api.item.getAllNames.useQuery(undefined, {
    enabled: fields.includes("reward_items") || fields.includes("collect_item_id"),
  });

  // Form for handling the specific tag
  const form = useForm<AllObjectivesType>({
    defaultValues: shownTag,
    values: shownTag,
    resolver: zodResolver(objectiveSchema),
    mode: "all",
    reValidateMode: "onBlur",
  });

  // A few fields we need to watch
  const watchTask = form.watch("task");
  const watchAll = form.watch();

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
    void form.trigger(undefined, { shouldFocus: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [objective.task]);

  // Automatically update the effects whenever dirty
  useEffect(() => {
    const newObjectives = [...objectives];
    const parsedTag = objectiveSchema.safeParse(watchAll);
    const shownTag = parsedTag.success ? parsedTag.data : watchAll;
    newObjectives[idx] = shownTag;
    const diff = calculateContentDiff(objectives, newObjectives);
    if (diff.length > 0) {
      if (objective.task === watchTask) {
        if (form.formState.isDirty) {
          void form.trigger();
        }
        if (form.formState.isValid) {
          setObjectives(newObjectives);
          form.reset(watchAll);
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchAll]);

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
        ].includes(value),
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
      } else if (value === "reward_badges" && badgeData?.data) {
        return {
          id: value,
          values: badgeData?.data,
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
      } else if (innerType instanceof z.ZodBoolean) {
        return { id: value, label: value, type: "boolean" };
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
      form={form}
      formData={formData}
      formClassName={formClassName}
      showSubmit={false}
      buttonTxt="Confirm Changes (No database sync)"
      fixedWidths={props.fixedWidths}
      bgColor={props.bgColor}
    />
  );
};
