import { useState, useMemo } from "react";
import dynamic from "next/dynamic";
import ContentBox from "../../layout/ContentBox";
import { SECTOR_HEIGHT, SECTOR_WIDTH } from "../../libs/travel/constants";
import { fetchMap } from "../../libs/travel/globe";
import { api } from "../../utils/api";
import type { NextPage } from "next";

const Map = dynamic(() => import("../../layout/Map"), {
  ssr: false,
});

const ManualTravel: NextPage = () => {
  const [map, setMap] = useState<Awaited<ReturnType<typeof fetchMap>> | null>(null);
  void useMemo(async () => {
    setMap(await fetchMap());
  }, []);
  const { data: villages } = api.village.getAll.useQuery(undefined);

  return (
    <>
      <ContentBox title="Travel" subtitle="Navigating the world" back_href="/manual">
        The world of Seichi is a vast and dangerous place. To navigate it, there are two
        levels of travel in this game; global travel and sector travel. Global travel
        shows you the entire planet segregated into so-called &quot;sectors&quot;. When
        viewing one of these sectors, you will see a {SECTOR_HEIGHT} times{" "}
        {SECTOR_WIDTH} hexagonal grid. You should think of this grid as a small section
        of that sector, in which your character can move, explore and interact with
        other players.
        {villages && map && (
          <Map intersection={false} highlights={villages} hexasphere={map} />
        )}
      </ContentBox>
    </>
  );
};

export default ManualTravel;
