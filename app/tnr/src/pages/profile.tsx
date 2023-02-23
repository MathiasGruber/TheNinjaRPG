import { type NextPage } from "next";
import { useRequiredUser } from "../utils/UserContext";
import ContentBox from "../layout/ContentBox";
import Loader from "../layout/Loader";

const Profile: NextPage = () => {
  // Queries & mutations
  const { data: userData } = useRequiredUser();
  if (!userData) {
    return <Loader explanation="Loading profile page..." />;
  }

  return (
    <ContentBox
      title="Profile"
      subtitle="An overview of current stats for your character"
    >
      <div className="grid grid-cols-2">
        <div>
          <b>General</b>
          <p>
            Lvl. {userData?.level} {userData?.rank}
          </p>
          <p>Village: {userData?.village?.name}</p>
          <p>Money: {userData?.money}</p>
          <p>Bank: {userData?.bank}</p>
          <p>Status: {userData?.status}</p>
          <p>Gender: {userData?.gender}</p>
          <br />
          <b>Associations</b>
          <p>Clan: None</p>
          <p>ANBU: None</p>
          <p>Bloodline: {userData?.bloodline?.name || "None"}</p>
          <br />
          <b>Experience</b>
          <p>Experience: {userData?.experience}</p>
          <p>Experience for lvl: ---</p>
          <p>PVP Experience: {userData?.pvp_experience}</p>
          <br />
          <b>Special</b>
          <p>Reputation points: {userData?.reputation_points}</p>
          <p>Popularity points: {userData?.popularity_points}</p>
        </div>
        <div>
          <b>Generals</b>
          <p>Strength: {userData?.strength}</p>
          <p>Intelligence: {userData?.intelligence}</p>
          <p>Willpower: {userData?.willpower}</p>
          <p>Speed: {userData?.speed}</p>
          <br />
          <b>Offences</b>
          <p>Ninjutsu offence: {userData?.ninjutsu_offence}</p>
          <p>Genjutsu offence: {userData?.genjutsu_offence}</p>
          <p>Taijutsu offence: {userData?.taijutsu_offence}</p>
          <p>Weapon offence: {userData?.weapon_offence}</p>
          <br />
          <b>Defences</b>
          <p>Ninjutsu defence: {userData?.ninjutsu_defence}</p>
          <p>Genjutsu defence: {userData?.genjutsu_defence}</p>
          <p>Taijutsu defence: {userData?.taijutsu_defence}</p>
          <p>Weapon defence: {userData?.weapon_defence}</p>
        </div>
      </div>
    </ContentBox>
  );
};

export default Profile;
