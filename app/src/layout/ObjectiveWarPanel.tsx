"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/app/_trpc/client";
import { Button } from "@/components/ui/button";
import {
  WAR_CAMP_DURATION_HOURS,
  WAR_CAMP_INTERVAL_HOURS,
  WAR_ESPIONAGE_TARGET,
} from "@/drizzle/constants";
import Link from "@/layout/Link";
import Loader from "@/layout/Loader";
import { getWarEspionage, getWarSide } from "@/libs/objectiveWar";
import { pushToCombat } from "@/utils/routing";
import { useRequiredUserData } from "@/utils/UserContext";

export const ObjectiveWarPanel = ({ warId }: { warId: string }) => {
  const [message, setMessage] = useState("");
  const { data: user, updateUser } = useRequiredUserData();
  const router = useRouter();
  const utils = api.useUtils();
  const { data, isPending } = api.war.getObjectiveWarInfo.useQuery(
    { warId },
    { refetchInterval: 10000 },
  );
  const refresh = (result: { success: boolean; message: string }) => {
    setMessage(result.message);
    void utils.war.getObjectiveWarInfo.invalidate({ warId });
    void utils.war.getActiveWars.invalidate();
    void utils.profile.getUser.invalidate();
  };
  const start = api.war.startWarMission.useMutation({
    onSuccess: refresh,
    onError: (error) => setMessage(error.message),
  });
  const finish = api.war.completeWarMission.useMutation({
    onSuccess: refresh,
    onError: (error) => setMessage(error.message),
  });
  const cancel = api.war.cancelWarMission.useMutation({
    onSuccess: refresh,
    onError: (error) => setMessage(error.message),
  });
  const attack = api.combat.startShrineBattle.useMutation({
    onSuccess: async (result) => {
      setMessage(result.message);
      if (result.success && result.battleId) {
        await updateUser({
          status: "BATTLE",
          battleId: result.battleId,
          updatedAt: new Date(),
        });
        pushToCombat(router, result.battleId);
      }
    },
    onError: (error) => setMessage(error.message),
  });
  const camp = api.war.attackWarCamp.useMutation({
    onSuccess: async (result) => {
      setMessage(result.message);
      if (result.success && result.battleId) {
        await updateUser({
          status: "BATTLE",
          battleId: result.battleId,
          updatedAt: new Date(),
        });
        pushToCombat(router, result.battleId);
      }
    },
    onError: (error) => setMessage(error.message),
  });
  if (isPending) return <Loader explanation="Loading war objectives" />;
  if (!data || !user) return null;
  const w = data.war;
  const side = getWarSide(w, user.villageId)!;
  const activeAt = w.combatStartedAt!;
  const isNotice = new Date(activeAt) > new Date();
  const isRevealed = getWarEspionage(w, side) >= WAR_ESPIONAGE_TARGET;
  const enemyVillage =
    side === w.attackerVillageId ? w.defenderVillage : w.attackerVillage;
  const hasEnded =
    w.status !== "ACTIVE" ||
    !!w.endedAt ||
    w.attackerWarHealth <= 0 ||
    w.defenderWarHealth <= 0;
  const pending = hasEnded || start.isPending || finish.isPending || cancel.isPending;
  return (
    <section className="my-4 space-y-4 rounded-lg border p-4">
      <h3 className="text-lg font-semibold">War objectives</h3>
      <p>
        {hasEnded
          ? w.status === "ACTIVE"
            ? "War is settling."
            : `War ended: ${w.status.replaceAll("_", " ")}`
          : isNotice
            ? "Notice period — allies and war missions are available."
            : "Active objective war"}{" "}
        Combat begins {new Date(activeAt).toLocaleString()}.
      </p>
      <p className="text-sm">
        War ends{" "}
        {new Date(
          new Date(activeAt).getTime() + w.rules!.durationDays * 86400000,
        ).toLocaleString()}
        . The village with the most townhall health wins.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {[w.attackerVillageId, w.defenderVillageId].map((id) => (
          <div key={id}>
            <p className="font-medium">
              {id === side ? "Your side" : "Enemy side"} espionage:{" "}
              {getWarEspionage(w, id)} / {WAR_ESPIONAGE_TARGET}
            </p>
            <progress
              className="w-full"
              max={WAR_ESPIONAGE_TARGET}
              value={getWarEspionage(w, id)}
            />
          </div>
        ))}
      </div>
      {!isRevealed && (
        <p>
          Fill your espionage counter to reveal the shrines to defend and attack.
          Leaders can see their locations in advance.
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {w.objectiveState?.objectives.map((o, index) => (
          <div className="rounded border p-3" key={`${o.villageId}:${index}`}>
            <p className="font-semibold">
              {o.villageId === side ? "Defend" : "Attack"} sector {o.sector}
              {o.isReserve ? " (reserve)" : ""}
            </p>
            <p>
              Shrine health: {o.hp.toLocaleString()} / {o.maxHp.toLocaleString()}
              {o.destroyed ? " — destroyed" : ""}
            </p>
            <Link href={`/travel?sector=${o.sector}`}>Travel to sector {o.sector}</Link>
            {o.villageId !== side &&
              !o.destroyed &&
              isRevealed &&
              !isNotice &&
              !hasEnded && (
                <Button
                  className="mt-2"
                  disabled={user.sector !== o.sector || attack.isPending}
                  onClick={() => attack.mutate({ sector: o.sector })}
                >
                  Attack guardian
                </Button>
              )}
          </div>
        ))}
      </div>
      <div className="space-y-2">
        <h4 className="font-semibold">Concurrent war missions</h4>
        {data.attempt && (
          <div className="rounded border p-3">
            <p>
              {data.attempt.task} in sector {data.attempt.sector}. Ready{" "}
              {new Date(data.attempt.endsAt).toLocaleTimeString()}.
            </p>
            <Button
              disabled={pending || new Date(data.attempt.endsAt) > new Date()}
              onClick={() => finish.mutate({ attemptId: data.attempt!.id })}
            >
              Complete mission
            </Button>{" "}
            <Button
              variant="outline"
              disabled={cancel.isPending || start.isPending || finish.isPending}
              onClick={() => cancel.mutate({ attemptId: data.attempt!.id })}
            >
              Cancel mission
            </Button>
          </div>
        )}
        {!data.missions.length && (
          <p className="text-sm">No available war missions have been configured.</p>
        )}
        {data.missions.map((mission) => (
          <div
            key={`${mission.questId}:${mission.objective.id}`}
            className="flex flex-wrap items-center justify-between gap-2 rounded border p-3"
          >
            <div>
              <p className="font-semibold">
                {mission.name}: {mission.objective.task}
              </p>
              <p className="text-sm">
                {"durationSeconds" in mission.objective
                  ? mission.objective.durationSeconds
                  : 0}{" "}
                seconds; {"value" in mission.objective ? mission.objective.value : 0}{" "}
                {mission.objective.task === "espionage"
                  ? "espionage points"
                  : "shrine damage"}
              </p>
            </div>
            <Button
              disabled={pending || !!data.attempt}
              onClick={() =>
                start.mutate({
                  warId,
                  questId: mission.questId,
                  objectiveId: mission.objective.id,
                })
              }
            >
              Start {mission.objective.task}
            </Button>
          </div>
        ))}
      </div>
      <div>
        <h4 className="font-semibold">War camps</h4>
        <p className="text-sm">
          A camp opens every {WAR_CAMP_INTERVAL_HOURS} hours for{" "}
          {WAR_CAMP_DURATION_HOURS} hour. Tied camps deal no townhall damage.
        </p>
        {data.camps.map((c) => (
          <div key={c.id} className="rounded border p-3 mt-2">
            <p>
              <Link href={`/travel?sector=${c.sector}`}>Sector {c.sector}</Link> —
              closes {new Date(c.endsAt).toLocaleTimeString()}
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <p>
                  {w.attackerVillage.name}: {c.attackerScore}
                </p>
                <progress
                  className="w-full"
                  value={c.attackerScore}
                  max={Math.max(1, c.attackerScore + c.defenderScore)}
                />
              </div>
              <div>
                <p>
                  {w.defenderVillage.name}: {c.defenderScore}
                </p>
                <progress
                  className="w-full"
                  value={c.defenderScore}
                  max={Math.max(1, c.attackerScore + c.defenderScore)}
                />
              </div>
            </div>
            <Button
              disabled={
                hasEnded ||
                camp.isPending ||
                user.sector !== c.sector ||
                new Date(c.endsAt) <= new Date()
              }
              onClick={() => camp.mutate({ campId: c.id })}
            >
              Attack war camp
            </Button>
          </div>
        ))}
      </div>
      <div className="overflow-x-auto">
        <h4 className="font-semibold">Townhall contributions</h4>
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="text-left">Ninja</th>
              <th>War damage dealt</th>
              <th>Health recovered</th>
              <th>War points</th>
            </tr>
          </thead>
          <tbody>
            {[...data.contributions]
              .sort((a, b) => b.damage - a.damage)
              .map((row) => (
                <tr key={row.userId}>
                  <td>{row.username}</td>
                  <td className="text-center">{row.damage}</td>
                  <td className="text-center">{row.recovery}</td>
                  <td className="text-center">{row.damage}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
    </section>
  );
};
