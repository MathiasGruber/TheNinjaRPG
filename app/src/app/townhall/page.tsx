"use client";

import React, { useState, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import ContentBox from "@/layout/ContentBox";
import BanInfo from "@/layout/BanInfo";
import Confirm from "@/layout/Confirm";
import Modal2 from "@/layout/Modal2";
import Loader from "@/layout/Loader";
import Countdown from "@/layout/Countdown";
import NavTabs from "@/layout/NavTabs";
import AvatarImage from "@/layout/Avatar";
import PublicUserComponent from "@/layout/PublicUser";
import UserRequestSystem from "@/layout/UserRequestSystem";
import UserSearchSelect from "@/layout/UserSearchSelect";
import Building from "@/layout/Building";
import Table from "@/layout/Table";
import { Handshake, LandPlot, DoorOpen, Swords, Trophy, Trash2 } from "lucide-react";
import { CircleArrowUp, Lock, LockOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { showMutationToast } from "@/libs/toast";
import { secondsPassed, secondsFromDate } from "@/utils/time";
import { DoorClosed, ShieldPlus } from "lucide-react";
import { api } from "@/app/_trpc/client";
import { useRequiredUserData } from "@/utils/UserContext";
import { capitalizeFirstLetter } from "@/utils/sanitize";
import { canChangeContent } from "@/utils/permissions";
import { canAdministrateWars } from "@/utils/permissions";
import { canChallengeKage } from "@/utils/kage";
import { findRelationship } from "@/utils/alliance";
import { KAGE_PRESTIGE_REQUIREMENT } from "@/drizzle/constants";
import { KAGE_CHALLENGE_SECS, KAGE_CHALLENGE_MINS } from "@/drizzle/constants";
import { KAGE_RANK_REQUIREMENT, WAR_FUNDS_COST } from "@/drizzle/constants";
import { KAGE_PRESTIGE_COST } from "@/drizzle/constants";
import { KAGE_MIN_DAYS_IN_VILLAGE } from "@/drizzle/constants";
import { WAR_DECLARATION_COST, WAR_DAILY_TOKEN_REDUCTION } from "@/drizzle/constants";
import { WAR_TOKEN_REDUCTION_MULTIPLIER_AFTER_3_DAYS } from "@/drizzle/constants";
import { WAR_TOKEN_REDUCTION_MULTIPLIER_AFTER_7_DAYS } from "@/drizzle/constants";
import { WAR_VICTORY_TOKEN_BONUS } from "@/drizzle/constants";
import { VILLAGE_SYNDICATE_ID } from "@/drizzle/constants";
import { WAR_ALLY_OFFER_MIN } from "@/drizzle/constants";
import { WAR_SHRINE_IMAGE, WAR_SHRINE_HP } from "@/drizzle/constants";
import { WAR_PURCHASE_SHRINE_TOKEN_COST } from "@/drizzle/constants";
import { MAP_RESERVED_SECTORS } from "@/drizzle/constants";
import { getSearchValidator } from "@/validators/register";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { Village, VillageAlliance } from "@/drizzle/schema";
import type { UserWithRelations } from "@/server/api/routers/profile";
import type { AllianceState } from "@/drizzle/constants";
import { Input } from "@/components/ui/input";
import { canJoinWar } from "@/libs/war";
import { calculateEnemyConsequences } from "@/utils/alliance";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/ui/form";
import { Dialog } from "@/components/ui/dialog";
import { fetchMap } from "@/libs/travel/globe";
import type { FetchActiveWarsReturnType } from "@/server/api/routers/war";
import type { GlobalMapData } from "@/libs/travel/types";
import StatusBar from "@/layout/StatusBar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ColumnDefinitionType } from "@/layout/Table";
import type { ArrayElement } from "@/utils/typeutils";
import Confirm2 from "@/layout/Confirm2";

const Map = dynamic(() => import("@/layout/Map"), { ssr: false });

export default function TownHall() {
  const { data: userData } = useRequiredUserData();
  const availableTabs = userData?.isOutlaw
    ? ["Alliance", "Wars"]
    : ["Alliance", "Kage", "Elders", "Wars"];
  const [tab, setTab] = useState<(typeof availableTabs)[number] | null>(null);

  if (!userData) return <Loader explanation="Loading userdata" />;
  if (userData.isBanned) return <BanInfo />;

  const NavBarBlock = (
    <NavTabs
      id={`townhallSelection-${userData.villageId}`}
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
  } else if (tab === "Wars") {
    return userData.isOutlaw ? (
      <FactionRoom user={userData} navTabs={NavBarBlock} />
    ) : (
      <WarRoom user={userData} navTabs={NavBarBlock} />
    );
  }
}

const ElderHall: React.FC<{
  user: NonNullable<UserWithRelations>;
  navTabs: React.ReactNode;
}> = ({ user, navTabs }) => {
  // API utility
  const utils = api.useUtils();

  // Fetch elders
  const { data: elders, isPending } = api.kage.getElders.useQuery(
    { villageId: user.villageId ?? "" },
    { staleTime: 10000, enabled: !!user.villageId },
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
  const targetUser = useWatch({
    control: userSearchMethods.control,
    name: "users",
    defaultValue: [],
  })?.[0];

  // Derived
  const isKage = user.userId === user.village?.kageId;

  return (
    <>
      {/* MAIN INFORMATION */}
      <ContentBox
        title="Town Hall"
        subtitle="Elders Council"
        back_href="/village"
        topRightContent={navTabs}
      >
        <p className="pb-2">
          The Elder Council, composed of respected individuals, advises the Kage and
          ensures the village&apos;s prosperity. Known for their wisdom and leadership,
          they guide crucial decisions, maintain order, and uphold traditions. Chosen
          for their skills and dedication, these experienced ninjas play a vital role in
          shaping the village&apos;s future and its continued success.
        </p>
      </ContentBox>
      {/* SHOW ELDERS */}
      {elders && elders.length > 0 && (
        <ContentBox
          title="Current Elders"
          initialBreak={true}
          subtitle={`Currently elected elders in the village`}
        >
          {isPending && <Loader explanation="Loading Elders" />}
          <div className="grid grid-cols-3 pt-3">
            {elders?.map((elder, i) => (
              <div key={i} className="relative">
                <Link href={`/userid/${elder.userId}`} className="text-center">
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
                  {/* {isKage && (
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
                      You are about to remove this user as a village elder. Are you
                      sure?
                    </Confirm>
                  )} */}
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
            showAi={false}
            inline={true}
            maxUsers={maxUsers}
          />
          {targetUser && (
            <div>
              {targetUser.rank !== "JONIN" && targetUser.rank !== "ELITE JONIN" && (
                <p className="text-red-500 font-bold text-center pt-2">
                  User must be at least Jonin!
                </p>
              )}
              {(targetUser.rank === "JONIN" || targetUser.rank === "ELITE JONIN") && (
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
  // Ability to update user
  const { updateUser } = useRequiredUserData();

  // tRPC utility
  const utils = api.useUtils();

  // Query
  const { data: village, isPending } = api.village.get.useQuery(
    { id: user.villageId ?? "" },
    { staleTime: 10000, enabled: !!user.villageId },
  );

  const { mutate: resign, isPending: isResigning } = api.kage.resignKage.useMutation({
    onSuccess: async (data) => {
      showMutationToast(data);
      if (data.success) {
        await utils.village.get.invalidate();
      }
    },
  });

  const { mutate: sendKagePrestige, isPending: isSendingPrestige } =
    api.kage.sendKagePrestige.useMutation({
      onSuccess: async (data, variables) => {
        showMutationToast(data);
        if (data.success) {
          await updateUser({
            villagePrestige: user.villagePrestige - variables.amount,
          });
        }
      },
    });

  // Derived
  const isKage = user.userId === village?.villageData.kageId;
  const isElder = user.rank === "ELDER";

  // Schema for prestige sending
  const prestigeSchema = z.object({
    amount: z.coerce
      .number()
      .int()
      .positive()
      .max(user.villagePrestige ?? 0)
      .optional(),
  });

  // Form for prestige sending
  const prestigeForm = useForm<z.infer<typeof prestigeSchema>>({
    resolver: zodResolver(prestigeSchema),
  });

  // Submit handler for prestige
  const onSendPrestige = prestigeForm.handleSubmit((data) => {
    sendKagePrestige({
      kageId: village?.villageData.kageId ?? "",
      amount: data.amount ?? 0,
    });
    prestigeForm.reset();
  });

  // Checks
  if (!user.villageId) return <Loader explanation="Join a village first" />;
  if (isPending || !village) return <Loader explanation="Loading village" />;
  if (isResigning) return <Loader explanation="Resigning as Kage" />;
  if (isSendingPrestige) return <Loader explanation="Sending prestige" />;

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

        {isElder && (
          <Form {...prestigeForm}>
            <form onSubmit={onSendPrestige} className="relative my-2">
              <FormField
                control={prestigeForm.control}
                name="amount"
                render={({ field }) => (
                  <FormItem className="w-full flex flex-col">
                    <FormControl>
                      <Input
                        id="amount"
                        placeholder={`Send prestige (max ${user.villagePrestige})`}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button className="absolute top-0 right-0" type="submit">
                <CircleArrowUp className="h-5 w-5" />
              </Button>
            </form>
          </Form>
        )}
      </ContentBox>
      <KageChallenge user={user} />
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
                <Link href={`/userid/${challenge.userId}`}>
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
 * Kage challenge component
 */
const KageChallenge: React.FC<{
  user: NonNullable<UserWithRelations>;
}> = ({ user }) => {
  // tRPC utility
  const utils = api.useUtils();

  // Queries
  const { data: requests, isPending: isPendingRequests } =
    api.kage.getUserChallenges.useQuery(undefined, {
      staleTime: 10000,
    });

  const { data: activeWars } = api.war.getActiveWars.useQuery(
    { villageId: user.villageId ?? "" },
    { staleTime: 10000, enabled: !!user.villageId },
  );

  // Derived
  const isKage = user.userId === user.village?.kageId;
  const openForChallenges = user.village?.openForChallenges;
  const pendingRequests = requests?.filter((r) => r.status === "PENDING");
  const nPendingRequests = pendingRequests?.length ?? 0;
  const activeRequest = pendingRequests?.[0];
  const expiredRequest = pendingRequests?.find(
    (r) => secondsPassed(r.createdAt) > KAGE_CHALLENGE_SECS,
  );
  const isAtWar = activeWars && activeWars.length > 0;

  // Mutations
  const { mutate: create, isPending: isSendingChallenge } =
    api.kage.createChallenge.useMutation({
      onSuccess: async (data) => {
        showMutationToast(data);
        if (data.success) {
          await utils.kage.getUserChallenges.invalidate();
        }
      },
    });

  const { mutate: accept, isPending: isAccepting } =
    api.kage.acceptChallenge.useMutation({
      onSuccess: async (data) => {
        showMutationToast(data);
        if (data.success) {
          await utils.kage.getUserChallenges.invalidate();
        }
      },
    });

  const { mutate: reject, isPending: isRejecting } =
    api.kage.rejectChallenge.useMutation({
      onSuccess: async (data) => {
        showMutationToast(data);
        if (data.success) {
          await utils.kage.getUserChallenges.invalidate();
        }
      },
    });

  const { mutate: cancel, isPending: isCancelling } =
    api.kage.cancelChallenge.useMutation({
      onSuccess: async (data) => {
        showMutationToast(data);
        if (data.success) {
          await Promise.all([
            utils.kage.getUserChallenges.invalidate(),
            utils.profile.getUser.invalidate(),
          ]);
        }
      },
    });

  const { mutate: take, isPending: isTaking } = api.kage.takeKage.useMutation({
    onSuccess: async (data) => {
      showMutationToast(data);
      if (data.success) {
        await Promise.all([
          utils.village.get.invalidate(),
          utils.profile.getUser.invalidate(),
        ]);
      }
    },
  });

  const { mutate: toggleChallenges, isPending: isToggling } =
    api.kage.toggleOpenForChallenges.useMutation({
      onSuccess: async (data) => {
        showMutationToast(data);
        if (data.success) {
          await Promise.all([
            utils.village.get.invalidate(),
            utils.profile.getUser.invalidate(),
          ]);
        }
      },
    });

  // If challenge if over the limit, execute the AI vs AI battle
  useEffect(() => {
    if (expiredRequest && !isKage) {
      cancel({ id: expiredRequest.id });
    }
  }, [cancel, expiredRequest, isKage]);

  // Render
  return (
    <ContentBox
      title="Kage Challenges"
      subtitle="The strongest shall rule"
      initialBreak={true}
      padding={false}
    >
      {isAtWar ? (
        <p className="p-3 text-red-500 font-bold text-center">
          Kage challenges are disabled while the village is at war
        </p>
      ) : (
        <>
          <p className="p-3">
            <Button
              className="w-full"
              disabled={!isKage}
              loading={isToggling}
              onClick={() => toggleChallenges({ villageId: user.villageId ?? "" })}
            >
              {openForChallenges ? (
                <LockOpen className="h-6 w-6 mr-2" />
              ) : (
                <Lock className="h-6 w-6 mr-2" />
              )}
              {openForChallenges ? "Accepting Challenges" : "Not Accepting Challenges"}
            </Button>
          </p>
          {requests && requests.length > 0 && openForChallenges && (
            <UserRequestSystem
              isLoading={
                isAccepting ||
                isRejecting ||
                isCancelling ||
                isSendingChallenge ||
                isPendingRequests
              }
              requests={requests}
              userId={user.userId}
              onAccept={accept}
              onReject={reject}
              onCancel={cancel}
            />
          )}
          {requests && requests.length === 0 && isKage && openForChallenges && (
            <p className="p-3">No current challenge requests</p>
          )}
          {activeRequest && (
            <div className="p-3 flex flex-col items-center">
              <p>If not accepted by kage, challenge will execute as Ai vs Ai in:</p>
              <Countdown
                targetDate={secondsFromDate(
                  KAGE_CHALLENGE_SECS,
                  activeRequest.createdAt,
                )}
              />
            </div>
          )}
          {!isKage && openForChallenges && !activeRequest && (
            <div className="p-3">
              {canChallengeKage(user) && !nPendingRequests && (
                <>
                  <Button
                    id="challenge"
                    className="my-2 w-full"
                    onClick={() => {
                      if (user.village) {
                        create({
                          kageId: user.village.kageId,
                          villageId: user.village.id,
                        });
                      }
                    }}
                  >
                    <Swords className="h-6 w-6 mr-2" />
                    Send Kage Challenge Request
                  </Button>
                  <p>
                    <span className="font-bold">Note 1: </span>
                    <span>
                      Kage has {KAGE_CHALLENGE_MINS}mins to accept the challenge
                    </span>
                  </p>
                  <p>
                    <span className="font-bold">Note 2: </span>
                    <span>
                      If challenge is not accepted, it is executed as AI vs AI
                    </span>
                  </p>
                  <p>
                    <span className="font-bold">Note 3: </span>
                    <span>
                      Losing the challenge costs {KAGE_PRESTIGE_COST} village prestige
                    </span>
                  </p>
                  {user.rank === "ELDER" && (
                    <p>
                      <span className="font-bold">Note 4: </span>
                      <span>You will lose the rank of Elder in the village</span>
                    </p>
                  )}
                </>
              )}
              <p className="pt-3">
                <span className="font-bold">Challenge Requirements: </span>
                <span>
                  {KAGE_PRESTIGE_REQUIREMENT} village prestige,{" "}
                  {capitalizeFirstLetter(KAGE_RANK_REQUIREMENT)} rank and{" "}
                  {KAGE_MIN_DAYS_IN_VILLAGE} days in village.
                </span>
              </p>
            </div>
          )}
        </>
      )}
      {!isKage && canChangeContent(user.role) && (
        <div className="p-3">
          <Button
            id="challenge"
            variant="destructive"
            className="my-2 w-full"
            onClick={() => take()}
            loading={isTaking}
          >
            <ShieldPlus className="h-6 w-6 mr-2" />
            Take kage as Staff
          </Button>
        </div>
      )}
    </ContentBox>
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
  const { mutate: accept, isPending: isAccepting } =
    api.village.acceptRequest.useMutation({
      onSuccess: async (data) => {
        showMutationToast(data);
        if (data.success) {
          await utils.village.getAlliances.invalidate();
        }
      },
    });

  const { mutate: reject, isPending: isRejecting } =
    api.village.rejectRequest.useMutation({
      onSuccess: async (data) => {
        showMutationToast(data);
        if (data.success) {
          await utils.village.getAlliances.invalidate();
        }
      },
    });

  const { mutate: cancel, isPending: isCancelling } =
    api.village.cancelRequest.useMutation({
      onSuccess: async (data) => {
        showMutationToast(data);
        if (data.success) {
          await utils.village.getAlliances.invalidate();
        }
      },
    });

  if (isPending || !data) return <Loader explanation="Loading alliances" />;

  const villages = data.villages.filter(
    (v) => ["OUTLAW", "VILLAGE"].includes(v.type) && v.allianceSystem,
  );
  const relationships = data.relationships;
  const requests = data.requests;

  return (
    <>
      <ContentBox
        title={user.isOutlaw ? "Rumours" : "Town Hall"}
        subtitle="Villages & factions"
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
              <div key={i} className="h-full flex flex-col justify-end">
                {village.kage?.avatar && (
                  <Link href={`/userid/${village.kageId}`}>
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
              const elements: React.ReactNode[] = [
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
            isLoading={isAccepting || isRejecting || isCancelling}
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

  const { mutate: attack, isPending: isAttacking } =
    api.village.declareEnemy.useMutation({
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
  const isOutlaw = villageRow.type === "OUTLAW" || villageCol.type === "OUTLAW";
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
  const { ally, enemy, newEnemies, newNeutrals } = calculateEnemyConsequences(
    relationships,
    villages,
    villageRow.id,
    villageCol.id,
  );

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
      {!isOutlaw && isKage && !sameVillage && enemy.success && (
        <Confirm
          title="Confirm Enemy Declaration"
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
          <p>You are about to declare {otherVillage.name} an enemy. Are you sure?</p>
          <p>
            The cost of declaring a village as enemy is {WAR_FUNDS_COST} village tokens.
          </p>
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
        src={village.villageLogo}
        alt={village.name}
        className="p-1"
        width={100}
        height={100}
      />
    </div>
  );
};

/**
 * Wars Component
 */
const WarRoom: React.FC<{
  user: NonNullable<UserWithRelations>;
  navTabs: React.ReactNode;
}> = ({ user, navTabs }) => {
  // State
  const [warType, setWarType] = useState<"Active" | "Ended">("Active");

  // Queries
  const { data: activeWars } = api.war.getActiveWars.useQuery(
    { villageId: user.villageId ?? "" },
    { staleTime: 10000, enabled: !!user.villageId && warType === "Active" },
  );

  const { data: endedWars } = api.war.getEndedWars.useQuery(
    { villageId: user.villageId ?? "" },
    { staleTime: 10000, enabled: !!user.villageId && warType === "Ended" },
  );

  const { data: villageData } = api.village.getAlliances.useQuery(undefined, {
    staleTime: 10000,
  });

  // Derived
  const isKage = user.userId === user.village?.kageId;
  const villages = villageData?.villages;
  const userVillage = villages?.find((v) => v.id === user.villageId);
  const relationships = villageData?.relationships || [];

  // Checks
  if (!user.villageId) return <Loader explanation="Join a village first" />;

  return (
    <>
      <ContentBox
        title="Wars"
        subtitle="Manage Village Wars"
        back_href="/village"
        topRightContent={navTabs}
        initialBreak={true}
      >
        <WarMap
          user={user}
          isKage={isKage}
          villages={villages}
          relationships={relationships}
        />
      </ContentBox>

      {userVillage && (
        <ContentBox
          title={`${warType} Wars`}
          subtitle={warType === "Active" ? "Current Conflicts" : "Past Conflicts"}
          initialBreak={true}
          topRightContent={
            <NavTabs
              id="warTypeSelection"
              current={warType}
              options={["Active", "Ended"]}
              setValue={setWarType}
            />
          }
        >
          <div className="grid grid-cols-1 gap-4">
            {warType === "Active" &&
              activeWars?.map((war) =>
                war.type === "SECTOR_WAR" ? (
                  <SectorWar key={war.id} war={war} user={user} isKage={isKage} />
                ) : (
                  <VillageWar
                    key={war.id}
                    war={war}
                    user={user}
                    villages={villages}
                    relationships={relationships}
                    userVillage={userVillage}
                    isKage={isKage}
                  />
                ),
              )}
            {warType === "Active" && activeWars && activeWars.length === 0 && (
              <p>No active wars</p>
            )}
            {warType === "Ended" &&
              endedWars?.map((war) =>
                war.type === "SECTOR_WAR" ? (
                  <SectorWar key={war.id} war={war} user={user} isKage={isKage} />
                ) : (
                  <VillageWar
                    key={war.id}
                    war={war}
                    user={user}
                    villages={villages}
                    relationships={relationships}
                    userVillage={userVillage}
                    isKage={isKage}
                  />
                ),
              )}
            {warType === "Ended" && endedWars && endedWars.length === 0 && (
              <p>No ended wars</p>
            )}
          </div>
        </ContentBox>
      )}
    </>
  );
};

/**
 * Sector Wars Component
 */
const WarMap: React.FC<{
  user: NonNullable<UserWithRelations>;
  isKage: boolean;
  villages?: Village[];
  relationships: VillageAlliance[];
}> = ({ user, isKage, villages, relationships }) => {
  // Globe data
  const [globe, setGlobe] = useState<GlobalMapData | null>(null);
  const [showModal, setShowModal] = useState<boolean>(false);
  const [targetSector, setTargetSector] = useState<number | null>(null);
  const [structureRoute, setStructureRoute] = useState("/townhall");

  // Query data
  const { data: userData } = useRequiredUserData();
  const utils = api.useUtils();

  // Derived
  const canWar = ["VILLAGE", "TOWN", "HIDEOUT"].includes(userData?.village?.type ?? "");
  const canDeclareWar = isKage && canWar;
  const sectorVillage = villages?.find(
    (v) =>
      v.sector === targetSector && v.type === "VILLAGE" && v.allianceSystem === true,
  );
  const sectorClaimed = villages?.find((v) => v.sector === targetSector);
  const relationship = findRelationship(
    relationships ?? [],
    user.villageId ?? "",
    sectorVillage?.id ?? "",
  );
  const status = relationship?.status || (user.isOutlaw ? "ENEMY" : "NEUTRAL");
  let textColor = "text-slate-600";
  if (status === "ALLY") textColor = "text-green-600";
  if (status === "ENEMY") textColor = "text-red-600";
  const isReserved = MAP_RESERVED_SECTORS.includes(targetSector ?? 0);

  // Queries
  const { data: structures } = api.village.getVillageStructures.useQuery(
    { villageId: sectorVillage?.id ?? "" },
    { enabled: !!sectorVillage?.id },
  );

  // Mutations
  const { mutate: declareSectorWar, isPending: isDeclaringSectorWar } =
    api.war.declareSectorWar.useMutation({
      onSuccess: async (data) => {
        showMutationToast(data);
        if (data.success) {
          await Promise.all([
            utils.war.getActiveWars.invalidate(),
            utils.village.getSectorOwnerships.invalidate(),
          ]);
          setShowModal(false);
        }
      },
    });

  // Mutations
  const { mutate: declareVillageWarOrRaid, isPending: isDeclaringVillageWar } =
    api.war.declareVillageWarOrRaid.useMutation({
      onSuccess: async (data) => {
        showMutationToast(data);
        if (data.success) {
          await Promise.all([
            utils.war.getActiveWars.invalidate(),
            utils.village.getSectorOwnerships.invalidate(),
          ]);
          setShowModal(false);
        }
      },
    });

  const { mutate: leaveAlliance, isPending: isLeavingAlliance } =
    api.village.leaveAlliance.useMutation({
      onSuccess: async (data) => {
        showMutationToast(data);
        if (data.success) {
          await utils.village.getAlliances.invalidate();
        }
      },
    });

  const { mutate: declareEnemy, isPending: isDeclaringEnemy } =
    api.village.declareEnemy.useMutation({
      onSuccess: async (data) => {
        showMutationToast(data);
        if (data.success) {
          await utils.village.getAlliances.invalidate();
        }
      },
    });

  // Set globe data
  void useMemo(async () => {
    setGlobe(await fetchMap());
  }, []);

  // Derived
  const isLoading =
    isDeclaringSectorWar ||
    isDeclaringVillageWar ||
    isDeclaringEnemy ||
    isLeavingAlliance;

  // What to show in the modal
  let modalTitle = "Declare War";
  let proceedLabel: string | undefined = "Declare War";
  if (sectorVillage) {
    if (user.isOutlaw) {
      proceedLabel = "Start Raid";
      modalTitle = "Raid Village";
    } else if (status === "ALLY") {
      proceedLabel = "Break Alliance";
      modalTitle = "Break Alliance";
    } else if (status === "NEUTRAL") {
      proceedLabel = "Declare Enemy";
      modalTitle = "Declare Enemy";
    }
  } else if (sectorClaimed) {
    proceedLabel = undefined;
    modalTitle = "Sector Occupied";
  } else if (isReserved) {
    proceedLabel = undefined;
    modalTitle = "Sector Reserved";
  }

  // Depending on which tile the user clicked, we're either declaring a sector war, village war, or faction raid
  return (
    <div className="relative">
      {villages && globe && (
        <Map
          intersection={true}
          highlights={villages}
          userLocation={true}
          showOwnership={true}
          onTileClick={(sector) => {
            console.log(canDeclareWar, userData?.village?.type);
            if (!canDeclareWar) {
              showMutationToast({ success: false, message: "You are not the leader" });
            }
            if (canDeclareWar) {
              setTargetSector(sector);
              setShowModal(true);
            }
          }}
          actionExplanation="Double click tile to declare war on sector"
          hexasphere={globe}
        />
      )}
      {showModal && globe && userData && targetSector && (
        <Dialog open={showModal} onOpenChange={setShowModal}>
          <Modal2
            title={modalTitle}
            setIsOpen={setShowModal}
            proceed_label={!isLoading ? proceedLabel : undefined}
            onAccept={() => {
              if (sectorVillage) {
                if (status === "ALLY" && relationship) {
                  leaveAlliance({ allianceId: relationship?.id });
                } else if (status === "NEUTRAL") {
                  declareEnemy({ villageId: sectorVillage.id });
                } else if (status === "ENEMY") {
                  declareVillageWarOrRaid({
                    targetVillageId: sectorVillage.id,
                    targetStructureRoute: structureRoute,
                  });
                }
              } else {
                declareSectorWar({ sectorId: targetSector });
              }
            }}
          >
            {isLoading && <Loader explanation="Execution Action" />}
            {!isLoading && sectorVillage && user.isOutlaw && (
              <div>
                <div>
                  You have the option of initiating a raid in this sector, targeting a
                  giving structure. The cost of starting a raid is{" "}
                  {WAR_DECLARATION_COST.toLocaleString()} tokens, and each day at war
                  reduces your tokens by {WAR_DAILY_TOKEN_REDUCTION.toLocaleString()}{" "}
                  (increasing by{" "}
                  {Math.floor((WAR_TOKEN_REDUCTION_MULTIPLIER_AFTER_3_DAYS - 1) * 100)}%
                  after 3 days and{" "}
                  {Math.floor((WAR_TOKEN_REDUCTION_MULTIPLIER_AFTER_7_DAYS - 1) * 100)}%
                  after 7 days). If you win, the structure level will be reduced by 1
                  and you will received {WAR_VICTORY_TOKEN_BONUS.toLocaleString()}{" "}
                  tokens.
                </div>
                <div className="space-y-2">
                  <p className="font-semibold">Select Target Structure:</p>
                  <Select value={structureRoute} onValueChange={setStructureRoute}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a structure to raid" />
                    </SelectTrigger>
                    <SelectContent>
                      {structures?.map((structure) => (
                        <SelectItem
                          key={structure.id}
                          value={structure.route || structure.id}
                        >
                          {structure.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
            {!isLoading && !sectorVillage && sectorClaimed && (
              <div>This sector is already occupied and cannot be claimed.</div>
            )}
            {!isLoading && !sectorVillage && !sectorClaimed && isReserved && (
              <div>This sector is reserved and cannot be claimed.</div>
            )}
            {!isLoading && !sectorVillage && !sectorClaimed && !isReserved && (
              <div>
                <p>You are about to declare war on sector {targetSector}.</p>
                <p className="py-2">
                  This will initiate a war between your village and any village in
                  sector {targetSector}.
                </p>
                <p className="py-2">
                  The cost of declaring war is {WAR_DECLARATION_COST.toLocaleString()}{" "}
                  Village Tokens, and each day at war reduces your tokens by{" "}
                  {WAR_DAILY_TOKEN_REDUCTION.toLocaleString()} (increasing by{" "}
                  {Math.floor((WAR_TOKEN_REDUCTION_MULTIPLIER_AFTER_3_DAYS - 1) * 100)}%
                  after 3 days and{" "}
                  {Math.floor((WAR_TOKEN_REDUCTION_MULTIPLIER_AFTER_7_DAYS - 1) * 100)}%
                  after 7 days).
                </p>
                <p>Do you confirm?</p>
              </div>
            )}
            {!isLoading && sectorVillage && !user.isOutlaw && (
              <div className="border p-4 rounded-lg text-center relative">
                <p className="font-bold">{sectorVillage.name}</p>
                <Image
                  src={sectorVillage.villageGraphic}
                  alt={sectorVillage.name}
                  width={100}
                  height={100}
                  className="mx-auto mb-2 aspect-square"
                />
                <p className={`text-sm mb-2 font-semibold ${textColor}`}>
                  {capitalizeFirstLetter(status)}
                </p>
                {status === "ALLY" && relationship && (
                  <p>
                    You are about to break your alliance with {sectorVillage.name}. Are
                    you sure?
                  </p>
                )}
                {status === "NEUTRAL" && (
                  <>
                    <p>
                      You are about to declare {sectorVillage.name} an enemy. Are you
                      sure? The cost of declaring a village as enemy is {WAR_FUNDS_COST}{" "}
                      village tokens.
                    </p>
                    {(() => {
                      const { newEnemies, newNeutrals } = calculateEnemyConsequences(
                        relationships,
                        villages ?? [],
                        user.villageId ?? "",
                        sectorVillage.id,
                      );
                      return (
                        <>
                          {newEnemies && newEnemies.length > 0 && (
                            <p>
                              <span className="font-bold">Additional Enemies: </span>
                              <span className="font-normal">
                                {newEnemies.map((v) => v.name).join(", ")} will become
                                enemies
                              </span>
                            </p>
                          )}
                          {newNeutrals && newNeutrals.length > 0 && (
                            <p>
                              <span className="font-bold">Broken Alliances: </span>
                              <span className="font-normal">
                                {newNeutrals.map((v) => v.name).join(", ")} will become
                                neutral
                              </span>
                            </p>
                          )}
                        </>
                      );
                    })()}
                  </>
                )}
                {status === "ENEMY" && (
                  <>
                    <p>
                      You are about to declare war on {sectorVillage.name}. Are you
                      sure? The cost of declaring war is{" "}
                      {WAR_DECLARATION_COST.toLocaleString()} Village Tokens, and each
                      day at war reduces your tokens by{" "}
                      {WAR_DAILY_TOKEN_REDUCTION.toLocaleString()} (increasing by{" "}
                      {Math.floor(
                        (WAR_TOKEN_REDUCTION_MULTIPLIER_AFTER_3_DAYS - 1) * 100,
                      )}
                      % after 3 days and{" "}
                      {Math.floor(
                        (WAR_TOKEN_REDUCTION_MULTIPLIER_AFTER_7_DAYS - 1) * 100,
                      )}
                      % after 7 days).
                    </p>
                  </>
                )}
              </div>
            )}
          </Modal2>
        </Dialog>
      )}
    </div>
  );
};

const SectorWar: React.FC<{
  war: FetchActiveWarsReturnType;
  user: NonNullable<UserWithRelations>;
  isKage: boolean;
}> = ({ war, user, isKage }) => {
  // Only show active sector wars
  if (war.status !== "ACTIVE") return null;

  // tRPC utility
  const utils = api.useUtils();

  // Mutations
  const { mutate: buildShrine, isPending: isBuilding } =
    api.war.buildShrine.useMutation({
      onSuccess: async (data) => {
        showMutationToast(data);
        if (data.success) {
          await Promise.all([
            utils.war.getActiveWars.invalidate(),
            utils.village.getSectorOwnerships.invalidate(),
          ]);
        }
      },
    });

  // Derived
  const canBuildShrine =
    isKage &&
    user.village?.tokens &&
    war.attackerVillageId === user.villageId &&
    war.shrineHp <= 0 &&
    user.village?.tokens >= WAR_PURCHASE_SHRINE_TOKEN_COST;

  // Render
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col items-center gap-2">
        <Image
          src={WAR_SHRINE_IMAGE}
          alt="War Shrine"
          width={200}
          height={200}
          className={war.shrineHp <= 0 ? "opacity-50 grayscale" : ""}
        />
        <div className="w-full max-w-md space-y-2">
          <div>
            <p className="text-sm font-medium">Shrine - Sector {war.sectorNumber}</p>
            {war.shrineHp > 0 && (
              <StatusBar
                title="HP"
                tooltip="Shrine Health"
                color="bg-red-500"
                showText={true}
                status="AWAKE"
                current={war.shrineHp}
                total={WAR_SHRINE_HP}
              />
            )}
          </div>
          <div className="mt-2 rounded-md bg-popover p-3 text-sm text-popover-foreground">
            {war.shrineHp > 0 ? (
              <>
                {war.defenderVillageId === VILLAGE_SYNDICATE_ID ? (
                  <p>
                    <strong>Note:</strong> To attack this shrine, you must travel to
                    sector {war.sectorNumber} and engage in combat with the shrine
                    directly.
                  </p>
                ) : (
                  <p>
                    <strong>Note:</strong> To damage this shrine, attack players from
                    the defending village. Each victory will reduce the shrine&apos;s
                    HP.
                  </p>
                )}
              </>
            ) : (
              <p>
                <strong>Note:</strong> This shrine has been destroyed, and your leaders
                can chose to build a new shrine to claim this sector. The cost of
                building a new shrine is{" "}
                {WAR_PURCHASE_SHRINE_TOKEN_COST.toLocaleString()} tokens. Currently we
                have {user.village?.tokens?.toLocaleString()} tokens.
              </p>
            )}
          </div>
          {canBuildShrine && (
            <Confirm
              title="Build Shrine"
              button={
                <Button className="w-full" loading={isBuilding}>
                  <LandPlot className="h-5 w-5 mr-2" />
                  Build Shrine ({WAR_PURCHASE_SHRINE_TOKEN_COST.toLocaleString()}{" "}
                  tokens)
                </Button>
              }
              onAccept={(e) => {
                e.preventDefault();
                buildShrine({ warId: war.id });
              }}
            >
              <p>
                You are about to build a shrine in sector {war.sectorNumber}. This will
                cost {WAR_PURCHASE_SHRINE_TOKEN_COST.toLocaleString()} village tokens.
                Are you sure?
              </p>
            </Confirm>
          )}
        </div>
      </div>
    </div>
  );
};

/**
 * War Component
 */
const VillageWar: React.FC<{
  war: FetchActiveWarsReturnType;
  user: NonNullable<UserWithRelations>;
  villages?: Village[];
  relationships?: VillageAlliance[];
  userVillage?: Village;
  isKage: boolean;
}> = ({ war, user, villages, relationships, userVillage, isKage }) => {
  // Add state for dialog
  const [showKills, setShowKills] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [selectedStat, setSelectedStat] = useState<
    "townhallHpChange" | "shrineHpChange" | "totalKills"
  >("totalKills");

  // Add query for war kills
  const { data: warKills } = api.war.getWarKills.useQuery(
    { warId: war.id },
    { enabled: showKills },
  );

  // Add query for war kill stats
  const { data: warKillStats } = api.war.getWarKillStats.useQuery(
    { warId: war.id, aggregateBy: selectedStat },
    { enabled: showStats },
  );

  // Transform war kills data for table
  const tableData = useMemo(() => {
    if (!warKills) return [];
    return warKills.map((kill) => ({
      ...kill,
      killerAvatar: kill.killer.avatar,
      victimAvatar: kill.victim.avatar,
      killerInfo: (
        <div>
          <p className="font-bold">{kill.killer.username}</p>
          <p>{kill.killerVillage.name}</p>
        </div>
      ),
      victimInfo: (
        <div>
          <p className="font-bold">{kill.victim.username}</p>
          <p>{kill.victimVillage.name}</p>
        </div>
      ),
    }));
  }, [warKills]);

  // Transform war stats data for table
  const statsTableData = useMemo(() => {
    if (!warKillStats) return [];
    return warKillStats.map((stat, index) => ({
      ...stat,
      rank: index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : "",
      playerInfo: (
        <div>
          <p className="font-bold">{stat.killerUsername}</p>
          {stat.villageName && <p>{stat.villageName}</p>}
        </div>
      ),
      statValue: Math.abs(Number(stat.count)).toLocaleString(),
    }));
  }, [warKillStats]);

  type WarKill = ArrayElement<typeof tableData>;
  type WarStat = ArrayElement<typeof statsTableData>;

  // Define table columns
  const killColumns: ColumnDefinitionType<WarKill, keyof WarKill>[] = [
    { key: "killerAvatar", header: "", type: "avatar" },
    { key: "killerInfo", header: "Killer", type: "jsx" },
    { key: "victimAvatar", header: "", type: "avatar" },
    { key: "victimInfo", header: "Victim", type: "jsx" },
    { key: "sector", header: "Sector", type: "string" },
    { key: "shrineHpChange", header: "Shrine HP", type: "string" },
    { key: "townhallHpChange", header: "Townhall HP", type: "string" },
    { key: "killedAt", header: "Time", type: "date" },
  ];

  // Define stats table columns
  const statsColumns: ColumnDefinitionType<WarStat, keyof WarStat>[] = [
    { key: "rank", header: "", type: "string" },
    { key: "killerAvatar", header: "", type: "avatar" },
    { key: "playerInfo", header: "Player", type: "jsx" },
    {
      key: "statValue",
      header:
        selectedStat === "totalKills"
          ? "Kills"
          : selectedStat === "townhallHpChange"
            ? "Townhall Damage"
            : "Shrine Damage",
      type: "string",
    },
  ];

  // tRPC utility
  const utils = api.useUtils();

  // Form for token offer
  const offerSchema = z.object({
    amount: z.coerce
      .number()
      .int()
      .positive()
      .min(WAR_ALLY_OFFER_MIN)
      .max(userVillage?.tokens ?? 0),
  });

  const offerForm = useForm<z.infer<typeof offerSchema>>({
    resolver: zodResolver(offerSchema),
    defaultValues: { amount: 1000 },
    mode: "onChange",
  });

  const onOfferSubmit = (villageId: string) => {
    return offerForm.handleSubmit((data) => {
      createAllyOffer({
        warId: war.id ?? "",
        tokenOffer: data.amount,
        targetVillageId: villageId,
      });
    });
  };

  // Query
  const { data: requests } = api.war.getAllyOffers.useQuery(undefined, {
    staleTime: 30000,
  });

  // Derived for this war
  const warRequests = requests?.filter(
    (r) => r.relatedId === war.id && r.status !== "ACCEPTED",
  );

  // Mutations
  const { mutate: acceptAllyOffer, isPending: isHiring } =
    api.war.acceptAllyOffer.useMutation({
      onSuccess: async (data) => {
        showMutationToast(data);
        if (data.success) {
          await utils.war.getActiveWars.invalidate();
          await utils.war.getAllyOffers.invalidate();
        }
      },
    });

  const { mutate: rejectAllyOffer, isPending: isRejectingOffer } =
    api.war.rejectAllyOffer.useMutation({
      onSuccess: async (data) => {
        showMutationToast(data);
        if (data.success) {
          await utils.war.getAllyOffers.invalidate();
        }
      },
    });

  const { mutate: cancelAllyOffer, isPending: isCancelling } =
    api.war.cancelAllyOffer.useMutation({
      onSuccess: async (data) => {
        showMutationToast(data);
        if (data.success) {
          await utils.war.getAllyOffers.invalidate();
        }
      },
    });

  const { mutate: createAllyOffer, isPending: isCreatingOffer } =
    api.war.createAllyOffer.useMutation({
      onSuccess: async (data) => {
        showMutationToast(data);
        if (data.success) {
          await utils.war.getAllyOffers.invalidate();
          offerForm.reset();
        }
      },
    });

  const { mutate: surrender } = api.war.surrender.useMutation({
    onSuccess: async (data) => {
      showMutationToast(data);
      if (data.success) {
        await Promise.all([
          utils.war.getActiveWars.invalidate(),
          utils.war.getEndedWars.invalidate(),
        ]);
      }
    },
  });

  const { mutate: adminEndWar } = api.war.adminEndWar.useMutation({
    onSuccess: async (data) => {
      showMutationToast(data);
      if (data.success) {
        await utils.war.getActiveWars.invalidate();
        await utils.war.getEndedWars.invalidate();
      }
    },
  });

  const attackerTownHall = war.attackerVillage?.structures?.find(
    (s) => s.route === war.targetStructureRoute,
  );
  const defenderTownHall = war.defenderVillage?.structures?.find(
    (s) => s.route === war.targetStructureRoute,
  );
  const canJoin = villages?.filter((v) => {
    const { check } = canJoinWar(war, relationships ?? [], v, userVillage!);
    return check;
  });
  if (!attackerTownHall || !defenderTownHall) return null;

  return (
    <div className="border p-4 rounded-lg">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h4 className="font-bold text-lg">
            {war.attackerVillageId === user.villageId
              ? "Attacking"
              : "Defending Against"}{" "}
            {war.attackerVillageId === user.villageId
              ? war.defenderVillage?.name
              : war.attackerVillage?.name}
          </h4>
          <p className="text-sm">Started: {war.startedAt.toLocaleDateString()}</p>
          {war.status !== "ACTIVE" && war.endedAt && (
            <>
              <p className="text-sm">Ended: {war.endedAt.toLocaleDateString()}</p>
              <p
                className={`font-bold ${war.status === "DRAW" ? "text-yellow-500" : war.status === "ATTACKER_VICTORY" ? (war.attackerVillageId === user.villageId ? "text-green-500" : "text-red-500") : war.defenderVillageId === user.villageId ? "text-green-500" : "text-red-500"}`}
              >
                Outcome:{" "}
                {war.status === "DRAW"
                  ? "War ended in a Draw"
                  : war.status === "ATTACKER_VICTORY"
                    ? war.attackerVillageId === user.villageId
                      ? "Victory"
                      : "Defeat"
                    : war.defenderVillageId === user.villageId
                      ? "Victory"
                      : "Defeat"}
              </p>
            </>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={() => setShowKills(true)}>
            <Swords className="h-5 w-5" />
          </Button>
          <Button variant="outline" size="icon" onClick={() => setShowStats(true)}>
            <Trophy className="h-5 w-5" />
          </Button>
          {isKage && war.status === "ACTIVE" && (
            <Confirm2
              title="Confirm Surrender"
              button={
                <Button variant="destructive" size="icon">
                  <DoorClosed className="h-5 w-5" />
                </Button>
              }
              onAccept={(e) => {
                e.preventDefault();
                surrender({ warId: war.id });
              }}
            >
              <p>
                Are you sure you want to surrender this war? This will result in an
                immediate loss to your village.
              </p>
            </Confirm2>
          )}
          {canAdministrateWars(user.role) && (
            <Confirm2
              title="End War"
              button={
                <Button variant="destructive" size="icon">
                  <Trash2 className="h-5 w-5" />
                </Button>
              }
              onAccept={(e) => {
                e.preventDefault();
                adminEndWar({ warId: war.id });
              }}
            >
              <p>
                As an admin you can end the war at any time. This will end the war and
                remove all information about the war. No losses will be incurred for
                either side.
              </p>
            </Confirm2>
          )}
        </div>
      </div>

      {/* Add dialog for war kills */}
      <Dialog open={showKills} onOpenChange={setShowKills}>
        <Modal2
          title={`War Kills - ${war.attackerVillage.name} vs ${war.defenderVillage.name}`}
          setIsOpen={setShowKills}
          className="max-w-[99%]"
        >
          <div className="min-h-[200px]">
            {warKills && warKills.length > 0 ? (
              <Table
                data={tableData}
                columns={killColumns}
                linkColumn="killerId"
                linkPrefix="/userid/"
              />
            ) : (
              <p className="text-center text-muted-foreground">No kills recorded yet</p>
            )}
          </div>
        </Modal2>
      </Dialog>

      {/* Add dialog for war kill stats */}
      <Dialog open={showStats} onOpenChange={setShowStats}>
        <Modal2
          title={`War Statistics - ${war.attackerVillage.name} vs ${war.defenderVillage.name}`}
          setIsOpen={setShowStats}
          className="max-w-[99%]"
        >
          <div className="space-y-4">
            <div className="flex justify-center gap-2">
              <Button
                variant={selectedStat === "totalKills" ? "default" : "outline"}
                onClick={() => setSelectedStat("totalKills")}
              >
                Total Kills
              </Button>
              <Button
                variant={selectedStat === "townhallHpChange" ? "default" : "outline"}
                onClick={() => setSelectedStat("townhallHpChange")}
              >
                Townhall Damage
              </Button>
              <Button
                variant={selectedStat === "shrineHpChange" ? "default" : "outline"}
                onClick={() => setSelectedStat("shrineHpChange")}
              >
                Shrine Damage
              </Button>
            </div>

            <div className="min-h-[200px]">
              {warKillStats && warKillStats.length > 0 ? (
                <Table
                  data={statsTableData}
                  columns={statsColumns}
                  linkColumn="killerId"
                  linkPrefix="/userid/"
                />
              ) : (
                <p className="text-center text-muted-foreground">
                  No statistics recorded yet
                </p>
              )}
            </div>
          </div>
        </Modal2>
      </Dialog>

      <div className="grid grid-cols-2 gap-8 items-center justify-center">
        {/* Our Town Hall */}
        <div className="flex flex-col items-center justify-center">
          <h5 className="font-bold mb-2">Our Town Hall</h5>
          <div className="w-full md:w-3/5 lg:w-3/4">
            <Building
              structure={
                war.attackerVillageId === user.villageId
                  ? attackerTownHall
                  : defenderTownHall
              }
              village={
                war.attackerVillageId === user.villageId
                  ? war.attackerVillage
                  : war.defenderVillage
              }
              textPosition="bottom"
              showBar={war.status === "ACTIVE"}
              showNumbers={war.status === "ACTIVE"}
            />
          </div>
          {/* Show our supporting factions */}
          {war.type === "VILLAGE_WAR" && (
            <div className="mt-4">
              <h6 className="font-semibold text-sm mb-2">Supporting Forces:</h6>
              <div className="flex flex-wrap gap-2 justify-center">
                {war.warAllies
                  .filter((warAlly) =>
                    war.attackerVillageId === user.villageId
                      ? warAlly.supportVillageId === war.attackerVillageId
                      : warAlly.supportVillageId === war.defenderVillageId,
                  )
                  .map((warAlly) => (
                    <div
                      key={warAlly.villageId}
                      className="flex items-center space-x-2 bg-poppopover rounded-full px-3 py-1 border-2"
                    >
                      <Image
                        src={warAlly.village.villageGraphic}
                        alt={warAlly.village.name}
                        width={20}
                        height={20}
                        className="rounded-full"
                      />
                      <span className="text-sm">{warAlly.village.name}</span>
                    </div>
                  ))}
                {war.warAllies.filter((warAlly) =>
                  war.attackerVillageId === user.villageId
                    ? warAlly.supportVillageId === war.attackerVillageId
                    : warAlly.supportVillageId === war.defenderVillageId,
                ).length === 0 && (
                  <div className="text-sm text-muted-foreground italic">
                    No supporting forces
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Enemy Town Hall */}
        <div className="flex flex-col items-center justify-center">
          <h5 className="font-bold mb-2">Enemy Town Hall</h5>
          <div className="w-full md:w-3/5 lg:w-3/4">
            <Building
              structure={
                war.attackerVillageId === user.villageId
                  ? defenderTownHall
                  : attackerTownHall
              }
              village={
                war.attackerVillageId === user.villageId
                  ? war.defenderVillage
                  : war.attackerVillage
              }
              textPosition="bottom"
              showBar={war.status === "ACTIVE"}
              showNumbers={war.status === "ACTIVE"}
            />
          </div>
          {/* Show enemy supporting factions */}
          {war.type === "VILLAGE_WAR" && (
            <div className="mt-4">
              <h6 className="font-semibold text-sm mb-2">Supporting Forces:</h6>
              <div className="flex flex-wrap gap-2 justify-center">
                {war.warAllies
                  .filter((warAlly) =>
                    war.attackerVillageId === user.villageId
                      ? warAlly.supportVillageId === war.defenderVillageId
                      : warAlly.supportVillageId === war.attackerVillageId,
                  )
                  .map((warAlly) => (
                    <div
                      key={warAlly.villageId}
                      className="flex items-center space-x-2 bg-poppopover rounded-full px-3 py-1 border-2"
                    >
                      <Image
                        src={warAlly.village.villageGraphic}
                        alt={warAlly.village.name}
                        width={20}
                        height={20}
                        className="rounded-full"
                      />
                      <span className="text-sm">{warAlly.village.name}</span>
                    </div>
                  ))}
                {war.warAllies.filter((warAlly) =>
                  war.attackerVillageId === user.villageId
                    ? warAlly.supportVillageId === war.defenderVillageId
                    : warAlly.supportVillageId === war.attackerVillageId,
                ).length === 0 && (
                  <div className="text-sm text-muted-foreground italic">
                    No supporting forces
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {isKage && war.status === "ACTIVE" && war.type === "VILLAGE_WAR" && (
        <div className="mt-4">
          <h5 className="font-bold mb-2">Send War Alliance Offers</h5>
          <p className="text-sm text-muted-foreground mb-4">
            Send offers to factions or allied villages to join your war effort.
          </p>
          <div className="grid grid-cols-2 gap-2">
            {canJoin?.map((village) => (
              <div
                key={village.id}
                className="border rounded-lg py-1 px-2 hover:bg-popover transition-colors"
              >
                <div className="flex items-center space-x-2">
                  <Image
                    src={village.villageGraphic}
                    alt={village.name}
                    width={40}
                    height={40}
                    className="rounded-full"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{village.name}</p>
                    <p className="text-sm">
                      {village.type === "VILLAGE" ? "Ally" : "Faction"}
                    </p>
                  </div>
                  <Confirm
                    title={`Send Offer to ${village.name}`}
                    button={
                      <Button
                        size="sm"
                        className="shrink-0"
                        onClick={(e) => e.preventDefault()}
                      >
                        <Handshake className="h-4 w-4" />
                      </Button>
                    }
                    onAccept={onOfferSubmit(village.id)}
                  >
                    <Form {...offerForm}>
                      <form className="space-y-4">
                        <FormField
                          control={offerForm.control}
                          name="amount"
                          render={({ field }) => (
                            <FormItem>
                              <FormControl>
                                <Input
                                  type="number"
                                  placeholder={`Token offer (min ${WAR_ALLY_OFFER_MIN}, max ${userVillage?.tokens?.toLocaleString()})`}
                                  {...field}
                                  onChange={(e) => {
                                    const value = parseInt(e.target.value);
                                    field.onChange(value);
                                  }}
                                />
                              </FormControl>
                              <FormMessage className="text-xs" />
                            </FormItem>
                          )}
                        />
                      </form>
                    </Form>
                    <p className="text-sm text-muted-foreground mt-4">
                      This will send an offer to {village.name} to join your side in the
                      war against{" "}
                      {war.attackerVillageId === user.villageId
                        ? war.defenderVillage?.name
                        : war.attackerVillage?.name}
                      . They can choose to accept or reject this offer.
                    </p>
                  </Confirm>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {!user.isOutlaw &&
        war.status === "ACTIVE" &&
        warRequests &&
        warRequests.length > 0 && (
          <ContentBox
            title="War Ally Offers"
            subtitle="Sent to or from you"
            initialBreak={true}
            padding={false}
          >
            <UserRequestSystem
              isLoading={
                isHiring || isRejectingOffer || isCancelling || isCreatingOffer
              }
              requests={warRequests}
              userId={user.userId}
              onAccept={({ id }) => acceptAllyOffer({ offerId: id })}
              onReject={({ id }) => rejectAllyOffer({ id })}
              onCancel={({ id }) => cancelAllyOffer({ offerId: id })}
            />
          </ContentBox>
        )}
    </div>
  );
};

/**
 * Faction Room Component for Outlaws
 */
const FactionRoom: React.FC<{
  user: NonNullable<UserWithRelations>;
  navTabs: React.ReactNode;
}> = ({ user, navTabs }) => {
  // tRPC utility
  const utils = api.useUtils();

  // State
  const [warType, setWarType] = useState<"Active" | "Ended">("Active");

  // Queries
  const { data: activeWars, isPending: isLoadingActive } =
    api.war.getActiveWars.useQuery(
      { villageId: user.villageId ?? "" },
      { staleTime: 10000, enabled: !!user.villageId && warType === "Active" },
    );

  const { data: endedWars, isPending: isLoadingEnded } = api.war.getEndedWars.useQuery(
    { villageId: user.villageId ?? "" },
    { staleTime: 10000, enabled: !!user.villageId && warType === "Ended" },
  );

  const { data: villageData } = api.village.getAlliances.useQuery(undefined, {
    staleTime: 10000,
  });

  const { data: requests } = api.war.getAllyOffers.useQuery(undefined, {
    staleTime: 30000,
  });

  // Mutations
  const { mutate: acceptAllyOffer, isPending: isHiring } =
    api.war.acceptAllyOffer.useMutation({
      onSuccess: async (data) => {
        showMutationToast(data);
        if (data.success) {
          await utils.war.getActiveWars.invalidate();
          await utils.war.getEndedWars.invalidate();
          await utils.war.getAllyOffers.invalidate();
        }
      },
    });

  const { mutate: rejectAllyOffer, isPending: isRejectingOffer } =
    api.war.rejectAllyOffer.useMutation({
      onSuccess: async (data) => {
        showMutationToast(data);
        if (data.success) {
          await utils.war.getAllyOffers.invalidate();
        }
      },
    });

  const { mutate: cancelAllyOffer, isPending: isCancelling } =
    api.war.cancelAllyOffer.useMutation({
      onSuccess: async (data) => {
        showMutationToast(data);
        if (data.success) {
          await utils.war.getAllyOffers.invalidate();
        }
      },
    });

  // Derived
  const isLeader = user.userId === user.village?.kageId;
  const villages = villageData?.villages;
  const relationships = villageData?.relationships || [];

  // Checks
  if (!user.villageId) return <Loader explanation="Join a faction first" />;
  if (isLoadingActive && warType === "Active")
    return <Loader explanation="Loading active wars" />;
  if (isLoadingEnded && warType === "Ended")
    return <Loader explanation="Loading ended wars" />;

  const WarTypeNavTabs = (
    <NavTabs
      id="warTypeSelection"
      current={warType}
      options={["Active", "Ended"]}
      setValue={setWarType}
    />
  );

  return (
    <>
      <ContentBox
        title="Faction Wars"
        subtitle="Manage Faction Wars"
        back_href="/village"
        initialBreak={true}
        topRightContent={navTabs}
      >
        <p>
          As a faction, you can be hired by villages to join their wars as mercenaries.
          Each war contract comes with a payment in tokens, which will be transferred to
          your faction upon accepting the offer. In addition factions can participage in
          sectors wars to claim additional territory.
        </p>
        <WarMap
          user={user}
          isKage={isLeader}
          villages={villages}
          relationships={relationships}
        />
      </ContentBox>

      <ContentBox
        title={`${warType} Wars`}
        subtitle={warType === "Active" ? "Current Conflicts" : "Past Conflicts"}
        initialBreak={true}
        topRightContent={WarTypeNavTabs}
      >
        <div className="grid grid-cols-1 gap-4">
          {warType === "Active" &&
            activeWars?.map((war) =>
              war.type === "SECTOR_WAR" ? (
                <SectorWar key={war.id} war={war} user={user} isKage={isLeader} />
              ) : (
                <VillageWar key={war.id} war={war} user={user} isKage={isLeader} />
              ),
            )}
          {warType === "Active" && activeWars?.length === 0 && (
            <p className="text-muted-foreground">No active wars</p>
          )}
          {warType === "Ended" &&
            endedWars?.map((war) =>
              war.type === "SECTOR_WAR" ? (
                <SectorWar key={war.id} war={war} user={user} isKage={isLeader} />
              ) : (
                <VillageWar key={war.id} war={war} user={user} isKage={isLeader} />
              ),
            )}
          {warType === "Ended" && endedWars?.length === 0 && (
            <p className="text-muted-foreground">No ended wars</p>
          )}
        </div>
      </ContentBox>

      {isLeader && warType === "Active" && (
        <ContentBox
          title="War Contract Offers"
          subtitle="Pending war participation requests"
          initialBreak={true}
          padding={false}
        >
          {requests && requests.length > 0 && (
            <UserRequestSystem
              isLoading={isHiring || isRejectingOffer || isCancelling}
              requests={requests}
              userId={user.userId}
              onAccept={({ id }) => acceptAllyOffer({ offerId: id })}
              onReject={({ id }) => rejectAllyOffer({ id })}
              onCancel={({ id }) => cancelAllyOffer({ offerId: id })}
            />
          )}
          {requests && requests.length === 0 && (
            <p className="p-4">No pending war participation requests</p>
          )}
        </ContentBox>
      )}
    </>
  );
};
