import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/router";
import { type NextPage } from "next";
import { MagnifyingGlassCircleIcon } from "@heroicons/react/24/solid";

import Loader from "../layout/Loader";
import Map from "../layout/Map";
import Sector from "../layout/Sector";
import ContentBox from "../layout/ContentBox";
import NavTabs from "../layout/NavTabs";
import Modal from "../layout/Modal";
import Countdown from "../layout/Countdown";

import { fetchMap } from "../libs/travel/globe";
import { api } from "../utils/api";
import {
  isAtEdge,
  findNearestEdge,
  calcGlobalTravelTime,
} from "../libs/travel/controls";
import { useRequiredUserData } from "../utils/UserContext";
import { type GlobalTile, type SectorPoint } from "../libs/travel/types";
import { UserStatus } from "@prisma/client";

const Travel: NextPage = () => {
  // What is shown on this page
  const [showModal, setShowModal] = useState<boolean>(false);
  const [showSorrounding, setShowSorrounding] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<string>("");

  // Globe data
  const [globe, setGlobe] = useState<Awaited<ReturnType<typeof fetchMap>> | null>(null);

  // Current and target sectors & positions
  const [currentSector, setCurrentSector] = useState<number | null>(null);
  const [currentTile, setCurrentTile] = useState<GlobalTile | null>(null);
  const [currentPosition, setCurrentPosition] = useState<SectorPoint | null>(null);
  const [targetPosition, setTargetPosition] = useState<SectorPoint | null>(null);
  const [targetSector, setTargetSector] = useState<number | null>(null);

  // Data from database
  const { data: userData, refetch: refetchUser } = useRequiredUserData();
  const { data: villages } = api.village.getAll.useQuery(undefined, {
    staleTime: Infinity,
  });

  // Router for forwarding
  const router = useRouter();
  if (userData && userData.status === UserStatus.BATTLE) {
    void router.push(`/combat`);
  }

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

  const { mutate: startGlobalMove } = api.travel.startGlobalMove.useMutation({
    onSuccess: async (data) => {
      await refetchUser();
      setShowModal(false);
      setActiveTab("Global");
      setCurrentSector(data.sector);
      if (globe) {
        setCurrentTile(globe.tiles[data.sector] as GlobalTile);
      }
    },
    onError: (error) => {
      console.error("Error travelling", error);
    },
  });

  const { mutate: finishGlobalMove } = api.travel.finishGlobalMove.useMutation({
    onSuccess: async () => {
      await refetchUser();
      setActiveTab(sectorLink);
    },
    onError: (error) => {
      console.error("Error travelling", error);
    },
  });

  // Convenience variables
  const onEdge = isAtEdge(currentPosition);
  const isGlobal = activeTab === "Global";
  const showGlobal = villages && globe && isGlobal;
  const showSector = villages && currentSector && currentTile && !isGlobal;

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
              <MagnifyingGlassCircleIcon
                className={`h-5 w-5 ${showSorrounding ? "fill-orange-500" : ""}`}
                onClick={() => setShowSorrounding((prev) => !prev)}
              />
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
        {showSector && (
          <Sector
            tile={currentTile}
            sector={currentSector}
            target={targetPosition}
            showVillage={villages.find((village) => village.sector == currentSector)}
            showSorrounding={showSorrounding}
            setShowSorrounding={setShowSorrounding}
            setTarget={setTargetPosition}
            setPosition={setCurrentPosition}
          />
        )}
        {!villages && <Loader explanation="Loading data" />}
        {showModal && globe && userData && targetSector && (
          <Modal
            title="World Travel"
            setIsOpen={setShowModal}
            proceed_label={onEdge ? "Travel" : "Move to Edge"}
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
            <div>
              You are about to move from sector {userData.sector} to {targetSector}.{" "}
              {onEdge ? (
                <p className="py-2">
                  The travel time is estimated to be{" "}
                  {calcGlobalTravelTime(userData.sector, targetSector, globe)} seconds.
                </p>
              ) : (
                <p className="py-2">
                  Your character will first have to move to the edge of his current
                  sector.
                </p>
              )}{" "}
              Do you confirm?
            </div>
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
                    userData.travelFinishAt = null;
                    finishGlobalMove();
                  }}
                />
              </p>
            </div>
          </div>
        )}
      </ContentBox>
      {showSector && <p>Movement Hotkeys: Q-W-E-A-S-D</p>}
    </>
  );
};

export default Travel;
