import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/router";
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
  const [actionPerc, setActionPerc] = useState<number | undefined>(undefined);

  // Data from the DB
  const { data: userData, setBattle } = useRequiredUserData();
  const { data, isFetching } = api.combat.getBattle.useQuery(
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
    if (data) {
      setBattle(data.battle);
    }
  }, [userData, router, data, setBattle]);

  // Collect all possible actions for action selector
  const actions = availableUserActions(data?.battle.usersState, userData?.userId);
  const action = actions.find((a) => a.id === actionId);

  // Three.js scene
  const combat = useMemo(() => {
    return (
      data && (
        <Combat
          battle={data.battle}
          result={data.result}
          action={actions.find((a) => a.id === actionId)}
          setActionPerc={setActionPerc}
          setIsLoading={setIsLoading}
        />
      )
    );
  }, [data, actionId]);

  return (
    <div>
      <ContentBox
        title="Combat"
        subtitle="Sparring"
        padding={false}
        topRightContent={
          data &&
          !data.result && (
            <ActionTimer
              actionPerc={actionPerc}
              isLoading={isLoading}
              action={action}
            />
          )
        }
      >
        {!isFetching && combat}
        {!userData?.battleId && <Loader explanation="Loading User Data" />}
        {isFetching && <Loader explanation="Loading Battle Data" />}
      </ContentBox>
      {data && !data.result && (
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
