"use client";

import React, { useState, useMemo } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import ContentBox from "@/layout/ContentBox";
import Confirm from "@/layout/Confirm";
import Modal2 from "@/layout/Modal2";
import Loader from "@/layout/Loader";
import NavTabs from "@/layout/NavTabs";
import UserRequestSystem from "@/layout/UserRequestSystem";
import Building from "@/layout/Building";
import Table from "@/layout/Table";
import { Handshake, LandPlot, Swords, Trophy, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { showMutationToast } from "@/libs/toast";
import { DoorClosed } from "lucide-react";
import { api } from "@/app/_trpc/client";
import { useRequiredUserData } from "@/utils/UserContext";
import { capitalizeFirstLetter } from "@/utils/sanitize";
import { canAdministrateWars } from "@/utils/permissions";
import { findRelationship } from "@/utils/alliance";
import { WAR_FUNDS_COST } from "@/drizzle/constants";
import { WAR_DECLARATION_COST, WAR_DAILY_TOKEN_REDUCTION } from "@/drizzle/constants";
import { WAR_TOKEN_REDUCTION_MULTIPLIER_AFTER_3_DAYS } from "@/drizzle/constants";
import { WAR_TOKEN_REDUCTION_MULTIPLIER_AFTER_7_DAYS } from "@/drizzle/constants";
import { WAR_VICTORY_TOKEN_BONUS } from "@/drizzle/constants";
import { VILLAGE_SYNDICATE_ID } from "@/drizzle/constants";
import { WAR_ALLY_OFFER_MIN } from "@/drizzle/constants";
import { WAR_SHRINE_IMAGE, WAR_SHRINE_HP } from "@/drizzle/constants";
import { WAR_PURCHASE_SHRINE_TOKEN_COST } from "@/drizzle/constants";
import { MAP_RESERVED_SECTORS } from "@/drizzle/constants";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { Village, VillageAlliance } from "@/drizzle/schema";
import type { UserWithRelations } from "@/server/api/routers/profile";
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
import type { FetchActiveWarsReturnType } from "@/server/api/routers/war";
import type { GlobalMapData } from "@/libs/travel/types";
import { useMap } from "@/hooks/map";
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

const GlobalMap = dynamic(() => import("@/layout/Map"), { ssr: false });

/**
 * Wars Component
 */
export const WarRoom: React.FC<{
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
export const WarMap: React.FC<{
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
  useMap(setGlobe);

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
        <GlobalMap
          intersection={true}
          highlights={villages}
          userLocation={true}
          showOwnership={true}
          onTileClick={(sector) => {
            console.log(canDeclareWar, userData?.village?.type);
            if (!canDeclareWar) {
              showMutationToast({ success: false, message: "You are not the leader" });
            } else {
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

export const SectorWar: React.FC<{
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

  const { mutate: adminEndWar } = api.war.adminEndWar.useMutation({
    onSuccess: async (data) => {
      showMutationToast(data);
      if (data.success) {
        await utils.war.getActiveWars.invalidate();
        await utils.war.getEndedWars.invalidate();
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
    <div className="border p-4 rounded-lg">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col items-center gap-2">
          <div className="w-full flex justify-end">
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
          <Image
            src={WAR_SHRINE_IMAGE}
            alt="War Shrine"
            width={200}
            height={200}
            className={war.shrineHp <= 0 ? "opacity-50 grayscale" : ""}
          />
          <div className="w-full max-w-md space-y-2">
            <div>
              <p className="text-sm font-medium">Shrine - Sector {war.sector}</p>
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
                      sector {war.sector} and engage in combat with the shrine directly.
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
                  <strong>Note:</strong> This shrine has been destroyed, and your
                  leaders can chose to build a new shrine to claim this sector. The cost
                  of building a new shrine is{" "}
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
                  You are about to build a shrine in sector {war.sector}. This will cost{" "}
                  {WAR_PURCHASE_SHRINE_TOKEN_COST.toLocaleString()} village tokens. Are
                  you sure?
                </p>
              </Confirm>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

/**
 * War Component
 */
export const VillageWar: React.FC<{
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
  const villagesThatCanJoin = villages?.filter((v) => {
    if (userVillage) {
      const { check } = canJoinWar(war, relationships ?? [], v, userVillage);
      return check;
    }
    return false;
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
              : war.attackerVillage?.name}{" "}
            - {capitalizeFirstLetter(war.type.replace("_", " "))}
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
          <h5 className="font-bold mb-2">
            Our Town Hall ({war.attackerVillage?.name})
          </h5>
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

        {/* Enemy Town Hall */}
        <div className="flex flex-col items-center justify-center">
          <h5 className="font-bold mb-2">
            Enemy Town Hall ({war.defenderVillage?.name})
          </h5>
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
      </div>

      {isKage && war.status === "ACTIVE" && war.type === "VILLAGE_WAR" && (
        <div className="mt-4">
          <h5 className="font-bold mb-2">Send War Alliance Offers</h5>
          <p className="text-sm text-muted-foreground mb-4">
            Send offers to factions or allied villages to join your war effort.
          </p>
          <div className="grid grid-cols-2 gap-2">
            {villagesThatCanJoin?.map((village) => (
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
export const FactionRoom: React.FC<{
  user: NonNullable<UserWithRelations>;
  navTabs?: React.ReactNode;
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
