"use client";

import React, { useState } from "react";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Confirm from "@/layout/Confirm";
import ContentBox from "@/layout/ContentBox";
import StrengthWeaknesses from "@/layout/StrengthWeaknesses";
import Logbook from "@/layout/Logbook";
import Loader from "@/layout/Loader";
import Countdown from "@/layout/Countdown";
import Modal from "@/layout/Modal";
import { Button } from "@/components/ui/button";
import { sendGTMEvent } from "@next/third-parties/google";
import { Trash2, Wrench, Share2, GraduationCap } from "lucide-react";
import { useRequiredUserData } from "@/utils/UserContext";
import { api } from "@/utils/api";
import { showUserRank } from "@/libs/profile";
import { calcMedninRank } from "@/libs/hospital/hospital";
import { calcLevelRequirements } from "@/libs/profile";
import { calcHP, calcSP, calcCP } from "@/libs/profile";
import { capitalizeFirstLetter } from "@/utils/sanitize";
import { showMutationToast } from "@/libs/toast";

export default function Profile() {
  // State
  const { data: userData, refetch: refetchUser, timeDiff } = useRequiredUserData();
  const [showModal, setShowModal] = useState<boolean>(false);
  const [isLevelling, setIsLevelling] = useState<boolean>(false);

  // Router for forwarding
  const router = useRouter();

  const { mutate: toggleDeletionTimer, isPending: isTogglingDelete } =
    api.profile.toggleDeletionTimer.useMutation({
      onSuccess: async () => {
        await refetchUser();
      },
    });

  const { mutate: confirmDeletion, isPending: isDeleting } =
    api.profile.confirmDeletion.useMutation({
      onSuccess: async () => {
        await refetchUser();
        router.push("/");
      },
    });

  const { mutate: levelUp } = api.profile.levelUp.useMutation({
    onMutate: () => {
      setIsLevelling(true);
    },
    onSuccess: async (data) => {
      showMutationToast(data);
      if (data.success && userData) {
        await refetchUser();
        sendGTMEvent({
          event: "level_up",
          level: userData.level + 1,
          character: userData.userId,
        });
      }
    },
    onSettled: () => {
      document.body.style.cursor = "default";
      setIsLevelling(false);
    },
  });

  const canDelete =
    userData &&
    !userData.isBanned &&
    userData.deletionAt &&
    new Date(userData.deletionAt) < new Date();
  const expRequired =
    userData &&
    Math.max(calcLevelRequirements(userData.level) - userData.experience, 0);

  if (!userData) {
    return <Loader explanation="Loading profile page..." />;
  }
  if (isTogglingDelete || isDeleting) {
    return <Loader explanation="Performing action..." />;
  }

  return (
    <>
      <ContentBox
        title="Profile"
        subtitle="An overview of basic information"
        topRightContent={
          <div className="flex flex-row gap-1">
            {showModal && (
              <Modal
                title={`Level up to Lvl ${userData.level + 1}!`}
                setIsOpen={setShowModal}
                proceed_label="Awesome!"
                isValid={false}
                onAccept={() => {
                  levelUp();
                  setShowModal(false);
                }}
              >
                <div className="basis-1/2 absolute top-0 right-0 opacity-20">
                  <Image
                    alt="Level up graphic"
                    src="/images/levelupguy.webp"
                    width={375}
                    height={436}
                  />
                </div>
                {isLevelling && <Loader explanation="Leveling up..." />}
                {!isLevelling && (
                  <>
                    <div className="">
                      Congratulations on leveling up! Your dedication and hard work have
                      paid off, and you have proven yourself to be a true ninja warrior.
                      Keep up the great work and continue to hone your skills.
                    </div>
                    <p className="pt-2">
                      <span className="font-bold">New Health:</span>{" "}
                      {calcHP(userData.level + 1)} points
                    </p>
                    <p className="pt-2">
                      <span className="font-bold">New Chakra:</span>{" "}
                      {calcCP(userData.level + 1)} points
                    </p>
                    <p className="pt-2">
                      <span className="font-bold">New Stamina:</span>{" "}
                      {calcSP(userData.level + 1)} points
                    </p>
                  </>
                )}
              </Modal>
            )}
            <Link href="/profile/recruit">
              <Share2 className="h-6 w-6 cursor-pointer hover:text-orange-500" />
            </Link>
            <Link href="/profile/edit">
              <Wrench className="h-6 w-6 cursor-pointer hover:text-orange-500" />
            </Link>
            <Confirm
              title="Confirm Deletion"
              button={
                <Trash2
                  className={`h-6 w-6 cursor-pointer hover:text-orange-500 ${
                    userData.deletionAt ? "fill-red-500" : ""
                  }`}
                />
              }
              proceed_label={
                canDelete
                  ? "Complete Deletion"
                  : userData.deletionAt
                    ? "Disable Deletion Timer"
                    : "Enable Deletion Timer"
              }
              onAccept={(e) => {
                e.preventDefault();
                if (canDelete) {
                  confirmDeletion();
                } else {
                  toggleDeletionTimer();
                }
              }}
            >
              <span>
                This feature is intended for marking the character for deletion.
                Toggling this feature enables a timer of 2 days, after which you will be
                able to delete the character - this is to ensure no un-intentional
                character deletion.
                {userData.isBanned && (
                  <p className="font-bold py-3">
                    NOTE: You are banned, and cannot delete your account until the ban
                    is over!
                  </p>
                )}
                {userData.deletionAt && (
                  <Button
                    id="create"
                    disabled={userData.deletionAt > new Date() || userData.isBanned}
                    className="w-full mt-3"
                    variant="destructive"
                    onClick={(e) => {
                      e.preventDefault();
                      if (userData.deletionAt) {
                        toggleDeletionTimer();
                      }
                    }}
                  >
                    {userData.deletionAt < new Date() ? (
                      "Disable Deletion Timer"
                    ) : (
                      <Countdown targetDate={userData.deletionAt} timeDiff={timeDiff} />
                    )}
                  </Button>
                )}
              </span>
            </Confirm>
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
            <p>Village prestige: {userData.villagePrestige}</p>
          </div>
          <div>
            <b>Associations</b>
            <p>Village: {userData.village?.name}</p>
            <p>Bloodline: {userData.bloodline?.name || "None"}</p>
            <p>ANBU: {userData.anbuSquad?.name || "None"}</p>
            <p>Clan: {userData.clan?.name || "None"}</p>
            <p>Medical: {capitalizeFirstLetter(calcMedninRank(userData))}</p>
          </div>
        </div>
        {expRequired !== undefined && expRequired <= 0 && (
          <Button
            id="create"
            className="w-full mt-3"
            onClick={(e) => {
              e.preventDefault();
              setShowModal(true);
            }}
          >
            <GraduationCap className="h-6 w-6 mr-2" />
            Level up!
          </Button>
        )}
      </ContentBox>
      <StrengthWeaknesses />
      <Logbook />
    </>
  );
}
