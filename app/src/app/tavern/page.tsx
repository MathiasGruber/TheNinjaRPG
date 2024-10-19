"use client";

import { useEffect } from "react";
import { useLocalStorage } from "@/hooks/localstorage";
import NavTabs from "@/layout/NavTabs";
import Loader from "@/layout/Loader";
import Conversation from "@/layout/Conversation";
import BanInfo from "@/layout/BanInfo";
import UserBlacklistControl from "@/layout/UserBlacklistControl";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { UserRoundX } from "lucide-react";
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

export default function Tavern() {
  // State
  const [activeTab, setActiveTab] = useLocalStorage<string | undefined>(
    "selectedTavern",
    undefined,
  );

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
  const availTaverns = ["Global", localTavern];
  if (userData?.role !== "USER") {
    villages
      ?.filter((v) => ["OUTLAW", "VILLAGE"].includes(v.type))
      .map((v) => v.name)
      .filter((v) => !availTaverns.includes(v))
      .forEach((v) => availTaverns.push(v));
  }

  // If no tavern defined, set the tavern
  useEffect(() => {
    if (userData && !activeTab) {
      setActiveTab(localTavern);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userData, localTavern]);

  if (!userData) return <Loader explanation="Loading userdata" />;
  if (userData.isBanned || userData.isSilenced) return <BanInfo />;
  if (isPending) return <Loader explanation="Getting sector information" />;

  // Tavern selector
  const tavernSelector =
    userData?.role !== "USER" ? (
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
    ) : (
      <NavTabs
        id="tavernSelector"
        current={activeTab ?? localTavern}
        options={availTaverns}
        setValue={setActiveTab}
      />
    );

  const conversation = activeTab ?? "Global";
  return (
    <Conversation
      refreshKey={0}
      convo_title={conversation}
      title={conversation + " Tavern"}
      initialBreak={false}
      subtitle={conversation === "Global" ? "Global chat" : "Village chat"}
      topRightContent={
        <div className="flex flex-row gap-1">
          {tavernSelector}
          <Popover>
            <PopoverTrigger asChild>
              <Button id="filter-bloodline">
                <UserRoundX className="h-6 w-6 hover:text-orange-500" />
              </Button>
            </PopoverTrigger>
            <PopoverContent>
              <div className="max-w-[320px] min-w-[320px]">
                <UserBlacklistControl />
              </div>
            </PopoverContent>
          </Popover>
        </div>
      }
    />
  );
}
