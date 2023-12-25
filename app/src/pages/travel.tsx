import { useState, useEffect, useMemo } from "react";
import { useSafePush } from "@/utils/routing";
import dynamic from "next/dynamic";
import Loader from "@/layout/Loader";
import ContentBox from "@/layout/ContentBox";
import NavTabs from "@/layout/NavTabs";
import Modal from "@/layout/Modal";
import Countdown from "@/layout/Countdown";
import { MagnifyingGlassCircleIcon } from "@heroicons/react/24/solid";
import { EyeIcon } from "@heroicons/react/24/solid";
import { EyeSlashIcon } from "@heroicons/react/24/solid";
import { fetchMap } from "@/libs/travel/globe";
import { api } from "@/utils/api";
import { getUserQuests, isLocationObjective } from "@/libs/quest";
import { isAtEdge, findNearestEdge } from "@/libs/travel/controls";
import { calcGlobalTravelTime } from "@/libs/travel/controls";
import { useRequiredUserData } from "@/utils/UserContext";
import { show_toast } from "@/libs/toast";
import type { NextPage } from "next";
import type { GlobalTile, SectorPoint, GlobalMapData } from "@/libs/travel/types";

const Map = dynamic(() => import("../layout/Map"), { ssr: false });
const Sector = dynamic(() => import("../layout/Sector"), { ssr: false });

const Travel: NextPage = () => {
  // What is shown on this page
  const [showActive, setShowActive] = useState<boolean>(true);
  const [showModal, setShowModal] = useState<boolean>(false);
  const [showSorrounding, setShowSorrounding] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<string>("");

  // Globe data
  const [globe, setGlobe] = useState<GlobalMapData | null>(null);

  // Current and target sectors & positions
  const [currentSector, setCurrentSector] = useState<number | null>(null);
  const [currentTile, setCurrentTile] = useState<GlobalTile | null>(null);
  const [hoverPosition, setHoverPosition] = useState<SectorPoint | null>(null);
  const [currentPosition, setCurrentPosition] = useState<SectorPoint | null>(null);
  const [targetPosition, setTargetPosition] = useState<SectorPoint | null>(null);
  const [targetSector, setTargetSector] = useState<number | null>(null);

  // Data from database
  const { data: userData, refetch: refetchUser } = useRequiredUserData();
  const { data: villages } = api.village.getAll.useQuery(undefined, {
    staleTime: Infinity,
    enabled: userData !== undefined,
  });

  // Router for forwarding
  const router = useSafePush();

  // Sector tab link
  const sectorLink = currentSector
    ? currentPosition
      ? `You (${currentPosition.x}, ${currentPosition.y})`
      : `Sector ${currentSector}`
    : "";

  void useMemo(async () => {
    setGlobe(await fetchMap());
  }, []);

  useEffect(() => {
    if (!currentSector && userData && globe) {
      setCurrentSector(userData.sector);
      setCurrentPosition({ x: userData.longitude, y: userData.latitude });
      setCurrentTile(globe.tiles[userData.sector] as GlobalTile);
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

  const { mutate: startGlobalMove, isLoading: isStartingTravel } =
    api.travel.startGlobalMove.useMutation({
      onSuccess: async (data) => {
        if (data.success && data.sector) {
          await refetchUser();
          setShowModal(false);
          setActiveTab("Global");
          setCurrentSector(data.sector);
          if (globe) {
            setCurrentTile(globe.tiles[data.sector] as GlobalTile);
          }
        } else {
          show_toast("Error travelling", data.message, "error");
        }
      },
      onError: (error) => {
        show_toast("Error travelling", error.message, "error");
        console.error("Error travelling", error);
      },
    });

  const { mutate: finishGlobalMove, isLoading: isFinishingTravel } =
    api.travel.finishGlobalMove.useMutation({
      onSuccess: async (data) => {
        if (data.success) {
          await refetchUser();
          setActiveTab(sectorLink);
        } else {
          show_toast("Error travelling", data.message, "error");
        }
      },
      onError: (error) => {
        show_toast("Error travelling", error.message, "error");
        console.error("Error travelling", error);
      },
    });

  const { mutate: checkQuest } = api.quests.checkLocationQuest.useMutation({
    onSuccess: async (data) => {
      if (data.success) {
        data.notifications.forEach((notification) => {
          show_toast("Quest Update", notification, "info");
        });
        await refetchUser();
      }
    },
    onError: (error) => {
      show_toast("Quest Error", error.message, "error");
    },
  });

  useEffect(() => {
    if (userData && currentSector && currentPosition) {
      getUserQuests(userData).forEach((quest) => {
        quest.content.objectives.forEach((objective) => {
          // If an objective is a location objective, then check quest
          if (
            isLocationObjective(
              {
                sector: currentSector,
                latitude: currentPosition.y,
                longitude: currentPosition.x,
              },
              objective
            )
          ) {
            checkQuest();
          } else if (objective.attackers.length > 0 && objective.attackers_chance > 0) {
            // If an objective is an attacker objective, then check quest, which will also check for attacks
            checkQuest();
          }
        });
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPosition]);

  // Convenience variables
  const onEdge = isAtEdge(currentPosition);
  const isGlobal = activeTab === "Global";
  const showGlobal = villages && globe && isGlobal;
  const showSector = villages && currentSector && currentTile && !isGlobal;

  // Battle scene
  const SectorComponent = useMemo(() => {
    return (
      currentTile &&
      currentSector && (
        <Sector
          tile={currentTile}
          sector={currentSector}
          target={targetPosition}
          showVillage={villages?.find((village) => village.sector === currentSector)}
          showSorrounding={showSorrounding}
          showActive={showActive}
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
          <div className="flex flex-row items-center">
            {activeTab === sectorLink && (
              <>
                {showActive ? (
                  <EyeIcon
                    className={`h-7 w-7 fill-orange-500`}
                    onClick={() => setShowActive((prev) => !prev)}
                  />
                ) : (
                  <EyeSlashIcon
                    className={`h-7 w-7`}
                    onClick={() => setShowActive((prev) => !prev)}
                  />
                )}
                <div className="px-1"></div>
                <MagnifyingGlassCircleIcon
                  className={`h-7 w-7 ${showSorrounding ? "fill-orange-500" : ""}`}
                  onClick={() => setShowSorrounding((prev) => !prev)}
                />
              </>
            )}
            <NavTabs
              current={activeTab}
              options={[sectorLink, "Global"]}
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
            proceed_label={
              !isStartingTravel ? (onEdge ? "Travel" : "Move to Edge") : undefined
            }
            isValid={false}
            onAccept={() => {
              if (!onEdge && currentPosition) {
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
                {onEdge ? (
                  <p className="py-2">
                    The travel time is estimated to be{" "}
                    {calcGlobalTravelTime(userData.sector, targetSector, globe)}{" "}
                    seconds.
                  </p>
                ) : (
                  <>
                    <p className="py-2">
                      Your character will first have to move to the edge of his current
                      sector.
                    </p>
                    <p className="pb-2">
                      Current location: {currentPosition?.x}, {currentPosition?.y}
                    </p>
                  </>
                )}{" "}
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
                  onFinish={() => {
                    if (!isFinishingTravel) finishGlobalMove();
                  }}
                />
              </p>
            </div>
          </div>
        )}
      </ContentBox>
      <div className="flex flex-row">
        {showSector && <p>Movement Hotkeys: Q-W-E-A-S-D</p>}
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
};

export default Travel;
