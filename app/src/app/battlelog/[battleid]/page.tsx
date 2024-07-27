"use client";

import { useEffect, useState, useMemo } from "react";
import dynamic from "next/dynamic";
import { api } from "@/utils/api";
import { useRequiredUserData } from "@/utils/UserContext";
import ContentBox from "@/layout/ContentBox";
import CombatHistory from "@/layout/CombatHistory";
import type { BattleState } from "@/libs/combat/types";

const Combat = dynamic(() => import("@/layout/Combat"));

export default function BattleLog({ params }: { params: { battleid: string } }) {
  // State
  const [userId, setUserId] = useState<string | undefined>(undefined);
  const [battleState, setBattleState] = useState<BattleState | undefined>(undefined);
  const battleId = params.battleid;

  const { data: userData } = useRequiredUserData();
  const { data } = api.combat.getBattle.useQuery(
    { battleId: battleId },
    { enabled: !!battleId, staleTime: Infinity },
  );

  // Derived variables
  const battle = battleState?.battle;
  const versionId = battle?.version;

  useEffect(() => {
    if (data?.battle && userData) {
      setUserId(userData.userId);
      setBattleState({ battle: data?.battle, result: undefined, isPending: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      title="Battle Log"
      subtitle="Logs only saved for 3 hours!"
      back_href="/profile"
      padding={false}
    >
      {combat}
      <CombatHistory battleId={battleId} />
    </ContentBox>
  );
}
