import { z } from "zod";
import { useForm } from "react-hook-form";
import Image from "next/image";
import React, { useEffect } from "react";
import Button from "./Button";
import InputField from "./InputField";
import SelectField from "./SelectField";
import AvatarImage from "./Avatar";
import { getTagSchema } from "../libs/combat/types";
import { zodResolver } from "@hookform/resolvers/zod";
import { show_toast, show_errors } from "../libs/toast";
import { UploadButton } from "../utils/uploadthing";
import { api } from "../utils/api";
import { combatAssetsNames } from "@/libs//travel/constants";
import type { CombatAssetName } from "@/libs//travel/constants";
import type { AnimationName } from "@/libs/combat/types";
import type { ZodAllTags } from "../libs/combat/types";
import type { FieldErrors } from "react-hook-form";
import type { UseFormRegister, UseFormSetValue } from "react-hook-form";

export type FormDbValue = { id: string; name: string };
export type FormEntry<K> = {
  id: K;
  label?: string;
  doubleWidth?: boolean;
} & (
  | { type: "text" }
  | { type: "number" }
  | { type: "db_values"; values: FormDbValue[] | undefined; multiple?: boolean }
  | { type: "str_array"; values: readonly string[]; multiple?: boolean }
  | { type: "animation_array"; values: readonly string[]; current: AnimationName }
  | { type: "statics_array"; values: readonly string[]; current: CombatAssetName }
  | { type: "avatar"; href?: string | null }
);

interface EditContentProps<T, K> {
  schema: T;
  formData: FormEntry<K>[];
  errors: FieldErrors;
  showSubmit: boolean;
  buttonTxt?: string;
  allowImageUpload?: boolean;
  limitSelectHeight?: boolean;
  fixedWidths?: "basis-32";
  bgColor?: "bg-slate-600" | "";
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
export const EditContent = <T extends z.AnyZodObject, K extends keyof T["shape"]>(
  props: EditContentProps<T, K>
) => {
  const { formData, errors, showSubmit, buttonTxt, register, setValue } = props;

  // Event listener for submitting on enter click
  const onDocumentKeyDown = (event: KeyboardEvent) => {
    if (props.onEnter) {
      switch (event.key) {
        case "Enter":
          props.onEnter();
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
                <UploadButton
                  endpoint="imageUploader"
                  onClientUploadComplete={(res) => {
                    const url = res?.[0]?.fileUrl;
                    if (url) {
                      setValue(id, url, { shouldDirty: true });
                    }
                  }}
                  onUploadError={(error: Error) => {
                    show_toast("Error uploading", error.message, "error");
                  }}
                />
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

interface TagFormWrapperProps {
  idx: number;
  availableTags: readonly string[];
  hideTagType?: boolean;
  hideRounds?: boolean;
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
export const TagFormWrapper: React.FC<TagFormWrapperProps> = (props) => {
  // Destructure props
  const { tag, idx, effects, setEffects } = props;

  // Get the schema & parse the tag
  const tagSchema = getTagSchema(tag.type);
  const parsedTag = tagSchema.safeParse(tag);
  const shownTag = parsedTag.success ? parsedTag.data : tag;

  // Queries
  const { data: aiData, isLoading: l1 } = api.profile.getAllAiNames.useQuery(
    undefined,
    {
      staleTime: Infinity,
      enabled: Object.keys(shownTag).includes("aiId"),
    }
  );

  // Form for handling the specific tag
  const {
    register,
    setValue,
    trigger,
    watch,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<ZodAllTags>({
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
        newEffects[idx] = shownTag;
      }
      setEffects(newEffects);
    }
  }, [tag, watchType, idx, effects, trigger]);

  // Trigger re-validation after type changes
  useEffect(() => {
    void trigger(undefined, { shouldFocus: true });
  }, [tag.type, trigger]);

  // Automatically update the effects whenever dirty
  useEffect(() => {
    if (isDirty) {
      handleTagupdate();
    }
  }, [isDirty]);

  // Form submission
  const handleTagupdate = handleSubmit(
    (data) => {
      const newEffects = [...effects];
      newEffects[idx] = data;
      setEffects(newEffects);
    },
    (errors) => show_errors(errors)
  );

  // Attributes on this tag, each of which we should show a form field for
  type Attribute = keyof ZodAllTags;
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
  const formData: FormEntry<Attribute>[] = attributes
    .filter(
      (value) =>
        !["timeTracker", "type", props.hideRounds ? "rounds" : ""].includes(value)
    )
    .map((value) => {
      const innerType = getInner(tagSchema.shape[value]);
      if ((value as string) === "aiId" && aiData) {
        return {
          id: value,
          label: "AI",
          values: aiData
            .sort((a, b) => a.level - b.level)
            .map((ai) => ({
              id: ai.userId,
              name: `lvl ${ai.level}: ${ai.username}`,
            })),
          type: "db_values",
        };
      } else if (
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
      } else if (value === "staticAssetPath") {
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
