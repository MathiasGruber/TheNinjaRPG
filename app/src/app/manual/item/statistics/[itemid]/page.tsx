"use client";
import { use } from "react";

import ContentBox from "@/layout/ContentBox";
import Loader from "@/layout/Loader";
import Link from "next/link";
import { useUserData } from "@/utils/UserContext";
import { api } from "@/app/_trpc/client";
import { UsageStats } from "@/layout/UsageStatistics";

export default function ItemStatistics(props: { params: Promise<{ itemid: string }> }) {
  const params = use(props.params);
  const itemId = params.itemid;

  // Queries
  const { data: userData } = useUserData();
  const { data, isPending } = api.data.getStatistics.useQuery(
    { id: itemId, type: "item" },
    { enabled: !!itemId },
  );
  const item = data?.info;
  const usage = data?.usage;
  const totalUsers = data?.totalUsers ?? 0;
  const total = usage?.reduce((acc, curr) => acc + curr.count, 0) ?? 0;
  const name = item && "name" in item ? item.name : "";

  // Prevent unauthorized access
  if (isPending) return <Loader explanation="Loading data" />;

  // Show panel controls
  return (
    <>
      {!userData && item && "name" in item && (
        <ContentBox
          title="Jutsu Statistics"
          subtitle={item.name}
          back_href="/manual/jutsu"
        >
          Welcome to the stats page for <b>{item.name}</b> in The Ninja RPG, your go-to
          destination for understanding this item&apos;s role and potential impact
          within our ever-evolving ninja world. Rather than diving deep into the
          backstory of <b>{item.name}</b>, this page focuses on the numbers—durability,
          power boosts, weight, and other key data points that can make or break your
          strategy in missions, clan battles, or PvP showdowns. <br /> <br /> Each item
          in The Ninja RPG, including <b>{item.name}</b>, serves a unique function in
          balancing your offensive, defensive, and supportive capabilities. By reviewing
          these core stats, you can determine how well <b>{item.name}</b> aligns with
          your build, whether you&apos;re aiming to unleash devastating attacks, shore
          up your defenses, or provide critical backup for your allies. Armed with this
          knowledge, you can fine-tune your loadout to gain an edge where it matters
          most—on the battlefield. <br /> <br /> Looking to delve even deeper into item
          synergy and advanced tactics? The{" "}
          <Link className="font-bold" href="/manual">
            {" "}
            game manual{" "}
          </Link>{" "}
          offers a comprehensive overview of equipment mechanics, skill trees, and
          mission strategies. Join our bustling{" "}
          <Link className="font-bold" href="https://discord.gg/grPmTr4z9C">
            {" "}
            Discord community{" "}
          </Link>{" "}
          to stay informed of the latest updates and discuss gear recommendations with
          ninjas from around the globe. You can also contribute your ideas or report any
          issues in our{" "}
          <Link
            className="font-bold"
            href="https://github.com/MathiasGruber/TheNinjaRPG/issues"
          >
            {" "}
            GitHub repository{" "}
          </Link>{" "}
          , or head over to the{" "}
          <Link className="font-bold" href="/forum">
            {" "}
            forums{" "}
          </Link>{" "}
          for in-depth discussions on item builds, upcoming features, and the evolving
          landscape of The Ninja RPG. <br /> <br /> Every piece of equipment has a
          purpose and place in the game world, and <b>{item.name}</b> is no exception.
          Studying its stats helps you make strategic decisions that enhance your ninja
          skillset, ensuring you remain a formidable force across all of your
          adventures. Ready to take the next step toward crafting a legendary gear
          setup? Sign up or log in at theninja-rpg.com, explore more items, and continue
          your journey toward becoming a true ninja legend.
        </ContentBox>
      )}
      <ContentBox
        title={`Item: ${name}`}
        subtitle={`#battles: ${total}. #users: ${totalUsers}`}
        initialBreak={!userData && !!item}
        back_href={userData ? "/manual/item" : undefined}
      >
        {usage && <UsageStats usage={usage} />}
      </ContentBox>
    </>
  );
}
