import { useEffect, useState, useMemo } from "react";
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
  const versionId = battle?.version;
  const user = battle?.usersState.find((u) => u.userId === userId);

  // Redirect to profile if not in battle
  useEffect(() => {
    if (data?.battle && userData) {
      setBattle(data.battle);
      setUserId(userData.userId);
      const newResult = results ? results : data?.result;
      setBattleState({ battle: data?.battle, result: newResult, isLoading: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userData, data, setBattle]);

  // Collect all possible actions for action selector
  const actions = availableUserActions(battleState?.battle, userData?.userId);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [versionId, actionId, userId, results]);

  // Handle key-presses
  useEffect(() => {
    const onDocumentKeyDown = (event: KeyboardEvent) => {
      switch (event.key) {
        case "m":
          actionId === "move" ? setActionId(undefined) : setActionId("move");
          break;
      }
    };
    document.addEventListener("keydown", onDocumentKeyDown);
    return () => {
      document.removeEventListener("keydown", onDocumentKeyDown);
    };
  }, [actionId]);

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
        {userData && !results && !userData.battleId && (
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
      {battle && <CombatHistory battle={battle} results={results} />}
      <div className="flex flex-row">
        {battle && !results && actionId && (
          <div className="pt-2 text-xs">
            <p className="text-red-500">Red: tile not affected</p>
            <p className="text-green-700">Green: tile affected by attack</p>
            <p className="text-blue-500">Blue: move character</p>
          </div>
        )}
        <div className="grow"></div>
        <div className="pt-2 text-xs">
          <p className="text-orange-700">Hotkey &quot;W&quot;: End turn</p>
          <p className="text-orange-700">Hotkey &quot;M&quot;: Move</p>
        </div>
      </div>
    </div>
  );
};

export default CombatPage;
