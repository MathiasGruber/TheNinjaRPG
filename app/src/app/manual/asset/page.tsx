"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import ContentBox from "@/layout/ContentBox";
import Loader from "@/layout/Loader";
import ItemWithEffects from "@/layout/ItemWithEffects";
import Modal from "@/layout/Modal";
import { Button } from "@/components/ui/button";
import { api } from "@/app/_trpc/client";
import { FilePlus } from "lucide-react";
import { ActionSelector } from "@/layout/CombatActions";
import { useInfinitePagination } from "@/libs/pagination";
import { useUserData } from "@/utils/UserContext";
import { showMutationToast } from "@/libs/toast";
import { canChangeContent } from "@/utils/permissions";
import GameAssetFiltering, {
  useFiltering,
  getFilter,
} from "@/layout/GameAssetFiltering";
import type { GameAsset } from "@/drizzle/schema";

export default function ManualAssets() {
  // Settings
  const { data: userData } = useUserData();
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [asset, setAsset] = useState<GameAsset | undefined>(undefined);
  const [lastElement, setLastElement] = useState<HTMLDivElement | null>(null);

  // filtering
  const state = useFiltering();

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
    { limit: 60, ...getFilter(state) },
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
    <ContentBox
      title="Database"
      subtitle="All assets"
      back_href="/manual"
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
          <GameAssetFiltering state={state} />
        </div>
      }
    >
      <ActionSelector
        items={allAssets?.map((asset) => ({
          ...asset,
          type: "asset",
          assetType: asset.type,
        }))}
        labelSingles={true}
        onClick={(id) => {
          console.log(id);
          setAsset(allAssets?.find((asset) => asset.id === id));
          setIsOpen(true);
        }}
        showBgColor={false}
        roundFull={true}
        hideBorder={true}
        showLabels={true}
        lastElement={lastElement}
        setLastElement={setLastElement}
        gridClassNameOverwrite="grid grid-cols-3 md:grid-cols-4"
        emptyText="No assets exist yet."
      />
      {isPending && <Loader explanation="Loading data" />}
      {isOpen && userData && asset && (
        <Modal
          title="Asset Details"
          setIsOpen={setIsOpen}
          isValid={false}
          className="max-w-3xl"
        >
          {!isPending && (
            <div className="relative">
              <ItemWithEffects
                hideImage
                item={asset}
                key={asset.id}
                onDelete={(id: string) => {
                  remove({ id });
                  setIsOpen(false);
                }}
                showEdit="asset"
              />
            </div>
          )}
          {isPending && <Loader explanation={`Processing ${asset.name}`} />}
        </Modal>
      )}
    </ContentBox>
  );
}
