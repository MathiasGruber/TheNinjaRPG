"use client";
import { use } from "react";
import Link from "next/link";
import ContentBox from "@/layout/ContentBox";
import Loader from "@/layout/Loader";
import { api } from "@/app/_trpc/client";
import { useUserData } from "@/utils/UserContext";
import { UsageStats } from "@/layout/UsageStatistics";

export default function ManualAIsStatistcs(props: {
  params: Promise<{ aiid: string }>;
}) {
  const params = use(props.params);
  const aiId = params.aiid;

  // Queries
  const { data: userData } = useUserData();
  const { data, isPending } = api.data.getStatistics.useQuery(
    { id: aiId, type: "ai" },
    { enabled: !!aiId },
  );
  const ai = data?.info;
  const usage = data?.usage;
  const total = usage?.reduce((acc, curr) => acc + curr.count, 0) ?? 0;
  const name = ai && "username" in ai ? ai.username : "";

  // Prevent unauthorized access
  if (isPending) {
    return <Loader explanation="Loading data" />;
  }

  // Show panel controls
  return (
    <>
      {!userData && ai && "username" in ai && (
        <ContentBox title="AI Profile" subtitle={ai.username} back_href="/manual/ai">
          Welcome to <b>{ai.username}</b>&apos;s stats page on The Ninja RPG, your go-to
          source for understanding how this AI opponent measures up in our ever-evolving
          ninja world. Here, you&apos;ll find vital data on battle performance—wins,
          losses, and other metrics that showcase just how formidable{" "}
          <b>{ai.username}</b> can be. Rather than focusing on the AI&apos;s individual
          quirks, this page is all about numbers and outcomes, helping you grasp the
          larger role AI-controlled opponents play in shaping the game&apos;s
          competitive landscape. <br /> <br /> As one of the many AI-driven encounters
          in The Ninja RPG, <b>{ai.username}</b> contributes to the dynamic balance
          between player ambition and in-game challenges. Analyzing its track record and
          combat success rates can help you anticipate strategies, adjust your build,
          and prepare for any scenario the ninja world throws at you. By tracking{" "}
          <b>{ai.username}</b>&apos;s battle statistics, you gain crucial insights into
          the metagame—making every mission, PvP engagement, and clan confrontation a
          more calculated and rewarding experience. <br /> <br /> Looking to sharpen
          your edge even more? Our{" "}
          <Link className="font-bold" href="/manual">
            {" "}
            game manual{" "}
          </Link>{" "}
          provides a comprehensive guide to mechanics, skill trees, and mission
          approaches, while our bustling{" "}
          <Link className="font-bold" href="https://discord.gg/grPmTr4z9C">
            {" "}
            Discord community{" "}
          </Link>{" "}
          brings ninjas from around the world together to swap strategies and stay
          updated on the latest AI developments. You can also contribute new ideas or
          report issues at our{" "}
          <Link
            className="font-bold"
            href="https://github.com/MathiasGruber/TheNinjaRPG/issues"
          >
            {" "}
            GitHub repository{" "}
          </Link>{" "}
          , or explore deeper discussions in the{" "}
          <Link className="font-bold" href="/forum">
            {" "}
            forums{" "}
          </Link>{" "}
          , where players collaborate on all aspects of the game. <br /> <br /> Every AI
          opponent in The Ninja RPG, including <b>{ai.username}</b>, serves a greater
          purpose: testing your combat readiness and spurring you to refine your
          tactics. By examining the performance stats here, you can gauge how well
          you&apos;re prepared to face—and ultimately overcome—any threat the ninja
          world has in store. Ready to climb the ranks and make your mark? Sign up at
          theninja-rpg.com, learn from every encounter, and become a legend in the ever-
          expanding universe of The Ninja RPG.
        </ContentBox>
      )}
      <ContentBox
        title={`AI: ${name}`}
        subtitle={`Total battles: ${total}`}
        initialBreak={!userData && !!ai}
        back_href={userData ? "/manual/ai" : undefined}
      >
        {usage && <UsageStats usage={usage} />}
      </ContentBox>
    </>
  );
}
