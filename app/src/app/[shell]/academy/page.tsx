"use client";

import { useState } from "react";
import {
  getUserCaps,
  IMG_BUILDING_ACADEMY,
  MAX_PLAYER_LEVEL,
} from "@/drizzle/constants";
import ContentBox from "@/layout/ContentBox";
import Image from "@/layout/Image";
import QuestPicker from "@/layout/QuestPicker";
import { eliteJoninExamBlockMessage } from "@/libs/profile";
import { useRequiredUserData } from "@/utils/UserContext";

export default function Academy() {
  const { data: userData } = useRequiredUserData();
  const isElite = userData?.rank === "ELITE JONIN";
  const caps = getUserCaps("ELITE JONIN");
  const subtitle = isElite ? "Elite Jonin milestones" : "Learning the ropes";
  // State
  const [activeElement, setActiveElement] = useState<string>("");

  // Show board
  return (
    <>
      {(activeElement === "" ||
        isElite ||
        (userData && ["JONIN", "ELDER"].includes(userData.rank))) && (
        <ContentBox
          title="Academy"
          subtitle={subtitle}
          defaultBackHref="/village"
          padding={false}
        >
          <Image
            alt="academy-image"
            src={IMG_BUILDING_ACADEMY}
            width={512}
            height={195}
            className="w-full"
            priority={true}
          />
          {isElite ? (
            <p className="p-3">
              Complete milestones to reach level {MAX_PLAYER_LEVEL}. Each milestone
              grants a level, combat stats and larger health, chakra, stamina and energy
              pools. Assigned experience does not increase your level. Rank caps:{" "}
              {caps.gens_cap.toLocaleString()} per general and{" "}
              {caps.stats_cap.toLocaleString()} offence and defence.
            </p>
          ) : userData && ["JONIN", "ELDER"].includes(userData.rank) ? (
            <p className="p-3">
              {eliteJoninExamBlockMessage(userData) ??
                "You qualify for the Elite Jonin exam. Choose an available exam below."}
            </p>
          ) : null}
        </ContentBox>
      )}
      <QuestPicker
        questType="starter"
        title={activeElement === "" ? (isElite ? "Milestones" : "Lessons") : "Academy"}
        subtitle={subtitle}
        initialBreak={activeElement === ""}
        activeQuestId={activeElement}
        setActiveQuestId={setActiveElement}
        defaultBackHref={activeElement === "" ? undefined : "/village"}
      />
    </>
  );
}
