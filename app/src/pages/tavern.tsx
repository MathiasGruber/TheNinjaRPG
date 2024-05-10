import { useState, useEffect } from "react";
import { type NextPage } from "next";
import ContentBox from "@/layout/ContentBox";
import WidgetBot from "@widgetbot/react-embed";
import Loader from "@/layout/Loader";
import NavTabs from "@/layout/NavTabs";
import Conversation from "@/layout/Conversation";
import BanInfo from "@/layout/BanInfo";
import { api } from "@/utils/api";
import { findVillageUserRelationship } from "@/utils/alliance";
import { useRequiredUserData } from "@/utils/UserContext";
import { capitalizeFirstLetter } from "@/utils/sanitize";

const Tavern: NextPage = () => {
  // State
  const [activeTab, setActiveTab] = useState<string | null>(null);

  // Data
  const { data: userData } = useRequiredUserData();
  const { data: sectorVillage, isPending } = api.travel.getVillageInSector.useQuery(
    { sector: userData?.sector ?? -1, isOutlaw: userData?.isOutlaw ?? false },
    { enabled: !!userData, staleTime: Infinity },
  );

  // Tavern name based on user village
  let localTavern = userData?.village ? userData?.village?.name : "Syndicate";

  // Change to ally tavern if relevant
  if (sectorVillage && userData) {
    const relationship = findVillageUserRelationship(
      sectorVillage,
      userData.villageId ?? "syndicate",
    );
    if (relationship?.status === "ALLY") {
      localTavern = sectorVillage.name;
    }
  }

  useEffect(() => {
    if (activeTab && !["Global", localTavern, "Discord"].includes(activeTab)) {
      setActiveTab("Global");
    }
  }, [activeTab, localTavern]);

  if (!userData) return <Loader explanation="Loading userdata" />;
  if (userData.isBanned) return <BanInfo />;
  if (isPending) return <Loader explanation="Getting sector information" />;

  const navTabs = (
    <NavTabs
      id="selected-tavern-tab"
      current={activeTab}
      options={["Global", localTavern, "Discord"]}
      setValue={setActiveTab}
    />
  );

  if (activeTab === "Discord") {
    return (
      <ContentBox
        title={"Tavern"}
        subtitle={activeTab + " Tavern"}
        padding={false}
        noBorder={true}
        topRightContent={navTabs}
      >
        <WidgetBot
          className="w-full min-h-96"
          username={`${userData.username} - lvl. ${userData.level} ${capitalizeFirstLetter(userData.rank)}`}
          avatar={userData.avatar ?? undefined}
          server="1080832341234159667"
          channel="1080832341821370399"
          height={600}
          shard="https://emerald.widgetbot.io"
        />
      </ContentBox>
    );
  } else {
    const conversation = activeTab ?? "Global";
    return (
      <Conversation
        refreshKey={0}
        convo_title={conversation}
        title={conversation + " Tavern"}
        initialBreak={false}
        subtitle={conversation === "Global" ? "Global chat" : "Village chat"}
        topRightContent={navTabs}
      />
    );
  }
};

export default Tavern;
