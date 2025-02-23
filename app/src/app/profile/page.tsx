"use client";

import Link from "next/link";
import ContentBox from "@/layout/ContentBox";
import DeleteUserButton from "@/layout/DeleteUserButton";
import StrengthWeaknesses from "@/layout/StrengthWeaknesses";
import Logbook from "@/layout/Logbook";
import Loader from "@/layout/Loader";
import LevelUpBtn from "@/layout/LevelUpBtn";
import { Wrench, Share2 } from "lucide-react";
import { useRequiredUserData } from "@/utils/UserContext";
import { api } from "@/app/_trpc/client";
import { showUserRank } from "@/libs/profile";
import { calcMedninRank } from "@/libs/hospital/hospital";
import { calcLevelRequirements } from "@/libs/profile";
import { capitalizeFirstLetter } from "@/utils/sanitize";

export default function Profile() {
  // State
  const { data: userData } = useRequiredUserData();

  // Query
  const { data: marriages } = api.marriage.getMarriedUsers.useQuery(
    {},
    { enabled: !!userData, staleTime: 300000 },
  );

  // Derived
  const expRequired =
    userData &&
    Math.max(calcLevelRequirements(userData.level) - userData.experience, 0);

  // Loader
  if (!userData) {
    return <Loader explanation="Loading profile page..." />;
  }

  return (
    <>
      <ContentBox
        title="Profile"
        subtitle="An overview of basic information"
        topRightContent={
          <div className="flex flex-row gap-1">
            <Link href="/profile/recruit">
              <Share2 className="h-6 w-6 cursor-pointer hover:text-orange-500 animate-[wiggle_1s_ease-in-out_infinite]" />
            </Link>
            <Link href="/profile/edit">
              <Wrench className="h-6 w-6 cursor-pointer hover:text-orange-500" />
            </Link>
            <DeleteUserButton userData={userData} />
          </div>
        }
      >
        <div className="grid grid-cols-2 gap-2">
          <div>
            <b>General</b>
            <p>
              Lvl. {userData.level} {showUserRank(userData)}
            </p>
            <p>Money: {userData.money.toFixed(2)}</p>
            <p>Bank: {userData.bank.toFixed(2)}</p>
            <p>Status: {userData.status}</p>
            <p>Regeneration: {userData.regeneration.toFixed(2)}</p>
            <p>Gender: {userData.gender}</p>
          </div>
          <div>
            <b>Activity</b>
            <p>Exp: {userData.experience.toFixed(2)}</p>
            <p>Exp for lvl: {expRequired ? expRequired.toFixed(2) : "--"}</p>
            <p>PVP Fights: {userData.pvpFights}</p>
            <p>PvE Fights: {userData.pveFights}</p>
            <p>PvP Streak: {userData.pvpStreak}</p>
            <p>PvP Activity: {userData.pvpActivity}</p>
            <p>Medical Exp: {userData.medicalExperience}</p>
          </div>
          <div>
            <b>Reputation</b>
            <p>Reputation points: {userData.reputationPoints.toFixed(2)}</p>
            <p>Federal Support: {userData.federalStatus.toLowerCase()}</p>
            <p>Activity Streak: {userData.activityStreak}</p>
            {userData.isOutlaw && <p>Notoriety: {userData.villagePrestige}</p>}
            {!userData.isOutlaw && <p>Village prestige: {userData.villagePrestige}</p>}
          </div>
          <div>
            <b>Associations</b>
            <p>Village: {userData.village?.name}</p>
            <p>Bloodline: {userData.bloodline?.name || "None"}</p>
            <p>ANBU: {userData.anbuSquad?.name || "None"}</p>
            <p>
              {userData.isOutlaw ? "Faction" : "Clan"}: {userData.clan?.name || "None"}
            </p>
            <p>Medical: {capitalizeFirstLetter(calcMedninRank(userData))}</p>
            <p>
              Married:{" "}
              {marriages !== undefined && marriages.length > 0
                ? marriages.map((x, i) => (
                    <Link
                      key={x.username}
                      href={`/username/${x.username}`}
                      className="font-bold"
                    >
                      {i >= 1 ? ", " + x.username : x.username}
                    </Link>
                  ))
                : "None"}
            </p>
          </div>
        </div>
        <LevelUpBtn />
      </ContentBox>
      <StrengthWeaknesses />
      <Logbook />
    </>
  );
}
