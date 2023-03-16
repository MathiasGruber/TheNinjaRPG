import { useState } from "react";
import { type NextPage } from "next";

import Map, { type Tile } from "../layout/Map";
import ContentBox from "../layout/ContentBox";
import NavTabs from "../layout/NavTabs";

import { api } from "../utils/api";

const Travel: NextPage = () => {
  const [activeTab, setActiveTab] = useState<string>("Global");
  const { data: villages } = api.village.getAll.useQuery(undefined);

  return (
    <ContentBox
      title="Travel"
      subtitle="The world of Seichi"
      topRightContent={
        <NavTabs
          current={activeTab}
          options={["Global", `Your Location`]}
          setValue={setActiveTab}
        />
      }
    >
      {villages && activeTab === "Global" && (
        <Map intersection={true} highlights={villages} />
      )}
    </ContentBox>
  );
};

export default Travel;
