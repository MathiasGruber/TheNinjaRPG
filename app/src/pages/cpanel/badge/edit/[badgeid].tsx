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
import { show_toast } from "@/libs/toast";
import type { Badge } from "@/drizzle/schema";
import type { NextPage } from "next";

const BadgePanel: NextPage = () => {
  const router = useSafePush();
  const badgeId = router.query.badgeid as string;
  const { data: userData } = useRequiredUserData();

  // Queries
  const { data, isLoading, refetch } = api.badge.get.useQuery(
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
  if (isLoading || !userData || !canChangeContent(userData.role) || !data) {
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
  const {
    badge,
    form: {
      control,
      getValues,
      setValue,
      register,
      formState: { isDirty, errors },
    },
    formData,
    handleBadgeSubmit,
  } = useBadgeEditForm(props.badge, props.refetch);

  // Get current form values
  const currentValues = getValues();

  // Mutations
  const { mutate: chatIdea, isLoading } = api.openai.createBadge.useMutation({
    onSuccess: (data) => {
      show_toast("Updated Badge", `Based on response from AI`, "success");
      let key: keyof typeof data;
      for (key in data) {
        setValue(key, data[key]);
      }
    },
    onError: (error) => {
      show_toast("Error from ChatGPT", error.message, "error");
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
            id="chatInput"
            placeholder="Instruct ChatGPT to edit name & description"
            isLoading={isLoading}
            onSubmit={(text) => {
              chatIdea({ badgeId: badge.id, prompt: text });
            }}
          />
        ) : undefined
      }
    >
      {!badge && <p>Could not find this badge</p>}
      {badge && (
        <div className="grid grid-cols-1 md:grid-cols-2 items-center">
          <EditContent
            currentValues={currentValues}
            schema={BadgeValidator}
            showSubmit={isDirty}
            buttonTxt="Save to Database"
            setValue={setValue}
            register={register}
            errors={errors}
            formData={formData}
            control={control}
            type="badge"
            allowImageUpload={true}
            onAccept={handleBadgeSubmit}
          />
        </div>
      )}
    </ContentBox>
  );
};
