import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/router";
import dynamic from "next/dynamic";
import ContentBox from "../layout/ContentBox";
import Loader from "../layout/Loader";
import ActionTimer from "../layout/ActionTimer";
import CombatHistory from "../layout/CombatHistory";
import { availableUserActions } from "../libs/combat/actions";
import { ActionSelector } from "../layout/CombatActions";
import { api } from "../utils/api";
import { useRequiredUserData } from "../utils/UserContext";
import type { NextPage } from "next";
import type { BattleState } from "../libs/combat/types";

const Combat = dynamic(() => import("../layout/Combat"));

const CombatPage: NextPage = () => {
  // State
  const [actionId, setActionId] = useState<string | undefined>(undefined);
  const [userId, setUserId] = useState<string | undefined>(undefined);
  const [battleState, setBattleState] = useState<BattleState | undefined>(undefined);

  // Data from the DB
  const { data: userData, setBattle } = useRequiredUserData();
  const { data, isInitialLoading, refetch } = api.combat.getBattle.useQuery(
    { battleId: userData?.battleId },
    { enabled: !!userData?.battleId, staleTime: Infinity }
  );

  // Derived variables
  const results = battleState?.result;
  const battle = battleState?.battle;
  const battleId = battle?.id;
  const versionId = battle?.version;
  const user = battle?.usersState.find((u) => u.userId === userId);

  // Redirect to profile if not in battle
  const router = useRouter();
  useEffect(() => {
    if (data?.battle && userData) {
      setBattle(data.battle);
      setUserId(userData.userId);
      const newResult = results ? results : data?.result;
      setBattleState({ battle: data?.battle, result: newResult, isLoading: false });
    }
  }, [userData, results, router, data, setBattle]);

  // Collect all possible actions for action selector
  const actions = availableUserActions(
    battleState?.battle?.usersState,
    userData?.userId
  );
  const action = actions.find((a) => a.id === actionId);

  // Battle scene
  const combat = useMemo(() => {
    return (
      battleState &&
      userId && (
        <Combat
          battleState={battleState}
          action={actions.find((a) => a.id === actionId)}
          userId={userId}
          refetchBattle={async () => await refetch()}
          setUserId={setUserId}
          setBattleState={setBattleState}
        />
      )
    );
  }, [versionId, actionId, userId, results]);

  // History Component
  const history = useMemo(() => {
    return (
      battleId &&
      versionId && <CombatHistory battleId={battleId} battleVersion={versionId} />
    );
  }, [battleId, versionId]);

  if (!userData) return <Loader explanation="Loading userdata" />;

  return (
    <div className="sm:container">
      <ContentBox
        title="Combat"
        subtitle="Sparring"
        padding={false}
        topRightContent={
          battle &&
          user &&
          userData?.status === "BATTLE" && (
            <ActionTimer
              user={user}
              battle={battle}
              isLoading={battleState.isLoading}
              action={action}
            />
          )
        }
      >
        {!isInitialLoading && combat}
        {!userData && <Loader explanation="Loading User Data" />}
        {isInitialLoading && <Loader explanation="Loading Battle Data" />}
        {userData && !userData.battleId && (
          <p className="p-3">You are not in any battle</p>
        )}
      </ContentBox>
      {battle && userData?.status === "BATTLE" && (
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
      {history}
      {battle && !results && actionId && (
        <div className="pt-2 text-xs">
          <p className="text-red-500">Red: tile not affected</p>
          <p className="text-green-700">Green: tile affected by attack</p>
        </div>
      )}
    </div>
  );
};

export default CombatPage;
