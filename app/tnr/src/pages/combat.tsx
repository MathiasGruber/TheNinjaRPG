import { type NextPage } from "next";

import ContentBox from "../layout/ContentBox";
import Loader from "../layout/Loader";
import Combat from "../layout/Combat";

import { useRequiredUserData } from "../utils/UserContext";

const CombatPage: NextPage = () => {
  // Data from the DB
  const { data: userData } = useRequiredUserData();

  return (
    <ContentBox title="Combat" subtitle="Combat" padding={false}>
      {userData?.battleId && <Combat battleId={userData.battleId} />}
      {!userData?.battleId && <Loader explanation="Loading User Data" />}
    </ContentBox>
  );
};

export default CombatPage;
