import { useAuth } from "@clerk/nextjs";
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
import { Flag, CopyCheck, Settings, RefreshCcwDot, Trash2 } from "lucide-react";
import { updateUserSchema } from "@/validators/user";
import { canChangeUserRole } from "@/utils/permissions";
import { api } from "@/utils/api";
import { showMutationToast } from "@/libs/toast";
import { canChangePublicUser } from "@/validators/reports";
import { useUserData } from "@/utils/UserContext";
import { useUserEditForm } from "@/libs/profile";
import type { UpdateUserSchema } from "@/validators/user";

interface PublicUserComponentProps {
  userId: string;
  title: string;
  back_href?: string;
  initialBreak?: boolean;
  showRecruited?: boolean;
  showStudents?: boolean;
  showBadges?: boolean;
  showNindo?: boolean;
}

const PublicUserComponent: React.FC<PublicUserComponentProps> = ({
  userId,
  title,
  back_href,
  initialBreak,
  showRecruited,
  showStudents,
  showBadges,
  showNindo,
}) => {
  // Get state
  const { isSignedIn } = useAuth();
  const { data: userData } = useUserData();

  // Queries
  const { data: profile, isPending } = api.profile.getPublicUser.useQuery(
    { userId: userId },
    { enabled: userId !== undefined, staleTime: Infinity },
  );

  // tRPC utility
  const utils = api.useUtils();

  // Mutations
  const updateAvatar = api.reports.updateUserAvatar.useMutation({
    onSuccess: async (data) => {
      showMutationToast(data);
      if (data.success) {
        await utils.profile.getPublicUser.invalidate();
      }
    },
  });

  const clearNindo = api.reports.clearNindo.useMutation({
    onSuccess: async (data) => {
      showMutationToast(data);
      if (data.success) {
        await utils.profile.getPublicUser.invalidate();
      }
    },
  });

  const cloneUser = api.profile.cloneUserForDebug.useMutation({
    onSuccess: async (data) => {
      showMutationToast(data);
      if (data.success) {
        await utils.profile.getUser.invalidate();
      }
    },
  });

  // Derived
  const canChange = isSignedIn && userData && canChangePublicUser(userData);
  const availableRoles = userData && canChangeUserRole(userData.role);

  // Loaders
  if (isPending) return <Loader explanation="Fetching Public User Data" />;
  if (!userData) return <Loader explanation="Fetching Your User Data" />;
  if (!profile) {
    return (
      <ContentBox title="Users" subtitle="Search Unsuccessful">
        User with id <b>{userId}</b> does not exist.
      </ContentBox>
    );
  }

  // Profile name
  let profileName = `${profile.username}`;
  if (profile.customTitle) profileName += ` [${profile.customTitle}]`;

  // Render
  return (
    <>
      {/* USER STATISTICS */}
      <ContentBox
        title={title}
        back_href={back_href}
        subtitle={`Profile: ${profileName}`}
        initialBreak={initialBreak}
        topRightContent={
          <div className="flex flex-row gap-1">
            {userData?.username === "Terriator" && (
              <CopyCheck
                className="h-6 w-6 cursor-pointer hover:fill-orange-500"
                onClick={() => cloneUser.mutate({ userId: profile.userId })}
              />
            )}
            {availableRoles && availableRoles.length > 0 && (
              <EditUserComponent userId={profile.userId} profile={profile} />
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
              button={<Flag className="h-6 w-6 cursor-pointer hover:fill-orange-500" />}
            />
          </div>
        }
      >
        <div className="grid grid-cols-2">
          <div>
            <b>General</b>
            <p>
              Lvl. {profile.level} {capitalizeFirstLetter(profile.rank)}
            </p>
            <p>Village: {profile.village?.name}</p>
            <p>Status: {profile.status}</p>
            <p>Gender: {profile.gender}</p>
            <br />
            <b>Associations</b>
            <p>Clan: {profile.clan?.name || "None"}</p>
            <p>ANBU: {profile.anbuSquad?.name || "None"}</p>
            <p>Bloodline: {profile.bloodline?.name || "None"}</p>
            <p>
              Sensei:{" "}
              {profile.rank === "GENIN" && profile.senseiId && profile.sensei ? (
                <Link href={`/users/${profile.senseiId}`} className="font-bold">
                  {profile.sensei?.username}
                </Link>
              ) : (
                "None"
              )}
            </p>
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
                      <RefreshCcwDot className="absolute right-[13%] top-[3%] h-9 w-9 cursor-pointer rounded-full bg-slate-300 p-1 hover:text-orange-500" />
                    }
                    onAccept={(e) => {
                      e.preventDefault();
                      updateAvatar.mutate({ userId: profile.userId });
                    }}
                  >
                    You are about to delete an avatar and create a new one. Note that
                    abuse of this feature is forbidden, it is solely intended for
                    removing potentially inappropriate avatars. The action will be
                    logged. Are you sure?
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
      {/* RECRUITED USERS */}
      {showRecruited && profile.recruitedUsers.length > 0 && (
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
      {/* STUDENTS */}
      {showStudents && profile.students.length > 0 && (
        <ContentBox title="Students" subtitle={`Past and present`} initialBreak={true}>
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5">
            {profile.students.map((user, i) => (
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
      {/* USER BADGES */}
      {showBadges && profile.badges.length > 0 && (
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
      {/* USER NINDO */}
      {showNindo && profile.nindo && (
        <ContentBox
          title="Nindo"
          subtitle={`${profile.username}'s Ninja Way`}
          initialBreak={true}
          topRightContent={
            <div className="flex flex-row gap-1">
              {canChange && (
                <Confirm
                  title="Clear User Nindo"
                  proceed_label="Done"
                  button={
                    <Trash2 className="h-6 w-6 cursor-pointer hover:fill-orange-500" />
                  }
                  onAccept={() => clearNindo.mutate({ userId: profile.userId })}
                >
                  Confirm that you wish to clear this nindo. The action will be logged.
                </Confirm>
              )}
            </div>
          }
        >
          <div className="overflow-x-scroll">
            {ReactHtmlParser(profile.nindo.content)}
          </div>
        </ContentBox>
      )}
    </>
  );
};

export default PublicUserComponent;

interface EditUserComponentProps {
  userId: string;
  profile: UpdateUserSchema;
}

const EditUserComponent: React.FC<EditUserComponentProps> = ({ userId, profile }) => {
  // Refetching public user
  const refetchProfile = () => void utils.profile.getPublicUser.invalidate();

  // tRPC utility
  const utils = api.useUtils();

  // Form handling
  const { form, formData, handleUserSubmit } = useUserEditForm(
    userId,
    profile,
    refetchProfile,
  );

  return (
    <Confirm
      title="Update User Data"
      proceed_label="Done"
      button={<Settings className="h-6 w-6 cursor-pointer hover:fill-orange-500" />}
    >
      <EditContent
        schema={updateUserSchema}
        form={form}
        formData={formData}
        showSubmit={form.formState.isDirty}
        buttonTxt="Save to Database"
        type="ai"
        allowImageUpload={true}
        onAccept={handleUserSubmit}
      />
    </Confirm>
  );
};
