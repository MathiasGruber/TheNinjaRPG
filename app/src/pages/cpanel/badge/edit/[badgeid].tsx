import ContentBox from "@/layout/ContentBox";
import Loader from "@/layout/Loader";
import ChatInputField from "@/layout/ChatInputField";
import { api } from "@/utils/api";
import { useEffect } from "react";
import { useSafePush } from "@/utils/routing";
import { EditContent } from "@/layout/EditContent";
import { useRequiredUserData } from "@/utils/UserContext";
import { canChangeContent } from "@/utils/permissions";
import { useBadgeEditForm } from "@/libs/badge";
import { BadgeValidator } from "@/validators/badge";
import { showMutationToast } from "@/libs/toast";
import type { Badge } from "@/drizzle/schema";
import type { NextPage } from "next";

const BadgePanel: NextPage = () => {
  const router = useSafePush();
  const badgeId = router.query.badgeid as string;
  const { data: userData } = useRequiredUserData();

  // Queries
  const { data, isPending, refetch } = api.badge.get.useQuery(
    { id: badgeId },
    { staleTime: Infinity, enabled: badgeId !== undefined },
  );

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

  return <SingleEditBadge badge={data} refetch={refetch} />;
};

export default BadgePanel;

interface SingleEditBadgeProps {
  badge: Badge;
  refetch: () => void;
}

const SingleEditBadge: React.FC<SingleEditBadgeProps> = (props) => {
  // Form handling
  const { badge, form, formData, handleBadgeSubmit } = useBadgeEditForm(
    props.badge,
    props.refetch,
  );

  // Mutations
  const { mutate: chatIdea, isPending } = api.openai.createBadge.useMutation({
    onSuccess: (data) => {
      showMutationToast({ success: true, message: "AI Updated Badge" });
      let key: keyof typeof data;
      for (key in data) {
        form.setValue(key, data[key]);
      }
    },
  });

  // Show panel controls
  return (
    <ContentBox
      title="Content Panel"
      subtitle="Badge Management"
      back_href="/manual/badges"
      noRightAlign={true}
      topRightContent={
        formData.find((e) => e.id === "description") ? (
          <ChatInputField
            inputProps={{
              id: "chatInput",
              placeholder: "Instruct ChatGPT to edit",
              disabled: isPending,
            }}
            onChat={(text) => {
              chatIdea({ badgeId: badge.id, prompt: text });
            }}
          />
        ) : undefined
      }
    >
      {!badge && <p>Could not find this badge</p>}
      {badge && (
        <EditContent
          schema={BadgeValidator}
          form={form}
          formData={formData}
          showSubmit={form.formState.isDirty}
          buttonTxt="Save to Database"
          type="badge"
          allowImageUpload={true}
          onAccept={handleBadgeSubmit}
        />
      )}
    </ContentBox>
  );
};
