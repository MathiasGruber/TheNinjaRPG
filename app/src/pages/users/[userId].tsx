import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/router";
import { type NextPage } from "next";
import ReactHtmlParser from "react-html-parser";
import Link from "next/link";
import Image from "next/image";
import StatusBar from "@/layout/StatusBar";
import AvatarImage from "@/layout/Avatar";
import ContentBox from "@/layout/ContentBox";
import Confirm from "@/layout/Confirm";
import Loader from "@/layout/Loader";
import ReportUser from "@/layout/Report";
import { capitalizeFirstLetter } from "@/utils/sanitize";
import { EditContent } from "@/layout/EditContent";
import { FlagIcon } from "@heroicons/react/24/outline";
import { Cog6ToothIcon } from "@heroicons/react/24/outline";
import { ArrowPathRoundedSquareIcon } from "@heroicons/react/24/solid";
import { updateUserSchema } from "@/validators/user";
import { canChangeUserRole } from "@/utils/permissions";

import { api } from "@/utils/api";
import { show_toast } from "@/libs/toast";
import { canChangeAvatar } from "../../validators/reports";
import { useUserData } from "@/utils/UserContext";
import { useUserEditForm } from "@/libs/profile";
import type { UpdateUserSchema } from "@/validators/user";

const PublicProfile: NextPage = () => {
  const { isSignedIn } = useAuth();
  const { data: userData } = useUserData();
  const router = useRouter();
  const userId = router.query.userId as string;

  const {
    data: profile,
    refetch: refetchProfile,
    isLoading,
  } = api.profile.getPublicUser.useQuery(
    { userId: userId },
    { enabled: userId !== undefined }
  );

  const updateAvatar = api.reports.updateUserAvatar.useMutation({
    onSuccess: async () => {
      await refetchProfile();
    },
    onError: (error) => {
      show_toast("Error on updating avatar", error.message, "error");
    },
  });

  const canChange = isSignedIn && userData && canChangeAvatar(userData);
  const availableRoles = userData && canChangeUserRole(userData.role);

  return (
    <>
      {isLoading && <Loader explanation="Fetching User Data" />}
      {!profile && !isLoading && (
        <ContentBox title="Users" subtitle="Search Unsuccessful">
          User with id <b>{userId}</b> does not exist.
        </ContentBox>
      )}
      {profile && (
        <>
          <ContentBox
            title="Users"
            back_href="/users"
            subtitle={"Public Profile: " + profile.username}
            topRightContent={
              <div className="flex flex-row gap-1">
                {availableRoles && availableRoles.length > 0 && (
                  <EditUserComponent
                    userId={profile.userId}
                    profile={profile}
                    refetchProfile={refetchProfile}
                  />
                )}
                <ReportUser
                  user={profile}
                  content={{
                    id: profile.userId,
                    title: profile.username,
                    content:
                      "General user behavior, justification must be provided in comments",
                  }}
                  system="user_profile"
                  button={
                    <FlagIcon className="h-6 w-6 cursor-pointer hover:fill-orange-500" />
                  }
                />
              </div>
            }
          >
            <div className="grid grid-cols-2">
              <div>
                <b>General</b>
                <p>
                  Lvl. {profile.level} {profile.rank}
                </p>
                <p>Village: {profile.village?.name}</p>
                <p>Status: {profile.status}</p>
                <p>Gender: {profile.gender}</p>
                <br />
                <b>Associations</b>
                <p>Clan: None</p>
                <p>ANBU: None</p>
                <p>Bloodline: {profile.bloodline?.name || "None"}</p>
                <br />
                <b>Experience</b>
                <p>Experience: {profile.experience}</p>
                <p>Experience for lvl: ---</p>
                <br />
                <b>Special</b>
                <p>Reputation points: {profile.reputationPoints}</p>
                <p>Federal Support: {profile.federalStatus.toLowerCase()}</p>
              </div>
              <div>
                <div className="basis-1/3">
                  <div className="relative">
                    <AvatarImage
                      href={profile.avatar}
                      alt={profile.username}
                      userId={profile.userId}
                      hover_effect={false}
                      priority={true}
                      size={100}
                    />
                    {canChange && !profile.isAi && (
                      <Confirm
                        title="Confirm Deletion"
                        button={
                          <ArrowPathRoundedSquareIcon className="absolute right-[13%] top-[3%] h-9 w-9 cursor-pointer rounded-full bg-slate-300 fill-black p-1 hover:fill-orange-500" />
                        }
                        onAccept={(e) => {
                          e.preventDefault();
                          updateAvatar.mutate({ userId: profile.userId });
                        }}
                      >
                        You are about to delete an avatar and create a new one. Note
                        that abuse of this feature is forbidden, it is solely intended
                        for removing potentially inappropriate avatars. The action will
                        be logged. Are you sure?
                      </Confirm>
                    )}
                  </div>
                  <StatusBar
                    title="HP"
                    tooltip="Health"
                    color="bg-red-500"
                    showText={true}
                    status={profile.status}
                    current={profile.curHealth}
                    total={profile.maxHealth}
                  />
                  <StatusBar
                    title="CP"
                    tooltip="Chakra"
                    color="bg-blue-500"
                    showText={true}
                    status={profile.status}
                    current={profile.curChakra}
                    total={profile.maxChakra}
                  />
                  <StatusBar
                    title="SP"
                    tooltip="Stamina"
                    color="bg-green-500"
                    showText={true}
                    status={profile.status}
                    current={profile.curStamina}
                    total={profile.maxStamina}
                  />
                </div>
              </div>
            </div>
          </ContentBox>
          {profile.recruitedUsers.length > 0 && (
            <ContentBox
              title="Recruited Users"
              subtitle={`${profile.username} referred these users`}
              initialBreak={true}
            >
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5">
                {profile.recruitedUsers.map((user, i) => (
                  <Link href={`/users/${user.userId}`} className="text-center" key={i}>
                    <AvatarImage
                      href={user.avatar}
                      alt={user.username}
                      userId={user.userId}
                      hover_effect={true}
                      priority={true}
                      size={100}
                    />
                    <div>
                      <div className="font-bold">{user.username}</div>
                      <div>
                        Lvl. {user.level} {capitalizeFirstLetter(user.rank)}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </ContentBox>
          )}
          {profile.badges.length > 0 && (
            <ContentBox
              title="Achieved Badges"
              subtitle={`Achieved through quests & help`}
              initialBreak={true}
            >
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5">
                {profile.badges.map((userbadge, i) => (
                  <div key={i} className="text-center">
                    <Image
                      src={userbadge.badge.image}
                      alt={userbadge.badge.name}
                      width={128}
                      height={128}
                    />
                    <div>
                      <div className="font-bold">{userbadge.badge.name}</div>
                    </div>
                  </div>
                ))}
              </div>
            </ContentBox>
          )}
          {profile.nindo && (
            <ContentBox
              title="Nindo"
              subtitle={`${profile.username}'s Ninja Way`}
              initialBreak={true}
            >
              {ReactHtmlParser(profile.nindo.content)}
            </ContentBox>
          )}
        </>
      )}
    </>
  );
};

export default PublicProfile;

interface EditUserComponentProps {
  userId: string;
  profile: UpdateUserSchema;
  refetchProfile: () => void;
}

const EditUserComponent: React.FC<EditUserComponentProps> = (props) => {
  // Destructure
  const { userId, profile, refetchProfile } = props;

  // Form handling
  const {
    form: {
      getValues,
      setValue,
      register,
      formState: { isDirty, errors },
    },
    formData,
    handleUserSubmit,
  } = useUserEditForm(userId, profile, refetchProfile);

  // Get current form values
  const currentValues = getValues();

  return (
    <Confirm
      title="Update User Data"
      proceed_label="Done"
      button={
        <Cog6ToothIcon className="h-6 w-6 cursor-pointer hover:fill-orange-500" />
      }
    >
      <EditContent
        currentValues={currentValues}
        schema={updateUserSchema}
        showSubmit={isDirty}
        buttonTxt="Save to Database"
        setValue={setValue}
        register={register}
        errors={errors}
        formData={formData}
        type="ai"
        allowImageUpload={true}
        onAccept={handleUserSubmit}
      />
    </Confirm>
  );
};
