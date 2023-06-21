import { useState } from "react";
import ItemWithEffects from "../../layout/ItemWithEffects";
import ContentBox from "../../layout/ContentBox";
import NavTabs from "../../layout/NavTabs";
import Loader from "../../layout/Loader";
import { useInfinitePagination } from "../../libs/pagination";
import { ItemRarities } from "../../../drizzle/constants";
import { api } from "../../utils/api";
import type { NextPage } from "next";

const ManualWeapons: NextPage = () => {
  // Settings
  const [rarity, setRarity] = useState<typeof ItemRarities[number]>("COMMON");
  const [lastElement, setLastElement] = useState<HTMLDivElement | null>(null);

  // Data
  const {
    data: items,
    isFetching,
    fetchNextPage,
    hasNextPage,
  } = api.item.getAll.useInfiniteQuery(
    { itemType: "WEAPON", itemRarity: rarity, limit: 20 },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      keepPreviousData: true,
      staleTime: Infinity,
    }
  );
  const allItems = items?.pages.map((page) => page.data).flat();
  useInfinitePagination({ fetchNextPage, hasNextPage, lastElement });

  return (
    <>
      <ContentBox title="Weapons" subtitle="Deadly ninja tools" back_href="/manual">
        <p>
          Weapons are an essential tool for any shinobi. The right weapon can give you
          the edge you need to complete your mission and defend yourself against enemy
          attacks. Each weapon has its unique strengths and weaknesses, and knowing how
          to use them effectively is crucial for success. Weapons are not only used for
          physical attacks but also for channeling chakra to perform various jutsus.
          Additionally, weapons can be used in combination with jutsus to create
          powerful attacks. For instance, a smoke bomb can be used to conceal your
          movements while launching a surprise attack with a weapon. Whether it is for
          physical attacks or jutsus, the right weapon can make all the difference in
          achieving your objectives and coming out on top.
        </p>
      </ContentBox>
      <br />
      <ContentBox
        title="Database"
        subtitle="All weapons"
        topRightCorntentBreakpoint="sm"
        topRightContent={
          <>
            <div className="grow"></div>
            <NavTabs
              current={rarity}
              options={Object.values(ItemRarities)}
              setValue={setRarity}
            />
          </>
        }
      >
        {isFetching && <Loader explanation="Loading data" />}
        {!isFetching &&
          allItems?.map((item, i) => (
            <div key={item.id} ref={i === allItems.length - 1 ? setLastElement : null}>
              <ItemWithEffects item={item} key={item.id} imageBorder={false} />
            </div>
          ))}
      </ContentBox>
    </>
  );
};

export default ManualWeapons;
