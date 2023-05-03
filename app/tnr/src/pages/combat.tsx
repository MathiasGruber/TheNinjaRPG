import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { AttackTarget, AttackMethod } from "@prisma/client";
import { type NextPage } from "next";

import ContentBox from "../layout/ContentBox";
import Loader from "../layout/Loader";
import Combat from "../layout/Combat";
import ActionTimer from "../layout/ActionTimer";
import { availableUserActions } from "../libs/combat/actions";
import { ActionSelector } from "../layout/CombatActions";
import { api } from "../utils/api";

import { useRequiredUserData } from "../utils/UserContext";

const CombatPage: NextPage = () => {
  // State
  const [actionId, setActionId] = useState<string | undefined>(undefined);
  const [isLoading, setIsLoading] = useState<boolean>(false);
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

  // Collect all possible actions for action selector
  const actions = availableUserActions(battle?.usersState, userData?.userId);

  return (
    <div>
      <ContentBox
        title="Combat"
        subtitle="Sparring"
        padding={false}
        topRightContent={battle && !isLoading ? <ActionTimer perc={100} /> : <Loader />}
      >
        {battle && (
          <Combat
            battle={battle}
            action={actions.find((a) => a.id === actionId)}
            setIsLoading={setIsLoading}
          />
        )}
        {!userData?.battleId && <Loader explanation="Loading User Data" />}
        {isFetching && <Loader explanation="Loading Battle Data" />}
      </ContentBox>
      {battle && (
        <ActionSelector
          items={actions}
          showBgColor={true}
          showLabels={true}
          selectedId={actionId}
          onClick={(id) => {
            if (id === actionId) {
              setActionId(undefined);
            } else {
              setActionId(id);
            }
          }}
        />
      )}
      {actionId && (
        <div className="pt-2 text-xs">
          <p className="text-red-500">Red: tile not affected</p>
          <p className="text-green-700">Green: tile affected by attack</p>
        </div>
      )}
    </div>
  );
};

export default CombatPage;
