import ContentBox from "@/layout/ContentBox";
import Loader from "@/layout/Loader";
import { api } from "@/utils/api";
import { useEffect } from "react";
import { useSafePush } from "@/utils/routing";
import { EditContent } from "@/layout/EditContent";
import { TagFormWrapper } from "@/layout/EditContent";
import { DocumentPlusIcon } from "@heroicons/react/24/outline";
import { DocumentMinusIcon } from "@heroicons/react/24/outline";
import { useRequiredUserData } from "@/utils/UserContext";
import { setNullsToEmptyStrings } from "@/utils/typeutils";
import { DamageTag } from "@/libs/combat/types";
import { ItemValidator } from "@/libs/combat/types";
import { canChangeContent } from "@/utils/permissions";
import { tagTypes } from "@/libs/combat/types";
import { useItemEditForm } from "@/libs/item";
import type { Item } from "@/drizzle/schema";
import type { NextPage } from "next";

const ItemPanel: NextPage = () => {
  const router = useSafePush();
  const itemId = router.query.itemid as string;
  const { data: userData } = useRequiredUserData();

  // Queries
  const { data, isLoading, refetch } = api.item.get.useQuery(
    { id: itemId },
    { staleTime: Infinity, enabled: itemId !== undefined }
  );

  // Convert key null values to empty strings, preparing data for form
  setNullsToEmptyStrings(data);

  // Redirect to profile if not content or admin
  useEffect(() => {
    if (userData && !canChangeContent(userData.role)) {
      void router.push("/profile");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userData]);

  // Prevent unauthorized access
  if (isLoading || !userData || !canChangeContent(userData.role) || !data) {
    return <Loader explanation="Loading data" />;
  }

  return <SingleEditItem item={data} refetch={refetch} />;
};

export default ItemPanel;

interface SingleEditItemProps {
  item: Item;
  refetch: () => void;
}

const SingleEditItem: React.FC<SingleEditItemProps> = (props) => {
  // Form handling
  const {
    item,
    effects,
    form: {
      setValue,
      register,
      formState: { isDirty, errors },
    },
    formData,
    setEffects,
    handleItemSubmit,
  } = useItemEditForm(props.item, props.refetch);

  // Icon for adding tag
  const AddTagIcon = (
    <DocumentPlusIcon
      className="h-6 w-6 cursor-pointer hover:fill-orange-500"
      onClick={() => {
        setEffects([
          ...effects,
          DamageTag.parse({
            description: "placeholder",
            rounds: 0,
            residualModifier: 0,
          }),
        ]);
      }}
    />
  );

  // Show panel controls
  return (
    <>
      <ContentBox
        title="Content Panel"
        subtitle="Item Management"
        back_href="/manual/items"
      >
        {!item && <p>Could not find this item</p>}
        {item && (
          <div className="grid grid-cols-1 md:grid-cols-2 items-center">
            <EditContent
              schema={ItemValidator._def.schema}
              showSubmit={isDirty}
              buttonTxt="Save to Database"
              setValue={setValue}
              register={register}
              errors={errors}
              formData={formData}
              onAccept={handleItemSubmit}
            />
          </div>
        )}
      </ContentBox>

      {effects.length === 0 && (
        <ContentBox
          title={`Item Tags`}
          initialBreak={true}
          topRightContent={<div className="flex flex-row">{AddTagIcon}</div>}
        >
          Please add effects to this item
        </ContentBox>
      )}
      {effects.map((tag, i) => {
        return (
          <ContentBox
            key={i}
            title={`Item Tag #${i + 1}`}
            subtitle="Control battle effects"
            initialBreak={true}
            topRightContent={
              <div className="flex flex-row">
                {AddTagIcon}
                <DocumentMinusIcon
                  className="h-6 w-6 cursor-pointer hover:fill-orange-500"
                  onClick={() => {
                    const newEffects = [...effects];
                    newEffects.splice(i, 1);
                    setEffects(newEffects);
                  }}
                />
              </div>
            }
          >
            <div className="grid grid-cols-1 md:grid-cols-2 items-center">
              <TagFormWrapper
                idx={i}
                tag={tag}
                availableTags={tagTypes}
                effects={effects}
                setEffects={setEffects}
              />
            </div>
          </ContentBox>
        );
      })}
    </>
  );
};
