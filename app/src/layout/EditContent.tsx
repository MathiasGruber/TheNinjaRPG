import { z } from "zod";
import { useForm } from "react-hook-form";
import React, { useEffect } from "react";
import Button from "./Button";
import InputField from "./InputField";
import SelectField from "./SelectField";
import AvatarImage from "./Avatar";
import { getTagSchema } from "../libs/combat/types";
import { zodResolver } from "@hookform/resolvers/zod";
import { show_toast, show_errors } from "../libs/toast";
import { UploadButton } from "../utils/uploadthing";
import type { ZodAllTags } from "../libs/combat/types";
import type { FieldErrors } from "react-hook-form";
import type { UseFormRegister, UseFormSetValue } from "react-hook-form";
// You need to import our styles for the button to look right. Best to import in the root /_app.tsx but this is fine
import "@uploadthing/react/styles.css";

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
  | { type: "avatar"; href?: string | null }
);

interface EditContentProps<T, K> {
  schema: T;
  formData: FormEntry<K>[];
  errors: FieldErrors;
  showSubmit: boolean;
  buttonTxt?: string;
  setValue: UseFormSetValue<any>;
  register: UseFormRegister<any>;
  onAccept: (
    e: React.BaseSyntheticEvent<object, any, any> | undefined
  ) => Promise<void>;
}

/**
 * Generic edit content component, used for creating and editing e.g. jutsu, bloodline, item, AI
 * @returns JSX.Element
 */
export const EditContent = <T extends z.AnyZodObject, K extends keyof T["shape"]>(
  props: EditContentProps<T, K>
) => {
  const { formData, errors, showSubmit, buttonTxt, register, setValue } = props;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 items-center">
      {formData.map((formEntry) => {
        const id = formEntry.id as string;
        return (
          <div
            key={id}
            className={`${formEntry.type === "avatar" ? "row-span-5" : ""} ${
              formEntry.doubleWidth ? "col-span-2" : ""
            }`}
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
            {formEntry.type === "avatar" && (
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
          </div>
        );
      })}
      {showSubmit && (
        <div className="col-span-2 items-center mt-3">
          <Button id="create" label={buttonTxt ?? "Save"} onClick={props.onAccept} />
        </div>
      )}
    </div>
  );
};

interface TagFormWrapperProps {
  idx: number;
  availableTags: readonly string[];
  hideRounds?: boolean;
  tag: ZodAllTags;
  setEffects: React.Dispatch<React.SetStateAction<ZodAllTags[]>>;
}

/**
 * A wrapper component around EditContent for creating a form for a single tag
 * @returns JSX.Element
 */
export const TagFormWrapper: React.FC<TagFormWrapperProps> = (props) => {
  // Destructure props
  const { tag, idx, setEffects } = props;

  // Get the schema & parse the tag
  const tagSchema = getTagSchema(tag.type);
  const parsedTag = tagSchema.safeParse(tag);
  const shownTag = parsedTag.success ? parsedTag.data : tag;

  // Form for handling the specific tag
  const {
    register,
    setValue,
    watch,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<ZodAllTags>({
    values: shownTag,
    resolver: zodResolver(tagSchema),
    mode: "onBlur",
  });

  // When user changes type, we need to update the effects array to re-render form
  const watchType = watch("type");
  useEffect(() => {
    setEffects((effects) => {
      const newEffects = [...effects];
      const curTag = newEffects?.[idx];
      if (curTag?.type) {
        curTag.type = watchType;
      }
      return newEffects;
    });
  }, [watchType, idx, setEffects]);

  // Form submission
  const handleTagupdate = handleSubmit(
    (data) => {
      setEffects((effects) => {
        const newEffects = [...effects];
        newEffects[idx] = data;
        return newEffects;
      });
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
      if (innerType instanceof z.ZodLiteral || innerType instanceof z.ZodString) {
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
  formData.unshift({
    id: "type",
    type: "str_array",
    values: props.availableTags,
  });

  // Re-used EditContent component for actually showing the form
  return (
    <EditContent
      schema={tagSchema}
      showSubmit={isDirty}
      buttonTxt="Confirm Changes (No database sync)"
      setValue={setValue}
      register={register}
      errors={errors}
      formData={formData}
      onAccept={handleTagupdate}
    />
  );
};
