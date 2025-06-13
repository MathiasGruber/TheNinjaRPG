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
  const type = useWatch({
    control: form.control,
    name: "type",
  });

  // Start with empty array
  const formData: FormEntry<keyof ZodGameAssetType>[] = [];

  // For scene backgrounds
  if (type === "SCENE_BACKGROUND") {
    formData.push({
      id: "image",
      type: "avatar",
      href: imageUrl,
      size: "landscape",
      maxDim: 512,
    });
  } else if (type === "SCENE_CHARACTER") {
    formData.push({
      id: "image",
      type: "avatar",
      href: imageUrl,
      size: "portrait",
      maxDim: 512,
    });
  } else {
    formData.push({ id: "image", type: "avatar", href: imageUrl, size: "square" });
  }

  // Object for form values
  formData.push(
    { id: "name", label: "Asset Name", type: "text" },
    { id: "licenseDetails", type: "text", label: "License Details" },
    { id: "type", type: "str_array", values: GameAssetTypes },
    { id: "hidden", type: "boolean" },
  );

  // For animations
  if (type === "ANIMATION") {
    formData.push({ id: "frames", type: "number", label: "Number of Frames" });
    formData.push({ id: "speed", type: "number", label: "Speed of Animation" });
  }

  // For static
  if (type === "STATIC") {
    formData.push({ id: "onInitialBattleField", type: "boolean" });
  }

  return { asset, form, formData, handleAssetSubmit };
};
