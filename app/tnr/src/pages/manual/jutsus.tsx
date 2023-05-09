import { useState } from "react";
import { type NextPage } from "next";
import { LetterRank } from "@prisma/client";

import ItemWithEffects from "../../layout/ItemWithEffects";
import ContentBox from "../../layout/ContentBox";
import NavTabs from "../../layout/NavTabs";
import Loader from "../../layout/Loader";

import { useInfinitePagination } from "../../libs/pagination";
import { api } from "../../utils/api";

const ManualJutsus: NextPage = () => {
  // Settings
  const [rarity, setRarity] = useState<LetterRank>(LetterRank.D);
  const [lastElement, setLastElement] = useState<HTMLDivElement | null>(null);

  // Data
  const {
    data: jutsus,
    isFetching,
    fetchNextPage,
    hasNextPage,
  } = api.jutsu.getAll.useInfiniteQuery(
    { rarity: rarity, limit: 20 },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      keepPreviousData: true,
    }
  );
  const alljutsus = jutsus?.pages.map((page) => page.data).flat();
  useInfinitePagination({ fetchNextPage, hasNextPage, lastElement });

  return (
    <>
      <ContentBox title="Jutsus" subtitle="What are they?" back_href="/manual">
        <p>
          In the world of ninja battles, jutsu refers to the mystical skills and
          techniques that a ninja can use. These techniques require the ninja to harness
          their inner chakra energy, which is released through a series of hand
          movements known as hand seals. With countless combinations of hand seals and
          chakra energies, there are endless possibilities for the types of jutsu that
          can be created. Whether it is a technique for offense or defense, a skilled
          ninja must master the art of jutsu to become a true warrior.
        </p>
        <p className="pt-4">
          Jutsu can be trained at the training grounds in your village; here you can
          find multiple teachers, who will teach you how to advance your jutsu for a
          given price.
        </p>
      </ContentBox>
      <ContentBox
        title="Database"
        subtitle="All known jutsu"
        topRightContent={
          <>
            <div className="grow"></div>
            <NavTabs
              current={rarity}
              options={["D", "C", "B", "A", "S"]}
              setValue={setRarity}
            />
          </>
        }
      >
        {isFetching && <Loader explanation="Loading data" />}
        {!isFetching &&
          alljutsus?.map((jutsu, i) => (
            <div
              key={jutsu.id}
              ref={i === alljutsus.length - 1 ? setLastElement : null}
            >
              <ItemWithEffects item={jutsu} key={jutsu.id} imageBorder={true} />
            </div>
          ))}
      </ContentBox>
    </>
  );
};

export default ManualJutsus;
