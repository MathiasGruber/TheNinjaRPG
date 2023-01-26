import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/router";
import { type NextPage } from "next";

import StatusBar from "../../layout/StatusBar";
import AvatarImage from "../../layout/Avatar";
import ContentBox from "../../layout/ContentBox";
import Confirm from "../../layout/Confirm";
import { ArrowPathRoundedSquareIcon } from "@heroicons/react/24/solid";

import { api } from "../../utils/api";
import { show_toast } from "../../libs/toast";
import { canChangeAvatar } from "../../validators/reports";
import { useUserData } from "../../utils/UserContext";

const PublicProfile: NextPage = () => {
  const { isSignedIn } = useAuth();
  const { data: userData } = useUserData();
  const router = useRouter();
  const userId = router.query.userId as string;

  const { data: profile, refetch: refetchProfile } = api.profile.getPublicUser.useQuery(
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

  return (
    <>
      {profile && (
        <>
          <ContentBox
            title="Users"
            back_href="/users"
            subtitle={"Public Profile: " + profile.username}
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
                    {isSignedIn && userData && canChangeAvatar(userData) && (
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
        </>
      )}
    </>
  );
};

export default PublicProfile;
