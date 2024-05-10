import React, { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import ContentBox from "@/layout/ContentBox";
import BanInfo from "@/layout/BanInfo";
import Confirm from "@/layout/Confirm";
import Loader from "@/layout/Loader";
import NavTabs from "@/layout/NavTabs";
import AvatarImage from "@/layout/Avatar";
import PublicUserComponent from "@/layout/PublicUser";
import UserRequestSystem from "@/layout/UserRequestSystem";
import UserSearchSelect from "@/layout/UserSearchSelect";
import { Handshake, LandPlot, DoorOpen } from "lucide-react";
import { CircleArrowUp, Ban } from "lucide-react";
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
import { KAGE_PRESTIGE_COST } from "@/utils/kage";
import { getSearchValidator } from "@/validators/register";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import type { Village, VillageAlliance } from "@/drizzle/schema";
import type { UserWithRelations } from "@/server/api/routers/profile";
import type { AllianceState } from "@/drizzle/constants";
import type { NextPage } from "next";

const TownHall: NextPage = () => {
  const { data: userData } = useRequiredUserData();
  const availableTabs = ["Alliance", "Kage", "Elders"] as const;
  const [tab, setTab] = useState<(typeof availableTabs)[number] | null>(null);

  if (!userData) return <Loader explanation="Loading userdata" />;
  if (userData.isBanned) return <BanInfo />;

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
  } else if (tab === "Elders") {
    return <ElderHall user={userData} navTabs={NavBarBlock} />;
  }
};

const ElderHall: React.FC<{
  user: NonNullable<UserWithRelations>;
  navTabs: React.ReactNode;
}> = ({ user, navTabs }) => {
  // API utility
  const utils = api.useUtils();

  // Fetch elders
  const { data: elders, isPending } = api.kage.getElders.useQuery(
    { villageId: user.villageId ?? "" },
    { staleTime: 10000 },
  );

  // Mutations for promoting & resigning elders
  const { mutate: toggleElder } = api.kage.toggleElder.useMutation({
    onSuccess: async (data) => {
      showMutationToast(data);
      if (data.success) {
        await utils.kage.getElders.invalidate();
      }
    },
  });

  // User search
  const maxUsers = 1;
  const userSearchSchema = getSearchValidator({ max: maxUsers });
  const userSearchMethods = useForm<z.infer<typeof userSearchSchema>>({
    resolver: zodResolver(userSearchSchema),
    defaultValues: { username: "", users: [] },
  });
  const targetUser = userSearchMethods.watch("users", [])?.[0];

  // Derived
  const isKage = user.userId === user.village?.kageId;
  const classifier = user.isOutlaw ? "faction" : "village";

  return (
    <>
      {/* MAIN INFORMATION */}
      <ContentBox
        title="Town Hall"
        subtitle="Elders Council"
        back_href="/village"
        topRightContent={navTabs}
      >
        {user.isOutlaw ? (
          <p className="pb-2">
            The Elder Council, composed of respected individuals, advises the Kage and
            ensures the faction&apos;s prosperity. Chosen for their loyalty, skills and
            dedication, these experienced ninjas play a vital role in shaping the
            faction&apos;s future and its continued success.
          </p>
        ) : (
          <p className="pb-2">
            The Elder Council, composed of respected individuals, advises the Kage and
            ensures the village&apos;s prosperity. Known for their wisdom and
            leadership, they guide crucial decisions, maintain order, and uphold
            traditions. Chosen for their skills and dedication, these experienced ninjas
            play a vital role in shaping the village&apos;s future and its continued
            success.
          </p>
        )}
      </ContentBox>
      {/* SHOW ELDERS */}
      {elders && elders.length > 0 && (
        <ContentBox
          title="Current Elders"
          initialBreak={true}
          subtitle={`Currently elected elders in the ${classifier}`}
        >
          {isPending && <Loader explanation="Loading Elders" />}
          <div className="grid grid-cols-3 pt-3">
            {elders?.map((elder, i) => (
              <div key={i} className="relative">
                <Link href={`/users/${elder.userId}`} className="text-center">
                  <AvatarImage
                    href={elder.avatar}
                    alt={elder.username}
                    userId={elder.userId}
                    hover_effect={true}
                    priority={true}
                    size={100}
                  />
                  <div>
                    <div className="font-bold">{elder.username}</div>
                    <div>
                      Lvl. {elder.level} {capitalizeFirstLetter(elder.rank)}
                    </div>
                  </div>
                  {isKage && (
                    <Confirm
                      title="Confirm Demotion"
                      button={
                        <Ban className="absolute right-[13%] top-[3%] h-9 w-9 cursor-pointer rounded-full bg-slate-300 p-1 hover:text-orange-500" />
                      }
                      onAccept={(e) => {
                        e.preventDefault();
                        toggleElder({
                          userId: elder.userId,
                          villageId: elder.villageId,
                        });
                      }}
                    >
                      You are about to remove this user as a {classifier} elder. Are you
                      sure?
                    </Confirm>
                  )}
                </Link>
              </div>
            ))}
          </div>
        </ContentBox>
      )}
      {/* KAGE CONTROL */}
      {isKage && (
        <ContentBox
          title="Appoint Elder"
          initialBreak={true}
          subtitle="Search for someone to promote to elder"
        >
          <p className="pb-2"></p>
          <UserSearchSelect
            useFormMethods={userSearchMethods}
            label="Search for receiver"
            selectedUsers={[]}
            showYourself={false}
            inline={true}
            maxUsers={maxUsers}
          />
          {targetUser && (
            <div>
              {targetUser.rank !== "JONIN" && (
                <p className="text-red-500 font-bold text-center pt-2">
                  User must be Jonin!
                </p>
              )}
              {targetUser.rank === "JONIN" && (
                <Button
                  id="challenge"
                  className="mt-2 w-full"
                  onClick={() =>
                    toggleElder({
                      userId: targetUser.userId,
                      villageId: user.villageId,
                    })
                  }
                >
                  <CircleArrowUp className="h-5 w-5 mr-2" />
                  Promote
                </Button>
              )}
            </div>
          )}
        </ContentBox>
      )}
    </>
  );
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
  const { data: village, isPending } = api.village.get.useQuery(
    { id: user.villageId ?? "" },
    { staleTime: 10000 },
  );

  // Mutations
  const { mutate: attack, isPending: isAttacking } = api.kage.fightKage.useMutation({
    onSuccess: async (data) => {
      showMutationToast(data);
      if (data.success) {
        await utils.profile.getUser.invalidate();
        await router.push("/combat");
      }
    },
  });

  const { mutate: resign, isPending: isResigning } = api.kage.resignKage.useMutation({
    onSuccess: async (data) => {
      showMutationToast(data);
      if (data.success) {
        await utils.village.get.invalidate();
      }
    },
  });

  const { mutate: take, isPending: isTaking } = api.kage.takeKage.useMutation({
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
  if (isPending || !village) return <Loader explanation="Loading village" />;
  if (isAttacking) return <Loader explanation="Attacking Kage" />;
  if (isResigning) return <Loader explanation="Resigning as Kage" />;
  if (isTaking) return <Loader explanation="Taking Kage" />;

  // Derived
  const classifier = user.isOutlaw ? "faction" : "village";

  // Render
  return (
    <>
      <ContentBox
        title="Town Hall"
        subtitle="Kage Challenge"
        back_href="/village"
        topRightContent={navTabs}
      >
        {user.isOutlaw ? (
          <p>
            The &quot;Kage&quot; is the toughest and most skilled ninja in the faction.
            As the highest-ranking authority in the faction, the Kage carries the burden
            of making critical decisions and ensures the faction&apos;s prosperity. The
            Kage is a symbol of strength, known to have the power to shape the destiny
            of the village.
          </p>
        ) : (
          <p>
            The &quot;Kage&quot; is the village&apos;s most potent and skilled ninja,
            given the esteemed responsibility of safeguarding its people. As the
            highest-ranking authority in the village, the Kage carries the burden of
            making critical decisions and ensures the village&apos;s prosperity. Their
            duty includes defending the village from external threats, maintaining order
            within, deciding missions for their fellow ninjas, and training the next
            generation of warriors. The Kage is a symbol of strength, wisdom, and
            dignity, known to have the power to shape the destiny of the village.
          </p>
        )}
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
              <span>
                Losing the challenge costs {KAGE_PRESTIGE_COST} {classifier} prestige
              </span>
            </p>
            {user.rank === "ELDER" && (
              <p>
                <span className="font-bold">Note 3: </span>
                <span>You will lose the rank of Elder in the {classifier}</span>
              </p>
            )}
          </>
        )}
        {!canChallengeKage(user) && (
          <p className="pt-3">
            <span className="font-bold">Requirements: </span>
            <span>
              {PRESTIGE_REQUIREMENT} {classifier} prestige,{" "}
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
        title={user.isOutlaw ? "Faction Kage" : "Village Kage"}
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
  const { data, isPending } = api.village.getAlliances.useQuery(undefined, {
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

  if (isPending || !data) return <Loader explanation="Loading alliances" />;

  const villages = data.villages;
  const relationships = data.relationships;
  const requests = data.requests;

  return (
    <>
      <ContentBox
        title="Town Hall"
        subtitle="Villages & factions"
        back_href="/village"
        topRightContent={navTabs}
      >
        <div className="overflow-auto">
          <div className="grid grid-cols-8 items-center text-center min-w-[400px]">
            <div>
              <p className="font-bold">Kage</p>
              <p className="py-4">&</p>
              <p className="font-bold">Village</p>
            </div>
            {villages.map((village, i) => (
              <div key={i}>
                {village.kage?.avatar && (
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
  const otherVillage = villageRow.id === user?.villageId ? villageCol : villageRow;
  let status: AllianceState = sameVillage ? "ALLY" : "NEUTRAL";

  // tRPC utility
  const utils = api.useUtils();

  // Mutations
  const { mutate: create, isPending: isCreating } =
    api.village.createRequest.useMutation({
      onSuccess: async (data) => {
        showMutationToast(data);
        if (data.success) {
          await utils.village.getAlliances.invalidate();
        }
      },
    });

  const { mutate: leave, isPending: isLeaving } = api.village.leaveAlliance.useMutation(
    {
      onSuccess: async (data) => {
        showMutationToast(data);
        if (data.success) {
          await utils.village.getAlliances.invalidate();
        }
      },
    },
  );

  const { mutate: attack, isPending: isAttacking } = api.village.startWar.useMutation({
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

  // Check outlaw
  const isOutlaw = villageRow.isOutlawFaction || villageCol.isOutlawFaction;
  if (isOutlaw) status = "ENEMY";

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
      {!isOutlaw && isKage && relationship && !sameVillage && status === "ALLY" && (
        <Button
          className="absolute top-1 left-1 px-1"
          variant="ghost"
          onClick={() => leave({ allianceId: relationship.id })}
        >
          <DoorOpen className=" h-6 w-6 hover:text-orange-500" />
        </Button>
      )}
      {!isOutlaw && isKage && !sameVillage && war.success && (
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
      {!isOutlaw && isKage && status === "ENEMY" && (
        <Button
          className="absolute top-1 left-1 px-1"
          variant="ghost"
          onClick={() => create({ targetId: otherVillage.id, type: "SURRENDER" })}
        >
          <LandPlot className=" h-6 w-6 hover:text-orange-500" />
        </Button>
      )}
      {!isOutlaw && isKage && ally.success && (
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
