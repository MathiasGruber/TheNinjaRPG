"use client";

import { useEffect, useState, useMemo, use } from "react";
import dynamic from "next/dynamic";
import { api } from "@/app/_trpc/client";
import { useRequiredUserData } from "@/utils/UserContext";
import ActionTimer from "@/layout/ActionTimer";
import ContentBox from "@/layout/ContentBox";
import CombatHistory from "@/layout/CombatHistory";
import type { BattleState } from "@/libs/combat/types";

const Combat = dynamic(() => import("@/layout/Combat"));

export default function BattleLog(props: { params: Promise<{ battleid: string }> }) {
  const params = use(props.params);
  // State
  const [userId, setUserId] = useState<string | undefined>(undefined);
  const [battleState, setBattleState] = useState<BattleState | undefined>(undefined);
  const battleId = params.battleid;

  const { data: userData } = useRequiredUserData();
  const { data } = api.combat.getBattle.useQuery(
    { battleId: battleId },
    { enabled: !!battleId },
  );

  // Derived variables
  const battle = battleState?.battle;
  const versionId = battle?.version;

  useEffect(() => {
    if (data?.battle && userData) {
      setUserId(userData.userId);
      setBattleState({ battle: data?.battle, result: undefined, isPending: false });
    }
  }, [userData, data]);

  // Battle scene
  const combat = useMemo(() => {
    return (
      battleState &&
      userId && (
        <Combat
          battleState={battleState}
          action={undefined}
          userId={userId}
          setBattleState={setBattleState}
        />
      )
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [versionId, userId]);

  return (
    <ContentBox
      title="Spectate"
      subtitle="Available for 3h!"
      back_href="/profile"
      padding={false}
      topRightContent={
        battle && (
          <ActionTimer
            user={{ userId: userId, actionPoints: 0 }}
            battle={battle}
            isPending={battleState.isPending}
          />
        )
      }
    >
      {combat}
      <CombatHistory battleId={battleId} battleVersion={versionId} />
    </ContentBox>
  );
}
