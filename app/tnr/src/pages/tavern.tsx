import { useState } from "react";
import { type NextPage } from "next";

import Conversation from "../layout/Conversation";
import NavTabs from "../layout/NavTabs";

import { useRequiredUserData } from "../utils/UserContext";

const Tavern: NextPage = () => {
  const [activeTab, setActiveTab] = useState<string>("Global");
  const { data: userData } = useRequiredUserData();

  const localTavern = userData?.village ? userData?.village?.name : "Syndicate";
  return (
    <>
      <Conversation
        refreshKey={0}
        convo_title={activeTab}
        title={activeTab + " Tavern"}
        subtitle="Broadcast across all villages."
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
