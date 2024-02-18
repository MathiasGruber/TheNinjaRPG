import React, { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import ContentBox from "@/layout/ContentBox";
import Loader from "@/layout/Loader";
import Button from "@/layout/Button";
import NavTabs from "@/layout/NavTabs";
import AvatarImage from "@/layout/Avatar";
import PublicUserComponent from "@/layout/PublicUser";
import { show_toast } from "@/libs/toast";
import { useSafePush } from "@/utils/routing";
import { TrophyIcon } from "@heroicons/react/24/solid";
import { api } from "@/utils/api";
import { useRequiredUserData } from "@/utils/UserContext";
import { capitalizeFirstLetter } from "@/utils/sanitize";
import { canChallengeKage } from "@/utils/kage";
import { PRESTIGE_REQUIREMENT } from "@/utils/kage";
import { RANK_REQUIREMENT } from "@/utils/kage";
import { PRESTIGE_COST } from "@/utils/kage";
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
      id="townhallSelection"
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
  // tRPC utility
  const utils = api.useUtils();

  // Router for forwarding
  const router = useSafePush();

  // Query
  const { data: village, isLoading } = api.village.get.useQuery(
    { id: user.villageId ?? "" },
    { staleTime: 10000 },
  );

  // Mutation for starting a fight
  const { mutate: attack, isLoading: isAttacking } = api.kage.fightKage.useMutation({
    onMutate: () => {
      document.body.style.cursor = "wait";
    },
    onSuccess: async (data) => {
      if (data.success) {
        await utils.profile.getUser.invalidate();
        await router.push("/combat");
      } else {
        show_toast("Error attacking", data.message, "info");
      }
    },
    onError: (error) => {
      show_toast("Error attacking", error.message, "error");
    },
    onSettled: () => {
      document.body.style.cursor = "default";
    },
  });

  // Checks
  if (!user.villageId) return <Loader explanation="Join a village first" />;
  if (isLoading || !village) return <Loader explanation="Loading village" />;
  if (isAttacking) return <Loader explanation="Attacking Kage" />;

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
        {canChallengeKage(user) && user.userId !== village.villageData.kageId && (
          <>
            <Button
              id="challenge"
              className="pt-3"
              image={<TrophyIcon className="h-6 w-6 mr-2" />}
              label="Challenge Kage"
              onClick={() =>
                attack({
                  kageId: village.villageData.kageId,
                  villageId: village.villageData.id,
                })
              }
            />
            <p>
              <span className="font-bold">Note 1: </span>
              <span>Kage challenges are executed as AI vs AI</span>
            </p>
            <p>
              <span className="font-bold">Note 2: </span>
              <span>Losing the challenge costs {PRESTIGE_COST} village prestige</span>
            </p>
          </>
        )}
        {!canChallengeKage(user) && (
          <p className="pt-3">
            <span className="font-bold">Requirements: </span>
            <span>
              {PRESTIGE_REQUIREMENT} Village Prestige,{" "}
              {capitalizeFirstLetter(RANK_REQUIREMENT)} rank
            </span>
          </p>
        )}
      </ContentBox>
      <PublicUserComponent
        userId={village.villageData.kageId}
        title="Village Kage"
        initialBreak
      />
      {village.defendedChallenges && village.defendedChallenges.length > 0 && (
        <ContentBox
          title="Challenge Record"
          subtitle="Challenges defended by current Kage"
          initialBreak={true}
        >
          <div className="grid grid-cols-4 lggrid-cols-5">
            {village.defendedChallenges.map((challenge, i) => (
              <div key={i} className="p-2 text-center">
                <Link href={`/users/${challenge.userId}`}>
                  <AvatarImage
                    href={challenge.user.avatar}
                    alt={challenge.user.username}
                    hover_effect={true}
                    size={200}
                  />
                  <p className="font-bold text-red-500 text-sm">
                    Lasted {challenge.rounds} rounds
                  </p>
                  <p className="italic text-xs">
                    {challenge.createdAt.toLocaleDateString()}
                  </p>
                  <p className="italic text-xs">
                    {challenge.createdAt.toLocaleTimeString()}
                  </p>
                </Link>
              </div>
            ))}
          </div>
        </ContentBox>
      )}
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
