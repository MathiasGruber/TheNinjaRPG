import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSafePush } from "@/utils/routing";
import Table, { type ColumnDefinitionType } from "@/layout/Table";
import { Clock, FastForward, Hand, FlaskConical, Scissors } from "lucide-react";
import Countdown from "@/layout/Countdown";
import Confirm from "@/layout/Confirm";
import Loader from "@/layout/Loader";
import ContentBox from "@/layout/ContentBox";
import NavTabs from "@/layout/NavTabs";
import ItemWithEffects from "@/layout/ItemWithEffects";
import Modal from "@/layout/Modal";
import StatusBar from "@/layout/StatusBar";
import { hasRequiredRank } from "@/libs/train";
import { Button } from "@/components/ui/button";
import { ActionSelector } from "@/layout/CombatActions";
import { structureBoost } from "@/utils/village";
import { useRequireInVillage } from "@/utils/village";
import { useRequiredUserData } from "@/utils/UserContext";
import { ROLL_CHANCE, BLOODLINE_COST, REMOVAL_COST } from "@/libs/bloodline";
import { api } from "@/utils/api";
import { showMutationToast } from "@/libs/toast";
import { calcHealFinish } from "@/libs/hospital/hospital";
import { calcHealCost, calcChakraToHealth } from "@/libs/hospital/hospital";
import { MEDNIN_MIN_RANK } from "@/drizzle/constants";
import type { NextPage } from "next";
import type { Bloodline, BloodlineRank } from "../../drizzle/schema";
import type { ArrayElement } from "@/utils/typeutils";

const Hospital: NextPage = () => {
  // Tab selection
  const [tab, setTab] = useState<"Hospital" | "Bloodline" | null>(null);

  // Settings
  const { userData, access } = useRequireInVillage("Hospital");

  // Hospital name
  const hospitalName = userData?.village?.name
    ? userData.village.name + " Hospital"
    : "Hospital";

  // Heal finish time
  if (!userData) return <Loader explanation="Loading userdata" />;
  if (!access) return <Loader explanation="Accessing Hospital" />;

  return (
    <>
      <ContentBox
        title="Hospital"
        subtitle={hospitalName}
        back_href="/village"
        topRightContent={
          <NavTabs
            id="hospital-page"
            current={tab}
            options={["Hospital", "Bloodline"]}
            setValue={setTab}
          />
        }
      >
        <div>
          Welcome to the {hospitalName}. Experience expert care, advanced technology,
          and ancient remedies in our serene facility. Here you can:
          <ol className="pt-3">
            {userData.status === "HOSPITALIZED" && (
              <li>
                <i>- Pay according to your injury to expedite your treatment.</i>
              </li>
            )}
            <li>
              <i> - You can have your bloodline analyzed or altered</i>
            </li>
            <li>
              <i> - You may help out by healing other patients.</i>
            </li>
          </ol>
        </div>
      </ContentBox>
      {tab === "Hospital" && <MainHospitalPage />}
      {tab === "Bloodline" && <MainBloodlinePage />}
    </>
  );
};

export default Hospital;

/**
 * Main Hospital Page
 */
const MainHospitalPage: React.FC = () => {
  const util = api.useUtils();

  // Settings
  const { userData, timeDiff } = useRequireInVillage("Hospital");
  const isHospitalized = userData?.status === "HOSPITALIZED";

  // Router for forwarding
  const router = useSafePush();

  // Current interest
  const boost = structureBoost("hospitalSpeedupPerLvl", userData?.village?.structures);

  // How much the user can heal
  const maxHeal = calcChakraToHealth(userData, userData?.curChakra);

  // Mutations
  const { mutate: heal, isPending: isPendingHeal } = api.hospital.heal.useMutation({
    onSuccess: async (data) => {
      showMutationToast(data);
      if (data.success) {
        await util.profile.getUser.invalidate();
        await router.push("/profile");
      }
    },
  });

  const { mutate: userHeal, isPending: isHealing } = api.hospital.userHeal.useMutation({
    onSuccess: async (data) => {
      showMutationToast(data);
      if (data.success) {
        await util.profile.getUser.invalidate();
        await util.hospital.getHospitalizedUsers.invalidate();
      }
    },
  });

  const isLoading = isPendingHeal || isHealing;

  // Queries
  const { data: hospitalized } = api.hospital.getHospitalizedUsers.useQuery(undefined, {
    refetchInterval: 5000,
  });
  const allHospitalized = hospitalized?.map((user) => {
    const missingHealth = user.maxHealth - user.curHealth;
    return {
      ...user,
      info: (
        <div>
          {user.username}
          <span className="hidden sm:inline">
            , Lvl. {user.level} {user.rank}
          </span>
          <StatusBar
            title="HP"
            tooltip="Health"
            color="bg-red-500"
            showText={true}
            status={user.status}
            current={user.curHealth}
            total={user.maxHealth}
            timeDiff={timeDiff}
          />
        </div>
      ),
      btns: (
        <div className="grid grid-cols-2 gap-1">
          <Button
            role="combobox"
            disabled={user.maxHealth * 0.25 > maxHeal}
            onClick={() => userHeal({ userId: user.userId, healPercentage: 25 })}
          >
            25%
          </Button>
          <Button
            role="combobox"
            disabled={
              user.maxHealth * 0.5 > maxHeal || missingHealth <= 0.25 * user.maxHealth
            }
            onClick={() => userHeal({ userId: user.userId, healPercentage: 50 })}
          >
            50%
          </Button>
          <Button
            role="combobox"
            disabled={
              user.maxHealth * 0.75 > maxHeal || missingHealth <= 0.5 * user.maxHealth
            }
            onClick={() => userHeal({ userId: user.userId, healPercentage: 75 })}
          >
            75%
          </Button>
          <Button
            role="combobox"
            disabled={
              user.maxHealth * 1.0 > maxHeal || missingHealth <= 0.75 * user.maxHealth
            }
            onClick={() => userHeal({ userId: user.userId, healPercentage: 100 })}
          >
            100%
          </Button>
        </div>
      ),
    };
  });
  type HospitalizedUser = ArrayElement<typeof allHospitalized>;

  // Table setup
  const columns: ColumnDefinitionType<HospitalizedUser, keyof HospitalizedUser>[] = [
    { key: "avatar", header: "", type: "avatar" },
    { key: "info", header: "Info", type: "jsx" },
    { key: "btns", header: "Heal", type: "jsx" },
  ];

  // Heal finish time
  const healFinishAt = userData && calcHealFinish({ user: userData, timeDiff, boost });
  const healCost = userData && calcHealCost(userData);
  const canAfford = userData && healCost && userData.money >= healCost;
  const canHealOthers = hasRequiredRank(userData?.rank, MEDNIN_MIN_RANK);

  return (
    <ContentBox
      title="Hospital"
      subtitle="Emergency Department"
      initialBreak={true}
      padding={false}
    >
      {!isLoading && isHospitalized && userData && healFinishAt && (
        <div className="p-3">
          <p>You are hospitalized, either wait or pay to expedite treatment.</p>
          <div className="grid grid-cols-2 py-3 gap-2">
            <Button
              id="check"
              disabled={healFinishAt && healFinishAt > new Date()}
              onClick={() => heal({ villageId: userData.villageId })}
            >
              <Clock className="mr-2 h-6 w-6" />
              <div>Wait ({<Countdown targetDate={healFinishAt} />})</div>
            </Button>
            <Button
              id="check"
              color={canAfford ? "default" : "red"}
              disabled={healFinishAt && healFinishAt <= new Date()}
              onClick={() => heal({ villageId: userData.villageId })}
            >
              {canAfford ? (
                <FastForward className="mr-3 h-6 w-6" />
              ) : (
                <Hand className="mr-3 h-6 w-6" />
              )}
              <div>Pay {healCost && <span>({healCost} ryo)</span>}</div>
            </Button>
          </div>
        </div>
      )}
      {!isLoading && !isHospitalized && userData && !canHealOthers && (
        <p className="p-3">You are not hospitalized.</p>
      )}
      {!isLoading && !isHospitalized && canHealOthers && (
        <div>
          {allHospitalized && allHospitalized.length > 0 ? (
            <Table data={allHospitalized} columns={columns} />
          ) : (
            <p className="p-3">There are nobody injured for you to heal</p>
          )}
        </div>
      )}
      {isLoading && <Loader explanation="Healing User" />}
    </ContentBox>
  );
};

/**
 * Main Bloodline Page
 */
const MainBloodlinePage: React.FC = () => {
  // Settings
  const { userData } = useRequireInVillage("Hospital");

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

  // Derived calculations
  const hasRolled = !!prevRoll;
  const bloodlineId = userData?.bloodlineId;

  return (
    <div>
      {isPendingBlood && <Loader explanation="Loading bloodlines" />}
      {!isPendingBlood && !hasRolled && <RollBloodline refetch={refetchBloodline} />}
      {!isPendingBlood && bloodlineId && <CurrentBloodline bloodlineId={bloodlineId} />}
      {!isPendingBlood && hasRolled && !userData?.bloodlineId && <PurchaseBloodline />}
    </div>
  );
};

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
