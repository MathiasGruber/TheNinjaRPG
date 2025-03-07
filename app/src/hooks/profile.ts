import { calculateContentDiff } from "@/utils/diff";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { api } from "@/app/_trpc/client";
import { UserRoles, UserRanks } from "@/drizzle/constants";
import { showMutationToast, showFormErrorsToast } from "@/libs/toast";
import { updateUserSchema } from "@/validators/user";
import type { UpdateUserSchema } from "@/validators/user";
import type { FormEntry } from "@/layout/EditContent";

/**
 * Hook used when creating frontend forms for editing AIs
 * @param data
 */
export const useUserEditForm = (userId: string, user: UpdateUserSchema) => {
  // Form handling
  const form = useForm<UpdateUserSchema>({
    mode: "all",
    criteriaMode: "all",
    values: user,
    defaultValues: user,
    resolver: zodResolver(updateUserSchema),
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
  const jutsusWithNames = jutsus?.map((jutsu) => {
    const userjutsu = userJutsus?.find((uj) => uj.jutsuId === jutsu.id);
    return userjutsu ? { ...jutsu, name: `${jutsu.name} (${userjutsu.level})` } : jutsu;
  });

  // Mutation for updating item
  const { mutate: updateUser, isPending: l4 } = api.profile.updateUser.useMutation({
    onSuccess: (data) => {
      showMutationToast(data);
      void utils.profile.getPublicUser.invalidate();
      void utils.jutsu.getPublicUserJutsus.invalidate();
    },
  });

  // Form submission
  const handleUserSubmit = form.handleSubmit(
    (data) => {
      const diff = calculateContentDiff(user, data);
      if (diff.length > 0) {
        updateUser({ id: userId, data: data });
      }
    },
    (errors) => showFormErrorsToast(errors),
  );

  // Are we loading data
  const loading = l1 || l2 || l3 || l4 || l5 || l6;

  // Object for form values
  const formData: FormEntry<keyof UpdateUserSchema>[] = [
    { id: "username", type: "text" },
    { id: "customTitle", type: "text" },
    { id: "role", type: "str_array", values: UserRoles },
    { id: "rank", type: "str_array", values: UserRanks },
    { id: "bloodlineId", type: "db_values", values: lines, resetButton: true },
    { id: "villageId", type: "db_values", values: villages, resetButton: true },
    {
      id: "jutsus",
      type: "db_values",
      values: jutsusWithNames,
      multiple: true,
      doubleWidth: true,
    },
    {
      id: "items",
      type: "db_values",
      values: items,
      multiple: true,
      doubleWidth: true,
    },
  ];

  return { user, loading, form, formData, userJutsus, handleUserSubmit };
};
