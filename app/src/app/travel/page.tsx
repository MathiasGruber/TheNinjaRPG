"use client";

import { useState, useEffect, useMemo } from "react";
import { useLocalStorage } from "@/hooks/localstorage";
import { useRouter } from "next/navigation";
import { z } from "zod";
import dynamic from "next/dynamic";
import Loader from "@/layout/Loader";
import ContentBox from "@/layout/ContentBox";
import NavTabs from "@/layout/NavTabs";
import ItemWithEffects from "@/layout/ItemWithEffects";
import Modal2 from "@/layout/Modal2";
import Countdown from "@/layout/Countdown";
import Confirm2 from "@/layout/Confirm2";
import LoadoutSelector from "@/layout/LoadoutSelector";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  UserRoundSearch,
  Globe2,
  Eye,
  EyeOff,
  GitMerge,
  MapPinned,
  Cookie,
} from "lucide-react";
import { HousePlus } from "lucide-react";
import { api } from "@/app/_trpc/client";
import { ActionSelector } from "@/layout/CombatActions";
import { isAtEdge, findNearestEdge } from "@/libs/travel/controls";
import { calcGlobalTravelTime } from "@/libs/travel/controls";
import { useRequiredUserData } from "@/utils/UserContext";
import { showMutationToast } from "@/libs/toast";
import { hasRequiredRank } from "@/libs/train";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/ui/form";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { nonCombatConsume } from "@/libs/item";
import { useMap } from "@/hooks/map";
import { Input } from "@/components/ui/input";
import { HIDEOUT_COST } from "@/drizzle/constants";
import { VILLAGE_REDUCED_GAINS_DAYS } from "@/drizzle/constants";
import { VILLAGE_LEAVE_REQUIRED_RANK } from "@/drizzle/constants";
import type { GlobalTile, SectorPoint, GlobalMapData } from "@/libs/travel/types";
import { Button } from "@/components/ui/button";
import type { UserItemWithItem } from "@/drizzle/schema";

const Map = dynamic(() => import("@/layout/Map"), { ssr: false });
const Sector = dynamic(() => import("@/layout/Sector"), { ssr: false });

export default function Travel() {
  // What is shown on this page
  const [showActive, setShowActive] = useLocalStorage<boolean>("showActiveOnMap", true);
  const [showOwnership, setShowOwnership] = useLocalStorage<boolean>(
    "showOwnership",
    false,
  );
  const [showModal, setShowModal] = useState<boolean>(false);
  const [showSorrounding, setShowSorrounding] = useState<boolean>(false);

  const [activeTab, setActiveTab] = useState<string>("");

  // Globe data
  const [globe, setGlobe] = useState<GlobalMapData | null>(null);

  // tRPC utility
  const utils = api.useUtils();

  // Current and target sectors & positions
  const [currentTile, setCurrentTile] = useState<GlobalTile | null>(null);
  const [currentPosition, setCurrentPosition] = useState<SectorPoint | null>(null);
  const [targetPosition, setTargetPosition] = useState<SectorPoint | null>(null);
  const [targetSector, setTargetSector] = useState<number | null>(null);

  // Data from database
  const { data: userData, timeDiff, updateUser } = useRequiredUserData();
  const { data: villageData } = api.village.getAll.useQuery(undefined, {
    enabled: !!userData,
  });
  const { data: sectorData } = api.travel.getSectorData.useQuery(
    { sector: userData?.sector || -1 },
    { enabled: !!userData },
  );
  const villages = villageData?.filter((v) => {
    if (userData?.isOutlaw) {
      return true;
    } else {
      return ["VILLAGE", "SAFEZONE"].includes(v.type);
    }
  });
  const sectorVillage = villages?.find((v) => v.sector === userData?.sector);

  // Consumable items
  const { data: userItems } = api.item.getUserItems.useQuery(undefined, {
    enabled: !!userData,
  });
  const [useritem, setUserItem] = useState<UserItemWithItem | undefined>(undefined);
  const [isOpen, setIsOpen] = useState<boolean>(false);

  // Router for forwarding
  const router = useRouter();

  // Sector tab link
  const currentSector = userData?.sector;
  const sectorLink = currentSector
    ? currentPosition
      ? `You (${currentPosition.x}, ${currentPosition.y})`
      : `Sector ${currentSector}`
    : "";
  const globalLink = `Global (${currentSector})`;

  useMap(setGlobe);

  // Selecting sector to highlight form
  const sectorSelect = z.object({
    sector: z.coerce.number().int().min(0).max(492).optional(),
  });
  const sectorForm = useForm<z.infer<typeof sectorSelect>>({
    mode: "all",
    resolver: zodResolver(sectorSelect),
  });
  const highlightedSector = useWatch({
    control: sectorForm.control,
    name: "sector",
  });

  useEffect(() => {
    if (userData && globe) {
      setCurrentPosition({ x: userData.longitude, y: userData.latitude });
      setCurrentTile(globe.tiles[userData.sector]!);
    }
  }, [userData, currentSector, globe]);

  useEffect(() => {
    setActiveTab(sectorLink);
  }, [sectorLink]);

  useEffect(() => {
    if (userData?.status === "BATTLE") {
      void router.push(`/combat`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userData?.status]);

  const { mutate: startGlobalMove, isPending: isStartingTravel } =
    api.travel.startGlobalMove.useMutation({
      onSuccess: async (result) => {
        showMutationToast(result);
        if (result.success && result.data) {
          await updateUser(result.data);
          setShowModal(false);
          setActiveTab(globalLink);
          if (globe) {
            setCurrentTile(globe.tiles[result.data.sector]!);
          }
        }
      },
    });

  const { mutate: finishGlobalMove, isPending: isFinishingTravel } =
    api.travel.finishGlobalMove.useMutation({
      onSuccess: async (result) => {
        showMutationToast(result);
        if (result.success) {
          await updateUser({ status: "AWAKE", travelFinishAt: null });
          setActiveTab(sectorLink);
        }
      },
    });

  const { mutate: joinVillage, isPending: isJoining } =
    api.village.joinVillage.useMutation({
      onSuccess: async (data) => {
        showMutationToast(data);
        if (data.success) {
          await utils.profile.getUser.invalidate();
        }
      },
    });

  const { mutate: purchaseHideout, isPending: isCreatingHideout } =
    api.clan.purchaseHideout.useMutation({
      onSuccess: async (data) => {
        showMutationToast(data);
        if (data.success) {
          await Promise.all([
            utils.village.getAll.invalidate(),
            utils.profile.getUser.invalidate(),
            utils.travel.getSectorData.invalidate(),
          ]);
        }
      },
    });

  const { mutate: consume, isPending: isConsuming } = api.item.consume.useMutation({
    onSuccess: async (data) => {
      showMutationToast(data);
      if (data.success) {
        await utils.profile.getUser.invalidate();
        await utils.item.getUserItems.invalidate();
        await utils.bloodline.getItemRolls.invalidate();
      }
    },
    onSettled: () => {
      setIsOpen(false);
      setUserItem(undefined);
    },
  });

  // Convenience variables
  const onEdge = isAtEdge(currentPosition);
  const isGlobal = activeTab === globalLink;
  const showGlobal = villages && globe && isGlobal;
  const showSector = villages && currentSector && currentTile && !isGlobal;

  useEffect(() => {
    const atTarget =
      currentPosition &&
      targetPosition &&
      currentPosition.x === targetPosition.x &&
      currentPosition.y === targetPosition.y;
    if (
      atTarget &&
      onEdge &&
      targetSector &&
      targetSector !== currentSector &&
      !isStartingTravel
    ) {
      startGlobalMove({ sector: targetSector });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPosition]);

  // Battle scene
  const SectorComponent = useMemo(() => {
    return (
      userData &&
      currentTile &&
      currentSector && (
        <Sector
          tile={currentTile}
          sector={currentSector}
          target={targetPosition}
          showSorrounding={showSorrounding}
          showActive={showActive}
          setShowSorrounding={setShowSorrounding}
          setTarget={setTargetPosition}
          setPosition={setCurrentPosition}
        />
      )
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    currentTile,
    currentSector,
    targetPosition,
    showSorrounding,
    showActive,
    villages,
  ]);

  if (!userData) return <Loader explanation="Loading userdata" />;
  if (isJoining) return <Loader explanation="Joining village" />;
  if (isCreatingHideout) return <Loader explanation="Purchasing hideout" />;

  // Derived
  const loadedVillages = villages && villages.length > 0;
  const isOutlaw = userData.isOutlaw;
  const canJoin = hasRequiredRank(userData.rank, VILLAGE_LEAVE_REQUIRED_RANK);
  const clanLeader = userData.clan?.leaderId === userData.userId;
  const hadHideout = userData?.village?.type !== "OUTLAW" && userData.isOutlaw;
  const canAffordHideout = (userData?.clan?.bank || 0) >= HIDEOUT_COST;
  const canCreateHideout =
    isOutlaw && !sectorVillage && clanLeader && !hadHideout && loadedVillages;
  const joinVillageBtn = userData.isOutlaw && canJoin && sectorVillage?.joinable;
  const subtitle =
    currentSector && userData && activeTab === sectorLink
      ? `Sector ${currentSector} ${sectorData?.sectorData?.village ? `(${sectorData.sectorData.village.name})` : ""}`
      : "The world of Seichi";
  const consumableItems = userItems?.filter((i) => nonCombatConsume(i.item, userData));
  const shownConsumables = consumableItems?.map((ui) => ({ ...ui.item, ...ui }));
  return (
    <>
      <ContentBox
        title="Travel"
        subtitle={subtitle}
        padding={false}
        topRightContent={
          <div className="flex flex-row items-center cursor-pointer">
            {activeTab === sectorLink && (
              <>
                {showActive ? (
                  <Eye
                    className={`h-7 w-7 mr-2 text-orange-500`}
                    onClick={() => setShowActive(false)}
                  />
                ) : (
                  <EyeOff
                    className={`h-7 w-7  mr-2`}
                    onClick={() => setShowActive(true)}
                  />
                )}
                <UserRoundSearch
                  className={`h-7 w-7 mr-2 hover:text-orange-500 ${showSorrounding ? "fill-orange-500" : ""}`}
                  onClick={() => setShowSorrounding((prev) => !prev)}
                />
              </>
            )}
            {activeTab === globalLink && (
              <>
                <Popover>
                  <PopoverTrigger>
                    <Globe2 className={`h-7 w-7 mr-2 hover:text-orange-500`} />
                  </PopoverTrigger>
                  <PopoverContent>
                    <p className="py-2">
                      Select sector you wish to highlight on the global map.
                    </p>
                    <div className="flex flex-row items-center gap-2">
                      {highlightedSector ? (
                        <p>Currently selected sector:</p>
                      ) : undefined}
                      <Form {...sectorForm}>
                        <FormField
                          control={sectorForm.control}
                          name="sector"
                          render={({ field }) => (
                            <FormItem>
                              <FormControl>
                                <Input
                                  className="w-full"
                                  placeholder="Sector Highlight"
                                  type="number"
                                  {...field}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </Form>
                    </div>
                  </PopoverContent>
                </Popover>
                <TooltipProvider delayDuration={50}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <MapPinned
                        className={`h-7 w-7 mr-2 ${showOwnership ? "text-orange-500" : ""}`}
                        onClick={() => setShowOwnership(!showOwnership)}
                      />
                    </TooltipTrigger>
                    <TooltipContent>Show sector ownerships and factions</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </>
            )}
            {joinVillageBtn && (
              <Confirm2
                title={`Join Village [${sectorVillage.name}]`}
                proceed_label="Submit"
                button={<GitMerge className={`h-7 w-7 mx-1 hover:text-orange-500`} />}
                onAccept={() => joinVillage({ villageId: sectorVillage.id })}
              >
                Do you confirm that you wish to join {sectorVillage.name}? Please be
                aware that if you join this village your training benefits & regen will
                be reduced for {VILLAGE_REDUCED_GAINS_DAYS} days.
              </Confirm2>
            )}
            {canCreateHideout && (
              <Confirm2
                title="Purchase Hideout"
                proceed_label={canAffordHideout ? "Submit" : "Not enough ryo"}
                button={<HousePlus className={`h-7 w-7 mx-1 hover:text-orange-500`} />}
                onAccept={() => {
                  if (canAffordHideout) {
                    purchaseHideout({
                      clanId: userData.clanId || "",
                      sector: currentSector || 0,
                    });
                  }
                }}
              >
                As a leader of a faction, you have the option of founding a hideout for
                your faction, thereby effectively de-coupling yourself from the common
                syndicate of outlaws. The purchase costs <b>{HIDEOUT_COST} ryo</b>, and
                the faction currently has <b>{userData?.clan?.bank} ryo</b>. Do you want
                to create your faction hideout in this sector?
              </Confirm2>
            )}

            <NavTabs
              current={activeTab}
              options={[sectorLink, globalLink]}
              setValue={setActiveTab}
            />
          </div>
        }
      >
        {showGlobal && (
          <Map
            intersection={true}
            highlights={villages}
            userLocation={true}
            highlightedSector={highlightedSector}
            showOwnership={showOwnership}
            onTileClick={(sector) => {
              setTargetSector(sector);
              setShowModal(true);
            }}
            hexasphere={globe}
          />
        )}
        {showSector && SectorComponent}
        {!villages && <Loader explanation="Loading data" />}
        {showModal && globe && userData && targetSector && (
          <Modal2
            title="World Travel"
            isOpen={showModal}
            setIsOpen={setShowModal}
            proceed_label={!isStartingTravel ? "Travel" : undefined}
            isValid={false}
            onAccept={() => {
              if (!onEdge && currentPosition) {
                setShowModal(false);
                setTargetPosition(findNearestEdge(currentPosition));
                setActiveTab(sectorLink);
              } else {
                startGlobalMove({ sector: targetSector });
              }
            }}
          >
            {isStartingTravel && <Loader explanation="Preparing to Travel" />}
            {!isStartingTravel && (
              <div>
                You are about to move from sector {userData.sector} to {targetSector}.{" "}
                <p className="py-2">
                  The travel time is estimated to be{" "}
                  {calcGlobalTravelTime(userData.sector, targetSector, globe)} seconds.
                </p>
                <p className="py-2">
                  Your character will first have to move to the edge of his current
                  sector.
                </p>
                <p className="pb-2">
                  Current location: {currentPosition?.x}, {currentPosition?.y}
                </p>
                Do you confirm?
              </div>
            )}
          </Modal2>
        )}
        {userData?.travelFinishAt && (
          <div className="absolute bottom-0 left-0 right-0 top-0 z-20 m-auto flex flex-col justify-center bg-black opacity-90">
            <div className="m-auto text-center text-white">
              <p className="p-5  text-3xl">Traveling to Sector {userData?.sector}</p>
              <p className="text-5xl">
                Time Left:{" "}
                <Countdown
                  targetDate={userData?.travelFinishAt}
                  timeDiff={timeDiff}
                  onFinish={() => {
                    if (!isFinishingTravel) finishGlobalMove();
                  }}
                />
              </p>
            </div>
          </div>
        )}
      </ContentBox>
      <div className="flex flex-row p-1">
        {showSector && <LoadoutSelector size="small" />}
      </div>
      {shownConsumables && shownConsumables.length > 0 && (
        <div className="flex flex-col">
          <p className="font-bold">Consumables</p>
          <ActionSelector
            className="grid-cols-6"
            items={shownConsumables}
            counts={shownConsumables}
            selectedId={useritem?.id}
            showBgColor={false}
            showLabels={false}
            onClick={(id) => {
              if (id == useritem?.id) {
                setUserItem(undefined);
                setIsOpen(false);
              } else {
                setUserItem(shownConsumables?.find((item) => item.id === id));
                setIsOpen(true);
              }
            }}
          />
          {isOpen && useritem && (
            <Modal2
              title="Item Details"
              isOpen={isOpen}
              setIsOpen={setIsOpen}
              isValid={false}
            >
              <ItemWithEffects
                item={useritem.item}
                key={useritem.id}
                showStatistic="item"
              />
              {!isConsuming && (
                <div className="flex flex-row gap-1">
                  {nonCombatConsume(useritem.item, userData) && (
                    <Button
                      variant="info"
                      onClick={() => consume({ userItemId: useritem.id })}
                    >
                      <Cookie className="mr-2 h-5 w-5" />
                      Consume
                    </Button>
                  )}
                </div>
              )}
              {isConsuming && <Loader explanation={`Using ${useritem.item.name}`} />}
            </Modal2>
          )}
        </div>
      )}
    </>
  );
}
