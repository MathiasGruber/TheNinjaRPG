import { useState } from "react";
import { useSafePush } from "@/utils/routing";
import Link from "next/link";
import ItemWithEffects from "@/layout/ItemWithEffects";
import ContentBox from "@/layout/ContentBox";
import Loader from "@/layout/Loader";
import { Button } from "@/components/ui/button";
import { FilePlus, Presentation } from "lucide-react";
import { useInfinitePagination } from "@/libs/pagination";
import { api } from "@/utils/api";
import { showMutationToast } from "@/libs/toast";
import { canChangeContent } from "@/utils/permissions";
import { useUserData } from "@/utils/UserContext";
import type { GenericObject } from "@/layout/ItemWithEffects";
import type { NextPage } from "next";

const ManualAI: NextPage = () => {
  // Settings
  const { data: userData } = useUserData();
  const [lastElement, setLastElement] = useState<HTMLDivElement | null>(null);

  // Router for forwarding
  const router = useSafePush();

  // Data
  const {
    data: users,
    fetchNextPage,
    refetch,
    hasNextPage,
    isFetching,
  } = api.profile.getPublicUsers.useInfiniteQuery(
    { limit: 30, orderBy: "Weakest", isAi: 1 },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      staleTime: Infinity,
    },
  );
  const allUsers = users?.pages
    .map((page) => page.data)
    .flat()
    .map((user) => {
      return {
        id: user.userId,
        name: user.username,
        image: user.avatar,
        description: "",
        rarity: "COMMON",
        createdAt: user.updatedAt,
        effects: [],
        href: `/users/${user.userId}`,
        attacks: user.jutsus?.map((jutsu) =>
          "jutsu" in jutsu ? jutsu.jutsu?.name : "Unknown",
        ),
        ...user,
      } as GenericObject;
    });

  useInfinitePagination({ fetchNextPage, hasNextPage, lastElement });

  // Mutations
  const { mutate: create, isPending: load1 } = api.profile.create.useMutation({
    onSuccess: async (data) => {
      showMutationToast(data);
      await refetch();
      await router.push(`/cpanel/ai/edit/${data.message}`);
    },
  });

  const { mutate: remove, isPending: load2 } = api.profile.delete.useMutation({
    onSuccess: async (data) => {
      showMutationToast(data);
      await refetch();
    },
  });

  // Derived
  const totalLoading = isFetching || load1 || load2;

  return (
    <>
      <ContentBox
        title="AI"
        subtitle="NPC Opponents"
        back_href="/manual"
        topRightContent={
          <Link href="/manual/ai/balance">
            <Button id="jutsu-statistics">
              <Presentation className="mr-2 h-6 w-6" />
              Balance Statistics
            </Button>
          </Link>
        }
      >
        <p>
          As you progress through the game, the AI opponents will grow more formidable,
          pushing you to continuously improve your ninja abilities and develop new
          strategies. Facing these intelligent opponents will provide a sense of
          achievement when you finally emerge victorious, making the journey through the
          ninja world immersive and rewarding
        </p>
      </ContentBox>
      <ContentBox
        title="Database"
        subtitle="All NPCs"
        initialBreak={true}
        topRightContent={
          userData &&
          canChangeContent(userData.role) && (
            <Button id="create-ai" onClick={() => create()}>
              <FilePlus className="mr-2 h-5 w-5" /> New AI
            </Button>
          )
        }
      >
        {totalLoading && <Loader explanation="Loading data" />}
        {allUsers?.map((user, i) => (
          <div key={i} ref={i === allUsers.length - 1 ? setLastElement : null}>
            <ItemWithEffects
              item={user}
              onDelete={(id: string) => remove({ id })}
              showEdit="ai"
              showStatistic="ai"
            />
          </div>
        ))}
      </ContentBox>
    </>
  );
};

export default ManualAI;
