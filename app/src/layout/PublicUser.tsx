"use client";

import React, { useEffect, useRef } from "react";
import { useAuth } from "@clerk/nextjs";
import { parseHtml } from "@/utils/parse";
import Link from "next/link";
import Image from "next/image";
import StatusBar from "@/layout/StatusBar";
import AvatarImage from "@/layout/Avatar";
import ContentBox from "@/layout/ContentBox";
import Confirm from "@/layout/Confirm";
import Loader from "@/layout/Loader";
import ReportUser from "@/layout/Report";
import Post from "@/layout/Post";
import ActionLogs from "@/layout/ActionLog";
import GraphCombatLog from "@/layout/GraphCombatLog";
import { useLocalStorage } from "@/hooks/localstorage";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TrainingSpeeds } from "@/drizzle/constants";
import { TransactionHistory } from "src/app/points/page";
import { capitalizeFirstLetter } from "@/utils/sanitize";
import { EditContent } from "@/layout/EditContent";
import {
  Flag,
  CopyCheck,
  Settings,
  RefreshCcwDot,
  Trash2,
  PersonStanding,
} from "lucide-react";
import { updateUserSchema } from "@/validators/user";
import { canChangeUserRole } from "@/utils/permissions";
import { canSeeSecretData } from "@/utils/permissions";
import { api } from "@/utils/api";
import { showMutationToast } from "@/libs/toast";
import { canChangePublicUser } from "@/validators/reports";
import { useUserData } from "@/utils/UserContext";
import { useUserEditForm } from "@/hooks/profile";
import { Chart as ChartJS } from "chart.js/auto";
import type { UpdateUserSchema } from "@/validators/user";
import { groupBy } from "@/utils/grouping";
import { Waypoints } from "lucide-react";
import { Button } from "@/components/ui/button";
import ActionLogFiltering, {
  useFiltering,
  getFilter,
} from "@/layout/ActionLogFiltering";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface PublicUserComponentProps {
  userId: string;
  title: string;
  back_href?: string;
  initialBreak?: boolean;
  showRecruited?: boolean;
  showStudents?: boolean;
  showBadges?: boolean;
  showNindo?: boolean;
  showReports?: boolean;
  showTransactions?: boolean;
  showActionLogs?: boolean;
  showTrainingLogs?: boolean;
  showCombatLogs?: boolean;
  showMarriages?: boolean;
}

const PublicUserComponent: React.FC<PublicUserComponentProps> = ({
  userId,
  title,
  back_href,
  initialBreak,
  showRecruited,
  showStudents,
  showBadges,
  showNindo,
  showReports,
  showTransactions,
  showActionLogs,
  showTrainingLogs,
  showCombatLogs,
  showMarriages,
}) => {
  // Get state
  const [showActive, setShowActive] = useLocalStorage<string>("pDetails", "nindo");
  const { isSignedIn } = useAuth();
  const { data: userData } = useUserData();
  const canSeeSecrets = userData && canSeeSecretData(userData.role);
  const enableReports = showReports && canSeeSecrets;
  const enablePaypal = showTransactions && canSeeSecrets;
  const enableLogs = showActionLogs && canSeeSecrets;

  // Two-level filtering
  const state = useFiltering();

  // Queries
  const { data: profile, isPending: isPendingProfile } =
    api.profile.getPublicUser.useQuery(
      { userId: userId },
      { enabled: userId !== undefined, staleTime: Infinity },
    );

  const { data: reports, isPending: isPendingReports } =
    api.reports.getUserReports.useQuery(
      { userId: userId },
      { enabled: !!enableReports, staleTime: Infinity },
    );

  const { data: marriages } = api.marriage.getMarriedUsers.useQuery(
    { id: userId },
    {
      staleTime: 300000,
    },
  );

  const { data: todayPveCount } = api.profile.getUserDailyPveBattleCount.useQuery(
    { userId: userId },
    { staleTime: Infinity },
  );

  // tRPC utility
  const utils = api.useUtils();

  // Mutations
  const updateAvatar = api.reports.updateUserAvatar.useMutation({
    onSuccess: async (data) => {
      showMutationToast(data);
      if (data.success) {
        await utils.profile.getPublicUser.invalidate();
      }
    },
  });

  const clearNindo = api.reports.clearNindo.useMutation({
    onSuccess: async (data) => {
      showMutationToast(data);
      if (data.success) {
        await utils.profile.getPublicUser.invalidate();
      }
    },
  });

  const cloneUser = api.profile.cloneUserForDebug.useMutation({
    onSuccess: async (data) => {
      showMutationToast(data);
      if (data.success) {
        await utils.profile.getUser.invalidate();
      }
    },
  });

  const unstuckUser = api.staff.forceAwake.useMutation({
    onSuccess: async (data) => {
      showMutationToast(data);
      if (data.success) {
        await utils.profile.getUser.invalidate();
      }
    },
  });

  // Derived
  const canChange = isSignedIn && userData && canChangePublicUser(userData);
  const availableRoles = userData && canChangeUserRole(userData.role);

  // Loaders
  if (isPendingProfile) return <Loader explanation="Fetching Public User Data" />;
  if (!userData) return <Loader explanation="Fetching Your User Data" />;
  if (!profile) {
    return (
      <ContentBox title="Users" subtitle="Search Unsuccessful">
        User with id <b>{userId}</b> does not exist.
      </ContentBox>
    );
  }

  // Profile name
  let profileName = `${profile.username}`;
  if (profile.customTitle) profileName += ` [${profile.customTitle}]`;

  // Render
  return (
    <>
      {/* USER STATISTICS */}
      <ContentBox
        title={title}
        back_href={back_href}
        subtitle={`Profile: ${profileName}`}
        initialBreak={initialBreak}
        topRightContent={
          <div className="flex flex-row gap-1">
            {userData?.username === "Terriator" && (
              <CopyCheck
                className="h-6 w-6 cursor-pointer hover:text-orange-500"
                onClick={() => cloneUser.mutate({ userId: profile.userId })}
              />
            )}
            {availableRoles && availableRoles.length > 0 && (
              <EditUserComponent userId={profile.userId} profile={profile} />
            )}
            <ReportUser
              user={profile}
              content={{
                id: profile.userId,
                title: profile.username,
                content:
                  "General user behavior, justification must be provided in comments",
              }}
              system="user_profile"
              button={<Flag className="h-6 w-6 cursor-pointer hover:text-orange-500" />}
            />
            {canSeeSecretData(userData.role) ? (
              <Confirm
                title="Confirm force change user state to awake"
                button={
                  <PersonStanding className="h-6 w-6 cursor-pointer hover:text-orange-500" />
                }
                onAccept={(e) => {
                  e.preventDefault();
                  unstuckUser.mutate({ userId: profile.userId });
                }}
              >
                Note that abuse of this feature is forbidden, it is solely intended for
                fixing users stuck in a particular state. I.E Battle. The action will be
                logged. Are you sure?
              </Confirm>
            ) : (
              ""
            )}
          </div>
        }
      >
        <div className="grid grid-cols-2">
          <div>
            <b>General</b>
            <p>
              Lvl. {profile.level} {capitalizeFirstLetter(profile.rank)}
            </p>
            <p>Village: {profile.village?.name}</p>
            <p>Status: {profile.status}</p>
            <p>Gender: {profile.gender}</p>
            <br />
            <b>Associations</b>
            <p>Clan: {profile.clan?.name || "None"}</p>
            <p>ANBU: {profile.anbuSquad?.name || "None"}</p>
            <p>Bloodline: {profile.bloodline?.name || "None"}</p>
            <p>
              Sensei:{" "}
              {profile.rank === "GENIN" && profile.senseiId && profile.sensei ? (
                <Link href={`/users/${profile.senseiId}`} className="font-bold">
                  {profile.sensei?.username}
                </Link>
              ) : (
                "None"
              )}
            </p>
            <br />
            <b>Experience</b>
            <p>Experience: {profile.experience}</p>
            {canSeeSecrets && <p>Unclaimed Exp: {profile.earnedExperience}</p>}
            <p>Experience for lvl: ---</p>
            <p>PVE Fights: {`${profile.pveFights} (+${todayPveCount})`}</p>
            <br />
            <b>Special</b>
            <p>Reputation points: {profile.reputationPoints}</p>
            <p>Federal Support: {profile.federalStatus.toLowerCase()}</p>
            {canSeeSecretData(userData.role) && (
              <div>
                <br />
                <b>Information</b>
                <p>Too fast infractions: {profile.movedTooFastCount}</p>
                <Link
                  href={`/users/ipsearch/${profile.lastIp}`}
                  className="hover:text-orange-500 hover:cursor-pointer"
                >
                  Last IP: {profile.lastIp}
                </Link>
                <div>
                  {profile.deletionAt
                    ? `To be deleted on: ${profile.deletionAt.toLocaleString()}`
                    : ""}
                </div>
              </div>
            )}
          </div>
          <div>
            <div className="basis-1/3">
              <div className="relative">
                <AvatarImage
                  href={profile.avatar}
                  alt={profile.username}
                  userId={profile.userId}
                  hover_effect={false}
                  priority={true}
                  size={100}
                />
                {canChange && !profile.isAi && (
                  <Confirm
                    title="Confirm Deletion"
                    button={
                      <RefreshCcwDot className="absolute right-[13%] top-[3%] h-9 w-9 cursor-pointer rounded-full bg-slate-300 p-1 hover:text-orange-500" />
                    }
                    onAccept={(e) => {
                      e.preventDefault();
                      updateAvatar.mutate({ userId: profile.userId });
                    }}
                  >
                    You are about to delete an avatar and create a new one. Note that
                    abuse of this feature is forbidden, it is solely intended for
                    removing potentially inappropriate avatars. The action will be
                    logged. Are you sure?
                  </Confirm>
                )}
              </div>
              <StatusBar
                title="HP"
                tooltip="Health"
                color="bg-red-500"
                showText={true}
                status={profile.status}
                current={profile.curHealth}
                total={profile.maxHealth}
              />
              <StatusBar
                title="CP"
                tooltip="Chakra"
                color="bg-blue-500"
                showText={true}
                status={profile.status}
                current={profile.curChakra}
                total={profile.maxChakra}
              />
              <StatusBar
                title="SP"
                tooltip="Stamina"
                color="bg-green-500"
                showText={true}
                status={profile.status}
                current={profile.curStamina}
                total={profile.maxStamina}
              />
            </div>
          </div>
        </div>
      </ContentBox>
      {/* MARRIED USERS */}
      {showMarriages && marriages !== undefined && marriages.length > 0 && (
        <ContentBox
          title="Married Users"
          subtitle={`${profile.username} is married to these users`}
          initialBreak={true}
        >
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5">
            {marriages.map((user, i) => (
              <Link href={`/users/${user.userId}`} className="text-center" key={i}>
                <AvatarImage
                  href={user.avatar}
                  alt={user.username}
                  userId={user.userId}
                  hover_effect={true}
                  priority={true}
                  size={100}
                />
                <div>
                  <div className="font-bold">{user.username}</div>
                </div>
              </Link>
            ))}
          </div>
        </ContentBox>
      )}
      {/* RECRUITED USERS */}
      {showRecruited && profile.recruitedUsers.length > 0 && (
        <ContentBox
          title="Recruited Users"
          subtitle={`${profile.username} referred these users`}
          initialBreak={true}
        >
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5">
            {profile.recruitedUsers.map((user, i) => (
              <Link href={`/users/${user.userId}`} className="text-center" key={i}>
                <AvatarImage
                  href={user.avatar}
                  alt={user.username}
                  userId={user.userId}
                  hover_effect={true}
                  priority={true}
                  size={100}
                />
                <div>
                  <div className="font-bold">{user.username}</div>
                  <div>
                    Lvl. {user.level} {capitalizeFirstLetter(user.rank)}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </ContentBox>
      )}
      {/* STUDENTS */}
      {showStudents && profile.students.length > 0 && (
        <ContentBox title="Students" subtitle={`Past and present`} initialBreak={true}>
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5">
            {profile.students.map((user, i) => (
              <Link href={`/users/${user.userId}`} className="text-center" key={i}>
                <AvatarImage
                  href={user.avatar}
                  alt={user.username}
                  userId={user.userId}
                  hover_effect={true}
                  priority={true}
                  size={100}
                />
                <div>
                  <div className="font-bold">{user.username}</div>
                  <div>
                    Lvl. {user.level} {capitalizeFirstLetter(user.rank)}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </ContentBox>
      )}
      {/* USER BADGES */}
      {showBadges && profile.badges.length > 0 && (
        <ContentBox
          title="Achieved Badges"
          subtitle={`Achieved through quests & help`}
          initialBreak={true}
        >
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5">
            {profile.badges.map((userbadge, i) => (
              <div key={i} className="text-center">
                <Image
                  src={userbadge.badge.image}
                  alt={userbadge.badge.name}
                  width={128}
                  height={128}
                />
                <div>
                  <div className="font-bold">{userbadge.badge.name}</div>
                </div>
              </div>
            ))}
          </div>
        </ContentBox>
      )}
      <Tabs
        defaultValue={showActive}
        className="flex flex-col items-center justify-center mt-3"
        onValueChange={(value) => setShowActive(value)}
      >
        <TabsList className="text-center">
          {showNindo && <TabsTrigger value="nindo">Nindo</TabsTrigger>}
          {showCombatLogs && <TabsTrigger value="graph">Combat Graph</TabsTrigger>}
          {showTransactions && (
            <TabsTrigger value="transactions">Transactions</TabsTrigger>
          )}
          {showReports && <TabsTrigger value="reports">Reports</TabsTrigger>}
          {showTrainingLogs && <TabsTrigger value="training">Training Log</TabsTrigger>}
          {enableLogs && <TabsTrigger value="content">Content Log</TabsTrigger>}
        </TabsList>
        {/* USER NINDO */}
        {showNindo && profile.nindo && (
          <TabsContent value="nindo">
            <ContentBox
              title="Nindo"
              subtitle={`${profile.username}'s Ninja Way`}
              initialBreak={true}
              topRightContent={
                <div className="flex flex-row gap-1">
                  {canChange && (
                    <Confirm
                      title="Clear User Nindo"
                      proceed_label="Done"
                      button={
                        <Trash2 className="h-6 w-6 cursor-pointer hover:text-orange-500" />
                      }
                      onAccept={() => clearNindo.mutate({ userId: profile.userId })}
                    >
                      Confirm that you wish to clear this nindo. The action will be
                      logged.
                    </Confirm>
                  )}
                </div>
              }
            >
              <div className="relative overflow-x-scroll">
                {parseHtml(profile.nindo.content)}
              </div>
            </ContentBox>
          </TabsContent>
        )}
        {/* USER COMBAT GRAPH */}
        {showCombatLogs && (
          <TabsContent value="graph">
            <ContentBox
              title="Combat Graph"
              subtitle={`PvP Activity`}
              initialBreak={true}
            >
              <p className="italic pb-3">
                The battle graph gives an overview of all users fought the last 60 days,
                as well as which users these opponents have faced.
              </p>
              <Dialog>
                <DialogTrigger asChild>
                  <Button type="submit" className="w-full">
                    <Waypoints className="h-5 w-5 mr-2" /> Show Battle Graph
                  </Button>
                </DialogTrigger>
                <DialogContent className="min-w-[99%] min-h-[99%]">
                  <DialogHeader>
                    <DialogTitle>PvP Overview</DialogTitle>
                    <DialogDescription asChild>
                      <GraphCombatLog userId={profile.userId} />
                    </DialogDescription>
                  </DialogHeader>
                </DialogContent>
              </Dialog>
            </ContentBox>
          </TabsContent>
        )}
        {/* USER TRANSACTIONS */}
        {showTransactions && enablePaypal && (
          <TabsContent value="transactions">
            <TransactionHistory userId={profile.userId} />
          </TabsContent>
        )}
        {/* USER REPORTS */}
        {showReports && enableReports && (
          <TabsContent value="reports">
            <ContentBox
              title="Reports"
              subtitle={`Reports against ${profile.username}`}
              initialBreak={true}
            >
              {isPendingReports && <Loader explanation="Fetching User Reports" />}
              {reports?.length === 0 && <p>No reports found</p>}
              {reports?.map((report) => {
                return (
                  <Link key={report.id} href={"/reports/" + report.id}>
                    <Post
                      title={`${report.reporterUser?.username} on ${report.system}`}
                      hover_effect={true}
                      align_middle={true}
                      image={
                        <div className="m-3 w-16 ">
                          {report.reporterUser?.avatar && (
                            <Image
                              src={report.reporterUser.avatar}
                              width={100}
                              height={100}
                              alt="Forum Icon"
                            ></Image>
                          )}
                        </div>
                      }
                    >
                      {parseHtml(report.reason)}
                      <b>Status:</b> {report.status.toLowerCase()}
                    </Post>
                  </Link>
                );
              })}
            </ContentBox>
          </TabsContent>
        )}
        {/* USER TRAINING LOG */}
        {showTrainingLogs && (
          <TabsContent value="training">
            <UserTrainingLog userId={profile.userId} />
          </TabsContent>
        )}
        {/* USER ACTION LOG */}
        {enableLogs && (
          <TabsContent value="content">
            <ActionLogs
              state={getFilter(state)}
              relatedId={userId}
              initialBreak={true}
              topRightContent={<ActionLogFiltering state={state} />}
            />
          </TabsContent>
        )}
      </Tabs>
    </>
  );
};

export default PublicUserComponent;

interface EditUserComponentProps {
  userId: string;
  profile: UpdateUserSchema;
}

const EditUserComponent: React.FC<EditUserComponentProps> = ({ userId, profile }) => {
  // Refetching public user
  const refetchProfile = () => void utils.profile.getPublicUser.invalidate();

  // tRPC utility
  const utils = api.useUtils();

  // Form handling
  const { form, formData, handleUserSubmit } = useUserEditForm(
    userId,
    profile,
    refetchProfile,
  );

  return (
    <Confirm
      title="Update User Data"
      proceed_label="Done"
      button={<Settings className="h-6 w-6 cursor-pointer hover:text-orange-500" />}
    >
      <EditContent
        schema={updateUserSchema}
        form={form}
        formData={formData}
        showSubmit={form.formState.isDirty}
        buttonTxt="Save to Database"
        type="ai"
        allowImageUpload={true}
        onAccept={handleUserSubmit}
      />
    </Confirm>
  );
};

interface TrainingStatsComponentProps {
  userId: string;
}

const UserTrainingLog: React.FC<TrainingStatsComponentProps> = ({ userId }) => {
  // State
  const chart = useRef<HTMLCanvasElement>(null);

  // Query
  const { data: logEntries } = api.train.getTrainingLog.useQuery(
    { userId: userId },
    { staleTime: Infinity },
  );

  // Create dataset for each training speed
  const x = [...Array(24).keys()];
  const datasets =
    logEntries &&
    TrainingSpeeds.map((speed) => {
      const hourlyEvents = groupBy(
        logEntries
          .filter((e) => e.speed === speed)
          .map((e) => ({
            ...e,
            hourAtDay: e.trainingFinishedAt.getHours(),
          })),
        "hourAtDay",
      );
      return {
        label: speed,
        data: x.map((i) => {
          const entries = hourlyEvents.get(i) || [];
          return {
            x: i,
            y: entries.length || 0,
            entries: entries,
          };
        }),
      };
    });

  // Create chart
  useEffect(() => {
    const ctx = chart?.current?.getContext("2d");
    if (ctx && datasets) {
      // Update stats chart
      const localTheme = localStorage.getItem("theme");
      ChartJS.defaults.color = localTheme === "dark" ? "#FFFFFF" : "#000000";
      const myChart = new ChartJS(ctx, {
        type: "bar",
        options: {
          maintainAspectRatio: false,
          responsive: true,
          aspectRatio: 1.1,
          scales: {
            y: {
              beginAtZero: true,
              ticks: {
                stepSize: 1,
              },
              title: {
                display: false,
                text: "#Events",
              },
              stacked: true,
            },
            x: {
              stacked: true,
              title: {
                display: true,
                text: "Hour of Day",
              },
            },
          },
          plugins: {
            legend: {
              position: "bottom",
              display: true,
            },
            tooltip: {
              callbacks: {
                title: function (tooltipItems) {
                  return `Training at hour ${tooltipItems?.[0]?.label || "unknown"}`;
                },
                label: function (tooltipItems) {
                  const raw = tooltipItems?.raw as {
                    entries: { trainingFinishedAt: string }[];
                  };
                  return (
                    raw.entries?.map((e) =>
                      new Date(e.trainingFinishedAt).toLocaleString(),
                    ) || []
                  );
                },
              },
            },
          },
        },
        data: {
          labels: x,
          datasets: datasets,
        },
      });

      // Remove on unmount
      return () => {
        myChart.destroy();
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datasets]);

  return (
    <ContentBox
      title="Training Log"
      subtitle="User activity last 7 days"
      initialBreak={true}
    >
      <div className="relative w-[99%] p-3">
        <canvas ref={chart} id="chart"></canvas>
      </div>
    </ContentBox>
  );
};
