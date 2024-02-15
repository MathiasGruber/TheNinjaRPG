import React, { useState } from "react";
import Image from "next/image";
import ContentBox from "@/layout/ContentBox";
import Loader from "@/layout/Loader";
import NavTabs from "@/layout/NavTabs";
import PublicUserComponent from "@/layout/PublicUser";
import { api } from "@/utils/api";
import { useRequiredUserData } from "@/utils/UserContext";
import { capitalizeFirstLetter } from "@/utils/sanitize";
import type { Village, VillageAlliance } from "@/drizzle/schema";
import type { UserWithRelations } from "@/server/api/routers/profile";
import type { AllianceState } from "@/drizzle/constants";
import type { NextPage } from "next";

const TownHall: NextPage = () => {
  const { data: userData } = useRequiredUserData();
  const availableTabs = ["Alliance", "Kage"] as const;
  const [tab, setTab] = useState<(typeof availableTabs)[number] | null>(null);

  if (!userData) return <Loader explanation="Loading userdata" />;

  const NavBarBlock = (
    <NavTabs
      id="arenaSelection"
      current={tab}
      options={availableTabs}
      setValue={setTab}
    />
  );

  if (tab === "Alliance" || !tab) {
    return <AllianceHall user={userData} navTabs={NavBarBlock} />;
  } else if (tab === "Kage") {
    return <KageHall user={userData} navTabs={NavBarBlock} />;
  }
};

/**
 * Kage Overview Component
 */
const KageHall: React.FC<{
  user: NonNullable<UserWithRelations>;
  navTabs: React.ReactNode;
}> = ({ user, navTabs }) => {
  // Query
  const { data: village, isLoading } = api.village.get.useQuery(
    { id: user.villageId ?? "" },
    { staleTime: 10000 },
  );

  // Checks
  if (!user.villageId) return <Loader explanation="Join a village first" />;
  if (isLoading || !village) return <Loader explanation="Loading village" />;

  // Render
  return (
    <>
      <ContentBox
        title="Town Hall"
        subtitle="Kage Challenge"
        back_href="/village"
        topRightContent={navTabs}
      >
        <p>
          The &quot;Kage&quot; is the village&apos;s most potent and skilled ninja,
          given the esteemed responsibility of safeguarding its people. As the
          highest-ranking authority in the village, the Kage carries the burden of
          making critical decisions and ensures the village&apos;s prosperity. Their
          duty includes defending the village from external threats, maintaining order
          within, deciding missions for their fellow ninjas, and training the next
          generation of warriors. The Kage is a symbol of strength, wisdom, and dignity,
          known to have the power to shape the destiny of the village.
        </p>
        <p className="pt-3 font-bold">Requirements for kage: </p>
        <ul>
          <li>- 30 Village Prestige</li>
          <li>- Jounin rank </li>
        </ul>
      </ContentBox>
      <PublicUserComponent
        userId={village.villageData.kageId}
        title="Village Kage"
        initialBreak
        showRecruited
        showBadges
        showNindo
      />
    </>
  );
};

/**
 * Alliance Overview Component
 */
const AllianceHall: React.FC<{
  user: NonNullable<UserWithRelations>;
  navTabs: React.ReactNode;
}> = ({ user, navTabs }) => {
  const { data, isLoading } = api.village.getAlliances.useQuery(undefined, {
    staleTime: 10000,
  });

  if (isLoading || !data) return <Loader explanation="Loading alliances" />;

  const villages = data.villages;
  const alliances = data.alliances;

  return (
    <ContentBox
      title="Town Hall"
      subtitle="Status between villages"
      back_href="/village"
      topRightContent={navTabs}
    >
      <div className="grid grid-cols-7 items-center text-center">
        <div></div>
        {villages.map((village, i) => (
          <div key={i}>
            <p className="font-bold pt-1">{village.name}</p>
            <VillageBlock village={village} user={user} />
          </div>
        ))}
        {villages.map((villageRow, i) => {
          const elements: JSX.Element[] = [
            <VillageBlock key={`row-${i}`} village={villageRow} user={user} />,
          ];
          villages.map((villageCol, j) => {
            elements.push(
              <AllianceBlock
                alliances={alliances}
                villageRow={villageRow}
                villageCol={villageCol}
                user={user}
                key={j}
              />,
            );
          });
          return elements;
        })}
      </div>
    </ContentBox>
  );
};

const AllianceBlock: React.FC<{
  alliances: VillageAlliance[];
  villageRow: Village;
  villageCol: Village;
  user: UserWithRelations;
}> = ({ alliances, villageRow, villageCol, user }) => {
  // Default
  let status: AllianceState = villageRow.id === villageCol.id ? "ALLY" : "NEUTRAL";
  // Check alliances
  const alliance = alliances.find(
    (a) =>
      (a.villageIdA === villageRow.id && a.villageIdB === villageCol.id) ||
      (a.villageIdA === villageCol.id && a.villageIdB === villageRow.id),
  );
  if (alliance) status = alliance.status;
  // Box background based on status
  let background = "bg-slate-300";
  if (status === "ALLY") background = "bg-green-300";
  if (status === "ENEMY") background = "bg-red-400";
  // Highlight
  const doHighlight = [villageRow.id, villageCol.id].includes(user?.villageId ?? "");
  const highlight = doHighlight ? "" : "opacity-50";
  return (
    <div
      className={`aspect-square ${background} ${highlight} flex items-center justify-center font-bold border-2`}
    >
      {capitalizeFirstLetter(status)}
    </div>
  );
};

const VillageBlock: React.FC<{ village: Village; user: UserWithRelations }> = ({
  village,
  user,
}) => {
  const highlight = village.id === user?.villageId ? "" : "opacity-50";
  return (
    <div className={`aspect-square ${highlight}`}>
      <Image
        src={`/villages/${village.name}.png`}
        alt={village.name}
        className="p-1"
        width={100}
        height={100}
      />
    </div>
  );
};

export default TownHall;
