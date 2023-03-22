import { useState, useEffect, useMemo } from "react";
import { type NextPage } from "next";

import Map from "../layout/Map";
import Sector from "../layout/Sector";
import ContentBox from "../layout/ContentBox";
import NavTabs from "../layout/NavTabs";

import { fetchMap } from "../libs/travel/map";
import { api } from "../utils/api";
import { useRequiredUser } from "../utils/UserContext";
import { type MapTile } from "../libs/travel/map";

const Travel: NextPage = () => {
  const [activeTab, setActiveTab] = useState<string>("");
  const [sector, setSector] = useState<number | null>(null);
  const [tile, setTile] = useState<MapTile | null>(null);
  const [map, setMap] = useState<Awaited<ReturnType<typeof fetchMap>> | null>(null);
  const [position, setPosition] = useState<[number, number] | null>(null);

  const { data: userData } = useRequiredUser();
  const { data: villages } = api.village.getAll.useQuery(undefined);

  void useMemo(async () => {
    setMap(await fetchMap());
  }, []);

  useEffect(() => {
    if (!sector && userData && map) {
      setSector(userData.sector);
      setPosition([userData.longitude, userData.latitude]);
      setTile(map.tiles[userData.sector] as MapTile);
    }
  }, [userData, sector, map]);

  const sectorLink = sector
    ? position
      ? `You (${position.join(", ")})`
      : `Sector ${sector}`
    : "";

  useEffect(() => {
    setActiveTab(sectorLink);
  }, [sectorLink]);

  return (
    <ContentBox
      title="Travel"
      subtitle={
        sector && userData && activeTab === sectorLink
          ? `Sector ${sector}`
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
      {villages && map && activeTab === "Global" && (
        <Map
          intersection={true}
          highlights={villages}
          onTileClick={(sector, tile) => {
            setSector(sector);
            setTile(tile);
          }}
          hexasphere={map}
        />
      )}
      {sector && tile && activeTab !== "Global" && (
        <Sector tile={tile} sector={sector} setPosition={setPosition} />
      )}
    </ContentBox>
  );
};

export default Travel;
