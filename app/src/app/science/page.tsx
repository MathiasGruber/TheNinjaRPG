"use client";

import Loader from "@/layout/Loader";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import ContentBox from "@/layout/ContentBox";
import { RollBloodline, CurrentBloodline, PurchaseBloodline } from "@/layout/Bloodline";
import { BloodlineStatistics } from "@/layout/BloodlineStatistics";
import { useRequireInVillage } from "@/utils/UserContext";
import { IMG_BUILDING_SCIENCEBUILDING } from "@/drizzle/constants";
import { api } from "@/app/_trpc/client";
import { BarChart2 } from "lucide-react";

export default function Science() {
  // Settings
  const { userData, access } = useRequireInVillage("/science");

  // Get data from DB
  const {
    data: prevRoll,
    isPending: isPendingBlood,
    refetch: refetchBloodline,
  } = api.bloodline.getNaturalRolls.useQuery(undefined, {
    enabled: !!userData,
  });

  // Heal finish time
  if (!userData) return <Loader explanation="Loading userdata" />;
  if (!access) return <Loader explanation="Accessing Science Building" />;

  // Derived calculations
  const hasRolled = !!prevRoll;
  const bloodlineId = userData?.bloodlineId;

  return (
    <>
      <ContentBox
        title="Science Building"
        subtitle="Check your genetics"
        padding={false}
        back_href="/village"
        topRightContent={
          <BloodlineStatistics
            trigger={
              <Button id="filter-bloodline">
                <BarChart2 className="sm:mr-2 h-6 w-6 hover:text-orange-500" />
                <p className="hidden sm:block">Roll Statistics</p>
              </Button>
            }
          />
        }
      >
        <Image
          alt="welcome"
          src={IMG_BUILDING_SCIENCEBUILDING}
          width={512}
          height={195}
          className="w-full"
          priority={true}
        />
        <p className="p-3">
          Greetings ninja, and welcome to the Science Building of Wake Island. I am
          Yashagoro Sensei, here in our esteemed institution, we are dedicated to
          exploring science, particularly in the fascinating field of bloodlines.{" "}
        </p>
        <p className="p-3">
          Our researchers tirelessly investigate the mysteries and potentials of
          bloodlines, seeking to unlock their secrets and harness their power for the
          betterment of our world. For those curious about your heritage and potential,
          I invite you to consult with our experts.
        </p>
        {isPendingBlood && <Loader explanation="Loading bloodlines" />}
        {!isPendingBlood && !hasRolled && <RollBloodline refetch={refetchBloodline} />}
      </ContentBox>
      {!isPendingBlood && bloodlineId && (
        <CurrentBloodline bloodlineId={bloodlineId} initialBreak />
      )}
      {!isPendingBlood && hasRolled && <PurchaseBloodline initialBreak />}
    </>
  );
}
