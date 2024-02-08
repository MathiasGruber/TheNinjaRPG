import { useState } from "react";
import { type NextPage } from "next";
import ContentBox from "@/layout/ContentBox";
import WidgetBot from "@widgetbot/react-embed";
import Loader from "@/layout/Loader";
import NavTabs from "@/layout/NavTabs";
import Conversation from "@/layout/Conversation";
import { useRequiredUserData } from "@/utils/UserContext";
import { capitalizeFirstLetter } from "@/utils/sanitize";

const Tavern: NextPage = () => {
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const { data: userData } = useRequiredUserData();
  const localTavern = userData?.village ? userData?.village?.name : "Syndicate";

  if (!userData) return <Loader explanation="Loading userdata" />;

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
