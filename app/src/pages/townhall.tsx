import React, { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import ContentBox from "@/layout/ContentBox";
import Confirm from "@/layout/Confirm";
import Loader from "@/layout/Loader";
import NavTabs from "@/layout/NavTabs";
import AvatarImage from "@/layout/Avatar";
import PublicUserComponent from "@/layout/PublicUser";
import UserRequestSystem from "@/layout/UserRequestSystem";
import { Handshake, LandPlot, DoorOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { showMutationToast } from "@/libs/toast";
import { useSafePush } from "@/utils/routing";
import { DoorClosed, ShieldPlus, Swords } from "lucide-react";
import { api } from "@/utils/api";
import { useRequiredUserData } from "@/utils/UserContext";
import { capitalizeFirstLetter } from "@/utils/sanitize";
import { canChangeContent } from "@/utils/permissions";
import { canChallengeKage } from "@/utils/kage";
import { findRelationship } from "@/utils/alliance";
import { PRESTIGE_REQUIREMENT } from "@/utils/kage";
import { canAlly, canWar } from "@/utils/alliance";
import { RANK_REQUIREMENT, WAR_FUNDS_COST } from "@/utils/kage";
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

  // Mutations
  const { mutate: attack, isLoading: isAttacking } = api.kage.fightKage.useMutation({
    onSuccess: async (data) => {
      showMutationToast(data);
      if (data.success) {
        await utils.profile.getUser.invalidate();
        await router.push("/combat");
      }
    },
  });

  const { mutate: resign, isLoading: isResigning } = api.kage.resignKage.useMutation({
    onSuccess: async (data) => {
      showMutationToast(data);
      if (data.success) {
        await utils.village.get.invalidate();
      }
    },
  });

  const { mutate: take, isLoading: isTaking } = api.kage.takeKage.useMutation({
    onSuccess: async (data) => {
      showMutationToast(data);
      if (data.success) {
        await utils.village.get.invalidate();
      }
    },
  });

  // Derived
  const isKage = user.userId === village?.villageData.kageId;

  // Checks
  if (!user.villageId) return <Loader explanation="Join a village first" />;
  if (isLoading || !village) return <Loader explanation="Loading village" />;
  if (isAttacking) return <Loader explanation="Attacking Kage" />;
  if (isResigning) return <Loader explanation="Resigning as Kage" />;
  if (isTaking) return <Loader explanation="Taking Kage" />;

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
        {isKage && (
          <Button
            id="challenge"
            className="my-2 w-full"
            onClick={() => resign({ villageId: village.villageData.id })}
          >
            <DoorClosed className="h-6 w-6 mr-2" />
            Resign as Kage
          </Button>
        )}
        {canChallengeKage(user) && !isKage && (
          <>
            <Button
              id="challenge"
              className="my-2 w-full"
              onClick={() =>
                attack({
                  kageId: village.villageData.kageId,
                  villageId: village.villageData.id,
                })
              }
            >
              <Swords className="h-6 w-6 mr-2" />
              Challenge Kage
            </Button>
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
        {!isKage && canChangeContent(user.role) && (
          <Button
            id="challenge"
            variant="destructive"
            className="my-2 w-full"
            onClick={() => take()}
          >
            <ShieldPlus className="h-6 w-6 mr-2" />
            Take kage as Staff
          </Button>
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
          subtitle="Kage Challenges & Outcomes"
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
                  {challenge.didWin > 0 ? (
                    <p className="font-bold text-green-500 text-sm">
                      Won, {challenge.rounds} rounds
                    </p>
                  ) : (
                    <p className="font-bold text-red-500 text-sm">
                      Lost, {challenge.rounds} rounds
                    </p>
                  )}
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
  // Queries
  const { data, isLoading } = api.village.getAlliances.useQuery(undefined, {
    staleTime: 10000,
  });

  // tRPC utility
  const utils = api.useUtils();

  // Mutations
  const { mutate: accept } = api.village.acceptRequest.useMutation({
    onSuccess: async (data) => {
      showMutationToast(data);
      if (data.success) {
        await utils.village.getAlliances.invalidate();
      }
    },
  });

  const { mutate: reject } = api.village.rejectRequest.useMutation({
    onSuccess: async (data) => {
      showMutationToast(data);
      if (data.success) {
        await utils.village.getAlliances.invalidate();
      }
    },
  });

  const { mutate: cancel } = api.village.cancelRequest.useMutation({
    onSuccess: async (data) => {
      showMutationToast(data);
      if (data.success) {
        await utils.village.getAlliances.invalidate();
      }
    },
  });

  if (isLoading || !data) return <Loader explanation="Loading alliances" />;

  const villages = data.villages;
  const relationships = data.relationships;
  const requests = data.requests;

  return (
    <>
      <ContentBox
        title="Town Hall"
        subtitle="Status between villages"
        back_href="/village"
        topRightContent={navTabs}
      >
        <div className="overflow-auto">
          <div className="grid grid-cols-7 items-center text-center min-w-[400px]">
            <div>
              <p className="font-bold">Kage</p>
              <p className="py-4">&</p>
              <p className="font-bold">Village</p>
            </div>
            {villages.map((village, i) => (
              <div key={i}>
                {village.kage.avatar && (
                  <Link href={`/users/${village.kageId}`}>
                    <AvatarImage
                      href={village.kage.avatar}
                      alt={village.kage.username}
                      hover_effect={true}
                      size={200}
                    />
                  </Link>
                )}
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
                    relationships={relationships}
                    villages={villages}
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
        </div>
      </ContentBox>
      {requests && requests.length > 0 && (
        <ContentBox
          title="Current Requests"
          subtitle="Sent to or from you"
          initialBreak={true}
          padding={false}
        >
          <UserRequestSystem
            requests={requests}
            userId={user.userId}
            onAccept={accept}
            onReject={reject}
            onCancel={cancel}
          />
        </ContentBox>
      )}
    </>
  );
};

const AllianceBlock: React.FC<{
  relationships: VillageAlliance[];
  villages: Village[];
  villageRow: Village;
  villageCol: Village;
  user: UserWithRelations;
}> = ({ relationships, villages, villageRow, villageCol, user }) => {
  // Default
  const sameVillage = villageRow.id === villageCol.id;
  const userVillage = villageRow.id === user?.villageId ? villageRow : villageCol;
  const otherVillage = villageRow.id === user?.villageId ? villageCol : villageRow;
  let status: AllianceState = sameVillage ? "ALLY" : "NEUTRAL";

  // tRPC utility
  const utils = api.useUtils();

  // Mutations
  const { mutate: create, isLoading: isCreating } =
    api.village.createRequest.useMutation({
      onSuccess: async (data) => {
        showMutationToast(data);
        if (data.success) {
          await utils.village.getAlliances.invalidate();
        }
      },
    });

  const { mutate: leave, isLoading: isLeaving } = api.village.leaveAlliance.useMutation(
    {
      onSuccess: async (data) => {
        showMutationToast(data);
        if (data.success) {
          await utils.village.getAlliances.invalidate();
        }
      },
    },
  );

  const { mutate: attack, isLoading: isAttacking } = api.village.startWar.useMutation({
    onSuccess: async (data) => {
      showMutationToast(data);
      if (data.success) {
        await utils.village.getAlliances.invalidate();
      }
    },
  });

  // Check alliances
  const relationship = findRelationship(relationships, villageCol.id, villageRow.id);
  if (relationship) status = relationship.status;

  // Is sending, show loader
  if (isCreating || isLeaving || isAttacking)
    return <Loader explanation="Processing" />;

  // Box background based on status
  let background = "bg-slate-300";
  if (status === "ALLY") background = "bg-green-300";
  if (status === "ENEMY") background = "bg-red-400";

  // Permissions
  const isKage = [villageRow.kageId, villageCol.kageId].includes(user?.userId ?? "");
  const ally = canAlly(relationships, villages, villageRow.id, villageCol.id);
  const war = canWar(relationships, villages, villageRow.id, villageCol.id);

  // Consequences of war
  const newEnemies = villages.filter((v) => war.newEnemies.includes(v.id));
  const newNeutrals = villages.filter((v) => war.newNeutrals.includes(v.id));

  // Derived
  const doHighlight = [villageRow.id, villageCol.id].includes(user?.villageId ?? "");
  const highlight = doHighlight ? "" : "opacity-50";

  // Render
  return (
    <div
      className={`relative aspect-square ${background} ${highlight} flex items-center justify-center font-bold border-2`}
    >
      {isKage && relationship && !sameVillage && status === "ALLY" && (
        <Button
          className="absolute top-1 left-1 px-1"
          variant="ghost"
          onClick={() => leave({ allianceId: relationship.id })}
        >
          <DoorOpen className=" h-6 w-6 hover:text-orange-500" />
        </Button>
      )}
      {isKage && !sameVillage && war.success && (
        <Confirm
          title="Confirm War Declaration"
          button={
            <Button className="absolute top-1 right-1 px-1" variant="ghost">
              <Swords className=" h-6 w-6 hover:text-orange-500" />
            </Button>
          }
          onAccept={(e) => {
            e.preventDefault();
            attack({ villageId: otherVillage.id });
          }}
        >
          <p>You are about to declare war on {otherVillage.name}. Are you sure?</p>
          <p>The cost of initiating a war is {WAR_FUNDS_COST} village tokens</p>
          {newEnemies.length > 0 && (
            <p>
              <span className="font-bold">Additional Enemies: </span>
              <span className="font-normal">
                {newEnemies.map((v) => v.name).join(", ")} will become enemies
              </span>
            </p>
          )}
          {newNeutrals.length > 0 && (
            <p>
              <span className="font-bold">Broken Alliances: </span>
              <span className="font-normal">
                {newNeutrals.map((v) => v.name).join(", ")} will become neutral
              </span>
            </p>
          )}
        </Confirm>
      )}
      {isKage && status === "ENEMY" && (
        <Button
          className="absolute top-1 left-1 px-1"
          variant="ghost"
          onClick={() => create({ targetId: otherVillage.id, type: "SURRENDER" })}
        >
          <LandPlot className=" h-6 w-6 hover:text-orange-500" />
        </Button>
      )}
      {isKage && ally.success && (
        <Button
          className="absolute top-1 left-1 px-1"
          variant="ghost"
          onClick={() => create({ targetId: otherVillage.id, type: "ALLIANCE" })}
        >
          <Handshake className=" h-6 w-6 hover:text-orange-500" />
        </Button>
      )}
      <p className="absolute bottom-3 text-xs sm:text-base md:text-sm">
        {capitalizeFirstLetter(status)}
      </p>
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
