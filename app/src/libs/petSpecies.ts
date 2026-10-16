import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { api } from "@/app/_trpc/client";
import { PetRarities } from "@/drizzle/constants";
import type { PetSpecies } from "@/drizzle/schema";
import type { FormEntry } from "@/layout/EditContent";
import { showFormErrorsToast, showMutationToast } from "@/libs/toast";
import { PetSpeciesValidator, type ZodPetSpeciesType } from "@/validators/petSpecies";

const emptySpecies: ZodPetSpeciesType = {
  name: "",
  description: "",
  rarity: "COMMON",
  isActive: false,
};

/** Share the Manual create/edit form while keeping rejected saves recoverable. */
export const usePetSpeciesEditForm = (
  species: PetSpecies | undefined,
  onSaved: () => void | Promise<void>,
) => {
  const utils = api.useUtils();
  const [message, setMessage] = useState<string | null>(null);
  const form = useForm<ZodPetSpeciesType>({
    mode: "all",
    criteriaMode: "all",
    values: species ?? emptySpecies,
    defaultValues: species ?? emptySpecies,
    resetOptions: { keepDirtyValues: true },
    resolver: zodResolver(PetSpeciesValidator),
  });
  const isActive = useWatch({ control: form.control, name: "isActive" });
  const mutationOptions = {
    onSuccess: async (result: { success: boolean; message: string }) => {
      showMutationToast({
        ...result,
        message:
          result.success && !species ? "Companion species created." : result.message,
      });
      if (!result.success) {
        setMessage(result.message);
        return;
      }
      form.reset(form.getValues());
      await Promise.all([
        utils.petSpecies.getAll.invalidate(),
        ...(species ? [utils.petSpecies.get.invalidate({ id: species.id })] : []),
      ]);
      await onSaved();
    },
    onError: (error: { message: string }) => setMessage(error.message),
  };
  const create = api.petSpecies.create.useMutation(mutationOptions);
  const update = api.petSpecies.update.useMutation(mutationOptions);
  const handleSubmit = form.handleSubmit((data) => {
    setMessage(null);
    if (species) update.mutate({ id: species.id, data });
    else create.mutate(data);
  }, showFormErrorsToast);
  const formData: FormEntry<keyof ZodPetSpeciesType>[] = [
    { id: "name", label: "Species name", type: "text" },
    { id: "rarity", label: "Rarity", type: "str_array", values: PetRarities },
    {
      id: "description",
      label: "Visual description",
      type: "textarea",
      rows: 4,
      fullWidth: true,
    },
    {
      id: "isActive",
      label: "Available for daily offers",
      type: "boolean",
      fullWidth: true,
    },
  ];
  return {
    form,
    formData,
    handleSubmit,
    isActive,
    isSaving: create.isPending || update.isPending,
    message,
  };
};
