import { useState } from "react";
import { useSafePush } from "@/utils/routing";
import Table, { type ColumnDefinitionType } from "@/layout/Table";
import { Clock, FastForward, Hand } from "lucide-react";
import Countdown from "@/layout/Countdown";
import Loader from "@/layout/Loader";
import ContentBox from "@/layout/ContentBox";
import NavTabs from "@/layout/NavTabs";
import StatusBar from "@/layout/StatusBar";
import { RollBloodline, CurrentBloodline, PurchaseBloodline } from "@/layout/Bloodline";
import { hasRequiredRank } from "@/libs/train";
import { Button } from "@/components/ui/button";
import { structureBoost } from "@/utils/village";
import { useRequireInVillage } from "@/utils/village";
import { api } from "@/utils/api";
import { showMutationToast } from "@/libs/toast";
import { calcHealFinish } from "@/libs/hospital/hospital";
import { calcHealCost, calcChakraToHealth } from "@/libs/hospital/hospital";
import { MEDNIN_MIN_RANK } from "@/drizzle/constants";
import type { NextPage } from "next";
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
      await util.hospital.getHospitalizedUsers.invalidate();
      if (data.success) {
        await util.profile.getUser.invalidate();
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
