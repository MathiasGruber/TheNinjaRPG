import { type NextPage } from "next";

import Confirm from "../layout/Confirm";
import ContentBox from "../layout/ContentBox";
import Loader from "../layout/Loader";
import Button from "../layout/Button";
import Countdown from "../layout/Countdown";
import { TrashIcon } from "@heroicons/react/24/outline";

import { useClerk } from "@clerk/clerk-react";
import { useRequiredUserData } from "../utils/UserContext";
import { api } from "../utils/api";
import { show_toast } from "../libs/toast";

const Profile: NextPage = () => {
  const { data: userData, refetch: refetchUser } = useRequiredUserData();
  const { signOut } = useClerk();

  const toggleDeletionTimer = api.profile.toggleDeletionTimer.useMutation({
    onSuccess: async () => {
      await refetchUser();
    },
    onError: (error) => {
      show_toast("Error on toggle deletion timer", error.message, "error");
    },
  });

  const confirmDeletion = api.profile.cofirmDeletion.useMutation({
    onSuccess: () => signOut(),
    onError: (error) => {
      show_toast("Error on performing deletion", error.message, "error");
    },
  });

  if (!userData) {
    return <Loader explanation="Loading profile page..." />;
  }

  return (
    <ContentBox
      title="Profile"
      subtitle="An overview of current stats for your character"
      topRightContent={
        <div className="flex flex-row">
          <Confirm
            title="Confirm Deletion"
            button={
              <TrashIcon
                className={`h-6 w-6 cursor-pointer hover:fill-orange-500 ${
                  userData.deletionAt ? "fill-red-500" : ""
                }`}
              />
            }
            proceed_label={
              userData.deletionAt ? "Disable Deletion Timer" : "Enable Deletion Timer"
            }
            onAccept={(e) => {
              e.preventDefault();
              if (userData.deletionAt && userData.deletionAt < new Date()) {
                confirmDeletion.mutate();
              } else {
                toggleDeletionTimer.mutate();
              }
            }}
          >
            <span>
              This feature is intended for marking the character for deletion. Toggling
              this feature enables a timer of 48 hours, after which you will be able to
              delete the character - this is to ensure no un-intentional character
              deletion.
              {userData.deletionAt && (
                <Button
                  id="create"
                  color="red"
                  disabled={userData.deletionAt > new Date()}
                  label={
                    userData.deletionAt < new Date() ? (
                      "Disable Deletion Timer"
                    ) : (
                      <Countdown targetDate={userData.deletionAt} />
                    )
                  }
                  onClick={(e) => {
                    e.preventDefault();
                    if (userData.deletionAt && userData.deletionAt < new Date()) {
                      confirmDeletion.mutate();
                    }
                  }}
                />
              )}
            </span>
          </Confirm>
        </div>
      }
    >
      <div className="grid grid-cols-2">
        <div>
          <b>General</b>
          <p>
            Lvl. {userData.level} {userData.rank}
          </p>
          <p>Village: {userData.village?.name}</p>
          <p>Money: {userData.money}</p>
          <p>Bank: {userData.bank}</p>
          <p>Status: {userData.status}</p>
          <p>Gender: {userData.gender}</p>
          <br />
          <b>Associations</b>
          <p>Clan: None</p>
          <p>ANBU: None</p>
          <p>Bloodline: {userData.bloodline?.name || "None"}</p>
          <br />
          <b>Experience</b>
          <p>Experience: {userData.experience}</p>
          <p>Experience for lvl: ---</p>
          <p>PVP Experience: {userData.pvp_experience}</p>
          <br />
          <b>Special</b>
          <p>Reputation points: {userData.reputation_points}</p>
          <p>Popularity points: {userData.popularity_points}</p>
          <p>Federal Support: {userData.federalStatus.toLowerCase()}</p>
        </div>
        <div>
          <b>Generals</b>
          <p>Strength: {userData.strength}</p>
          <p>Intelligence: {userData.intelligence}</p>
          <p>Willpower: {userData.willpower}</p>
          <p>Speed: {userData.speed}</p>
          <br />
          <b>Offences</b>
          <p>Ninjutsu offence: {userData.ninjutsu_offence}</p>
          <p>Genjutsu offence: {userData.genjutsu_offence}</p>
          <p>Taijutsu offence: {userData.taijutsu_offence}</p>
          <p>Weapon offence: {userData.weapon_offence}</p>
          <br />
          <b>Defences</b>
          <p>Ninjutsu defence: {userData.ninjutsu_defence}</p>
          <p>Genjutsu defence: {userData.genjutsu_defence}</p>
          <p>Taijutsu defence: {userData.taijutsu_defence}</p>
          <p>Weapon defence: {userData.weapon_defence}</p>
        </div>
      </div>
    </ContentBox>
  );
};

export default Profile;
