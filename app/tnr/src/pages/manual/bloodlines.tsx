import { useState } from "react";
import { type NextPage } from "next";
import { LetterRank } from "@prisma/client/edge";
import ItemWithEffects from "../../layout/ItemWithEffects";
import ContentBox from "../../layout/ContentBox";
import NavTabs from "../../layout/NavTabs";
import Loader from "../../layout/Loader";
import { useInfinitePagination } from "../../libs/pagination";
import { api } from "../../utils/api";

const ManualBloodlines: NextPage = () => {
  // Settings
  const [rank, setRank] = useState<LetterRank>(LetterRank.D);
  const [lastElement, setLastElement] = useState<HTMLDivElement | null>(null);

  // Data
  const {
    data: bloodlines,
    isFetching,
    fetchNextPage,
    hasNextPage,
  } = api.bloodline.getAll.useInfiniteQuery(
    { rank: rank, limit: 20 },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      keepPreviousData: true,
    }
  );
  const allBloodlines = bloodlines?.pages.map((page) => page.data).flat();
  useInfinitePagination({ fetchNextPage, hasNextPage, lastElement });

  return (
    <>
      <ContentBox title="Bloodlines" subtitle="What are they?" back_href="/manual">
        <p>
          Bloodlines are anomalies of the DNA that allow the wielders unique abilities,
          e.g. enhanced chakra control, enhanced stamina, regenerative effects, improved
          elemental control, etc. The name of the bloodline typically describes both the
          anomaly and the resulting techniques associated with it. Historically
          bloodlines are passed down between generations, however, in the modern age of
          the ninja world it is possible for non-bloodline ninja to acquire the genetic
          traits of bloodlines through ninjutsu-assisted surgery.
        </p>
        <p className="pt-4">
          When you reach the rank of Genin, you can go to the hospital of your village
          to take blood samples, in order to learn whether your character was born with
          an innate bloodline. If not, it is also at the hospital where they offer the
          service of implanting bloodlines into your body.
        </p>
      </ContentBox>
      <ContentBox
        title="Database"
        subtitle="All bloodlines"
        topRightContent={
          <>
            <div className="grow"></div>
            <NavTabs
              current={rank}
              options={["D", "C", "B", "A", "S"]}
              setValue={setRank}
            />
          </>
        }
      >
        {isFetching && <Loader explanation="Loading data" />}
        {!isFetching &&
          allBloodlines?.map((bloodline, i) => (
            <div
              key={bloodline.id}
              ref={i === allBloodlines.length - 1 ? setLastElement : null}
            >
              <ItemWithEffects item={bloodline} key={bloodline.id} imageBorder={true} />
            </div>
          ))}
      </ContentBox>
    </>
  );
};

export default ManualBloodlines;
