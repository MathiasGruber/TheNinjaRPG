import { calculateContentDiff } from "@/utils/diff";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { gameAssetValidator } from "@/validators/asset";
import { api } from "@/app/_trpc/client";
import { showMutationToast, showFormErrorsToast } from "@/libs/toast";
import { GameAssetTypes } from "@/drizzle/constants";
import type { GameAsset } from "@/drizzle/schema";
import type { FormEntry } from "@/layout/EditContent";
import type { ZodGameAssetType } from "@/validators/asset";

/**
 * Hook used when creating frontend forms for editing assets
 * @param data
 */
export const useAssetEditForm = (asset: GameAsset, refetch: () => void) => {
  // Form handling
  const form = useForm<ZodGameAssetType>({
    mode: "all",
    criteriaMode: "all",
    values: asset,
    defaultValues: asset,
    resolver: zodResolver(gameAssetValidator),
  });

  // Mutation for updating asset
  const { mutate: updateAsset } = api.gameAsset.update.useMutation({
    onSuccess: (data) => {
      showMutationToast(data);
      refetch();
    },
  });

  // Form submission
  const handleAssetSubmit = form.handleSubmit(
    (data: ZodGameAssetType) => {
      const newAsset = { ...asset, ...data };
      const diff = calculateContentDiff(asset, newAsset);
      if (diff.length > 0) {
        updateAsset({ id: asset.id, data: newAsset });
      }
    },
    (errors) => showFormErrorsToast(errors),
  );

  // Watch for changes to avatar
  const imageUrl = useWatch({
    control: form.control,
    name: "image",
  });

  // Object for form values
  const formData: FormEntry<keyof ZodGameAssetType>[] = [
    { id: "name", label: "Asset Name", type: "text" },
    { id: "image", type: "avatar", href: imageUrl },
    { id: "frames", type: "number", label: "Number of Frames" },
    { id: "speed", type: "number", label: "Speed of Animation" },
    { id: "licenseDetails", type: "text", label: "License Details" },
    { id: "type", type: "str_array", values: GameAssetTypes },
    { id: "onInitialBattleField", type: "boolean" },
    { id: "hidden", type: "boolean" },
  ];

  return { asset, form, formData, handleAssetSubmit };
};
