import { useState } from "react";
import { type NextPage } from "next";
import Loader from "../layout/Loader";
import Conversation from "../layout/Conversation";
import NavTabs from "../layout/NavTabs";

import { useRequiredUserData } from "../utils/UserContext";

const Tavern: NextPage = () => {
  const [activeTab, setActiveTab] = useState<string>("Global");
  const { data: userData } = useRequiredUserData();
  const localTavern = userData?.village ? userData?.village?.name : "Syndicate";

  if (!userData) return <Loader explanation="Loading userdata" />;

  return (
    <>
      <Conversation
        refreshKey={0}
        convo_title={activeTab}
        title={activeTab + " Tavern"}
        subtitle={
          activeTab === "Global"
            ? "Broadcast across all villages"
            : "Chat with your fellow villagers"
        }
        chatbox_options={
          <>
            <div className="grow"></div>
            <NavTabs
              current={activeTab}
              options={["Global", localTavern]}
              setValue={setActiveTab}
            />
          </>
        }
      />
    </>
  );
};

export default Tavern;
