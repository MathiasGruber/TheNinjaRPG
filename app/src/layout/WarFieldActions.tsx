"use client";
import { api } from "@/app/_trpc/client";
import { ObjectiveWarPanel } from "@/layout/ObjectiveWarPanel";
import { useRequiredUserData } from "@/utils/UserContext";

/** The same war actions remain reachable while travelling and visiting shrines. */
export const WarFieldActions = () => {
  const { data: user } = useRequiredUserData();
  const { data: wars } = api.war.getActiveWars.useQuery(
    { villageId: user?.villageId ?? "" },
    { enabled: !!user?.villageId },
  );
  if (!user) return null;
  return wars
    ?.filter((w) => w.rules)
    .map((w) => (
      <details key={w.id} className="my-3 rounded-lg border p-3">
        <summary className="cursor-pointer font-semibold">
          War objectives — {w.attackerVillage.name} vs {w.defenderVillage.name}
        </summary>
        <ObjectiveWarPanel warId={w.id} />
      </details>
    ));
};
