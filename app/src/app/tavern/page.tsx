"use client";

import { useState } from "react";
import ContentBox from "@/layout/ContentBox";
import WidgetBot from "@widgetbot/react-embed";
import Loader from "@/layout/Loader";
import Conversation from "@/layout/Conversation";
import BanInfo from "@/layout/BanInfo";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/utils/api";
import { findVillageUserRelationship } from "@/utils/alliance";
import { useRequiredUserData } from "@/utils/UserContext";
import { capitalizeFirstLetter } from "@/utils/sanitize";

export default function Tavern() {
  // State
  const [activeTab, setActiveTab] = useState<string>("Global");

  // Data
  const { data: userData } = useRequiredUserData();
  const { data: villages } = api.village.getAll.useQuery(undefined, {
    staleTime: Infinity,
  });
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

  // Check available taverns
  const availTaverns = ["Global", "Discord", localTavern];
  if (userData?.role !== "USER") {
    villages
      ?.filter((v) => ["OUTLAW", "VILLAGE"].includes(v.type))
      .map((v) => v.name)
      .filter((v) => !availTaverns.includes(v))
      .forEach((v) => availTaverns.push(v));
  }

  if (!userData) return <Loader explanation="Loading userdata" />;
  if (userData.isBanned || userData.isSilenced) return <BanInfo />;
  if (isPending) return <Loader explanation="Getting sector information" />;

  // Tavern selector
  const tavernSelector = (
    <Select onValueChange={(e) => setActiveTab(e)}>
      <SelectTrigger>
        <SelectValue placeholder={activeTab} />
      </SelectTrigger>
      <SelectContent>
        {availTaverns?.map((village) => (
          <SelectItem key={village} value={village}>
            {village}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  if (activeTab === "Discord") {
    return (
      <ContentBox
        title={"Tavern"}
        subtitle={activeTab + " Tavern"}
        padding={false}
        noBorder={true}
        topRightContent={tavernSelector}
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
        topRightContent={tavernSelector}
      />
    );
  }
}
