"use client";

import { useState, useEffect, useMemo } from "react";
import { useLocalStorage } from "@/hooks/localstorage";
import { useRouter } from "next/navigation";
import { z } from "zod";
import dynamic from "next/dynamic";
import Loader from "@/layout/Loader";
import ContentBox from "@/layout/ContentBox";
import NavTabs from "@/layout/NavTabs";
import Modal from "@/layout/Modal";
import Countdown from "@/layout/Countdown";
import Confirm from "@/layout/Confirm";
import LoadoutSelector from "@/layout/LoadoutSelector";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { UserRoundSearch, Globe2, Eye, EyeOff, GitMerge } from "lucide-react";
import { fetchMap } from "@/libs/travel/globe";
import { api } from "@/app/_trpc/client";
import { isAtEdge, findNearestEdge } from "@/libs/travel/controls";
import { calcGlobalTravelTime } from "@/libs/travel/controls";
import { useRequiredUserData } from "@/utils/UserContext";
import { showMutationToast } from "@/libs/toast";
import { hasRequiredRank } from "@/libs/train";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { calcIsInVillage } from "@/libs/travel/controls";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { VILLAGE_REDUCED_GAINS_DAYS } from "@/drizzle/constants";
import { VILLAGE_LEAVE_REQUIRED_RANK } from "@/drizzle/constants";
import type { GlobalTile, SectorPoint, GlobalMapData } from "@/libs/travel/types";

const Map = dynamic(() => import("@/layout/Map"), { ssr: false });
const Sector = dynamic(() => import("@/layout/Sector"), { ssr: false });

export default function Travel() {
  // What is shown on this page
  const [showActive, setShowActive] = useLocalStorage<boolean>("showActiveOnMap", true);
  const [showModal, setShowModal] = useState<boolean>(false);
  const [showSorrounding, setShowSorrounding] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<string>("");

  // Globe data
  const [globe, setGlobe] = useState<GlobalMapData | null>(null);

  // tRPC utility
  const utils = api.useUtils();

  // Current and target sectors & positions
  const [currentTile, setCurrentTile] = useState<GlobalTile | null>(null);
  const [hoverPosition, setHoverPosition] = useState<SectorPoint | null>(null);
  const [currentPosition, setCurrentPosition] = useState<SectorPoint | null>(null);
  const [targetPosition, setTargetPosition] = useState<SectorPoint | null>(null);
  const [targetSector, setTargetSector] = useState<number | null>(null);

  // Data from database
  const { data: userData, timeDiff, updateUser } = useRequiredUserData();
  const { data } = api.village.getAll.useQuery(undefined, {
    enabled: !!userData,
  });
  const villages = data?.filter((v) => {
    if (userData?.isOutlaw) {
      return true;
    } else {
      return ["VILLAGE", "SAFEZONE"].includes(v.type);
    }
  });
  const sectorVillage = villages?.find((v) => v.sector === userData?.sector);

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

  void useMemo(async () => {
    setGlobe(await fetchMap());
  }, []);

  // Selecting sector to highlight form
  const sectorSelect = z.object({
    sector: z.coerce.number().int().min(0).max(492).optional(),
  });
  const sectorForm = useForm<z.infer<typeof sectorSelect>>({
    mode: "all",
    resolver: zodResolver(sectorSelect),
  });
  const highlightedSector = sectorForm.watch("sector");

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
    if (atTarget && onEdge && targetSector && targetSector !== currentSector) {
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
          hoverPosition={hoverPosition}
          setShowSorrounding={setShowSorrounding}
          setTarget={setTargetPosition}
          setPosition={setCurrentPosition}
          setHoverPosition={setHoverPosition}
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

  // Derived
  const canJoin = hasRequiredRank(userData.rank, VILLAGE_LEAVE_REQUIRED_RANK);
  const inVillage = calcIsInVillage({ x: userData.longitude, y: userData.latitude });

  return (
    <>
      <ContentBox
        title="Travel"
        subtitle={
          currentSector && userData && activeTab === sectorLink
            ? `Sector ${currentSector}`
            : "The world of Seichi"
        }
        padding={false}
        topRightContent={
          <div className="flex flex-row items-center cursor-pointer">
            {activeTab === sectorLink && (
              <>
                {showActive ? (
                  <Eye
                    className={`h-7 w-7 mr-2 text-orange-500`}
                    onClick={() => setShowActive((prev) => !prev)}
                  />
                ) : (
                  <EyeOff
                    className={`h-7 w-7  mr-2`}
                    onClick={() => setShowActive((prev) => !prev)}
                  />
                )}
                <UserRoundSearch
                  className={`h-7 w-7 mr-2 hover:text-orange-500 ${showSorrounding ? "fill-orange-500" : ""}`}
                  onClick={() => setShowSorrounding((prev) => !prev)}
                />
              </>
            )}
            {activeTab === globalLink && (
              <Popover>
                <PopoverTrigger>
                  <Globe2 className={`h-7 w-7 mr-2 hover:text-orange-500`} />
                </PopoverTrigger>
                <PopoverContent>
                  <p className="py-2">
                    Select sector you wish to highlight on the global map.
                  </p>
                  <div className="flex flex-row items-center gap-2">
                    {highlightedSector ? <p>Currently selected sector:</p> : undefined}
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
            )}
            {userData.isOutlaw && canJoin && inVillage && sectorVillage && (
              <Confirm
                title="Join Village"
                proceed_label="Submit"
                button={<GitMerge className={`h-7 w-7 mx-1 hover:text-orange-500`} />}
                onAccept={() => joinVillage({ villageId: sectorVillage.id })}
              >
                Do you confirm that you wish to join this village? Please be aware that
                if you join this village your training benefits & regen will be reduced
                for {VILLAGE_REDUCED_GAINS_DAYS} days.
              </Confirm>
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
          <Modal
            title="World Travel"
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
          </Modal>
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
        {hoverPosition && (
          <>
            <p className="grow"></p>
            <p>
              Target: ({hoverPosition.x}, {hoverPosition.y})
            </p>
          </>
        )}
      </div>
    </>
  );
}
