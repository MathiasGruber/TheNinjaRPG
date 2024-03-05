import { useState } from "react";
import { useSafePush } from "@/utils/routing";
import Link from "next/link";
import ItemWithEffects from "@/layout/ItemWithEffects";
import ContentBox from "@/layout/ContentBox";
import Loader from "@/layout/Loader";
import MassEditContent from "@/layout/MassEditContent";
import JutsuFiltering, { useFiltering, getFilter } from "@/layout/JutsuFiltering";
import { Button } from "@/components/ui/button";
import { FilePlus, SquarePen, Presentation } from "lucide-react";
import { useInfinitePagination } from "@/libs/pagination";
import { api } from "@/utils/api";
import { showMutationToast } from "@/libs/toast";
import { canChangeContent } from "@/utils/permissions";
import { useUserData } from "@/utils/UserContext";
import type { NextPage } from "next";

const ManualJutsus: NextPage = () => {
  // Settings
  const { data: userData } = useUserData();
  const [lastElement, setLastElement] = useState<HTMLDivElement | null>(null);

  // Two-level filtering
  const state = useFiltering();

  // Router for forwarding
  const router = useSafePush();

  // Get jutsus
  const {
    data: jutsus,
    isFetching,
    refetch,
    fetchNextPage,
    hasNextPage,
  } = api.jutsu.getAll.useInfiniteQuery(
    { limit: 50, ...getFilter(state) },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      placeholderData: (previousData) => previousData,
      staleTime: Infinity,
    },
  );
  const alljutsus = jutsus?.pages.map((page) => page.data).flat();
  useInfinitePagination({ fetchNextPage, hasNextPage, lastElement });

  // Mutations
  const { mutate: create, isPending: load1 } = api.jutsu.create.useMutation({
    onSuccess: async (data) => {
      showMutationToast(data);
      await refetch();
      await router.push(`/cpanel/jutsu/edit/${data.message}`);
    },
  });

  const { mutate: remove, isPending: load2 } = api.jutsu.delete.useMutation({
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
        title="Jutsus"
        subtitle="What are they?"
        back_href="/manual"
        topRightContent={
          <Link href="/manual/jutsus/balance">
            <Button id="jutsu-statistics">
              <Presentation className="mr-2 h-6 w-6" />
              Balance Statistics
            </Button>
          </Link>
        }
      >
        <p>
          In the world of ninja battles, jutsu refers to the mystical skills and
          techniques that a ninja can use. These techniques require the ninja to harness
          their inner chakra energy, which is released through a series of hand
          movements known as hand seals. With countless combinations of hand seals and
          chakra energies, there are endless possibilities for the types of jutsu that
          can be created. Whether it is a technique for offence or defence, a skilled
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
        initialBreak={true}
        topRightContent={
          <div className="sm:flex sm:flex-row items-center">
            {userData && canChangeContent(userData.role) && (
              <div className="flex flex-col gap-1 mr-2">
                <Button id="create-jutsu" onClick={() => create()}>
                  <FilePlus className="mr-2 h-6 w-6" />
                  New
                </Button>
                <MassEditContent
                  title="Mass Edit Jutsus"
                  type="jutsu"
                  button={
                    <Button id="create-jutsu">
                      <SquarePen className="mr-2 h-6 w-6" />
                      Mass Edit
                    </Button>
                  }
                />
              </div>
            )}
            <JutsuFiltering state={state} />
          </div>
        }
      >
        {totalLoading && <Loader explanation="Loading data" />}
        {alljutsus?.map((jutsu, i) => (
          <div key={i} ref={i === alljutsus.length - 1 ? setLastElement : null}>
            <ItemWithEffects
              item={jutsu}
              key={jutsu.id}
              onDelete={(id: string) => remove({ id })}
              showEdit="jutsu"
              showStatistic="jutsu"
            />
          </div>
        ))}
        {!totalLoading && alljutsus?.length === 0 && (
          <div>No jutsus found given the search criteria.</div>
        )}
      </ContentBox>
    </>
  );
};

export default ManualJutsus;
