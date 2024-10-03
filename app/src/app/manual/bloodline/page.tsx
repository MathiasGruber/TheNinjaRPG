"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import ItemWithEffects from "@/layout/ItemWithEffects";
import ContentBox from "@/layout/ContentBox";
import Loader from "@/layout/Loader";
import MassEditContent from "@/layout/MassEditContent";
import BloodFiltering, { useFiltering, getFilter } from "@/layout/BloodlineFiltering";
import { Button } from "@/components/ui/button";
import { FilePlus, SquarePen, Presentation } from "lucide-react";
import { useInfinitePagination } from "@/libs/pagination";
import { api } from "@/utils/api";
import { showMutationToast } from "@/libs/toast";
import { canChangeContent } from "@/utils/permissions";
import { useUserData } from "@/utils/UserContext";

export default function ManualBloodlines() {
  // Settings
  const { data: userData } = useUserData();
  const [lastElement, setLastElement] = useState<HTMLDivElement | null>(null);

  // Two-level filtering
  const state = useFiltering();

  // Router for forwarding
  const router = useRouter();

  // Data
  const {
    data: bloodlines,
    isFetching,
    refetch,
    fetchNextPage,
    hasNextPage,
  } = api.bloodline.getAll.useInfiniteQuery(
    { limit: 20, ...getFilter(state), showHidden: true },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      placeholderData: (previousData) => previousData,
      staleTime: Infinity,
    },
  );
  const allBloodlines = bloodlines?.pages.map((page) => page.data).flat();
  useInfinitePagination({ fetchNextPage, hasNextPage, lastElement });

  // Mutations
  const { mutate: create, isPending: load1 } = api.bloodline.create.useMutation({
    onSuccess: async (data) => {
      showMutationToast(data);
      await refetch();
      router.push(`/manual/bloodline/edit/${data.message}`);
    },
  });

  const { mutate: remove, isPending: load2 } = api.bloodline.delete.useMutation({
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
        title="Bloodlines"
        subtitle="What are they?"
        back_href="/manual"
        topRightContent={
          <Link href="/manual/bloodline/balance">
            <Button id="bloodline-statistics">
              <Presentation className="mr-2 h-6 w-6" />
              Balance Statistics
            </Button>
          </Link>
        }
      >
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
          When you reach the rank of Genin, you can go to the Wake Island&apos;s Science
          Building to take blood samples, in order to learn whether your character was
          born with an innate bloodline. If not, it is also at the Science Building
          where they offer the service of implanting bloodlines into your body; or
          perhaps take a darker path in the Black Market of your village.
        </p>
      </ContentBox>
      <ContentBox
        title="Database"
        subtitle="All bloodlines"
        initialBreak={true}
        topRightContent={
          <div className="flex flex-row gap-1 items-center">
            {userData && canChangeContent(userData.role) && (
              <>
                <Button id="create-bloodline" onClick={() => create()}>
                  <FilePlus className="sm:mr-2 h-5 w-5" />
                  New
                </Button>
                <MassEditContent
                  title="Mass Edit Bloodlines"
                  type="bloodline"
                  button={
                    <Button id="create-bloodline">
                      <SquarePen className="sm:mr-2 h-6 w-6" />
                      Edit
                    </Button>
                  }
                />
              </>
            )}
            <BloodFiltering state={state} />
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
}
