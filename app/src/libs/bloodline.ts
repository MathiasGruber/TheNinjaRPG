import HumanDiff from "human-object-diff";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { BloodlineValidator } from "@/libs/combat/types";
import { api } from "@/utils/api";
import { showMutationToast, showFormErrorsToast } from "@/libs/toast";
import { LetterRanks } from "@/drizzle/constants";
import type { Bloodline } from "@/drizzle/schema";
import type { ZodBloodlineTags, ZodAllTags } from "@/libs/combat/types";
import type { FormEntry } from "@/layout/EditContent";
import type { ZodBloodlineType } from "@/libs/combat/types";

export const ROLL_CHANCE = {
  ["H"]: 0.001,
  ["S"]: 0.005,
  ["A"]: 0.01,
  ["B"]: 0.02,
  ["C"]: 0.04,
  ["D"]: 0.08,
} as const;

// export const BLOODLINE_COST = {
//   ["S"]: 400,
//   ["A"]: 200,
//   ["B"]: 100,
//   ["C"]: 50,
//   ["D"]: 25,
// } as const;

// Alpha Pricing
export const BLOODLINE_COST = {
  ["H"]: 999999,
  ["S"]: 999999,
  ["A"]: 200,
  ["B"]: 190,
  ["C"]: 180,
  ["D"]: 170,
} as const;

export const REMOVAL_COST = 5;

/**
 * Hook used when creating frontend forms for editing bloodlines
 * @param data
 */
export const useBloodlineEditForm = (data: Bloodline, refetch: () => void) => {
  // Case type
  const bloodline = { ...data, effects: data.effects as ZodBloodlineTags[] };

  // Form handling
  const form = useForm<ZodBloodlineType>({
    mode: "all",
    criteriaMode: "all",
    values: bloodline,
    defaultValues: bloodline,
    resolver: zodResolver(BloodlineValidator),
  });

  // Query for bloodlines and villages
  const { data: villages, isPending: l1 } = api.village.getAll.useQuery(undefined, {
    staleTime: Infinity,
  });

  // Mutation for updating bloodline
  const { mutate: updateBloodline, isPending: l2 } = api.bloodline.update.useMutation({
    onSuccess: (data) => {
      showMutationToast(data);
      refetch();
    },
  });

  // Form submission
  const handleBloodlineSubmit = form.handleSubmit(
    (data: ZodBloodlineType) => {
      const newBloodline = { ...bloodline, ...data };
      const diff = new HumanDiff({}).diff(bloodline, newBloodline);
      if (diff.length > 0) {
        updateBloodline({ id: bloodline.id, data: newBloodline });
      }
    },
    (errors) => showFormErrorsToast(errors),
  );

  // Watch the effects
  const effects = form.watch("effects");

  // Handle updating of effects. This casting should be safe, and is a hack to make it work with MassEdit functionality types
  const setEffects = (newEffects: ZodAllTags[] | ZodBloodlineTags[]) => {
    form.setValue("effects", newEffects as ZodBloodlineTags[], { shouldDirty: true });
  };

  // Are we loading data
  const loading = l1 || l2;

  // Watch for changes to avatar
  const imageUrl = form.watch("image");

  // Object for form values
  const formData: FormEntry<keyof ZodBloodlineType>[] = [
    { id: "name", type: "text" },
    { id: "image", type: "avatar", href: imageUrl },
    { id: "regenIncrease", type: "number" },
    { id: "hidden", type: "number", label: "Hidden" },
    { id: "village", type: "db_values", values: villages, resetButton: true },
    { id: "rank", type: "str_array", values: LetterRanks },
    { id: "description", type: "richinput", doubleWidth: true },
  ];

  return {
    bloodline,
    effects,
    form,
    formData,
    loading,
    setEffects,
    handleBloodlineSubmit,
  };
};
