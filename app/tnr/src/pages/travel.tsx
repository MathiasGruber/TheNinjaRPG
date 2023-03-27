import { useState, useEffect, useMemo } from "react";
import { type NextPage } from "next";

import Map from "../layout/Map";
import Sector from "../layout/Sector";
import ContentBox from "../layout/ContentBox";
import NavTabs from "../layout/NavTabs";
import Modal from "../layout/Modal";
import Countdown from "../layout/Countdown";

import { fetchMap } from "../libs/travel/map";
import { api } from "../utils/api";
import {
  isAtEdge,
  findNearestEdge,
  calcGlobalTravelTime,
} from "../libs/travel/controls";
import { useRequiredUser } from "../utils/UserContext";
import { type MapTile, type SectorPoint } from "../libs/travel/map";

const Travel: NextPage = () => {
  const [showModal, setShowModal] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<string>("");

  const [currentSector, setCurrentSector] = useState<number | null>(null);
  const [currentTile, setCurrentTile] = useState<MapTile | null>(null);
  const [currentPosition, setCurrentPosition] = useState<SectorPoint | null>(null);
  const [globe, setGlobe] = useState<Awaited<ReturnType<typeof fetchMap>> | null>(null);
  const [targetTile, setTargetTile] = useState<SectorPoint | null>(null);
  const [targetSector, setTargetSector] = useState<number | null>(null);

  const { data: userData, refetch: refetchUser } = useRequiredUser();
  const { data: villages } = api.village.getAll.useQuery(undefined);

  const sectorLink = currentSector
    ? currentPosition
      ? `You (${currentPosition.x}, ${currentPosition.y})`
      : `Sector ${currentSector}`
    : "";
  const onEdge = isAtEdge(currentPosition);

  void useMemo(async () => {
    setGlobe(await fetchMap());
  }, []);

  useEffect(() => {
    if (!currentSector && userData && globe) {
      setCurrentSector(userData.sector);
      setCurrentPosition({ x: userData.longitude, y: userData.latitude });
      setCurrentTile(globe.tiles[userData.sector] as MapTile);
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
        setCurrentTile(globe.tiles[data.sector] as MapTile);
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

  return (
    <ContentBox
      title="Travel"
      subtitle={
        currentSector && userData && activeTab === sectorLink
          ? `Sector ${currentSector}`
          : "The world of Seichi"
      }
      padding={false}
      topRightContent={
        <NavTabs
          current={activeTab}
          options={[sectorLink, "Global"]}
          setValue={setActiveTab}
        />
      }
    >
      {villages && globe && activeTab === "Global" && (
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
      {villages && currentSector && currentTile && activeTab !== "Global" && (
        <Sector
          tile={currentTile}
          sector={currentSector}
          target={targetTile}
          showVillage={villages.find((village) => village.sector == currentSector)}
          setTarget={setTargetTile}
          setPosition={setCurrentPosition}
        />
      )}
      {showModal && globe && userData && targetSector && (
        <Modal
          title="World Travel"
          setIsOpen={setShowModal}
          proceed_label={onEdge ? "Travel" : "Move to Edge"}
          isValid={false}
          onAccept={() => {
            if (!onEdge && currentPosition) {
              setTargetTile(findNearestEdge(currentPosition));
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
        <div className="absolute top-0 bottom-0 left-0 right-0 z-20 m-auto flex flex-col justify-center bg-black opacity-90">
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
  );
};

export default Travel;
