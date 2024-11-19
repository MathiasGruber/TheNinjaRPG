import { calculateContentDiff } from "@/utils/diff";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { BadgeValidator } from "@/validators/badge";
import { api } from "@/app/_trpc/client";
import { showMutationToast, showFormErrorsToast } from "@/libs/toast";
import type { Badge } from "@/drizzle/schema";
import type { FormEntry } from "@/layout/EditContent";
import type { ZodBadgeType } from "@/validators/badge";

/**
 * Hook used when creating frontend forms for editing badges
 * @param data
 */
export const useBadgeEditForm = (badge: Badge, refetch: () => void) => {
  // Form handling
  const form = useForm<ZodBadgeType>({
    mode: "all",
    criteriaMode: "all",
    values: badge,
    defaultValues: badge,
    resolver: zodResolver(BadgeValidator),
  });

  // Mutation for updating badges
  const { mutate: updateBadge } = api.badge.update.useMutation({
    onSuccess: (data) => {
      showMutationToast(data);
      refetch();
    },
  });

  // Form submission
  const handleBadgeSubmit = form.handleSubmit(
    (data: ZodBadgeType) => {
      const newBadge = { ...badge, ...data };
      const diff = calculateContentDiff(badge, newBadge);
      if (diff.length > 0) {
        updateBadge({ id: badge.id, data: newBadge });
      }
    },
    (errors) => showFormErrorsToast(errors),
  );

  // Watch for changes to avatar
  const imageUrl = form.watch("image");

  // Object for form values
  const formData: FormEntry<keyof ZodBadgeType>[] = [
    { id: "name", label: "Badge Name", type: "text" },
    { id: "image", type: "avatar", href: imageUrl },
    { id: "description", type: "text" },
  ];

  return { badge, form, formData, handleBadgeSubmit };
};
