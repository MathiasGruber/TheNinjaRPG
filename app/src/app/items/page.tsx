"use client";

import { useState } from "react";
import { Merge, CircleDollarSign, Cookie } from "lucide-react";
import Image from "next/image";
import NavTabs from "@/layout/NavTabs";
import ContentBox from "@/layout/ContentBox";
import Loader from "@/layout/Loader";
import ItemWithEffects from "@/layout/ItemWithEffects";
import Modal from "@/layout/Modal";
import Confirm from "@/layout/Confirm";
import ContentImage from "@/layout/ContentImage";
import { nonCombatConsume } from "@/libs/item";
import { Button } from "@/components/ui/button";
import { ActionSelector } from "@/layout/CombatActions";
import { useRequiredUserData } from "@/utils/UserContext";
import { api } from "@/utils/api";
import { showMutationToast } from "@/libs/toast";
import { calcMaxItems } from "@/libs/item";
import { CircleArrowUp } from "lucide-react";
import { COST_EXTRA_ITEM_SLOT } from "@/drizzle/constants";
import type { UserWithRelations } from "@/server/api/routers/profile";
import type { Item, UserItem, ItemSlot } from "@/drizzle/schema";

export default function MyItems() {
  // State
  const { data: userData } = useRequiredUserData();
  const tabs = ["Character", "Backpack"];
  const [screen, setScreen] = useState<(typeof tabs)[number]>("Character");

  // tRPC utils
  const utils = api.useUtils();

  // Data from DB
  useRequiredUserData();
  const {
    data: userItems,
    refetch,
    isFetching,
  } = api.item.getUserItems.useQuery(undefined, {
    staleTime: Infinity,
    enabled: userData !== undefined,
  });

  // Mutations
  const { mutate: buyItemSlot, isPending } = api.blackmarket.buyItemSlot.useMutation({
    onSuccess: async (data) => {
      showMutationToast(data);
      if (data.success) {
        await utils.profile.getUser.invalidate();
      }
    },
  });

  // Collapse UserItem and Item
  const allItems = userItems?.map((useritem) => {
    return { ...useritem.item, ...useritem };
  });

  // Subtitle
  const nonEquipped = allItems?.filter((item) => item.equipped === "NONE");

  // Loaders
  if (!userData) return <Loader explanation="Loading userdata" />;

  // Can afford removing
  const canAfford =
    userData.reputationPoints && userData.reputationPoints >= COST_EXTRA_ITEM_SLOT;

  // Subtitle
  const subtitle =
    screen === "Character" ? (
      "Equip for battle"
    ) : (
      <div className="flex flex-row items-center">
        Inventory {nonEquipped?.length}/{calcMaxItems(userData)}
        <Confirm
          title="Extra Item Slot"
          proceed_label={
            canAfford
              ? `Purchase for ${COST_EXTRA_ITEM_SLOT} reps`
              : `Need ${userData.reputationPoints - COST_EXTRA_ITEM_SLOT} more reps`
          }
          isValid={!isPending}
          button={
            <CircleArrowUp className="h-5 w-5 ml-2 hover:text-orange-500 hover:cursor-pointer" />
          }
          onAccept={(e) => {
            e.preventDefault();
            if (canAfford) buyItemSlot();
          }}
        >
          <p>
            You are about to purchase an extra item slot for {COST_EXTRA_ITEM_SLOT}{" "}
            reputation points. You currently have {userData.reputationPoints} points.
            Are you sure?
          </p>
        </Confirm>
      </div>
    );

  return (
    <ContentBox
      title="Item Management"
      subtitle={subtitle}
      topRightContent={<NavTabs current={screen} options={tabs} setValue={setScreen} />}
    >
      {!isFetching && screen === "Character" && (
        <Character items={allItems} refetch={() => refetch()} />
      )}
      {!isFetching && screen === "Backpack" && (
        <Backpack userData={userData} items={nonEquipped} />
      )}
      {isFetching && <Loader explanation="Loading items" />}
    </ContentBox>
  );
}

/**
 * Backpack Screen
 */
interface BackpackProps {
  items: (UserItem & Item)[] | undefined;
  userData: NonNullable<UserWithRelations>;
}

const Backpack: React.FC<BackpackProps> = (props) => {
  // State
  const [item, setItem] = useState<(UserItem & Item) | undefined>(undefined);
  const [isOpen, setIsOpen] = useState<boolean>(false);

  // tRPC utility
  const utils = api.useUtils();

  // Handler for when mutations are settled
  const onSettled = () => {
    document.body.style.cursor = "default";
    setIsOpen(false);
    setItem(undefined);
  };

  // Mutations
  const { mutate: merge, isPending: isMerging } = api.item.mergeStacks.useMutation({
    onSuccess: async (data) => {
      showMutationToast(data);
      if (data.success) {
        await utils.item.getUserItems.invalidate();
      }
    },
    onSettled,
  });

  const { mutate: consume, isPending: isConsuming } = api.item.consume.useMutation({
    onSuccess: async (data) => {
      showMutationToast(data);
      if (data.success) {
        await utils.item.getUserItems.invalidate();
      }
    },
    onSettled,
  });

  const { mutate: sell, isPending: isSelling } = api.item.sellUserItem.useMutation({
    onSuccess: async (data) => {
      showMutationToast(data);
      if (data.success) {
        await utils.item.getUserItems.invalidate();
      }
    },
    onSettled,
  });

  return (
    <>
      <ActionSelector
        items={props.items}
        counts={props.items}
        selectedId={item?.id}
        showBgColor={false}
        showLabels={false}
        onClick={(id) => {
          if (id == item?.id) {
            setItem(undefined);
            setIsOpen(false);
          } else {
            setItem(props.items?.find((item) => item.id === id));
            setIsOpen(true);
          }
        }}
      />
      {isOpen && item && (
        <Modal title="Item Details" setIsOpen={setIsOpen} isValid={false}>
          {!isMerging && !isSelling && (
            <>
              <ItemWithEffects item={item} key={item.id} showStatistic="item" />
              <div className="flex flex-row gap-1">
                {item.canStack && (
                  <Button variant="info" onClick={() => merge({ itemId: item.itemId })}>
                    <Merge className="mr-2 h-5 w-5" />
                    Merge Stacks
                  </Button>
                )}
                {nonCombatConsume(item, props.userData) && (
                  <Button
                    variant="info"
                    onClick={() => consume({ userItemId: item.id })}
                  >
                    <Cookie className="mr-2 h-5 w-5" />
                    Consume
                  </Button>
                )}
                <div className="grow"></div>
                <Button
                  id="sell"
                  variant="destructive"
                  onClick={() => sell({ userItemId: item.id })}
                >
                  <CircleDollarSign className="mr-2 h-5 w-5" />
                  Sell Item [{Math.floor(item.cost / 2)} ryo]
                </Button>
              </div>
            </>
          )}
          {isMerging && <Loader explanation={`Merging ${item.name} stacks`} />}
          {isConsuming && <Loader explanation={`Using ${item.name}`} />}
          {isSelling && <Loader explanation={`Selling ${item.name}`} />}
        </Modal>
      )}
    </>
  );
};

/**
 * Character Equip Screen
 */
interface CharacterProps {
  items: (UserItem & Item)[] | undefined;
  refetch: () => void;
}

const Character: React.FC<CharacterProps> = (props) => {
  // Set state
  const { items } = props;
  const [slot, setSlot] = useState<ItemSlot | undefined>(undefined);
  const [item, setItem] = useState<(UserItem & Item) | undefined>(undefined);
  const [isOpen, setIsOpen] = useState<boolean>(false);

  // The item on the current slot
  const equipped = items?.find((item) => item.equipped === slot);

  // Open modal for equipping
  const act = (slot: ItemSlot) => {
    setSlot(slot);
    setIsOpen(true);
  };

  // Mutations
  const { mutate: equip, isPending: isEquipping } = api.item.toggleEquip.useMutation({
    onSuccess: () => {
      props.refetch();
    },
    onSettled: () => {
      document.body.style.cursor = "default";
      setIsOpen(false);
      setItem(undefined);
    },
  });

  // Placement of equip boxes
  const l = "left-[10%] ";
  const r = "right-[10%] ";
  const t1 = "top-2";
  const t2 = "top-[20%]";
  const t3 = "top-[40%]";
  const t4 = "top-[60%]";
  const t5 = "top-[80%]";

  return (
    <div className="flex flex-row items-center justify-center text-center">
      <Image
        className="w-full opacity-50"
        src="/equip/silhouette.webp"
        alt="background"
        width={461}
        height={461}
      />
      <Equip slot={"HEAD"} act={act} txt="Head" pos={t1} items={items} />
      <Equip slot={"CHEST"} act={act} txt="Chest" pos={t2} items={items} />
      <Equip slot={"LEGS"} act={act} txt="Legs" pos={t3} items={items} />
      <Equip slot={"FEET"} act={act} txt="Feet" pos={t4} items={items} />
      <Equip slot={"ITEM_1"} act={act} txt="Item" pos={l + t2} items={items} />
      <Equip slot={"ITEM_2"} act={act} txt="Item" pos={r + t2} items={items} />
      <Equip slot={"HAND_1"} act={act} txt="Hand" pos={l + t3} items={items} />
      <Equip slot={"HAND_2"} act={act} txt="Hand" pos={r + t3} items={items} />
      <Equip slot={"ITEM_3"} act={act} txt="Item" pos={l + t4} items={items} />
      <Equip slot={"ITEM_4"} act={act} txt="Item" pos={r + t4} items={items} />
      <Equip slot={"ITEM_5"} act={act} txt="Item" pos={l + t5} items={items} />
      <Equip slot={"ITEM_6"} act={act} txt="Item" pos={t5} items={items} />
      <Equip slot={"ITEM_7"} act={act} txt="Item" pos={r + t5} items={items} />
      {isOpen && slot && (
        <Modal
          title="Select Item"
          setIsOpen={setIsOpen}
          isValid={false}
          proceed_label={equipped ? "Unequip" : undefined}
          onAccept={() => {
            if (equipped) {
              setItem(equipped);
              equip({ userItemId: equipped.id, slot: slot });
            }
          }}
        >
          {!isEquipping && (
            <ActionSelector
              items={items?.filter((item) => slot?.includes(item.slot))}
              counts={items}
              showBgColor={false}
              showLabels={false}
              greyedIds={items
                ?.filter((item) => item.equipped !== "NONE")
                .map((item) => item.id)}
              onClick={(id) => {
                setItem(items?.find((item) => item.id === id));
                equip({ userItemId: id, slot: slot });
              }}
            />
          )}
          {isEquipping && item && <Loader explanation={`Swapping ${item.name}`} />}
        </Modal>
      )}
    </div>
  );
};

/**
 * Equip on the Character Equip Screen
 */
interface EquipProps {
  txt: string;
  pos: string;
  slot: ItemSlot;
  items: (UserItem & Item)[] | undefined;
  act: (slot: ItemSlot) => void;
}

const Equip: React.FC<EquipProps> = (props) => {
  const item = props.items?.find((item) => item.equipped == props.slot);
  return (
    <div
      className={`absolute ${
        props.pos
      } flex h-1/6 w-1/6 cursor-pointer flex-row items-center justify-center border-2 border-dashed border-slate-500 bg-slate-200 text-xl font-bold ${
        item ? "" : "opacity-50"
      } hover:border-black hover:bg-slate-400`}
      onClick={() => props.act(props.slot)}
    >
      {item ? (
        <ContentImage
          image={item.image}
          alt={item.name}
          rarity={item.rarity}
          className=""
        />
      ) : (
        <p className="opacity-100">{props.txt}</p>
      )}
    </div>
  );
};
