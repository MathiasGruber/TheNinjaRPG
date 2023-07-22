import { useState } from "react";
import ItemWithEffects from "../../layout/ItemWithEffects";
import ContentBox from "../../layout/ContentBox";
import Loader from "../../layout/Loader";
import { useInfinitePagination } from "../../libs/pagination";
import { api } from "../../utils/api";
import type { GenericObject } from "../../layout/ItemWithEffects";
import type { NextPage } from "next";

const ManualAI: NextPage = () => {
  // Settings
  const [lastElement, setLastElement] = useState<HTMLDivElement | null>(null);

  // Data
  const {
    data: users,
    fetchNextPage,
    hasNextPage,
    isFetching,
  } = api.profile.getPublicUsers.useInfiniteQuery(
    { limit: 30, orderBy: "Weakest", isAi: 1 },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      keepPreviousData: true,
      staleTime: Infinity,
    }
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
        attacks: user.jutsus?.map((jutsu) =>
          "jutsu" in jutsu ? jutsu.jutsu?.name : "Unknown"
        ),
        ...user,
      } as GenericObject;
    });

  console.log(allUsers);

  useInfinitePagination({ fetchNextPage, hasNextPage, lastElement });

  return (
    <>
      <ContentBox title="AI" subtitle="NPC Opponents" back_href="/manual">
        <p>
          As you progress through the game, the AI opponents will grow more formidable,
          pushing you to continuously improve your ninja abilities and develop new
          strategies. Facing these intelligent opponents will provide a sense of
          achievement when you finally emerge victorious, making the journey through the
          ninja world immersive and rewarding
        </p>
      </ContentBox>
      <ContentBox title="Database" subtitle="All NPCs" initialBreak={true}>
        {isFetching && <Loader explanation="Loading data" />}
        {!isFetching &&
          allUsers?.map((user, i) => (
            <div key={i} ref={i === allUsers.length - 1 ? setLastElement : null}>
              <ItemWithEffects item={user} showEdit="ai" />
            </div>
          ))}
      </ContentBox>
    </>
  );
};

export default ManualAI;
