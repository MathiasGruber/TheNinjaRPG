"use client";
import { Swords } from "lucide-react";
import { useState } from "react";
import { api } from "@/app/_trpc/client";
import Accordion from "@/layout/Accordion";
import ContentBox from "@/layout/ContentBox";
import { ObjectiveWarPanel } from "@/layout/ObjectiveWarPanel";
import { useRequiredUserData } from "@/utils/UserContext";

/** Keep field actions compact, mounting detailed war queries only while expanded. */
export const WarFieldActions = () => {
  const [selectedWar, setSelectedWar] = useState("");
  const { data: user } = useRequiredUserData();
  const { data: wars } = api.war.getActiveWars.useQuery(
    { villageId: user?.villageId ?? "" },
    { enabled: !!user?.villageId, staleTime: 10000, refetchInterval: 10000 },
  );
  if (!user) return null;
  return wars
    ?.filter((war) => war.rules)
    .map((war) => (
      <div key={war.id} className="mb-4">
        <ContentBox padding={false}>
          <Accordion
            title="War objectives"
            selectionKey={war.id}
            selectedTitle={selectedWar}
            onClick={setSelectedWar}
            collapsible
            icon={Swords}
            className="border-b-0 pb-2"
            unselectedSubtitle={`${war.attackerVillage.name} vs ${war.defenderVillage.name}`}
            selectedSubtitle={`${war.attackerVillage.name} vs ${war.defenderVillage.name}`}
          >
            <ObjectiveWarPanel warId={war.id} />
          </Accordion>
        </ContentBox>
      </div>
    ));
};
