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
import { useAwake } from "@/utils/routing";
import { api } from "@/utils/api";
import { showMutationToast } from "@/libs/toast";
import { ItemTypes } from "@/drizzle/constants";
import { structureBoost } from "@/utils/village";
import { ANBU_ITEMSHOP_DISCOUNT_PERC } from "@/drizzle/constants";
import type { ItemType, Item } from "@/drizzle/schema";
import type { UserWithRelations } from "@/server/api/routers/profile";

interface ShopProps {
  userData: NonNullable<UserWithRelations>;
  defaultType: ItemType;
  restrictTypes?: ItemType[];
  title?: string;
  subtitle?: string;
  back_href?: string;
  initialBreak?: boolean;
  minCost?: number;
  minRepsCost?: number;
}

const Shop: React.FC<ShopProps> = (props) => {
  // Destructure
  const { userData, defaultType, minCost, minRepsCost, restrictTypes } = props;

  // Settings
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [item, setItem] = useState<Item | undefined>(undefined);
  const [stacksize, setStacksize] = useState<number>(1);
  const [itemtype, setItemtype] = useState<ItemType>(defaultType);
  const isAwake = useAwake(userData);

  // tRPC Utility
  const utils = api.useUtils();

  // Data
  const { data: items, isFetching } = api.item.getAll.useInfiniteQuery(
    { itemType: itemtype, minCost, minRepsCost, onlyInShop: true, limit: 500 },
    {
      enabled: userData !== undefined,
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      placeholderData: (previousData) => previousData,
      staleTime: Infinity,
    },
  );
  const allItems = items?.pages.map((page) => page.data).flat();

  // Mutations
  const { mutate: purchase, isPending: isPurchasing } = api.item.buy.useMutation({
    onSuccess: (data) => {
      showMutationToast(data);
      if (data.success) {
        void utils.item.getUserItemCounts.invalidate();
        void utils.profile.getUser.invalidate();
        void utils.item.getUserItems.invalidate();
      }
    },
    onSettled: () => {
      document.body.style.cursor = "default";
      setIsOpen(false);
      setItem(undefined);
    },
  });

  // Discount factors
  const sDiscount = structureBoost("itemDiscountPerLvl", userData.village?.structures);
  const aDiscount = userData.anbuId ? ANBU_ITEMSHOP_DISCOUNT_PERC : 0;
  const factor = (100 - sDiscount - aDiscount) / 100;

  // Can user afford selected item
  const ryoCost = (item?.cost ?? 0) * stacksize * factor;
  const repsCost = (item?.repsCost ?? 0) * stacksize;
  const canAfford = userData.money >= ryoCost && userData.reputationPoints >= repsCost;
  const costString =
    "Buy for " +
    (ryoCost > 0 ? ryoCost + " ryo" : "") +
    (repsCost > 0 ? repsCost + " reputation points" : "");

  // Item types categories
  let categories = Object.values(ItemTypes);
  if (restrictTypes) categories = categories.filter((t) => restrictTypes.includes(t));

  return (
    <>
      {isAwake && (
        <ContentBox
          title={props.title ?? "Item Shop"}
          subtitle={props.subtitle ?? "Buy items"}
          back_href={props.back_href}
          initialBreak={props.initialBreak}
          topRightContent={
            categories.length > 1 && (
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
                    {categories.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )
          }
        >
          {isFetching && <Loader explanation="Loading data" />}
          {!isFetching && userData && (
            <>
              <ActionSelector
                items={allItems}
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
                        ? costString
                        : `Insufficient funds`
                  }
                  setIsOpen={setIsOpen}
                  isValid={false}
                  onAccept={() => {
                    if (canAfford) {
                      purchase({
                        itemId: item.id,
                        stack: stacksize,
                        villageId: userData.villageId,
                      });
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
                  <p className="pb-3">
                    You have {userData.money} ryo in your pocket and{" "}
                    {userData.reputationPoints} reputation points.
                  </p>
                  {!isPurchasing && (
                    <>
                      <ItemWithEffects
                        item={item}
                        key={item.id}
                        showEdit="item"
                        showStatistic="item"
                      />
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

export default Shop;
