import HumanDiff from "human-object-diff";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { api } from "@/utils/api";
import { ElementNames, UserRanks } from "@/drizzle/constants";
import { show_toast, show_errors } from "@/libs/toast";
import { insertUserDataSchema } from "@/drizzle/schema";
import type { InsertUserDataSchema } from "@/drizzle/schema";
import type { UserData } from "@/drizzle/schema";
import type { UserJutsu } from "@/drizzle/schema";
import type { FormEntry } from "@/layout/EditContent";

/**
 * Hook used when creating frontend forms for editing AIs
 * @param data
 */
export const useAiEditForm = (
  user: UserData & { jutsus: UserJutsu[] },
  refetch: () => void,
) => {
  // Process data for form
  const processedUser = {
    ...user,
    jutsus: user?.jutsus?.map((jutsu) => jutsu.jutsuId),
  };

  // Form handling
  const form = useForm<InsertUserDataSchema>({
    mode: "all",
    criteriaMode: "all",
    values: processedUser,
    defaultValues: processedUser,
    resolver: zodResolver(insertUserDataSchema),
  });

  // Query for jutsus
  const { data: jutsus, isLoading: l1 } = api.jutsu.getAllNames.useQuery(undefined, {
    staleTime: Infinity,
  });

  // Mutation for updating item
  const { mutate: updateAi, isLoading: l2 } = api.profile.updateAi.useMutation({
    onSuccess: (data) => {
      refetch();
      show_toast("Updated AI", data.message, "info");
    },
    onError: (error) => {
      show_toast("Error updating", error.message, "error");
    },
  });

  // Form submission
  const handleUserSubmit = form.handleSubmit(
    (data) => {
      const diff = new HumanDiff({}).diff(user, data);
      if (diff.length > 0) {
        updateAi({ id: user.userId, data: data });
      }
    },
    (errors) => show_errors(errors),
  );

  // Watch for changes to avatar
  const avatarUrl = form.watch("avatar");

  // Are we loading data
  const loading = l1 || l2;

  // Object for form values
  const formData: FormEntry<keyof InsertUserDataSchema | "jutsus">[] = [
    { id: "username", type: "text" },
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
    { id: "isSummon", type: "number" },
    { id: "primaryElement", type: "str_array", values: ElementNames },
    { id: "secondaryElement", type: "str_array", values: ElementNames },
    {
      id: "jutsus",
      label: "Jutsus",
      type: "db_values",
      values: jutsus,
      multiple: true,
      doubleWidth: true,
    },
  ];

  return { processedUser, loading, form, formData, handleUserSubmit };
};
