import { type NextPage } from "next";

import ContentBox from "../layout/ContentBox";
import Combat from "../layout/Combat";

import { useRequiredUserData } from "../utils/UserContext";

const CombatPage: NextPage = () => {
  // Data from the DB
  const { data: userData, refetch: refetchUser } = useRequiredUserData();

  return (
    <ContentBox title="Combat" subtitle="Combat" padding={false}>
      {userData?.battleId && <Combat battleId={userData.battleId} />}
    </ContentBox>
  );
};

export default CombatPage;
