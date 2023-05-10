import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/router";
import { type NextPage } from "next";

import ContentBox from "../layout/ContentBox";
import Loader from "../layout/Loader";
import Combat from "../layout/Combat";
import ActionTimer from "../layout/ActionTimer";
import CombatHistory from "../layout/CombatHistory";

import { availableUserActions } from "../libs/combat/actions";
import { ActionSelector } from "../layout/CombatActions";
import { api } from "../utils/api";
import { useRequiredUserData } from "../utils/UserContext";
import type { BattleState } from "../libs/combat/types";

const CombatPage: NextPage = () => {
  // State
  const [actionId, setActionId] = useState<string | undefined>(undefined);
  const [actionPerc, setActionPerc] = useState<number | undefined>(undefined);
  const [battleState, setBattleState] = useState<BattleState | undefined>(undefined);

  // Data from the DB
  const { data: userData, setBattle } = useRequiredUserData();
  const { data, isFetching } = api.combat.getBattle.useQuery(
    { battleId: userData?.battleId },
    { enabled: !!userData?.battleId, staleTime: Infinity }
  );

  // Redirect to profile if not in battle
  const router = useRouter();
  useEffect(() => {
    if (data?.battle) {
      setBattle(data.battle);
      setBattleState({ battle: data.battle, result: null, isLoading: false });
    }
  }, [userData, router, data, setBattle]);

  // Collect all possible actions for action selector
  const actions = availableUserActions(data?.battle?.usersState, userData?.userId);
  const action = actions.find((a) => a.id === actionId);

  // Derived variables
  const results = battleState?.result;
  const battle = battleState?.battle;
  const battleId = battle?.id;
  const versionId = battle?.version;

  // Battle scene
  const combat = useMemo(() => {
    return (
      battleState && (
        <Combat
          battleState={battleState}
          action={actions.find((a) => a.id === actionId)}
          setActionPerc={setActionPerc}
          setBattleState={setBattleState}
        />
      )
    );
  }, [versionId, actionId]);

  // History Component
  const history = useMemo(() => {
    return (
      battleId &&
      versionId && <CombatHistory battleId={battleId} battleVersion={versionId} />
    );
  }, [battleId, versionId]);

  return (
    <div>
      <ContentBox
        title="Combat"
        subtitle="Sparring"
        padding={false}
        topRightContent={
          battle &&
          !results && (
            <ActionTimer
              actionPerc={actionPerc}
              isLoading={battleState.isLoading}
              action={action}
            />
          )
        }
      >
        {!isFetching && combat}
        {!userData && <Loader explanation="Loading User Data" />}
        {isFetching && <Loader explanation="Loading Battle Data" />}
        {userData && !userData.battleId && (
          <p className="p-3">You are not in any battle</p>
        )}
      </ContentBox>
      {battle && !results && (
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
