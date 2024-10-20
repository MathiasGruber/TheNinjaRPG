"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import ContentBox from "@/layout/ContentBox";
import Loader from "@/layout/Loader";
import ItemWithEffects from "@/layout/ItemWithEffects";
import { Button } from "@/components/ui/button";
import { api } from "@/utils/api";
import { FilePlus } from "lucide-react";
import { useInfinitePagination } from "@/libs/pagination";
import { useUserData } from "@/utils/UserContext";
import { showMutationToast } from "@/libs/toast";
import { canChangeContent } from "@/utils/permissions";

export default function ManualAssets() {
  // Settings
  const { data: userData } = useUserData();
  const [lastElement, setLastElement] = useState<HTMLDivElement | null>(null);

  // Router for forwarding
  const router = useRouter();

  // Query data
  const {
    data: assets,
    isFetching,
    refetch,
    fetchNextPage,
    hasNextPage,
  } = api.gameAsset.getAll.useInfiniteQuery(
    { limit: 50 },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      placeholderData: (previousData) => previousData,
    },
  );
  const allAssets = assets?.pages.map((page) => page.data).flat();
  useInfinitePagination({ fetchNextPage, hasNextPage, lastElement });

  // Mutations
  const { mutate: create, isPending: load1 } = api.gameAsset.create.useMutation({
    onSuccess: async (data) => {
      showMutationToast(data);
      await refetch();
      router.push(`/manual/asset/edit/${data.message}`);
    },
  });

  const { mutate: remove, isPending: load2 } = api.gameAsset.delete.useMutation({
    onSuccess: async (data) => {
      showMutationToast(data);
      await refetch();
    },
  });

  // Derived
  const isPending = isFetching || load1 || load2;

  // Return JSX
  return (
    <>
      <ContentBox
        title="Game Assets"
        subtitle="Animations, static images, etc."
        back_href="/manual"
      >
        Here you can see the list of all game assets. Click on an asset to view.
      </ContentBox>
      <ContentBox
        title="Database"
        subtitle="All assets"
        initialBreak={true}
        topRightContent={
          <div className="flex flex-row gap-1 items-center">
            {userData && canChangeContent(userData.role) && (
              <>
                <Button id="create-bloodline" onClick={() => create()}>
                  <FilePlus className="sm:mr-2 h-5 w-5" />
                  New
                </Button>
              </>
            )}
            {/* <BloodFiltering state={state} /> */}
          </div>
        }
      >
        {isPending && <Loader explanation="Loading data" />}
        {allAssets?.map((asset, i) => (
          <div key={asset.id} ref={i === allAssets.length - 1 ? setLastElement : null}>
            <ItemWithEffects
              item={asset}
              key={asset.id}
              onDelete={(id: string) => remove({ id })}
              showEdit="asset"
            />
          </div>
        ))}
      </ContentBox>
    </>
  );
}
