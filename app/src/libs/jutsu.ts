import HumanDiff from "human-object-diff";
import { useForm } from "react-hook-form";
import { api } from "@/utils/api";
import { zodResolver } from "@hookform/resolvers/zod";
import { JutsuValidator } from "@/libs/combat/types";
import { AttackTargets } from "@/drizzle/constants";
import { AttackMethods } from "@/drizzle/constants";
import { LetterRanks } from "@/drizzle/constants";
import { WeaponTypes } from "@/drizzle/constants";
import { JutsuTypes } from "@/drizzle/constants";
import { UserRanks } from "@/drizzle/constants";
import { show_toast, show_errors } from "@/libs/toast";
import type { ZodAllTags } from "@/libs/combat/types";
import type { ZodJutsuType } from "@/libs/combat/types";
import type { FormEntry } from "@/layout/EditContent";
import type { Jutsu } from "@/drizzle/schema";

/**
 * Hook used when creating frontend forms for editing jutsus
 * @param data
 */
export const useJutsuEditForm = (data: Jutsu, refetch: () => void) => {
  // Case type
  const jutsu = { ...data, effects: data.effects };

  // Form handling
  const form = useForm<ZodJutsuType>({
    mode: "all",
    criteriaMode: "all",
    values: jutsu,
    defaultValues: jutsu,
    resolver: zodResolver(JutsuValidator),
  });

  // Query for bloodlines and villages
  const { data: bloodlines, isLoading: l1 } = api.bloodline.getAllNames.useQuery(
    undefined,
    { staleTime: Infinity },
  );
  const { data: villages, isLoading: l2 } = api.village.getAll.useQuery(undefined, {
    staleTime: Infinity,
  });

  // Mutation for updating jutsu
  const { mutate: updateJutsu, isLoading: l3 } = api.jutsu.update.useMutation({
    onSuccess: (data) => {
      refetch();
      show_toast("Updated Jutsu", data.message, "info");
    },
    onError: (error) => {
      show_toast("Error updating", error.message, "error");
    },
  });

  // Form submission
  const handleJutsuSubmit = form.handleSubmit(
    (data: ZodJutsuType) => {
      const newJutsu = { ...jutsu, ...data };
      const diff = new HumanDiff({}).diff(jutsu, newJutsu);
      if (diff.length > 0) {
        updateJutsu({ id: jutsu.id, data: newJutsu });
      }
    },
    (errors) => show_errors(errors),
  );

  // Watch the effects
  const effects = form.watch("effects");

  // Handle updating of effects
  const setEffects = (newEffects: ZodAllTags[]) => {
    form.setValue("effects", newEffects, { shouldDirty: true });
  };

  // Are we loading data
  const loading = l1 || l2 || l3;

  // Watch for changes to avatar
  const imageUrl = form.watch("image");

  // Object for form values
  const formData: FormEntry<keyof ZodJutsuType>[] = [
    { id: "image", type: "avatar", href: imageUrl },
    { id: "name", type: "text" },
    { id: "actionCostPerc", label: "AP Cost [%]", type: "number" },
    { id: "staminaCostPerc", label: "SP Cost [%]", type: "number" },
    { id: "chakraCostPerc", label: "CP Cost [%]", type: "number" },
    { id: "healthCostPerc", label: "HP Cost [%]", type: "number" },
    { id: "description", type: "text", doubleWidth: true },
    { id: "battleDescription", type: "text", doubleWidth: true },
    { id: "range", type: "number" },
    { id: "cooldown", type: "number" },
    { id: "hidden", type: "number" },
    { id: "jutsuType", type: "str_array", values: JutsuTypes },
    { id: "bloodlineId", type: "db_values", values: bloodlines, resetButton: true },
    { id: "villageId", type: "db_values", values: villages, resetButton: true },
    { id: "jutsuWeapon", type: "str_array", values: WeaponTypes },
    { id: "method", type: "str_array", values: AttackMethods },
    { id: "jutsuRank", type: "str_array", values: LetterRanks },
    { id: "requiredRank", type: "str_array", values: UserRanks },
    { id: "target", type: "str_array", values: AttackTargets },
  ];

  return { jutsu, effects, form, formData, loading, setEffects, handleJutsuSubmit };
};
