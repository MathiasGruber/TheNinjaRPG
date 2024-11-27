import { useForm } from "react-hook-form";
import { calculateContentDiff } from "@/utils/diff";
import { api } from "@/app/_trpc/client";
import { zodResolver } from "@hookform/resolvers/zod";
import { BackgroundSchemaValidator } from "@/validators/backgroundSchema";
import { showMutationToast, showFormErrorsToast } from "@/libs/toast";
import type { ZodBackgroundSchemaType } from "@/validators/backgroundSchema";
import type { BackgroundSchema } from "@/drizzle/schema";
import type { FormEntry } from "@/layout/EditContent";

/**
 * Hook used when creating frontend forms for editing background schemas
 * @param data
 * @param refetch
 */
export const useBackgroundSchemaEditForm = (
  data: BackgroundSchema,
  refetch: () => void,
) => {
  // Initialize the form
  const form = useForm<ZodBackgroundSchemaType>({
    mode: "all",
    criteriaMode: "all",
    values: data as ZodBackgroundSchemaType,
    defaultValues: data as ZodBackgroundSchemaType,
    resolver: zodResolver(BackgroundSchemaValidator),
  });

  // Mutation for updating background schema
  const { mutate: updateBackgroundSchema, isPending } =
    api.backgroundSchema.update.useMutation({
      onSuccess: (data) => {
        showMutationToast(data);
        refetch();
      },
    });

  // Form submission
  const handleBackgroundSchemaSubmit = form.handleSubmit(
    (formData: ZodBackgroundSchemaType) => {
      const newSchema = { ...data, ...formData };
      const diff = calculateContentDiff(data, newSchema);
      if (diff.length > 0) {
        updateBackgroundSchema({ id: data.id, data: newSchema });
      }
    },
    (errors) => showFormErrorsToast(errors),
  );

  // Watch for changes to image URLs
  const imageUrls = form.watch("schema");

  // Object for form values
  const formData: FormEntry<keyof ZodBackgroundSchemaType>[] = [
    { id: "name", type: "text" },
    { id: "description", type: "text", doubleWidth: true },
    { id: "isActive", type: "boolean" },
    // You can add more fields as needed
  ];

  // Return the necessary values and functions
  return {
    form,
    formData,
    imageUrls,
    handleBackgroundSchemaSubmit,
    isPending,
  };
};
