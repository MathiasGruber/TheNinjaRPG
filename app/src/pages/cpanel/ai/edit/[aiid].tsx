import ContentBox from "@/layout/ContentBox";
import Loader from "@/layout/Loader";
import { useEffect } from "react";
import { useSafePush } from "@/utils/routing";
import { EditContent } from "@/layout/EditContent";
import { api } from "@/utils/api";
import { useRequiredUserData } from "@/utils/UserContext";
import { setNullsToEmptyStrings } from "@/utils/typeutils";
import { canChangeContent } from "@/utils/permissions";
import { insertUserDataSchema } from "@/drizzle/schema";
import { useAiEditForm } from "@/libs/ais";
import type { UserData } from "@/drizzle/schema";
import type { UserJutsu } from "@/drizzle/schema";
import type { NextPage } from "next";

const AIPanel: NextPage = () => {
  const router = useSafePush();
  const aiId = router.query.aiid as string;
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
      void router.push("/profile");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userData]);

  // Prevent unauthorized access
  if (isPending || !userData || !canChangeContent(userData.role) || !data) {
    return <Loader explanation="Loading data" />;
  }

  return <SingleEditUser user={data} refetch={refetch} />;
};

export default AIPanel;

interface SingleEditUserProps {
  user: UserData & { jutsus: UserJutsu[] };
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
    </>
  );
};
