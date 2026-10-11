"use client";

import { differenceInDays, differenceInHours } from "date-fns";
import {
  History,
  Info,
  LayoutDashboard,
  Settings,
  Share2,
  Trash2,
  Trophy,
  UserRound,
  Wrench,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import { lazy, Suspense, useState } from "react";
import { api } from "@/app/_trpc/client";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { safeLocalStorageSetItem } from "@/hooks/localstorage";
import ContentBox from "@/layout/ContentBox";
import Countdown from "@/layout/Countdown";
import { DashboardSettings } from "@/layout/DashboardSettings";
import DeleteUserButton from "@/layout/DeleteUserButton";
import ItemWithEffects from "@/layout/ItemWithEffects";
import LevelUpBtn from "@/layout/LevelUpBtn";
import Link from "@/layout/Link";
import Loader from "@/layout/Loader";
import Logbook, {
  LogbookAchievements,
  LogbookBattles,
  LogbookHistory,
} from "@/layout/Logbook";
import Modal from "@/layout/Modal";
import NavTabs from "@/layout/NavTabs";
import ProfileDashboard from "@/layout/ProfileDashboard";
import StrengthWeaknesses from "@/layout/StrengthWeaknesses";
import { calcMedninRank } from "@/libs/hospital";
import { calcLevelRequirements, showUserRank } from "@/libs/profile";
import { getRankedRank } from "@/libs/ranked_pvp";
import { getSageMasteryDisplayRank } from "@/libs/sageMode";
import { isTutorialActive } from "@/libs/tutorial";
import { capitalizeFirstLetter } from "@/utils/string";
import { nextRegenerationTickAt } from "@/utils/time";
import { useRequiredUserData } from "@/utils/UserContext";

const profileTabs = [
  "Dashboard",
  "Character",
  "Achievements",
  "History",
  "Edit Character",
  "Sharing",
  "Delete Character",
] as const;
const iconProfileTabs = [
  "Achievements",
  "History",
  "Edit Character",
  "Sharing",
  "Delete Character",
] as const;
const tutorialProfileTabs = ["Character", ...iconProfileTabs] as const;
type ProfileTab = (typeof profileTabs)[number];
const profileTabValues: Record<ProfileTab, string> = {
  Dashboard: "dashboard",
  Character: "character",
  Achievements: "achievements",
  History: "history",
  "Edit Character": "edit",
  Sharing: "sharing",
  "Delete Character": "delete",
};

export function Profile() {
  const { data: userData, updateUser, notifications } = useRequiredUserData();
  const [tab, setTab] = useState<ProfileTab | null>(null);
  const searchParams = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const urlTab = profileTabs.find(
    (option) => option === requestedTab || profileTabValues[option] === requestedTab,
  );

  if (!userData) return <Loader explanation="Loading profile page..." />;

  const tutorialActive = isTutorialActive(userData);
  const selectedTab = urlTab ?? tab ?? "Dashboard";
  const activeTab =
    tutorialActive && selectedTab === "Dashboard" ? "Character" : selectedTab;
  const visibleTabs = tutorialActive ? tutorialProfileTabs : profileTabs;
  const newInRecruit =
    notifications?.find((n) => n.href.includes("/profile/recruit"))
      ?.notificationCount || 0;

  const dashboardSettings = !tutorialActive ? (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0"
          aria-label="Dashboard settings"
        >
          <Settings className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="max-h-[80dvh] w-[min(24rem,calc(100vw-2rem))] overflow-y-auto"
      >
        <DashboardSettings userData={userData} updateUser={updateUser} />
      </PopoverContent>
    </Popover>
  ) : null;

  const selectTab = (value: string) => {
    const next = profileTabs.find(
      (option) => option === value || profileTabValues[option] === value,
    );
    if (!next) return;
    const allowed = tutorialActive && next === "Dashboard" ? "Character" : next;
    if (userData.rememberProfileTab) {
      safeLocalStorageSetItem(`profileTab:${userData.userId}`, allowed);
    }
    setTab(allowed);
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", profileTabValues[allowed]);
    window.history.replaceState(null, "", `/profile?${params}`);
  };

  return (
    <div id="tutorial-profile">
      <Tabs
        value={profileTabValues[activeTab]}
        onValueChange={(value) => selectTab(value)}
      >
        <div className="@container mb-3">
          <NavTabs
            id={`profileTab:${userData.userId}`}
            remember={userData.rememberProfileTab}
            current={urlTab || tab !== null ? activeTab : null}
            options={visibleTabs}
            onChange={selectTab}
            accessibleTabs
            label="Profile sections"
            icons={{
              Dashboard: (
                <LayoutDashboard
                  className="h-[20px] w-[20px] @min-[480px]:hidden"
                  aria-hidden="true"
                />
              ),
              Character: (
                <UserRound
                  className="h-[20px] w-[20px] @min-[480px]:hidden"
                  aria-hidden="true"
                />
              ),
              Achievements: <Trophy className="h-[20px] w-[20px]" aria-hidden="true" />,
              History: <History className="h-[20px] w-[20px]" aria-hidden="true" />,
              "Edit Character": (
                <Wrench className="h-[20px] w-[20px]" aria-hidden="true" />
              ),
              Sharing: <Share2 className="h-[20px] w-[20px]" aria-hidden="true" />,
              "Delete Character": (
                <Trash2 className="h-[20px] w-[20px]" aria-hidden="true" />
              ),
            }}
            iconOnlyOptions={profileTabs}
            labelClassName={(option) =>
              option === "Dashboard" || option === "Character"
                ? "@min-[480px]:not-sr-only"
                : ""
            }
            values={profileTabValues}
            counts={{ Sharing: newInRecruit }}
            listClassName="w-full flex-nowrap justify-start gap-[4px]"
            itemClassName={(option) =>
              `shrink-0 w-[min(44px,calc((100cqw_-_24px)/7))] ${option === "Character" ? "mr-auto" : "mr-0"} ${option === "Dashboard" || option === "Character" ? "@min-[480px]:w-auto" : ""}`
            }
            className="min-h-[44px] min-w-0 w-full px-0 text-base @min-[480px]:px-[12px]"
          />
        </div>
        <TabsContent value="dashboard">
          <ContentBox padding={false}>
            <ProfileDashboard settings={dashboardSettings} />
          </ContentBox>
        </TabsContent>
        <TabsContent value="character">
          <CharacterProfile />
        </TabsContent>
        <TabsContent value="achievements">
          <ContentBox title="Achievements" padding={false}>
            <div className="p-3">
              <LogbookAchievements />
            </div>
          </ContentBox>
        </TabsContent>
        <TabsContent value="history">
          <ContentBox title="History" padding={false}>
            <ProfileHistory />
          </ContentBox>
        </TabsContent>
        <TabsContent value="edit">
          <Suspense fallback={<Loader explanation="Loading character settings..." />}>
            <ProfileEdit />
          </Suspense>
        </TabsContent>
        <TabsContent value="sharing">
          <Suspense fallback={<Loader explanation="Loading sharing..." />}>
            <ProfileSharing />
          </Suspense>
        </TabsContent>
        <TabsContent value="delete">
          <ContentBox
            title="Delete Character"
            subtitle="Review your account deletion options"
          >
            <p className="mb-4">
              Open the deletion details to review the waiting period and confirm or
              cancel your request.
            </p>
            <DeleteUserButton
              userData={userData}
              label="Review deletion details"
              className="min-h-11 gap-2 rounded-md border px-4 hover:bg-muted"
            />
          </ContentBox>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function CharacterProfile() {
  // State
  const { data: userData, timeDiff } = useRequiredUserData();
  const [pvpInfoModal, setPvpInfoModal] = useState<"activity" | "rank" | null>(null);

  // Query
  const { data: marriages } = api.marriage.getMarriedUsers.useQuery(
    {},
    { enabled: !!userData, staleTime: 300000 },
  );

  const { data: topPlayers } = api.pvpRank.getCurrentTopPlayers.useQuery(undefined, {
    enabled: !!userData,
    staleTime: 300000,
  });

  // Derived
  const expRequired =
    userData &&
    Math.max(calcLevelRequirements(userData.level) - userData.experience, 0);

  // Loader
  if (!userData) {
    return <Loader explanation="Loading profile page..." />;
  }

  const equippedSageMode = userData.sageMode;

  return (
    <>
      <ContentBox title="Profile" subtitle="An overview of basic information">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <b>General</b>
            <p>
              Lvl. {userData.level} {showUserRank(userData)}
            </p>
            <p>Money: {userData.money?.toLocaleString()}</p>
            <p>Bank: {userData.bank?.toLocaleString()}</p>
            <p>Status: {userData.status}</p>
            <p>
              Regen per minute: {userData.regeneration?.toFixed(2)} (
              <RegenerationCountdown
                key={userData.regenAt.getTime()}
                regenAt={userData.regenAt}
                timeDiff={timeDiff}
              />
              )
            </p>
            <p>Gender: {userData.gender}</p>
          </div>
          <div className="flex flex-col items-start">
            <b>Activity</b>
            <p>Exp: {userData.experience?.toLocaleString()}</p>
            <p>Exp for lvl: {expRequired ? expRequired.toFixed(2) : "--"}</p>
            <p>PvE Fights: {userData.pveFights}</p>
            <TooltipProvider delayDuration={50}>
              <div className="flex flex-row items-center gap-1">
                <p>PvP Activity: {userData.pvpActivity}</p>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-foreground"
                      aria-label="PvP activity details"
                      onClick={() => setPvpInfoModal("activity")}
                    >
                      <Info className="mb-1 h-4 w-4 shrink-0" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <div>
                      <p>PVP Fights: {userData.pvpFights}</p>
                      <p>PvP Streak: {userData.pvpStreak}</p>
                    </div>
                  </TooltipContent>
                </Tooltip>
              </div>
            </TooltipProvider>
            {topPlayers && (
              <TooltipProvider delayDuration={50}>
                <div className="flex flex-row items-center gap-1">
                  <p>PvP Rank: {getRankedRank(userData.rankedLp, topPlayers)}</p>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="text-muted-foreground hover:text-foreground"
                        aria-label="PvP rank details"
                        onClick={() => setPvpInfoModal("rank")}
                      >
                        <Info className="mb-1 h-4 w-4 shrink-0" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <div>
                        <p>LP: {userData.rankedLp}</p>
                        <p>Battles: {userData.rankedBattles}</p>
                        <p>Wins: {userData.rankedWins}</p>
                        <p>
                          Win Rate:{" "}
                          {userData.rankedBattles > 0
                            ? (
                                (userData.rankedWins / userData.rankedBattles) *
                                100
                              ).toFixed(1)
                            : "0"}
                          %
                        </p>
                        <p>Current Streak: {userData.rankedStreak}</p>
                        <p>Seichi Silver: {userData.seichiSilver}</p>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </div>
              </TooltipProvider>
            )}
            <p>Medical Exp: {userData.medicalExperience?.toLocaleString()}</p>
          </div>
          <div>
            <b>Reputation</b>
            <p>Reputation points: {userData.reputationPoints?.toLocaleString()}</p>
            <p>Seichi Silver: {userData.seichiSilver.toLocaleString()}</p>
            <p>Federal Support: {(userData.federalStatus || "NONE").toLowerCase()}</p>
            {userData.isOutlaw && (
              <p>Notoriety: {userData.villagePrestige?.toLocaleString()}</p>
            )}
            {!userData.isOutlaw && (
              <p>Village prestige: {userData.villagePrestige?.toLocaleString()}</p>
            )}
            {userData.joinedVillageAt && (
              <p>
                Village Member:{" "}
                {differenceInDays(new Date(), new Date(userData.joinedVillageAt))} days,{" "}
                {differenceInHours(new Date(), new Date(userData.joinedVillageAt)) % 24}{" "}
                hours
              </p>
            )}
          </div>
          <div>
            <b>Associations</b>
            <p>Village: {userData.village?.name}</p>
            <p>
              Bloodline:{" "}
              {userData.bloodline ? (
                <Popover>
                  <PopoverTrigger asChild>
                    <span className="cursor-pointer font-bold hover:text-orange-500">
                      {userData.bloodline.name}
                    </span>
                  </PopoverTrigger>
                  <PopoverContent className="w-[500px] max-w-[90vw]">
                    <ItemWithEffects item={userData.bloodline} />
                  </PopoverContent>
                </Popover>
              ) : (
                "None"
              )}
            </p>
            <p>
              Sage Mode:{" "}
              {equippedSageMode ? (
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="cursor-pointer font-bold hover:text-orange-500"
                    >
                      {equippedSageMode.name}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[500px] max-w-[90vw]">
                    <ItemWithEffects item={equippedSageMode} />
                  </PopoverContent>
                </Popover>
              ) : (
                "None"
              )}
            </p>
            <p>ANBU: {userData.anbuSquad?.name || "None"}</p>
            <p>
              {userData.isOutlaw ? "Faction" : "Clan"}: {userData.clan?.name || "None"}
            </p>
            <p>Medical: {capitalizeFirstLetter(calcMedninRank(userData))}</p>
            <p>
              Sage Mode Rank:{" "}
              {capitalizeFirstLetter(
                getSageMasteryDisplayRank(
                  userData.sageMasteryExperience ?? 0,
                  !!userData.sageModeId,
                ),
              )}
            </p>
            <p>
              Married:{" "}
              {marriages !== undefined && marriages.length > 0
                ? marriages.map((x, i) => (
                    <Link
                      key={x.username}
                      href={`/username/${x.username}`}
                      className="font-bold"
                    >
                      {i >= 1 ? `, ${x.username}` : x.username}
                    </Link>
                  ))
                : "None"}
            </p>
          </div>
        </div>
        <LevelUpBtn id="tutorial-level-up-btn" />
      </ContentBox>

      <Modal
        title="PvP activity"
        className="md:!max-w-[16rem] w-full max-w-[min(16rem,calc(100%-2rem))] gap-2 p-4"
        centerText
        isOpen={pvpInfoModal === "activity"}
        setIsOpen={(open) => setPvpInfoModal(open ? "activity" : null)}
      >
        <div className="space-y-1 text-sm">
          <p>
            <span className="text-muted-foreground">Activity score:</span>{" "}
            {userData.pvpActivity}
          </p>
          <p>
            <span className="text-muted-foreground">PVP fights:</span>{" "}
            {userData.pvpFights}
          </p>
          <p>
            <span className="text-muted-foreground">PvP streak:</span>{" "}
            {userData.pvpStreak}
          </p>
        </div>
      </Modal>

      {topPlayers && (
        <Modal
          title="PvP rank"
          className="md:!max-w-[17rem] w-full max-w-[min(17rem,calc(100%-2rem))] gap-2 p-4"
          centerText
          isOpen={pvpInfoModal === "rank"}
          setIsOpen={(open) => setPvpInfoModal(open ? "rank" : null)}
        >
          <div className="space-y-1 text-sm">
            <p>
              <span className="text-muted-foreground">Rank:</span>{" "}
              {getRankedRank(userData.rankedLp, topPlayers)}
            </p>
            <p>
              <span className="text-muted-foreground">LP:</span> {userData.rankedLp}
            </p>
            <p>
              <span className="text-muted-foreground">Battles:</span>{" "}
              {userData.rankedBattles}
            </p>
            <p>
              <span className="text-muted-foreground">Wins:</span> {userData.rankedWins}
            </p>
            <p>
              <span className="text-muted-foreground">Win rate:</span>{" "}
              {userData.rankedBattles > 0
                ? ((userData.rankedWins / userData.rankedBattles) * 100).toFixed(1)
                : "0"}
              %
            </p>
            <p>
              <span className="text-muted-foreground">Current streak:</span>{" "}
              {userData.rankedStreak}
            </p>
            <p>
              <span className="text-muted-foreground">Seichi Silver:</span>{" "}
              {userData.seichiSilver}
            </p>
          </div>
        </Modal>
      )}

      <StrengthWeaknesses />
      {isTutorialActive(userData) && <Logbook />}
    </>
  );
}

function ProfileHistory() {
  const [tab, setTab] = useState<"Quests" | "Battles" | null>(null);
  return (
    <div>
      <div className="flex justify-end border-b px-3">
        <NavTabs
          id="profileHistoryTab"
          current={tab}
          options={["Battles", "Quests"]}
          onChange={(value) => setTab(value === "Quests" ? "Quests" : "Battles")}
          className="min-h-11 px-3"
        />
      </div>
      {tab === "Quests" ? <LogbookHistory /> : <LogbookBattles />}
    </div>
  );
}

function RegenerationCountdown({
  regenAt,
  timeDiff,
}: {
  regenAt: Date;
  timeDiff: number;
}) {
  const nextTick = () => nextRegenerationTickAt(regenAt, timeDiff);
  const [targetDate, setTargetDate] = useState(nextTick);
  return (
    <Countdown
      targetDate={targetDate}
      timeDiff={timeDiff}
      onFinish={() => setTargetDate(nextTick())}
    />
  );
}

const ProfileEdit = lazy(() =>
  import("@/layout/ProfileEdit").then((module) => ({ default: module.ProfileEdit })),
);
const ProfileSharing = lazy(() =>
  import("@/layout/ProfileSharing").then((module) => ({
    default: module.ProfileSharing,
  })),
);
