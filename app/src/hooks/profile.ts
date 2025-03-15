import { calculateContentDiff } from "@/utils/diff";
import type { UseFormReturn, FieldErrors } from "react-hook-form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { api } from "@/app/_trpc/client";
import { UserRoles, UserRanks } from "@/drizzle/constants";
import { showMutationToast, showFormErrorsToast } from "@/libs/toast";
import { updateUserSchema } from "@/validators/user";
import type { UpdateUserSchema } from "@/validators/user";
import type { FormEntry } from "@/layout/EditContent";
import type { Jutsu, UserJutsu } from "@/drizzle/schema";
import type { BaseSyntheticEvent } from "react";

// Define response type inline since it's specific to this context
type ApiResponse = {
  success: boolean;
  message: string;
};

/**
 * Hook used when creating frontend forms for editing users
 * @param userId - The ID of the user being edited
 * @param user - The user data to edit
 */
export const useUserEditForm = (userId: string, user: UpdateUserSchema): {
  user: UpdateUserSchema;
  loading: boolean;
  form: UseFormReturn<UpdateUserSchema>;
  formData: FormEntry<keyof UpdateUserSchema>[];
  userJutsus: UserJutsu[] | undefined;
  handleUserSubmit: (e?: BaseSyntheticEvent) => Promise<void>;
} => {
  // Form handling
  const form = useForm<UpdateUserSchema>({
    mode: "all",
    criteriaMode: "all",
    values: user,
    defaultValues: user,
    resolver: zodResolver(updateUserSchema),
    shouldUnregister: false,
  });

  // Query for bloodlines and villages
  const { data: jutsus, isPending: l1 } = api.jutsu.getAllNames.useQuery(undefined);
  const { data: items, isPending: l2 } = api.item.getAllNames.useQuery(undefined);
  const { data: lines, isPending: l3 } = api.bloodline.getAllNames.useQuery(undefined);
  const { data: villages, isPending: l5 } = api.village.getAllNames.useQuery(undefined);
  const { data: userJutsus, isPending: l6 } = api.jutsu.getPublicUserJutsus.useQuery({
    userId: userId,
  });

  // tRPC utility
  const utils = api.useUtils();

  // Update jutsus with level
  const jutsusWithNames = jutsus?.map((jutsu: { id: string; name: string }) => {
    const userjutsu = userJutsus?.find((uj: UserJutsu) => uj.jutsuId === jutsu.id);
    return userjutsu ? { ...jutsu, name: `${jutsu.name} (${userjutsu.level})` } : jutsu;
  });

  // Mutation for updating item
  const { mutate: updateUser, isPending: l4 } = api.profile.updateUser.useMutation({
    onSuccess: (data: ApiResponse) => {
      showMutationToast(data);
      void utils.profile.getPublicUser.invalidate();
      void utils.jutsu.getPublicUserJutsus.invalidate();
    },
  });

  // Form submission
  const handleUserSubmit = form.handleSubmit(
    (data: UpdateUserSchema) => {
      const diff = calculateContentDiff(user, data);
      if (diff.length > 0) {
        updateUser({ id: userId, data: data });
      }
    },
    (errors: FieldErrors<UpdateUserSchema>) => showFormErrorsToast(errors),
  );

  // Are we loading data
  const loading = l1 || l2 || l3 || l4 || l5 || l6;

  // Object for form values
  const formData: FormEntry<keyof UpdateUserSchema>[] = [
    { id: "username", type: "text", onChange: (value: string) => form.setValue("username", value, { shouldDirty: true }) },
    { id: "customTitle", type: "text", onChange: (value: string) => form.setValue("customTitle", value, { shouldDirty: true }) },
    { id: "role", type: "str_array", values: UserRoles, onChange: (value: string) => form.setValue("role", value, { shouldDirty: true }) },
    { id: "rank", type: "str_array", values: UserRanks, onChange: (value: string) => form.setValue("rank", value, { shouldDirty: true }) },
    { id: "bloodlineId", type: "db_values", values: lines, resetButton: true, onChange: (value: string | null) => form.setValue("bloodlineId", value, { shouldDirty: true }) },
    { id: "villageId", type: "db_values", values: villages, resetButton: true, onChange: (value: string | null) => form.setValue("villageId", value, { shouldDirty: true }) },
    {
      id: "jutsus",
      type: "db_values",
      values: jutsusWithNames,
      multiple: true,
      doubleWidth: true,
      onChange: (value: string[]) => form.setValue("jutsus", value, { shouldDirty: true }),
    },
    {
      id: "items",
      type: "db_values",
      values: items,
      multiple: true,
      doubleWidth: true,
      onChange: (value: string[]) => form.setValue("items", value, { shouldDirty: true }),
    },
  ];

  return { user, loading, form, formData, userJutsus, handleUserSubmit };
};
