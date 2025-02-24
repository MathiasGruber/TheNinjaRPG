"use client";

import { calculateContentDiff } from "@/utils/diff";
import { useForm } from "react-hook-form";
import { api } from "@/app/_trpc/client";
import { zodResolver } from "@hookform/resolvers/zod";
import { JutsuValidator } from "@/libs/combat/types";
import { AttackTargets } from "@/drizzle/constants";
import { AttackMethods } from "@/drizzle/constants";
import { LetterRanks } from "@/drizzle/constants";
import { WeaponTypes } from "@/drizzle/constants";
import { JutsuTypes } from "@/drizzle/constants";
import { UserRanks } from "@/drizzle/constants";
import { StatTypes } from "@/drizzle/constants";
import { showMutationToast, showFormErrorsToast } from "@/libs/toast";
import { JUTSU_TRANSFER_FREE_AMOUNT } from "@/drizzle/constants";
import { JUTSU_TRANSFER_FREE_NORMAL } from "@/drizzle/constants";
import { JUTSU_TRANSFER_FREE_SILVER } from "@/drizzle/constants";
import { JUTSU_TRANSFER_FREE_GOLD } from "@/drizzle/constants";
import type { FederalStatus } from "@/drizzle/constants";
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
    values: jutsu as ZodJutsuType,
    defaultValues: jutsu as ZodJutsuType,
    resolver: zodResolver(JutsuValidator),
  });

  // Query for bloodlines and villages
  const { data: bloodlines, isPending: l1 } =
    api.bloodline.getAllNames.useQuery(undefined);
  const { data: villages, isPending: l2 } = api.village.getAllNames.useQuery(undefined);

  // Mutation for updating jutsu
  const { mutate: updateJutsu, isPending: l3 } = api.jutsu.update.useMutation({
    onSuccess: (data) => {
      showMutationToast(data);
      refetch();
    },
  });

  // Form submission
  const handleJutsuSubmit = form.handleSubmit(
    (data: ZodJutsuType) => {
      const newJutsu = { ...jutsu, ...data };
      const diff = calculateContentDiff(jutsu, newJutsu);
      if (diff.length > 0) {
        updateJutsu({ id: jutsu.id, data: newJutsu });
      }
    },
    (errors) => showFormErrorsToast(errors),
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
    { id: "staminaCost", type: "number" },
    { id: "chakraCost", type: "number" },
    { id: "healthCost", type: "number" },
    { id: "chakraCostReducePerLvl", type: "number" },
    { id: "staminaCostReducePerLvl", type: "number" },
    { id: "healthCostReducePerLvl", type: "number" },
    { id: "extraBaseCost", type: "number" },
    { id: "description", type: "text", doubleWidth: true },
    { id: "battleDescription", type: "text", doubleWidth: true },
    { id: "statClassification", type: "str_array", values: StatTypes },
    { id: "range", type: "number" },
    { id: "cooldown", type: "number" },
    { id: "requiredLevel", type: "number" },
    { id: "jutsuType", type: "str_array", values: JutsuTypes },
    { id: "bloodlineId", type: "db_values", values: bloodlines, resetButton: true },
    { id: "villageId", type: "db_values", values: villages, resetButton: true },
    { id: "jutsuWeapon", type: "str_array", values: WeaponTypes },
    { id: "method", type: "str_array", values: AttackMethods },
    { id: "jutsuRank", type: "str_array", values: LetterRanks },
    { id: "requiredRank", type: "str_array", values: UserRanks },
    { id: "target", type: "str_array", values: AttackTargets },
    { id: "hidden", type: "boolean" },
  ];

  return { jutsu, effects, form, formData, loading, setEffects, handleJutsuSubmit };
};

/**
 * Get the number of free jutsu level transfers based on the federal status
 * @param federalStatus
 * @returns
 */
export const getFreeTransfers = (federalStatus: FederalStatus) => {
  switch (federalStatus) {
    case "GOLD":
      return JUTSU_TRANSFER_FREE_GOLD;
    case "SILVER":
      return JUTSU_TRANSFER_FREE_SILVER;
    case "NORMAL":
      return JUTSU_TRANSFER_FREE_NORMAL;
    default:
      return JUTSU_TRANSFER_FREE_AMOUNT;
  }
};
