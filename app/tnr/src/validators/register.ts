import { z } from "zod";
import { FederalStatus } from "@prisma/client";

// List of possible attributes
export const attributes = [
  "Full Beard",
  "Stubble",
  "Scar",
  "Soft features",
  "Hard features",
  "Tattoo",
] as const;
export const colors = ["Black", "Brown", "Blue", "Red", "White", "Gray"] as const;
export const skin_colors = ["Light", "Dark", "Olive", "Alibino"] as const;
export const genders = ["Male", "Female"] as const;

export const usernameSchema = z
  .string()
  .trim()
  .regex(new RegExp("^[a-zA-Z0-9_]+$"), {
    message: "Must only contain alphanumeric characters and no spaces",
  })
  .min(3)
  .max(12);

export const registrationSchema = z
  .object({
    username: usernameSchema,
    village: z.string().cuid({ message: "Must select a village" }),
    gender: z.enum(genders),
    hair_color: z.enum(colors),
    eye_color: z.enum(colors),
    skin_color: z.enum(skin_colors),
    attribute_1: z.enum(attributes),
    attribute_2: z.enum(attributes),
    attribute_3: z.enum(attributes),
    read_tos: z.literal(true),
    read_privacy: z.literal(true),
  })
  .strict()
  .required()
  .refine(
    (data) =>
      data.attribute_1 !== data.attribute_2 && data.attribute_1 !== data.attribute_3,
    {
      message: "Attributes can only be chosen once",
      path: ["attribute_1"],
    }
  )
  .refine(
    (data) =>
      data.attribute_2 !== data.attribute_1 && data.attribute_2 !== data.attribute_3,
    {
      message: "Attributes can only be chosen once",
      path: ["attribute_2"],
    }
  )
  .refine(
    (data) =>
      data.attribute_3 !== data.attribute_1 && data.attribute_3 !== data.attribute_2,
    {
      message: "Attributes can only be chosen once",
      path: ["attribute_3"],
    }
  );
export type RegistrationSchema = z.infer<typeof registrationSchema>;

export const userSearchSchema = z.object({
  username: usernameSchema,
});
export type UserSearchSchema = z.infer<typeof userSearchSchema>;

export const getSearchValidator = (props: { max: number }) => {
  return z.object({
    username: usernameSchema,
    users: z
      .array(
        z.object({
          userId: z.string(),
          username: usernameSchema,
          avatar: z.string().url().optional().nullish(),
          rank: z.string(),
          level: z.number(),
          federalStatus: z.nativeEnum(FederalStatus),
        })
      )
      .min(1)
      .max(props.max),
  });
};
