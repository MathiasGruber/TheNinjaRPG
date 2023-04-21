import { useRef, useEffect, useState } from "react";
import { useRouter } from "next/router";
import { type NextPage } from "next";
import Image from "next/image";

import ContentBox from "../layout/ContentBox";
import Loader from "../layout/Loader";
import Combat from "../layout/Combat";
import ActionTimer from "../layout/ActionTimer";
import CombatActions from "../layout/CombatActions";
import { api } from "../utils/api";

import { useRequiredUserData } from "../utils/UserContext";

const CombatPage: NextPage = () => {
  // State
  const [updatedAt, setUpdatedAt] = useState<number>(0);

  // Data from the DB
  const { data: userData, setBattle } = useRequiredUserData();
  const { data: battle, isFetching } = api.combat.getBattle.useQuery(
    { battleId: userData?.battleId ?? "1337" },
    {
      enabled: !!userData,
      staleTime: Infinity,
    }
  );

  // Redirect to profile if not in battle
  const router = useRouter();
  useEffect(() => {
    if (userData && !userData.battleId) {
      void router.push("/profile");
    }
    if (battle) {
      setBattle(battle);
    }
  }, [userData, router, battle, setBattle]);

  return (
    <div>
      <ContentBox
        title="Combat"
        subtitle="Sparring"
        padding={false}
        topRightContent={battle && <ActionTimer perc={100} />}
      >
        {battle && <Combat battle={battle} />}
        {!userData?.battleId && <Loader explanation="Loading User Data" />}
        {isFetching && <Loader explanation="Loading Battle Data" />}
      </ContentBox>
      {battle && <CombatActions battle={battle} />}
    </div>
  );
};

export default CombatPage;
