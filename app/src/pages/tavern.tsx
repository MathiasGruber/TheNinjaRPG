import { useState } from "react";
import { type NextPage } from "next";
import ContentBox from "@/layout/ContentBox";
import WidgetBot from "@widgetbot/react-embed";
import Loader from "@/layout/Loader";
import NavTabs from "@/layout/NavTabs";

import { useRequiredUserData } from "@/utils/UserContext";
import { capitalizeFirstLetter } from "@/utils/sanitize";

const Tavern: NextPage = () => {
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const { data: userData } = useRequiredUserData();
  const localTavern = userData?.village ? userData?.village?.name : "Syndicate";

  if (!userData) return <Loader explanation="Loading userdata" />;

  const villageChannel = getDiscordChannel(localTavern);

  const navTabs = (
    <NavTabs
      id="selected-tavern-tab"
      current={activeTab}
      options={["Global", localTavern]}
      setValue={setActiveTab}
    />
  );

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
        channel={activeTab === "Global" ? "1080832341821370399" : villageChannel}
        height={600}
        shard="https://emerald.widgetbot.io"
      />
    </ContentBox>
  );

  // BACKUP: Tavern based on conversation component
  // return (
  //   <Conversation
  //     refreshKey={0}
  //     convo_title={activeTab}
  //     title={activeTab + " Tavern"}
  //     subtitle={
  //       activeTab === "Global"
  //         ? "Broadcast across all villages"
  //         : "Chat with your fellow villagers"
  //     }
  //     chatbox_options={
  //       <>
  //         <div className="grow"></div>
  //         {navTabs}
  //       </>
  //     }
  //   />
  // );
};

export default Tavern;

const getDiscordChannel = (village: string) => {
  switch (village) {
    case "Konoki":
      return "1204394868382892032";
    case "Shine":
      return "1204394934535454741";
    case "Glacier":
      return "1204394969633390602";
    case "Current":
      return "1204395016546553906";
    case "Shroud":
      return "1204395049648005152";
    case "Silence":
      return "1204395082493595678";
    default:
      return "1204414240585289809";
  }
};
