"use client";

import ContentBox from "@/layout/ContentBox";
import Loader from "@/layout/Loader";
import AiProfileEdit from "@/layout/AiProfileEdit";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { EditContent } from "@/layout/EditContent";
import { api } from "@/utils/api";
import { useRequiredUserData } from "@/utils/UserContext";
import { setNullsToEmptyStrings } from "@/utils/typeutils";
import { canChangeContent } from "@/utils/permissions";
import { insertUserDataSchema } from "@/drizzle/schema";
import { useAiEditForm } from "@/libs/ais";
import type { AiWithRelations } from "@/routers/profile";

export default function ManualAisEdit({ params }: { params: { aiid: string } }) {
  const aiId = params.aiid;
  const router = useRouter();
  const { data: userData } = useRequiredUserData();

  // Queries
  const { data, isPending, refetch } = api.profile.getAi.useQuery(
    { userId: aiId },
    { staleTime: Infinity, enabled: aiId !== undefined },
  );

  // Convert key null values to empty strings, preparing data for form
  setNullsToEmptyStrings(data);

  // Redirect to profile if not content or admin
  useEffect(() => {
    if (userData && !canChangeContent(userData.role)) {
      router.push("/profile");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userData]);

  // Prevent unauthorized access
  if (isPending || !userData || !canChangeContent(userData.role) || !data) {
    return <Loader explanation="Loading data" />;
  }

  return <SingleEditUser user={data} refetch={refetch} />;
}

interface SingleEditUserProps {
  user: AiWithRelations;
  refetch: () => void;
}

const SingleEditUser: React.FC<SingleEditUserProps> = (props) => {
  // Form handling
  const { loading, processedUser, form, formData, handleUserSubmit } = useAiEditForm(
    props.user,
    props.refetch,
  );

  // Show panel controls
  return (
    <>
      <ContentBox
        title="Content Panel"
        subtitle="Note: stats scaled by level!"
        back_href="/manual/ai"
      >
        {!processedUser && <p>Could not find this AI</p>}
        {!loading && processedUser && (
          <EditContent
            schema={insertUserDataSchema}
            form={form}
            formData={formData}
            showSubmit={form.formState.isDirty}
            buttonTxt="Save to Database"
            type="ai"
            allowImageUpload={true}
            onAccept={handleUserSubmit}
          />
        )}
      </ContentBox>

      <AiProfileEdit userData={props.user} />
    </>
  );
};
