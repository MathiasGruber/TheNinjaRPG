"use client";

import React, { useEffect, useState, useMemo } from "react";
import dynamic from "next/dynamic";
import ContentBox from "@/layout/ContentBox";
import Loader from "@/layout/Loader";
import ActionTimer from "@/layout/ActionTimer";
import CombatHistory from "@/layout/CombatHistory";
import { availableUserActions } from "@/libs/combat/actions";
import { ActionSelector } from "@/layout/CombatActions";
import { api } from "@/app/_trpc/client";
import { useRequiredUserData } from "@/utils/UserContext";
import { useSetAtom, useAtom } from "jotai";
import { userBattleAtom, combatActionIdAtom } from "@/utils/UserContext";
import type { BattleState } from "@/libs/combat/types";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useMediaQuery } from "@/hooks/useMediaQuery";

const Combat = dynamic(() => import("@/layout/Combat"));

export default function CombatPage() {
  // Add media query hook
  const isDesktop = useMediaQuery("(min-width: 768px)");

  // State
  const [actionId, setActionId] = useAtom(combatActionIdAtom);
  const [battleState, setBattleState] = useState<BattleState | undefined>(undefined);
  const [lastViewedVersion, setLastViewedVersion] = useState<number>(0);
  const [activeTab, setActiveTab] = useState<string>("actions");

  // Data from the DB
  const setBattleAtom = useSetAtom(userBattleAtom);
  const { data: userData } = useRequiredUserData();
  const { data, isLoading } = api.combat.getBattle.useQuery(
    { battleId: userData?.battleId },
    { enabled: !!userData?.battleId },
  );

  // Derived variables
  const userId = userData?.userId;
  const results = battleState?.result;
  const battle = battleState?.battle;
  const versionId = battle?.version;
  const user = battle?.usersState.find((u) => u.userId === userId);

  // Calculate number of unread actions
  const unreadActions = battle?.version
    ? Math.max(0, battle.version - lastViewedVersion)
    : 0;

  // Update last viewed version when switching to history tab
  useEffect(() => {
    if (activeTab === "history" && battle?.version) {
      setLastViewedVersion(battle.version);
    }
  }, [activeTab, battle?.version]);

  // Redirect to profile if not in battle
  useEffect(() => {
    if (data?.battle) {
      setBattleAtom(data.battle);
      const newResult = results ? results : data?.result;
      setBattleState({ battle: data?.battle, result: newResult, isPending: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

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
          if (actionId === "move") {
            setActionId(undefined);
          } else {
            setActionId("move");
          }
          break;
      }
    };
    document.addEventListener("keydown", onDocumentKeyDown);
    return () => {
      document.removeEventListener("keydown", onDocumentKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
              isPending={battleState.isPending}
              action={action}
            />
          )
        }
      >
        {!isLoading && combat}
        {!userData && <Loader explanation="Loading User Data" />}
        {isLoading && <Loader explanation="Loading Battle Data" />}
        {userData && !results && !userData.battleId && (
          <p className="p-3">You are not in any battle</p>
        )}
      </ContentBox>

      {battle && (
        <>
          {isDesktop ? (
            // Desktop view stacked
            <>
              {userData?.status === "BATTLE" && (
                <ActionSelector
                  items={actions}
                  currentRound={battle.round}
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
              <CombatHistory
                battleId={battle.id}
                battleVersion={battle.version}
                battleRound={battle.round}
                results={results}
              />
            </>
          ) : (
            // Mobile view with tabs
            <Tabs
              defaultValue="actions"
              className="w-full"
              value={activeTab}
              onValueChange={setActiveTab}
            >
              <TabsList className="w-full my-2">
                <TabsTrigger value="actions" className="flex-1">
                  Actions
                </TabsTrigger>
                <TabsTrigger value="history" className="flex-1 relative">
                  History
                  {unreadActions > 0 && activeTab !== "history" && (
                    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full min-w-[1.25rem] h-5 flex items-center justify-center">
                      {unreadActions}
                    </span>
                  )}
                </TabsTrigger>
              </TabsList>
              <TabsContent value="actions">
                {userData?.status === "BATTLE" && (
                  <ActionSelector
                    items={actions}
                    currentRound={battle.round}
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
              </TabsContent>
              <TabsContent value="history">
                <CombatHistory
                  battleId={battle.id}
                  battleVersion={battle.version}
                  battleRound={battle.round}
                  results={results}
                />
              </TabsContent>
            </Tabs>
          )}
        </>
      )}

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
}
