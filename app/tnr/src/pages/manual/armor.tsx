import { useState } from "react";
import { type NextPage } from "next";
import { ItemType } from "@prisma/client";
import { ItemRarity } from "@prisma/client";

import ItemWithEffects from "../../layout/ItemWithEffects";
import ContentBox from "../../layout/ContentBox";
import NavTabs from "../../layout/NavTabs";
import Loader from "../../layout/Loader";
import { useInfinitePagination } from "../../libs/pagination";
import { api } from "../../utils/api";

const ManualArmor: NextPage = () => {
  // Settings
  const [rarity, setRarity] = useState<ItemRarity>(ItemRarity.COMMON);
  const [lastElement, setLastElement] = useState<HTMLDivElement | null>(null);

  // Data
  const {
    data: items,
    isFetching,
    fetchNextPage,
    hasNextPage,
  } = api.item.getAll.useInfiniteQuery(
    { itemType: ItemType.ARMOR, itemRarity: rarity, limit: 20 },
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
      <ContentBox title="Armor" subtitle="What you wear matters" back_href="/manual">
        <p>
          Wearing armor is of utmost importance as it can be the difference between life
          and death. As a ninja, you will be engaged in high-risk missions that will
          require you to be well-prepared to face any kind of danger. Armor can protect
          you from physical attacks, such as swords, shurikens, and kunais, and can also
          provide defense against certain types of jutsus. Without armor, you will be
          left vulnerable to attacks, which can significantly reduce your chances of
          success. Thus, it is highly recommended that you invest in the right armor to
          ensure that you can complete your missions and emerge victorious. Armor along
          with other items are purchased at the item shop in your village.
        </p>
      </ContentBox>
      <br />
      <ContentBox
        title="Database"
        subtitle="All armor"
        topRightCorntentBreakpoint="sm"
        topRightContent={
          <>
            <div className="grow"></div>
            <NavTabs
              current={rarity}
              options={Object.values(ItemRarity)}
              setValue={setRarity}
            />
          </>
        }
      >
        {isFetching && <Loader explanation="Loading data" />}
        {!isFetching &&
          allItems?.map((item, i) => (
            <div key={item.id} ref={i === allItems.length - 1 ? setLastElement : null}>
              <ItemWithEffects item={item} key={item.id} />
            </div>
          ))}
      </ContentBox>
    </>
  );
};

export default ManualArmor;
