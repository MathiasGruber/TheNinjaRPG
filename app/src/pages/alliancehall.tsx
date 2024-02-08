import React from "react";
import Image from "next/image";
import ContentBox from "@/layout/ContentBox";
import Loader from "@/layout/Loader";
import { api } from "@/utils/api";
import { useRequiredUserData } from "@/utils/UserContext";
import { capitalizeFirstLetter } from "@/utils/sanitize";
import type { Village, VillageAlliance } from "@/drizzle/schema";
import type { UserWithRelations } from "@/server/api/routers/profile";
import type { AllianceState } from "@/drizzle/constants";
import type { NextPage } from "next";

const Alliance: NextPage = () => {
  const { data: userData } = useRequiredUserData();

  const { data, isLoading } = api.village.getAlliances.useQuery(undefined, {
    staleTime: 10000,
  });

  if (isLoading || !data) return <Loader explanation="Loading alliances" />;
  if (!userData) return <Loader explanation="Loading userdata" />;

  const villages = data.villages;
  const alliances = data.alliances;

  return (
    <ContentBox
      title="Alliance"
      subtitle="Alliance status between villages"
      back_href="/village"
    >
      <div className="grid grid-cols-7 items-center text-center">
        <div></div>
        {villages.map((village, i) => (
          <div key={i}>
            <p className="font-bold pt-1">{village.name}</p>
            <VillageBlock village={village} user={userData} />
          </div>
        ))}
        {villages.map((villageRow, i) => {
          const elements: JSX.Element[] = [
            <VillageBlock key={`row-${i}`} village={villageRow} user={userData} />,
          ];
          villages.map((villageCol, j) => {
            elements.push(
              <AllianceBlock
                alliances={alliances}
                villageRow={villageRow}
                villageCol={villageCol}
                user={userData}
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

export default Alliance;
