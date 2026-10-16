"use client";

import { useParams } from "next/navigation";
import { api } from "@/app/_trpc/client";
import { Button } from "@/components/ui/button";
import ContentBox from "@/layout/ContentBox";
import { HomeScene } from "@/layout/HomeScene";
import Loader from "@/layout/Loader";
import { useUserData } from "@/utils/UserContext";

/** Display the server-authorized decoration snapshot with navigation and no owner actions. */
export default function HomeVisitPage() {
  const params = useParams<{ userId: string }>();
  const { data: user } = useUserData();
  const query = api.home.getVisitedHome.useQuery(
    { userId: params.userId },
    { enabled: !!user, staleTime: 0, retry: false },
  );
  const home = query.data?.home;
  return (
    <ContentBox
      title={home ? `${home.username}'s Home` : "Home visit"}
      defaultBackHref="/users"
    >
      {!user ? (
        <p>Sign in to visit player homes.</p>
      ) : query.isLoading ? (
        <Loader explanation="Opening home" />
      ) : query.isError ? (
        <div role="alert">
          Unable to load this home.{" "}
          <Button onClick={() => void query.refetch()}>Retry</Button>
        </div>
      ) : !home ? (
        <p role="status">{query.data?.message}</p>
      ) : (
        <>
          <p className="mb-3 text-muted-foreground text-sm">
            You are visiting. Explore the rooms and yard to see this player's
            decorations.
          </p>
          <HomeScene
            homeType={home.homeType}
            biome={home.biome}
            styles={home.styles}
            furniture={home.furniture}
            layout={home.layout}
            isVisiting
            isGuest
            isAsleep={false}
            isTogglingSleep={false}
            isDecorating={false}
            onDecoratingChange={() => {}}
            onSleep={() => {}}
            onStorage={() => {}}
            onKitchen={() => {}}
            onFarm={() => {}}
          />
        </>
      )}
    </ContentBox>
  );
}
