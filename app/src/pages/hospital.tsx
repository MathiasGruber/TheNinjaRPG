import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSafePush } from "@/utils/routing";
import type { Bloodline, BloodlineRank } from "../../drizzle/schema";
import type { NextPage } from "next";
import { Clock, FastForward, Hand, FlaskConical, Scissors } from "lucide-react";

import Countdown from "@/layout/Countdown";
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
import { calcHealFinish } from "@/libs/hospital/hospital";
import { calcHealCost } from "@/libs/hospital/hospital";

const Hospital: NextPage = () => {
  // Settings
  const { data: userData, timeDiff, refetch: refetchUser } = useRequiredUserData();
  const isHospitalized = userData?.status === "HOSPITALIZED";
  const hospitalName = userData?.village?.name
    ? userData.village.name + " Hospital"
    : "Hospital";

  // Router for forwarding
  const router = useSafePush();

  // Get data from DB
  const {
    data: prevRoll,
    isPending: isPendingBlood,
    refetch: refetchBloodline,
  } = api.bloodline.getRolls.useQuery(
    {
      currentBloodlineId: userData?.bloodlineId,
    },
    { staleTime: Infinity, enabled: userData !== undefined },
  );

  // Mutations
  const { mutate: heal, isPending: isPendingHeal } = api.hospital.heal.useMutation({
    onSuccess: async (data) => {
      showMutationToast(data);
      if (data.success) {
        await refetchUser();
        await router.push("/profile");
      }
    },
  });

  // Derived calculations
  const hasRolled = !!prevRoll;
  const bloodlineId = userData?.bloodlineId;

  // Heal finish time
  const healFinishAt = userData && calcHealFinish(userData, timeDiff);
  const healCost = userData && calcHealCost(userData);
  const canAfford = userData && healCost && userData.money >= healCost;

  if (!userData) return <Loader explanation="Loading userdata" />;

  return (
    <>
      <ContentBox
        title="Hospital"
        subtitle="All your medical needs"
        back_href="/village"
      >
        <div>
          Welcome to the {hospitalName}. Experience expert care, advanced technology,
          and ancient remedies in our serene facility. You may pay according to your
          injury to expedite your treatment, or wait until the doctors have time to
          patch you up, ensuring fair access for all. Our aim is to help restore your
          strength, spirit, and honor.
        </div>
        {!isPendingHeal && isHospitalized && userData && healFinishAt && (
          <div className="grid grid-cols-2 py-3 gap-2">
            <Button
              id="check"
              disabled={healFinishAt && healFinishAt > new Date()}
              onClick={() => heal()}
            >
              <Clock className="mr-2 h-6 w-6" />
              <div>Wait ({<Countdown targetDate={healFinishAt} />})</div>
            </Button>
            <Button
              id="check"
              color={canAfford ? "default" : "red"}
              disabled={healFinishAt && healFinishAt <= new Date()}
              onClick={() => heal()}
            >
              {canAfford ? (
                <FastForward className="mr-3 h-6 w-6" />
              ) : (
                <Hand className="mr-3 h-6 w-6" />
              )}
              <div>Pay {healCost && <span>({healCost} ryo)</span>}</div>
            </Button>
          </div>
        )}
        {!isPendingHeal && !isHospitalized && userData && (
          <p className="py-3">You are not at the hospital.</p>
        )}
        {isPendingHeal && <Loader explanation="Healing User" />}
      </ContentBox>
      <br />

      {isPendingBlood && <Loader explanation="Loading bloodlines" />}
      {!isPendingBlood && !hasRolled && <RollBloodline refetch={refetchBloodline} />}
      {!isPendingBlood && bloodlineId && <CurrentBloodline bloodlineId={bloodlineId} />}
      {!isPendingBlood && hasRolled && !userData?.bloodlineId && <PurchaseBloodline />}
    </>
  );
};

export default Hospital;

/**
 * Let user purchase a new bloodline
 */
const PurchaseBloodline: React.FC = () => {
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

const CurrentBloodline: React.FC<CurrentBloodlineProps> = (props) => {
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
    <ContentBox title="Bloodline" subtitle="Genetic Details">
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
const RollBloodline: React.FC<RollBloodlineProps> = (props) => {
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
    <ContentBox title="Bloodline" subtitle="Check your genetics">
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
