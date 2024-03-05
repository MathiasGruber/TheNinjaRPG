import { useState } from "react";
import { useSafePush } from "@/utils/routing";
import ItemWithEffects from "@/layout/ItemWithEffects";
import ContentBox from "@/layout/ContentBox";
import NavTabs from "@/layout/NavTabs";
import Loader from "@/layout/Loader";
import MassEditContent from "@/layout/MassEditContent";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { FilePlus, SquarePen } from "lucide-react";
import { useInfinitePagination } from "@/libs/pagination";
import { ItemRarities, ItemTypes } from "../../../drizzle/constants";
import { api } from "@/utils/api";
import { showMutationToast } from "@/libs/toast";
import { canChangeContent } from "@/utils/permissions";
import { useUserData } from "@/utils/UserContext";
import type { NextPage } from "next";

const ManualItems: NextPage = () => {
  // Settings
  const { data: userData } = useUserData();
  const [rarity, setRarity] = useState<(typeof ItemRarities)[number]>("COMMON");
  const [itemType, setItemType] = useState<(typeof ItemTypes)[number]>("WEAPON");
  const [lastElement, setLastElement] = useState<HTMLDivElement | null>(null);

  // Router for forwarding
  const router = useSafePush();

  // Data
  const {
    data: items,
    isFetching,
    refetch,
    fetchNextPage,
    hasNextPage,
  } = api.item.getAll.useInfiniteQuery(
    { itemType: itemType, itemRarity: rarity, limit: 20 },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      placeholderData: (previousData) => previousData,
      staleTime: Infinity,
    },
  );
  const allItems = items?.pages.map((page) => page.data).flat();
  useInfinitePagination({ fetchNextPage, hasNextPage, lastElement });

  // Mutations
  const { mutate: create, isPending: load1 } = api.item.create.useMutation({
    onSuccess: async (data) => {
      showMutationToast(data);
      await refetch();
      await router.push(`/cpanel/item/edit/${data.message}`);
    },
  });

  const { mutate: remove, isPending: load2 } = api.item.delete.useMutation({
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
        title="Items"
        subtitle="Content"
        back_href="/manual"
        topRightContent={
          <div className="lg:flex lg:flex-row">
            <div className="grow"></div>
            <Select
              onValueChange={(e) => setItemType(e as (typeof ItemTypes)[number])}
              defaultValue={itemType}
              value={itemType}
            >
              <SelectTrigger>
                <SelectValue placeholder={`None`} />
              </SelectTrigger>
              <SelectContent>
                {Object.values(ItemTypes).map((target) => (
                  <SelectItem key={target} value={target}>
                    {target}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
      >
        <p>
          In the treacherous world of ninja warfare, the mastery of jutsu alone is not
          enough to ensure victory. To become a truly formidable force, ninjas must
          harness the power of a diverse array of tools, weapons, and armor. These
          essential implements are instrumental in enhancing their combat prowess,
          aiding their strategic maneuvers, and providing crucial defense in the face of
          danger.
        </p>
      </ContentBox>
      <br />
      <ContentBox
        title="Database"
        subtitle={`Category: ${itemType.toLowerCase()}`}
        initialBreak={true}
        topRightCorntentBreakpoint="sm"
        topRightContent={
          <div className="sm:flex sm:flex-row items-center">
            {userData && canChangeContent(userData.role) && (
              <div className="grid grid-cols-1 gap-1 mr-1">
                <Button
                  id={`create-${itemType}`}
                  className="w-full"
                  onClick={() => create({ type: itemType })}
                >
                  <FilePlus className="mr-2 h-6 w-6" />
                  New
                </Button>
                <MassEditContent
                  title="Mass Edit Items"
                  type="item"
                  button={
                    <Button id="create-item" className="w-full">
                      <SquarePen className="mr-2 h-6 w-6" />
                      Edit
                    </Button>
                  }
                />
              </div>
            )}
            <div className="grow"></div>
            <NavTabs
              current={rarity}
              options={Object.values(ItemRarities)}
              setValue={setRarity}
            />
          </div>
        }
      >
        {totalLoading && <Loader explanation="Loading data" />}
        {allItems?.map((item, i) => (
          <div key={item.id} ref={i === allItems.length - 1 ? setLastElement : null}>
            <ItemWithEffects
              item={item}
              key={item.id}
              onDelete={(id: string) => remove({ id })}
              showEdit="item"
              showStatistic="item"
            />
          </div>
        ))}
      </ContentBox>
    </>
  );
};

export default ManualItems;
