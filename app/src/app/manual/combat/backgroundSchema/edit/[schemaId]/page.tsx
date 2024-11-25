"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import ContentBox from "@/layout/ContentBox";
import Loader from "@/layout/Loader";
import { api } from "@/app/_trpc/client";
import { useRequiredUserData } from "@/utils/UserContext";
import { canChangeContent } from "@/utils/permissions";
import { UploadButton } from "@/utils/uploadthing";
import { showMutationToast } from "@/libs/toast";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Form,
  FormField,
  FormItem,
  FormControl,
  FormMessage,
} from "@/components/ui/form";
import { BackgroundSchemaValidator } from "@/validators/backgroundSchema";

export default function EditBackgroundSchemaPage({
  params,
}: {
  params: { schemaId: string };
}) {
  const router = useRouter();
  const schemaId = params.schemaId;
  const { data: userData } = useRequiredUserData();

  // Check permissions
  useEffect(() => {
    if (userData && !canChangeContent(userData.role)) {
      void router.push("/profile");
    }
  }, [userData, router]);

  // Fetch the background schema
  const { data, isPending, refetch } = api.backgroundSchema.get.useQuery(
    { id: schemaId },
    { enabled: !!schemaId && !!userData },
  );

  if (isPending || !userData || !canChangeContent(userData.role)) {
    return <Loader explanation="Loading data..." />;
  }

  return <EditBackgroundSchemaForm schema={data} refetch={refetch} />;
}

interface EditBackgroundSchemaFormProps {
  schema: any; // Replace with the actual type of your background schema
  refetch: () => void;
}

const EditBackgroundSchemaForm: React.FC<EditBackgroundSchemaFormProps> = ({
  schema,
  refetch,
}) => {
  const router = useRouter();
  const utils = api.useUtils();
  const [imageUrls, setImageUrls] = useState<Record<string, string>>(
    schema?.schema || {
      ocean: "",
      ice: "",
      dessert: "",
      ground: "",
      arena: "",
      default: "",
    },
  );

  const form = useForm({
    resolver: zodResolver(BackgroundSchemaValidator),
    defaultValues: {
      id: schema?.id || undefined,
      name: schema?.name || "",
      description: schema?.description || "",
      isActive: schema?.isActive || false,
      schema: imageUrls,
    },
  });

  const { mutate: updateSchema, isLoading: isUpdating } =
    api.backgroundSchema.update.useMutation({
      onSuccess: async () => {
        showMutationToast({
          success: true,
          message: "Schema saved successfully.",
        });
        utils.backgroundSchema.getAll.invalidate();
        router.push("/manual/combat/backgroundSchema");
      },
      onError: (error) => {
        const errorMessage = error.message || "There was an issue saving the schema.";
        showMutationToast({
          success: false,
          message: `Error: ${errorMessage}. Please check the fields.`,
        });
      },
    });

  const handleImageUpload = (key: string, url: string) => {
    setImageUrls((prev) => ({ ...prev, [key]: url }));
    form.setValue(`schema.${key}`, url);
  };

  const onSubmit = form.handleSubmit((values) => {
    updateSchema({ ...values, id: schema.id });
  });

  return (
    <ContentBox
      title="Edit Background Schema"
      subtitle={`Editing schema: ${schema?.name || "New Schema"}`}
      back_href="/manual/combat/backgroundSchema"
    >
      <Form {...form}>
        <form onSubmit={onSubmit}>
          {/* Name field */}
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <Label>Name</Label>
                <FormControl>
                  <Input placeholder="Schema Name" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Description field */}
          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <Label>Description</Label>
                <FormControl>
                  <Input placeholder="Description" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Image Uploads */}
          {["ocean", "ice", "dessert", "ground", "arena", "default"].map((key) => (
            <div key={key} className="mt-4">
              <Label>{capitalizeFirstLetter(key)} Background Image</Label>
              <UploadButton
                endpoint="backgroundImageUploader"
                onClientUploadComplete={(res) => {
                  if (res?.[0]?.url) {
                    handleImageUpload(key, res[0].url);
                  }
                }}
                onUploadError={(error: Error) => {
                  showMutationToast({ success: false, message: error.message });
                }}
              />
              {imageUrls[key] && (
                <div className="mt-2">
                  <img
                    src={imageUrls[key]}
                    alt={`${key} background`}
                    className="max-w-full h-auto"
                  />
                </div>
              )}
            </div>
          ))}

          {/* Submit button */}
          <Button type="submit" className="mt-6" disabled={isUpdating}>
            {isUpdating ? "Saving..." : "Save Schema"}
          </Button>
        </form>
      </Form>
    </ContentBox>
  );
};

// Helper function to capitalize the first letter
function capitalizeFirstLetter(string: string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
}
