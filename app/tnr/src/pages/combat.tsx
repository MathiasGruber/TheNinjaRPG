import { useRef, useEffect, useState } from "react";
import { useRouter } from "next/router";
import { type NextPage } from "next";
import Image from "next/image";

import ContentBox from "../layout/ContentBox";
import Loader from "../layout/Loader";
import Combat from "../layout/Combat";
import ActionTimer from "../layout/ActionTimer";
import CombatActions, { ActionSelector } from "../layout/CombatActions";
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

  // User options
  const user = battle?.usersState.find((u) => u.userId === userData?.userId);

  // Collect all possible actions for action selector
  const actions = [
    {
      id: "sp",
      name: "Stamina Attack",
      image: "/combat/basicActions/stamina.png",
      type: "basic" as const,
    },
    {
      id: "cp",
      name: "Chakra Attack",
      image: "/combat/basicActions/chakra.png",
      type: "basic" as const,
    },
    {
      id: "move",
      name: "Move",
      image: "/combat/basicActions/move.png",
      type: "basic" as const,
    },
    {
      id: "flee",
      name: "Flee",
      image: "/combat/basicActions/flee.png",
      type: "basic" as const,
    },
    ...(user?.jutsus
      ? user.jutsus.map((userjutsu) => {
          return { ...userjutsu, ...userjutsu.jutsu, type: "jutsu" as const };
        })
      : []),
    ...(user?.items
      ? user.items.map((useritem) => {
          return { ...useritem, ...useritem.item, type: "item" as const };
        })
      : []),
  ];
  console.log(actions);

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
      {battle && (
        <ActionSelector
          items={actions}
          showBgColor={true}
          showLabels={true}
          onClick={(id) => {
            console.log(id);
          }}
        />
      )}
    </div>
  );
};

export default CombatPage;
