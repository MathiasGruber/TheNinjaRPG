import { useState } from "react";
import { useSafePush } from "@/utils/routing";
import ItemWithEffects from "@/layout/ItemWithEffects";
import ContentBox from "@/layout/ContentBox";
import NavTabs from "@/layout/NavTabs";
import Loader from "@/layout/Loader";
import Button from "@/layout/Button";
import SelectField from "@/layout/SelectField";
import MassEditContent from "@/layout/MassEditContent";
import { FilePlus, SquarePen } from "lucide-react";
import { useInfinitePagination } from "@/libs/pagination";
import { ItemRarities, ItemTypes } from "../../../drizzle/constants";
import { api } from "@/utils/api";
import { show_toast } from "@/libs/toast";
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
      keepPreviousData: true,
      staleTime: Infinity,
    },
  );
  const allItems = items?.pages.map((page) => page.data).flat();
  useInfinitePagination({ fetchNextPage, hasNextPage, lastElement });

  // Mutations
  const { mutate: create, isLoading: load1 } = api.item.create.useMutation({
    onSuccess: async (data) => {
      await refetch();
      await router.push(`/cpanel/item/edit/${data.message}`);
      show_toast("Created Item", "Placeholder Item Created", "success");
    },
    onError: (error) => {
      show_toast("Error creating", error.message, "error");
    },
  });

  const { mutate: remove, isLoading: load2 } = api.item.delete.useMutation({
    onSuccess: async () => {
      await refetch();
      show_toast("Deleted Item", "Item Deleted", "success");
    },
    onError: (error) => {
      show_toast("Error deleting", error.message, "error");
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
            <SelectField
              id="item-type"
              label=""
              onChange={(e) =>
                setItemType(e.target.value as (typeof ItemTypes)[number])
              }
            >
              {Object.values(ItemTypes).map((target) => (
                <option key={target} value={target}>
                  {target}
                </option>
              ))}
            </SelectField>
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
              <div className="flex flex-col">
                <Button
                  id={`create-${itemType}`}
                  label={`New`}
                  image={<FilePlus className="mr-2 h-6 w-6" />}
                  onClick={() => create({ type: itemType })}
                  marginClass="pr-2"
                  noJustify={true}
                  borderClass="rounded-t-md border-b-2 border-orange-900"
                />
                <MassEditContent
                  title="Mass Edit Items"
                  type="item"
                  button={
                    <Button
                      id="create-item"
                      label="Edit"
                      image={<SquarePen className="mr-2 h-6 w-6" />}
                      marginClass="mb-1 pr-2 w-full"
                      noJustify={true}
                      borderClass="rounded-b-md"
                    />
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
