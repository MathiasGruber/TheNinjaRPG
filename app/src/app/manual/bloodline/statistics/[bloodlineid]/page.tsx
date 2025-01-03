"use client";
import { use } from "react";

import ContentBox from "@/layout/ContentBox";
import Loader from "@/layout/Loader";
import Link from "next/link";
import { useUserData } from "@/utils/UserContext";
import { api } from "@/app/_trpc/client";
import { UsageStats, LevelStats } from "@/layout/UsageStatistics";

export default function BloodlineStatistics(props: {
  params: Promise<{ bloodlineid: string }>;
}) {
  const params = use(props.params);
  const bloodlineId = params.bloodlineid;

  // Queries
  const { data: userData } = useUserData();
  const { data, isPending } = api.data.getStatistics.useQuery(
    { id: bloodlineId, type: "bloodline" },
    { enabled: !!bloodlineId },
  );
  const bloodline = data?.info;
  const usage = data?.usage;
  const totalUsers = data?.totalUsers ?? 0;
  const levelDistribution = data?.levelDistribution;
  const total = usage?.reduce((acc, curr) => acc + curr.count, 0) ?? 0;
  const name = bloodline && "name" in bloodline ? bloodline.name : "";

  // Prevent unauthorized access
  if (isPending) {
    return <Loader explanation="Loading data" />;
  }

  // Show panel controls
  return (
    <>
      {!userData && bloodline && "name" in bloodline && (
        <ContentBox
          title="Bloodline Statistics"
          subtitle={bloodline.name}
          back_href="/manual/jutsu"
        >
          Welcome to the stats page for <b>{bloodline.name}</b> in The Ninja RPG, your
          central resource for understanding how this distinctive bloodline influences
          our ever-expanding ninja world. Rather than delving into lore or backstory,
          this page zeroes in on numbers and core metrics—boosts, special abilities, and
          synergies—that define <b>{bloodline.name}</b>&apos;s power in missions, clan
          battles, and PvP showdowns. <br /> <br /> Bloodlines in The Ninja RPG,
          including <b>{bloodline.name}</b>, play a critical role in shaping your unique
          playstyle. By analyzing this bloodline’s stats, you can see how well it aligns
          with your chosen jutsu, items, and elemental affinities. Whether you
          specialize in stealth, brute force, or support, <b>{bloodline.name}</b> can
          amplify your strengths and help you overcome even the toughest challenges our
          world has to offer. <br /> <br /> Ready to dive deeper into bloodlines and
          more? The{" "}
          <Link className="font-bold" href="/manual">
            {" "}
            game manual{" "}
          </Link>{" "}
          is your go-to source for advanced skill mechanics and mission strategies. You
          can also join our vibrant{" "}
          <Link className="font-bold" href="https://discord.gg/grPmTr4z9C">
            {" "}
            Discord community{" "}
          </Link>{" "}
          to stay informed about the latest updates and discuss optimal builds with
          ninjas from all walks of life. If you have insights or suggestions to share,
          head over to our{" "}
          <Link
            className="font-bold"
            href="https://github.com/MathiasGruber/TheNinjaRPG/issues"
          >
            {" "}
            GitHub repository{" "}
          </Link>{" "}
          , or visit the{" "}
          <Link className="font-bold" href="/forum">
            {" "}
            forums{" "}
          </Link>{" "}
          for in-depth conversations on bloodline synergy, upcoming features, and more.{" "}
          <br /> <br /> Every bloodline, including <b>{bloodline.name}</b>, offers a
          unique path to mastery, enhancing your toolkit in ways that can make or break
          your journey to become a legendary ninja. By studying the stats on this page,
          you&apos;ll be better prepared to harness the full power of{" "}
          <b>{bloodline.name}</b>, customizing your gameplay for maximum impact. If
          you&apos;re ready to advance your skills, sign up or log in at
          theninja-rpg.com, and begin your adventure toward forging an unforgettable
          legacy in The Ninja RPG.
        </ContentBox>
      )}
      <ContentBox
        title={`Bloodline: ${name}`}
        subtitle={`Total users: ${totalUsers}`}
        initialBreak={!userData && !!bloodline}
        back_href={userData ? "/manual/bloodline" : undefined}
      >
        {levelDistribution && (
          <LevelStats
            levelDistribution={levelDistribution}
            title="#Users vs. User Level"
            xaxis="User Level"
          />
        )}
      </ContentBox>
      <ContentBox
        title="Usage Statistics"
        subtitle={`Total battles: ${total}`}
        initialBreak={true}
      >
        {usage && <UsageStats usage={usage} />}
      </ContentBox>
    </>
  );
}
