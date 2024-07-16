"use client";

import Loader from "@/layout/Loader";
import Image from "next/image";
import ContentBox from "@/layout/ContentBox";
import { RollBloodline, CurrentBloodline, PurchaseBloodline } from "@/layout/Bloodline";
import { useRequireInVillage } from "@/utils/UserContext";
import { api } from "@/utils/api";

export default function Science() {
  // Settings
  const { userData, access } = useRequireInVillage("/science");

  // Get data from DB
  const {
    data: prevRoll,
    isPending: isPendingBlood,
    refetch: refetchBloodline,
  } = api.bloodline.getRolls.useQuery(
    {
      currentBloodlineId: userData?.bloodlineId,
    },
    { staleTime: Infinity, enabled: userData !== undefined },
  );

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
      >
        <Image
          alt="welcome"
          src="/sciencebuilding.webp"
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
