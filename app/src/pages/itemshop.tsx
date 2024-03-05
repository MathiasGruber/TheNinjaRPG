import { useState } from "react";
import ContentBox from "@/layout/ContentBox";
import Loader from "@/layout/Loader";
import Modal from "@/layout/Modal";
import ItemWithEffects from "@/layout/ItemWithEffects";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ActionSelector } from "@/layout/CombatActions";
import { UncontrolledSliderField } from "@/layout/SliderField";
import { useRequiredUserData } from "@/utils/UserContext";
import { useAwake } from "@/utils/routing";
import { api } from "@/utils/api";
import { showMutationToast } from "@/libs/toast";
import { ItemTypes } from "@/drizzle/constants";
import type { ItemType, Item } from "../../drizzle/schema";
import type { NextPage } from "next";

const ItemShop: NextPage = () => {
  // Settings
  const { data: userData, refetch: refetchUser } = useRequiredUserData();
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [item, setItem] = useState<Item | undefined>(undefined);
  const [stacksize, setStacksize] = useState<number>(1);
  const [itemtype, setItemtype] = useState<ItemType>("WEAPON");
  const isAwake = useAwake(userData);

  // Data
  const { data: items, isFetching } = api.item.getAll.useInfiniteQuery(
    { itemType: itemtype, limit: 500 },
    {
      enabled: userData !== undefined,
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      placeholderData: (previousData) => previousData,
      staleTime: Infinity,
    },
  );
  const allItems = items?.pages.map((page) => page.data).flat();

  // Get user item counts
  const { data: userItems, refetch: refetchUserItems } =
    api.item.getUserItemCounts.useQuery();

  // Mutations
  const { mutate: purchase, isPending: isPurchasing } = api.item.buy.useMutation({
    onSuccess: (data) => {
      showMutationToast(data);
      if (data.success) {
        void refetchUserItems();
        void refetchUser();
      }
    },
    onSettled: () => {
      document.body.style.cursor = "default";
      setIsOpen(false);
      setItem(undefined);
    },
  });

  // Can user affort selected item
  const canAfford = item && userData && userData.money >= item.cost;

  if (!userData) return <Loader explanation="Loading userdata" />;

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
                <Select
                  onValueChange={(e) => {
                    setItemtype(e as ItemType);
                    setItem(undefined);
                  }}
                  defaultValue={itemtype}
                  value={itemtype}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={`None`} />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.values(ItemTypes).map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
                      {item.canStack && item.stackSize > 1 ? (
                        <UncontrolledSliderField
                          id="stackSize"
                          label={`How many to buy: ${stacksize}`}
                          value={stacksize}
                          min={1}
                          max={item.stackSize}
                          setValue={setStacksize}
                        />
                      ) : undefined}
                    </>
                  )}
                  {isPurchasing && <Loader explanation={`Purchasing ${item.name}`} />}
                </Modal>
              )}
            </>
          )}
        </ContentBox>
      )}
      {!isAwake && <Loader explanation="Redirecting because not awake" />}
    </>
  );
};

export default ItemShop;
