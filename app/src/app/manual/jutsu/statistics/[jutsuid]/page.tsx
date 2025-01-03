"use client";
import { use } from "react";

import ContentBox from "@/layout/ContentBox";
import Loader from "@/layout/Loader";
import Link from "next/link";
import { useUserData } from "@/utils/UserContext";
import { api } from "@/app/_trpc/client";
import { UsageStats, LevelStats } from "@/layout/UsageStatistics";

export default function JutsuStatistics(props: {
  params: Promise<{ jutsuid: string }>;
}) {
  const params = use(props.params);
  const jutsuId = params.jutsuid;

  // Queries
  const { data: userData } = useUserData();
  const { data, isPending } = api.data.getStatistics.useQuery(
    { id: jutsuId, type: "jutsu" },
    { enabled: !!jutsuId },
  );
  const jutsu = data?.info;
  const usage = data?.usage;
  const totalUsers = data?.totalUsers ?? 0;
  const levelDistribution = data?.levelDistribution;
  const total = usage?.reduce((acc, curr) => acc + curr.count, 0) ?? 0;
  const name = jutsu && "name" in jutsu ? jutsu.name : "";

  // Prevent unauthorized access
  if (isPending) return <Loader explanation="Loading data" />;

  // Show panel controls
  return (
    <>
      {!userData && jutsu && "name" in jutsu && (
        <ContentBox
          title="Jutsu Statistics"
          subtitle={jutsu.name}
          back_href="/manual/jutsu"
        >
          Welcome to <b>{jutsu.name}</b>&apos;s stats page on The Ninja RPG, your
          one-stop resource for understanding how this technique stacks up in our
          ever-evolving ninja landscape. Here, you&apos;ll find crucial data on its
          power, energy usage, cooldowns, and other metrics that shape its effectiveness
          in both PvP and PvE scenarios. Rather than focusing solely on the lore behind{" "}
          <b>{jutsu.name}</b>, this page zooms in on the numbers—helping you gauge how
          well it complements your build and fits into the broader metagame. <br />{" "}
          <br /> Each jutsu in The Ninja RPG, including <b>{jutsu.name}</b>, plays a
          pivotal role in balancing offensive firepower, defensive resilience, and
          supportive capabilities. By analyzing <b>{jutsu.name}</b>&apos;s performance
          stats, you&apos;ll uncover key insights on synergy with other skills,
          recommended elemental affinities, and potential counterplays you may face in
          clan battles or high-stakes PvP encounters. Armed with this knowledge, you can
          make informed decisions when fine-tuning your loadout and overall playstyle.{" "}
          <br /> <br /> Looking to dig deeper into jutsu mechanics and strategy? Our{" "}
          <Link className="font-bold" href="/manual">
            {" "}
            game manual{" "}
          </Link>{" "}
          covers everything from skill trees to mission tactics, while our lively{" "}
          <Link className="font-bold" href="https://discord.gg/grPmTr4z9C">
            {" "}
            Discord community{" "}
          </Link>{" "}
          brings ninjas from around the globe together to share jutsu insights and stay
          up-to-date on game developments. You can also submit feedback, share
          innovative ideas, or report issues in our{" "}
          <Link
            className="font-bold"
            href="https://github.com/MathiasGruber/TheNinjaRPG/issues"
          >
            {" "}
            GitHub repository{" "}
          </Link>{" "}
          , and discuss advanced jutsu concepts on the{" "}
          <Link className="font-bold" href="/forum">
            {" "}
            forums{" "}
          </Link>{" "}
          , where players collaborate to tackle every challenge the ninja world throws
          their way. <br /> <br /> Every jutsu, including <b>{jutsu.name}</b>, is
          meticulously crafted to push your strategic thinking and adaptability to new
          heights. By examining its stats, you&apos;ll be better prepared to integrate{" "}
          <b>{jutsu.name}</b> into your arsenal—whether you&apos;re aiming to
          outmaneuver enemies, support your allies, or achieve mastery through
          relentless training. Ready to level up your ninja journey? Head over to
          theninja-rpg.com, sign up today, and discover how your dedication and
          ingenuity can transform <b>{jutsu.name}</b> into a cornerstone of your legacy
          in The Ninja RPG.
        </ContentBox>
      )}
      <ContentBox
        title={`Jutsu: ${name}`}
        subtitle={`Total users: ${totalUsers}`}
        initialBreak={!userData && !!jutsu}
        back_href={userData ? "/manual/jutsu" : undefined}
      >
        {levelDistribution && (
          <LevelStats
            levelDistribution={levelDistribution}
            title="#Users vs. Jutsu Level"
            xaxis="Jutsu Level"
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
