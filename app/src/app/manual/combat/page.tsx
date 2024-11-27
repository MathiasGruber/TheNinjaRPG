"use client";

import Link from "next/link";
import ContentBox from "@/layout/ContentBox";
import { COMBAT_SECONDS } from "@/libs/combat/constants";
import React from "react";
import { Image as LucideImage } from "lucide-react";
import { Button } from "@/components/ui/button";
import { canChangeContent } from "@/utils/permissions";
import { useUserData } from "@/utils/UserContext";

export default function ManualCombat() {
  const { data: userData } = useUserData();
  return (
    <>
      <ContentBox
        title="Combat"
        subtitle="Fighting for survival"
        back_href="/manual"
        topRightContent={
          userData &&
          canChangeContent(userData.role) && (
            <Link href="/manual/combat/backgroundSchema">
              <Button hoverText="Background Schemas">
                <LucideImage className="w-5 h-6" />
              </Button>
            </Link>
          )
        }
      >
        Combat is based on a turn-based system, where each user gets to perform their
        action in turns of {COMBAT_SECONDS} seconds. The user with the highest
        initiative goes first. Each action has a action point cost, and so one or more
        actions may be possible in each turn.
        <h2 className="text-xl font-bold mt-5">Initiative</h2>
        Initiative is calculated by rolling a random number between 1 and 20 for each
        user. Several modifiers are added to this number:
        <ul className="list-disc ml-5">
          <li>For each lvl above defender, a bonus of 3% is added</li>
          <li>If in own territory, a bonus of 10% is added</li>
          <li>If outside own territory, initiative is reduced by 10%</li>
          <li>For consecutive PVP kills, stacking bonus of 5-0.25% are added</li>
        </ul>
      </ContentBox>
    </>
  );
}
