import { useEffect } from "react";
import { useRouter } from "next/router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import ContentBox from "../../../layout/ContentBox";
import Loader from "../../../layout/Loader";
import { EditContent } from "../../../layout/EditContent";
import { api } from "../../../utils/api";
import { useRequiredUserData } from "../../../utils/UserContext";
import { UserRanks } from "../../../../drizzle/constants";
import { setNullsToEmptyStrings } from "../../../../src/utils/typeutils";
import { show_toast } from "../../../libs/toast";
import { canChangeContent } from "../../../utils/permissions";
import { insertUserDataSchema } from "../../../../drizzle/schema";
import type { z } from "zod";
import type { FormEntry } from "../../../layout/EditContent";
import type { NextPage } from "next";

const AIPanel: NextPage = () => {
  const router = useRouter();
  const aiId = router.query.aiid as string;
  const { data: userData } = useRequiredUserData();

  // Queries
  const { data, isLoading, refetch } = api.profile.getAi.useQuery(
    { userId: aiId },
    { staleTime: Infinity, enabled: aiId !== undefined }
  );

  // Type for inserting data
  type InsertUserDataSchema = z.infer<typeof insertUserDataSchema>;

  // Convert key null values to empty strings, preparing data for form
  setNullsToEmptyStrings(data);

  const { mutate: updateAi } = api.profile.updateAi.useMutation({
    onSuccess: async (data) => {
      await refetch();
      show_toast("Updated AI", data.message, "info");
    },
    onError: (error) => {
      show_toast("Error updating", error.message, "error");
    },
  });

  // Redirect to profile if not content or admin
  useEffect(() => {
    if (userData && !canChangeContent(userData.role)) {
      void router.push("/profile");
    }
  }, [userData, router, data]);

  // Form handling
  const {
    register,
    setValue,
    handleSubmit,
    watch,
    formState: { errors, isDirty },
  } = useForm<InsertUserDataSchema>({
    values: data,
    defaultValues: data,
    resolver: zodResolver(insertUserDataSchema),
  });

  // Form submission
  const handleAiSubmit = handleSubmit(
    (data) => updateAi({ id: aiId, data: data }),
    (errors) => console.error(errors)
  );

  // Prevent unauthorized access
  if (isLoading || !userData || !canChangeContent(userData.role)) {
    return <Loader explanation="Loading data" />;
  }

  // Watch for changes to avatar
  const avatarUrl = watch("avatar");

  // Object for form values
  const formData: FormEntry<keyof InsertUserDataSchema>[] = [
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
  ];

  // Show panel controls
  return (
    <>
      <ContentBox
        title="Content Panel"
        subtitle="Note: stats scaled by level!"
        back_href="/manual/ai"
      >
        {!data && <p>Could not find this AI</p>}
        {data && (
          <EditContent
            schema={insertUserDataSchema}
            showSubmit={isDirty}
            buttonTxt="Save to Database"
            setValue={setValue}
            register={register}
            errors={errors}
            formData={formData}
            onAccept={handleAiSubmit}
          />
        )}
      </ContentBox>
    </>
  );
};

export default AIPanel;
