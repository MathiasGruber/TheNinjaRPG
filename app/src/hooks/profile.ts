import HumanDiff from "human-object-diff";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { api } from "@/utils/api";
import { UserRoles, UserRanks } from "@/drizzle/constants";
import { showMutationToast, showFormErrorsToast } from "@/libs/toast";
import { updateUserSchema } from "@/validators/user";
import type { UpdateUserSchema } from "@/validators/user";
import type { FormEntry } from "@/layout/EditContent";

/**
 * Hook used when creating frontend forms for editing AIs
 * @param data
 */
export const useUserEditForm = (
  userId: string,
  user: UpdateUserSchema,
  refetch: () => void,
) => {
  // Form handling
  const form = useForm<UpdateUserSchema>({
    mode: "all",
    criteriaMode: "all",
    values: user,
    defaultValues: user,
    resolver: zodResolver(updateUserSchema),
  });

  // Query for bloodlines and villages
  const { data: jutsus, isPending: l1 } = api.jutsu.getAllNames.useQuery(undefined, {
    staleTime: Infinity,
  });
  const { data: items, isPending: l2 } = api.item.getAllNames.useQuery(undefined, {
    staleTime: Infinity,
  });
  const { data: lines, isPending: l3 } = api.bloodline.getAllNames.useQuery(undefined, {
    staleTime: Infinity,
  });

  // Mutation for updating item
  const { mutate: updateUser, isPending: l4 } = api.profile.updateUser.useMutation({
    onSuccess: (data) => {
      showMutationToast(data);
      refetch();
    },
  });

  // Form submission
  const handleUserSubmit = form.handleSubmit(
    (data) => {
      const diff = new HumanDiff({}).diff(user, data);
      if (diff.length > 0) {
        updateUser({ id: userId, data: data });
      }
    },
    (errors) => showFormErrorsToast(errors),
  );

  // Are we loading data
  const loading = l1 || l2 || l3 || l4;

  // Object for form values
  const formData: FormEntry<keyof UpdateUserSchema>[] = [
    { id: "username", type: "text" },
    { id: "customTitle", type: "text" },
    { id: "role", type: "str_array", values: UserRoles },
    { id: "rank", type: "str_array", values: UserRanks },
    { id: "bloodlineId", type: "db_values", values: lines, resetButton: true },
    {
      id: "jutsus",
      type: "db_values",
      values: jutsus,
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

  return { user, loading, form, formData, handleUserSubmit };
};
