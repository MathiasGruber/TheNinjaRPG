"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import ItemWithEffects from "@/layout/ItemWithEffects";
import ContentBox from "@/layout/ContentBox";
import Loader from "@/layout/Loader";
import MassEditContent from "@/layout/MassEditContent";
// import BackgroundFiltering, { useFiltering, getFilter } from "@/layout/BackgroundFiltering";
import { Button } from "@/components/ui/button";
import { FilePlus, SquarePen } from "lucide-react";
import { useInfinitePagination } from "@/libs/pagination";
import { api } from "@/app/_trpc/client";
import { showMutationToast } from "@/libs/toast";
import { canChangeCombatBgScheme } from "@/utils/permissions";
import { canChangeContent } from "@/utils/permissions";
import { useUserData } from "@/utils/UserContext";

export default function ManualbackgroundSchema() {
  // Settings
  const { data: userData } = useUserData();
  const [lastElement, setLastElement] = useState<HTMLDivElement | null>(null);

  // Router for navigation
  const router = useRouter();

  // Data fetching using tRPC
  const {
    data: backgroundSchema,
    isFetching,
    refetch,
    fetchNextPage,
    hasNextPage,
  } = api.backgroundSchema.getAll.useInfiniteQuery(
    { limit: 10 }, // Adjust limit as needed
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      placeholderData: (previousData) => previousData,
    },
  );
  const allbackgroundSchema = backgroundSchema?.pages.flat();
  useInfinitePagination({ fetchNextPage, hasNextPage, lastElement });

  // Mutations for creating deleting and activating background schemas
  const { mutate: create, isPending: load1 } = api.backgroundSchema.create.useMutation({
    onSuccess: async (data) => {
      showMutationToast(data);
      await refetch();
      router.push(`/manual/backgroundSchema/edit/${data.message}`);
    },
  });

  const { mutate: remove, isPending: load2 } = api.backgroundSchema.delete.useMutation({
    onSuccess: async (data) => {
      showMutationToast(data);
      await refetch();
    },
  });

  const { mutate: activate, isPending: load3 } =
    api.backgroundSchema.activate.useMutation({
      onSuccess: async (data) => {
        showMutationToast(data);
        await refetch();
      },
    });

  // Check if data is loading
  const totalLoading = isFetching || load1 || load2 || load3;
  console.log(allbackgroundSchema);
  return (
    <>
      <ContentBox
        title="Combat Background Schemas"
        subtitle="Manage combat background schemas"
        back_href="/manual"
        topRightContent={
          <div className="flex flex-row gap-1 items-center">
            {userData && canChangeContent(userData.role) && (
              <>
                <Button id="create-backgroundSchema" onClick={() => create()}>
                  <FilePlus className="sm:mr-2 h-5 w-5" />
                  New
                </Button>
                <MassEditContent
                  title="Mass Edit Background Schemas"
                  type="backgroundSchema"
                  button={
                    <Button id="mass-edit-backgroundSchema">
                      <SquarePen className="sm:mr-2 h-6 w-6" />
                      Edit
                    </Button>
                  }
                />
              </>
            )}
            {/* If you have a BackgroundFiltering component, you can include it here */}
            {/* <BackgroundFiltering state={state} /> */}
          </div>
        }
      >
        <p>
          Combat background schemas define the images used for different environments in
          combat. Only users with appropriate permissions can manage these schemas.
        </p>
      </ContentBox>
      {userData && canChangeContent(userData.role) && (
        <ContentBox
          title="Database"
          subtitle="All Combat Background Schemas"
          initialBreak={true}
        >
          {totalLoading && <Loader explanation="Loading data" />}
          {allbackgroundSchema?.map((backgroundSchema, i) => (
            <div
              key={backgroundSchema.id}
              ref={i === allbackgroundSchema.length - 1 ? setLastElement : null}
            >
              <ItemWithEffects
                item={backgroundSchema}
                key={backgroundSchema.id}
                onDelete={(id: string) => remove({ id })}
                showEdit="combat/backgroundSchema"
                hideImage={true}
              />
              {userData && canChangeCombatBgScheme(userData.role) && (
                <Button
                  onClick={() => activate({ id: backgroundSchema.id })}
                  className="mt-2"
                >
                  {backgroundSchema.isActive ? "Is Active" : "Activate"}
                </Button>
              )}
            </div>
          ))}
        </ContentBox>
      )}
    </>
  );
}
