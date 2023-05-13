import { useState } from "react";
import { type NextPage } from "next";
import type { Item, UserItem } from "@prisma/client";
import { ItemSlot } from "@prisma/client";
import { ArrowsPointingInIcon, TrashIcon } from "@heroicons/react/24/solid";

import Image from "next/image";
import NavTabs from "../layout/NavTabs";
import ContentBox from "../layout/ContentBox";
import Loader from "../layout/Loader";
import ItemWithEffects from "../layout/ItemWithEffects";
import Modal from "../layout/Modal";
import ContentImage from "../layout/ContentImage";
import Button from "../layout/Button";

import { ActionSelector } from "../layout/CombatActions";
import { useRequiredUserData } from "../utils/UserContext";
import { api } from "../utils/api";
import { show_toast } from "../libs/toast";

const MyItems: NextPage = () => {
  // State
  const tabs = ["Character", "Backpack"];
  const [screen, setScreen] = useState<(typeof tabs)[number]>("Character");

  // Data from DB
  useRequiredUserData();
  const {
    data: userItems,
    refetch,
    isFetching,
  } = api.item.getUserItems.useQuery(undefined, {});

  // Collapse UserItem and Item
  const allItems = userItems?.map((useritem) => {
    return { ...useritem.item, ...useritem };
  });

  return (
    <ContentBox
      title="Item Management"
      subtitle="Equip for battle"
      topRightContent={<NavTabs current={screen} options={tabs} setValue={setScreen} />}
    >
      {!isFetching && screen === "Character" && (
        <Character items={allItems} refetch={() => refetch()} />
      )}
      {!isFetching && screen === "Backpack" && (
        <Backpack items={allItems} refetch={() => refetch()} />
      )}
      {isFetching && <Loader explanation="Loading items" />}
    </ContentBox>
  );
};

export default MyItems;

/**
 * Backpack Screen
 */
interface BackpackProps {
  items: (UserItem & Item)[] | undefined;
  refetch: () => void;
}

const Backpack: React.FC<BackpackProps> = (props) => {
  // State
  const [item, setItem] = useState<(UserItem & Item) | undefined>(undefined);
  const [isOpen, setIsOpen] = useState<boolean>(false);

  // Mutations
  const { mutate: merge, isLoading: isMerging } = api.item.mergeStacks.useMutation({
    onSuccess: () => {
      props.refetch();
    },
    onError: (error) => {
      show_toast("Error merging stacks", error.message, "error");
    },
    onSettled: () => {
      setIsOpen(false);
      setItem(undefined);
    },
  });

  const { mutate: drop, isLoading: isDropping } = api.item.dropUserItem.useMutation({
    onSuccess: () => {
      props.refetch();
    },
    onError: (error) => {
      show_toast("Error dropping item", error.message, "error");
    },
    onSettled: () => {
      setIsOpen(false);
      setItem(undefined);
    },
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
          {!isMerging && !isDropping && (
            <>
              <ItemWithEffects item={item} key={item.id} />
              <div className="flex flex-row">
                {item.canStack && (
                  <>
                    <Button
                      id="merge"
                      label="Merge Stacks"
                      color="green"
                      image={<ArrowsPointingInIcon className="mr-3 h-5 w-5" />}
                      onClick={() => merge({ itemId: item.itemId })}
                    />
                  </>
                )}
                <div className="grow"></div>
                <Button
                  id="drop"
                  label="Drop Item"
                  color="red"
                  image={<TrashIcon className="mr-3 h-5 w-5" />}
                  onClick={() => drop({ userItemId: item.id })}
                />
              </div>
            </>
          )}
          {(isMerging || isDropping) && (
            <Loader explanation={`Merging ${item.name} stacks`} />
          )}
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
  const { mutate: equip, isLoading: isEquipping } = api.item.toggleEquip.useMutation({
    onSuccess: () => {
      props.refetch();
    },
    onError: (error) => {
      show_toast("Error during equip", error.message, "error");
    },
    onSettled: () => {
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
      <Equip slot={ItemSlot.HEAD} act={act} txt="Head" pos={t1} items={items} />
      <Equip slot={ItemSlot.CHEST} act={act} txt="Chest" pos={t2} items={items} />
      <Equip slot={ItemSlot.LEGS} act={act} txt="Legs" pos={t3} items={items} />
      <Equip slot={ItemSlot.FEET} act={act} txt="Feet" pos={t4} items={items} />
      <Equip slot={ItemSlot.ITEM_1} act={act} txt="Item" pos={l + t2} items={items} />
      <Equip slot={ItemSlot.ITEM_2} act={act} txt="Item" pos={r + t2} items={items} />
      <Equip slot={ItemSlot.HAND_1} act={act} txt="Hand" pos={l + t3} items={items} />
      <Equip slot={ItemSlot.HAND_2} act={act} txt="Hand" pos={r + t3} items={items} />
      <Equip slot={ItemSlot.ITEM_3} act={act} txt="Item" pos={l + t4} items={items} />
      <Equip slot={ItemSlot.ITEM_4} act={act} txt="Item" pos={r + t4} items={items} />
      <Equip slot={ItemSlot.ITEM_5} act={act} txt="Item" pos={l + t5} items={items} />
      <Equip slot={ItemSlot.ITEM_6} act={act} txt="Item" pos={t5} items={items} />
      <Equip slot={ItemSlot.ITEM_7} act={act} txt="Item" pos={r + t5} items={items} />
      {isOpen && slot && (
        <Modal
          title="Item Details"
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
              selectedId={item?.id}
              showBgColor={false}
              showLabels={false}
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
