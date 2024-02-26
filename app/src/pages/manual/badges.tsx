import { useState } from "react";
import { useSafePush } from "@/utils/routing";
import ContentBox from "@/layout/ContentBox";
import Loader from "@/layout/Loader";
import Modal from "@/layout/Modal";
import ItemWithEffects from "@/layout/ItemWithEffects";
import { Button } from "@/components/ui/button";
import { ActionSelector } from "@/layout/CombatActions";
import { api } from "@/utils/api";
import { FilePlus } from "lucide-react";
import { useUserData } from "@/utils/UserContext";
import { show_toast } from "@/libs/toast";
import { canChangeContent } from "@/utils/permissions";
import type { NextPage } from "next";
import type { Badge } from "@/drizzle/schema";

const ManualBadges: NextPage = () => {
  // Settings
  const { data: userData } = useUserData();
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [badge, setBadge] = useState<Badge | undefined>(undefined);

  // Router for forwarding
  const router = useSafePush();

  // Query data
  const {
    data: badges,
    isFetching,
    refetch,
  } = api.badge.getAll.useInfiniteQuery(
    { limit: 50 },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      keepPreviousData: true,
    },
  );
  const allBadges = badges?.pages.map((page) => page.data).flat();

  // Mutations
  const { mutate: create, isLoading: load1 } = api.badge.create.useMutation({
    onSuccess: async (data) => {
      await refetch();
      await router.push(`/cpanel/badge/edit/${data.message}`);
      show_toast("Created Badge", "Placeholder Badge Created", "success");
    },
    onError: (error) => {
      show_toast("Error creating", error.message, "error");
    },
  });

  const { mutate: remove, isLoading: load2 } = api.badge.delete.useMutation({
    onSuccess: async () => {
      await refetch();
      show_toast("Deleted Badge", "Badge Deleted", "success");
    },
    onError: (error) => {
      show_toast("Error deleting", error.message, "error");
    },
  });

  // Derived
  const isLoading = isFetching || load1 || load2;

  // Return JSX
  return (
    <ContentBox
      title="Badges"
      subtitle="All available user badges"
      back_href="/manual"
      topRightContent={
        userData && canChangeContent(userData.role) ? (
          <Button id="create-badge" onClick={() => create()}>
            <FilePlus className="mr-2 h-6 w-6" />
            New
          </Button>
        ) : undefined
      }
    >
      <p className="mb-2">
        Completing quests, reaching milestones, or assisting in the development of TNR
        can earn you badges. Badges are displayed on your profile, and can be used to
        show off your accomplishments. All badges and details sorrounding them can be
        found below.
      </p>
      <ActionSelector
        items={allBadges}
        labelSingles={true}
        onClick={(id) => {
          setBadge(allBadges?.find((badge) => badge.id === id));
          setIsOpen(true);
        }}
        showBgColor={false}
        roundFull={true}
        hideBorder={true}
        showLabels={true}
        emptyText="No badges exist yet."
      />
      {isOpen && userData && badge && (
        <Modal
          title="Badge Details"
          setIsOpen={setIsOpen}
          isValid={false}
          className="max-w-3xl"
        >
          {!isLoading && (
            <div className="relative">
              <ItemWithEffects
                item={badge}
                key={badge.id}
                onDelete={(id: string) => {
                  remove({ id });
                  setIsOpen(false);
                }}
                showEdit="badge"
              />
            </div>
          )}
          {isLoading && <Loader explanation={`Processing ${badge.name}`} />}
        </Modal>
      )}
    </ContentBox>
  );
};

export default ManualBadges;
