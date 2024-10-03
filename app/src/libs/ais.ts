import { calculateContentDiff } from "@/utils/diff";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { api } from "@/utils/api";
import { ElementNames, UserRanks } from "@/drizzle/constants";
import { showMutationToast, showFormErrorsToast } from "@/libs/toast";
import { insertUserDataSchema } from "@/drizzle/schema";
import type { InsertUserDataSchema } from "@/drizzle/schema";
import type { UserData } from "@/drizzle/schema";
import type { UserJutsu } from "@/drizzle/schema";
import type { UserItem } from "@/drizzle/schema";
import type { FormEntry } from "@/layout/EditContent";

/**
 * Hook used when creating frontend forms for editing AIs
 * @param data
 */
export const useAiEditForm = (
  user: UserData & { jutsus: UserJutsu[]; items: UserItem[] },
  refetch: () => void,
) => {
  // Process data for form
  const processedUser = {
    ...user,
    jutsus: user?.jutsus?.map((jutsu) => jutsu.jutsuId),
    items: user?.items?.map((item) => item.itemId),
  };

  // Form handling
  const form = useForm<InsertUserDataSchema>({
    mode: "all",
    criteriaMode: "all",
    values: processedUser,
    defaultValues: processedUser,
    resolver: zodResolver(insertUserDataSchema),
  });

  // Query for content
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
  const { mutate: updateAi, isPending: l4 } = api.profile.updateAi.useMutation({
    onSuccess: (data) => {
      showMutationToast(data);
      refetch();
    },
  });

  // Form submission
  const handleUserSubmit = form.handleSubmit(
    (data) => {
      const diff = calculateContentDiff(user, data);
      if (diff.length > 0) {
        updateAi({ id: user.userId, data: data });
      }
    },
    (errors) => showFormErrorsToast(errors),
  );

  // Watch for changes to avatar
  const avatarUrl = form.watch("avatar");

  // Are we loading data
  const loading = l1 || l2 || l3 || l4;

  // Object for form values
  const formData: FormEntry<keyof InsertUserDataSchema | "jutsus" | "items">[] = [
    { id: "username", type: "text" },
    { id: "customTitle", type: "text" },
    { id: "avatar", type: "avatar", href: avatarUrl },
    { id: "gender", type: "text" },
    { id: "level", type: "number" },
    { id: "regeneration", type: "number" },
    { id: "rank", type: "str_array", values: UserRanks },
    { id: "ninjutsuOffence", label: "Nin Off Focus", type: "number" },
    { id: "ninjutsuDefence", label: "Nin Def Focus", type: "number" },
    { id: "genjutsuOffence", label: "Gen Off Focus", type: "number" },
    { id: "genjutsuDefence", label: "Gen Def Focus", type: "number" },
    { id: "taijutsuOffence", label: "Tai Off Focus", type: "number" },
    { id: "taijutsuDefence", label: "Tai Def Focus", type: "number" },
    { id: "bukijutsuOffence", label: "Buku Off Focus", type: "number" },
    { id: "bukijutsuDefence", label: "Buki Def Focus", type: "number" },
    { id: "strength", label: "Strength Focus", type: "number" },
    { id: "intelligence", label: "Intelligence Focus", type: "number" },
    { id: "willpower", label: "Willpower Focus", type: "number" },
    { id: "speed", label: "Speed Focus", type: "number" },
    { id: "isSummon", type: "boolean" },
    { id: "inArena", type: "boolean" },
    {
      id: "primaryElement",
      type: "str_array",
      values: ElementNames,
      resetButton: true,
    },
    {
      id: "secondaryElement",
      type: "str_array",
      values: ElementNames,
      resetButton: true,
    },
    {
      id: "bloodlineId",
      type: "db_values",
      values: lines,
      resetButton: true,
    },
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

  return { processedUser, loading, form, formData, handleUserSubmit };
};
