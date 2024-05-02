import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { FlaskConical, Scissors } from "lucide-react";
import Confirm from "@/layout/Confirm";
import Loader from "@/layout/Loader";
import ContentBox from "@/layout/ContentBox";
import NavTabs from "@/layout/NavTabs";
import ItemWithEffects from "@/layout/ItemWithEffects";
import Modal from "@/layout/Modal";
import { Button } from "@/components/ui/button";
import { ActionSelector } from "@/layout/CombatActions";
import { useRequiredUserData } from "@/utils/UserContext";
import { ROLL_CHANCE, BLOODLINE_COST, REMOVAL_COST } from "@/libs/bloodline";
import { api } from "@/utils/api";
import { showMutationToast } from "@/libs/toast";
import type { Bloodline, BloodlineRank } from "../../drizzle/schema";

/**
 * Let user purchase a new bloodline
 */
export const PurchaseBloodline: React.FC = () => {
  // State
  const { data: userData, refetch: refetchUser } = useRequiredUserData();
  const [bloodline, setBloodline] = useState<Bloodline | undefined>(undefined);
  const [rank, setRank] = useState<BloodlineRank>("S");
  const [isOpen, setIsOpen] = useState<boolean>(false);

  // Fetch data
  const { data: bloodlines, isFetching } = api.bloodline.getAll.useInfiniteQuery(
    { rank: rank, limit: 500 },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      placeholderData: (previousData) => previousData,
      staleTime: Infinity,
    },
  );
  const allBloodlines = bloodlines?.pages.map((page) => page.data).flat();

  // Mutations
  const { mutate: purchase, isPending: isPurchasing } =
    api.bloodline.purchaseBloodline.useMutation({
      onSuccess: async () => {
        await refetchUser();
      },
      onSettled: () => {
        setIsOpen(false);
        document.body.style.cursor = "default";
      },
    });

  // Derived calculations
  const cost = BLOODLINE_COST[rank];
  const canAfford = userData?.reputationPoints && userData.reputationPoints >= cost;

  return (
    <ContentBox
      title="Bloodline"
      subtitle="Purchase special abilities"
      initialBreak={true}
      topRightContent={
        <>
          <div className="grow"></div>
          <NavTabs
            current={rank}
            options={["D", "C", "B", "A", "S"]}
            setValue={setRank}
          />
        </>
      }
    >
      {userData && (
        <>
          <p>
            A {rank}-rank bloodline costs <b>{cost} reputation points</b>. You have{" "}
            <span className={`${!canAfford ? "text-red-500" : ""} font-bold`}>
              {userData.reputationPoints} points.{" "}
            </span>
          </p>
          {!canAfford ? (
            <>
              <p className="text-base">
                <Link
                  className="font-bold text-red-800 hover:text-orange-500"
                  href="/points"
                >
                  Purchase Reputation Points
                </Link>
              </p>
              <hr className="py-2" />
            </>
          ) : (
            ""
          )}
        </>
      )}

      {!isFetching && (
        <ActionSelector
          items={allBloodlines}
          selectedId={bloodline?.id}
          showBgColor={false}
          showLabels={true}
          onClick={(id) => {
            if (id == bloodline?.id) {
              setBloodline(undefined);
              setIsOpen(false);
            } else {
              setBloodline(allBloodlines?.find((b) => b.id === id));
              setIsOpen(true);
            }
          }}
        />
      )}
      {isFetching && <Loader explanation="Loading bloodlines" />}
      {isOpen && userData && bloodline && (
        <Modal
          title="Confirm Purchase"
          proceed_label={
            isPurchasing
              ? undefined
              : canAfford
                ? `Buy for ${cost} reps`
                : `Need ${cost - userData.reputationPoints} reps`
          }
          setIsOpen={setIsOpen}
          isValid={false}
          onAccept={() => {
            if (canAfford) {
              purchase({ bloodlineId: bloodline.id });
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
          {!isPurchasing && <ItemWithEffects item={bloodline} key={bloodline.id} />}
          {isPurchasing && <Loader explanation={`Purchasing ${bloodline.name}`} />}
        </Modal>
      )}
    </ContentBox>
  );
};

/**
 * Show Current bloodline & let user remove it
 */
interface CurrentBloodlineProps {
  bloodlineId: string;
}

export const CurrentBloodline: React.FC<CurrentBloodlineProps> = (props) => {
  // Get current bloodline
  const { data: userData, refetch: refetchUser } = useRequiredUserData();
  const { data, isFetching } = api.bloodline.get.useQuery(
    { id: props.bloodlineId },
    { staleTime: Infinity },
  );

  // Mutations
  const { mutate: remove, isPending: isRemoving } =
    api.bloodline.removeBloodline.useMutation({
      onSuccess: async () => {
        await refetchUser();
      },
    });

  // Can afford removing
  const canAfford =
    userData?.reputationPoints && userData.reputationPoints >= REMOVAL_COST;

  return (
    <ContentBox title="Bloodline" subtitle="Genetic Details" initialBreak={true}>
      {(isFetching || isRemoving) && <Loader explanation="Loading bloodline" />}
      {!isFetching && data && userData && (
        <>
          <ItemWithEffects item={data} key={data.id} />
          <Confirm
            title="Bloodline Removal"
            proceed_label={
              canAfford
                ? `Remove for ${REMOVAL_COST} reps`
                : `Need ${userData.reputationPoints - REMOVAL_COST} more reps`
            }
            isValid={!isFetching}
            button={
              <Button id="check" className="w-full">
                <Scissors className="mr-2 h-6 w-6" />
                Remove Bloodline
              </Button>
            }
            onAccept={(e) => {
              e.preventDefault();
              if (canAfford) remove();
            }}
          >
            <p>
              Confirm using <b>{REMOVAL_COST} reputation points</b> to have the doctors
              at the hospital remove your bloodline.
            </p>
          </Confirm>
        </>
      )}
    </ContentBox>
  );
};

/**
 * Component for rolling a new bloodline
 */
interface RollBloodlineProps {
  refetch: () => void;
}
export const RollBloodline: React.FC<RollBloodlineProps> = (props) => {
  const { refetch: refetchUser } = useRequiredUserData();
  // State
  const { mutate: roll, isPending: isRolling } = api.bloodline.roll.useMutation({
    onSuccess: async (data) => {
      props.refetch();
      showMutationToast({ ...data, title: "Bloodline Roll" });
      if (data.success) {
        await refetchUser();
      }
    },
  });

  return (
    <ContentBox title="Bloodline" subtitle="Check your genetics" initialBreak={true}>
      <div className="flex flex-row">
        <div className="hidden sm:block sm:basis-1/3">
          <Image
            className="rounded-2xl border-2"
            alt="Bloodline"
            src="/bloodlines/hospital.png"
            width={256}
            height={256}
          ></Image>
        </div>
        <div className="pl-0 sm:basis-2/3 sm:pl-5">
          {!isRolling && (
            <p>
              At the hospital, skilled doctors and geneticists use advanced technology
              to analyze the DNA of each patient. They search for specific genetic
              markers that indicate the presence of a rare and powerful bloodline, known
              only to a select few ninja clans. Some patients may experience side
              effects or complications as a result of their newfound powers - the
              hospital therefore offers removal of native bloodlines free of charge.
            </p>
          )}

          {isRolling && <Loader explanation="Rolling bloodline" />}
          <Confirm
            title="Confirm Roll"
            proceed_label="Roll"
            isValid={!isRolling}
            button={
              <Button id="check" className="w-full">
                <FlaskConical className="mr-2 h-6 w-6" />
                Check Genetics
              </Button>
            }
            onAccept={(e) => {
              e.preventDefault();
              roll();
            }}
          >
            <p>
              You are about to get your genetics checked to see if you have a bloodline.
              Statistically, the chances for the different ranks of bloodlines are:
            </p>
            <ul className="pl-5 pt-3">
              <li>S-Ranked: {ROLL_CHANCE["S"] * 100}%</li>
              <li>A-Ranked: {ROLL_CHANCE["A"] * 100}%</li>
              <li>B-Ranked: {ROLL_CHANCE["B"] * 100}%</li>
              <li>C-Ranked: {ROLL_CHANCE["C"] * 100}%</li>
              <li>D-Ranked: {ROLL_CHANCE["D"] * 100}%</li>
            </ul>
          </Confirm>
        </div>
      </div>
    </ContentBox>
  );
};
