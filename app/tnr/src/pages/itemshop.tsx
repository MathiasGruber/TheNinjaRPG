import { useState } from "react";
import ContentBox from "../layout/ContentBox";
import Loader from "../layout/Loader";
import SelectField from "../layout/SelectField";
import Modal from "../layout/Modal";
import ItemWithEffects from "../layout/ItemWithEffects";
import { ActionSelector } from "../layout/CombatActions";
import { UncontrolledSliderField } from "../layout/SliderField";
import { useInfinitePagination } from "../libs/pagination";
import { useRequiredUserData } from "../utils/UserContext";
import { useAwake } from "../utils/routing";
import { api } from "../utils/api";
import { show_toast } from "../libs/toast";
import { ItemTypes } from "../../drizzle/constants";
import type { ItemType, Item } from "../../drizzle/schema";
import type { NextPage } from "next";

const ItemShop: NextPage = () => {
  // Settings
  const { data: userData, refetch: refetchUser } = useRequiredUserData();
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [item, setItem] = useState<Item | undefined>(undefined);
  const [stacksize, setStacksize] = useState<number>(1);
  const [itemtype, setItemtype] = useState<ItemType>("WEAPON");
  const [lastElement, setLastElement] = useState<HTMLDivElement | null>(null);
  const isAwake = useAwake(userData);

  // Data
  const {
    data: items,
    isFetching,
    fetchNextPage,
    hasNextPage,
  } = api.item.getAll.useInfiniteQuery(
    { itemType: itemtype, limit: 20 },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      keepPreviousData: true,
      staleTime: Infinity,
    }
  );
  const allItems = items?.pages.map((page) => page.data).flat();
  useInfinitePagination({ fetchNextPage, hasNextPage, lastElement });

  // Get user item counts
  const { data: userItems, refetch: refetchUserItems } =
    api.item.getUserItemCounts.useQuery();

  // Mutations
  const { mutate: purchase, isLoading: isPurchasing } = api.item.buy.useMutation({
    onSuccess: () => {
      void refetchUserItems();
      void refetchUser();
    },
    onError: (error) => {
      show_toast("Error purchasing", error.message, "error");
    },
    onSettled: () => {
      setIsOpen(false);
      setItem(undefined);
    },
  });

  // Can user affort selected item
  const canAfford = item && userData && userData.money >= item.cost;

  return (
    <>
      {isAwake && (
        <ContentBox
          title="Shop"
          subtitle="Buy items"
          back_href="/village"
          topRightContent={
            <>
              <div className="flex flex-row">
                <SelectField
                  id="itemtype"
                  onChange={(e) => {
                    setItemtype(e.target.value as ItemType);
                    setItem(undefined);
                  }}
                >
                  {Object.values(ItemTypes).map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </SelectField>
              </div>
            </>
          }
        >
          {isFetching && <Loader explanation="Loading data" />}
          {!isFetching && userData && (
            <>
              <ActionSelector
                items={allItems}
                counts={userItems}
                selectedId={item?.id}
                labelSingles={true}
                onClick={(id) => {
                  if (id == item?.id) {
                    setItem(undefined);
                    setIsOpen(false);
                  } else {
                    setItem(allItems?.find((item) => item.id === id));
                    setIsOpen(true);
                  }
                }}
                showBgColor={false}
                showLabels={false}
              />
              {isOpen && item && (
                <Modal
                  title="Confirm Purchase"
                  proceed_label={
                    isPurchasing
                      ? undefined
                      : canAfford
                      ? `Buy for ${item.cost * stacksize} ryo`
                      : `Need ${item.cost * stacksize - userData.money} more ryo`
                  }
                  setIsOpen={setIsOpen}
                  isValid={false}
                  onAccept={() => {
                    if (canAfford) {
                      purchase({ itemId: item.id, stack: stacksize });
                    } else {
                      setIsOpen(false);
                    }
                  }}
                  confirmClassName={
                    canAfford
                      ? "bg-blue-600 text-white hover:bg-blue-700"
                      : "bg-red-600 text-white hover:bg-red-700"
                  }
                >
                  <p className="pb-3">You have {userData.money} ryo in your pocket</p>
                  {!isPurchasing && (
                    <>
                      <ItemWithEffects item={item} key={item.id} />
                      {item.canStack && (
                        <UncontrolledSliderField
                          id="stackSize"
                          label={`How many to buy: ${stacksize}`}
                          value={stacksize}
                          min={1}
                          max={item.stackSize}
                          setValue={setStacksize}
                        />
                      )}
                    </>
                  )}
                  {isPurchasing && <Loader explanation={`Purchasing ${item.name}`} />}
                </Modal>
              )}
            </>
          )}
        </ContentBox>
      )}
      {!isAwake && <Loader explanation="Loading userdata" />}
    </>
  );
};

export default ItemShop;
