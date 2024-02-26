import { useState } from "react";
import { useSafePush } from "@/utils/routing";
import ItemWithEffects from "@/layout/ItemWithEffects";
import ContentBox from "@/layout/ContentBox";
import NavTabs from "@/layout/NavTabs";
import Loader from "@/layout/Loader";
import MassEditContent from "@/layout/MassEditContent";
import { Button } from "@/components/ui/button";
import { FilePlus, SquarePen } from "lucide-react";
import { useInfinitePagination } from "@/libs/pagination";
import { api } from "@/utils/api";
import { showMutationToast } from "@/libs/toast";
import { canChangeContent } from "@/utils/permissions";
import { useUserData } from "@/utils/UserContext";
import type { LetterRanks } from "@/drizzle/constants";
import type { NextPage } from "next";

const ManualBloodlines: NextPage = () => {
  // Settings
  const { data: userData } = useUserData();
  const [rank, setRank] = useState<(typeof LetterRanks)[number]>("D");
  const [lastElement, setLastElement] = useState<HTMLDivElement | null>(null);

  // Router for forwarding
  const router = useSafePush();

  // Data
  const {
    data: bloodlines,
    isFetching,
    refetch,
    fetchNextPage,
    hasNextPage,
  } = api.bloodline.getAll.useInfiniteQuery(
    { rank: rank, limit: 20, showHidden: true },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      keepPreviousData: true,
      staleTime: Infinity,
    },
  );
  const allBloodlines = bloodlines?.pages.map((page) => page.data).flat();
  useInfinitePagination({ fetchNextPage, hasNextPage, lastElement });

  // Mutations
  const { mutate: create, isLoading: load1 } = api.bloodline.create.useMutation({
    onSuccess: async (data) => {
      showMutationToast(data);
      await refetch();
      await router.push(`/cpanel/bloodline/edit/${data.message}`);
    },
  });

  const { mutate: remove, isLoading: load2 } = api.bloodline.delete.useMutation({
    onSuccess: async (data) => {
      showMutationToast(data);
      await refetch();
    },
  });

  // Derived
  const totalLoading = isFetching || load1 || load2;

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
        initialBreak={true}
        topRightContent={
          <div className="sm:flex sm:flex-row">
            {userData && canChangeContent(userData.role) && (
              <div className="flex flex-row gap-1">
                <Button id="create-bloodline" onClick={() => create()}>
                  <FilePlus className="mr-1 h-5 w-5" />
                  New
                </Button>
                <MassEditContent
                  title="Mass Edit Bloodlines"
                  type="bloodline"
                  button={
                    <Button id="create-bloodline" className="sm:mr-5">
                      <SquarePen className="mr-2 h-6 w-6" />
                      Edit
                    </Button>
                  }
                />
              </div>
            )}
            <div className="grow"></div>
            <NavTabs
              current={rank}
              options={["D", "C", "B", "A", "S"]}
              setValue={setRank}
            />
          </div>
        }
      >
        {totalLoading && <Loader explanation="Loading data" />}
        {allBloodlines?.map((bloodline, i) => (
          <div
            key={bloodline.id}
            ref={i === allBloodlines.length - 1 ? setLastElement : null}
          >
            <ItemWithEffects
              item={bloodline}
              key={bloodline.id}
              onDelete={(id: string) => remove({ id })}
              showEdit="bloodline"
              showStatistic="bloodline"
            />
          </div>
        ))}
      </ContentBox>
    </>
  );
};

export default ManualBloodlines;
