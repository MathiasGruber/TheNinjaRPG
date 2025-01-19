"use client";
import { useState, useEffect } from "react";
import Table, { type ColumnDefinitionType } from "@/layout/Table";
import { Clock, FastForward, Hand, Plus, UserPlus, UserMinus } from "lucide-react";
import Countdown from "@/layout/Countdown";
import Loader from "@/layout/Loader";
import ContentBox from "@/layout/ContentBox";
import StatusBar, { calcCurrent } from "@/layout/StatusBar";
import Image from "next/image";
import { hasRequiredRank } from "@/libs/train";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { structureBoost } from "@/utils/village";
import { calcIsInVillage } from "@/libs/travel/controls";
import { useRequireInVillage } from "@/utils/UserContext";
import { api } from "@/app/_trpc/client";
import { showMutationToast } from "@/libs/toast";
import { calcHealFinish } from "@/libs/hospital/hospital";
import { calcHealCost, calcChakraToHealth } from "@/libs/hospital/hospital";
import { MEDNIN_MIN_RANK, IMG_BUILDING_HOSPITAL } from "@/drizzle/constants";
import type { ArrayElement } from "@/utils/typeutils";
import type { UserWithRelations } from "@/server/api/routers/profile";
import type { MedicalNinjaSquad } from "@/server/db/schema/medicalNinja";
import type { UserData } from "@/server/db/schema/users";

export default function Hospital() {
  // Settings
  const { userData, notifications, access, timeDiff, updateUser, updateNotifications } =
    useRequireInVillage("/hospital");
  const isHospitalized = userData?.status === "HOSPITALIZED";

  // Hospital name
  const hospitalName = userData?.village?.name
    ? userData.village.name + " Hospital"
    : "Hospital";

  // Current interest
  const boost = structureBoost("hospitalSpeedupPerLvl", userData?.village?.structures);

  // Mutations
  const { mutate: heal, isPending } = api.hospital.heal.useMutation({
    onSuccess: async (result) => {
      showMutationToast(result);
      if (result.success && result.data) {
        await updateNotifications(notifications?.filter((n) => n.href !== "/hospital"));
        await updateUser({
          curHealth: result.data.curHealth,
          money: result.data.money,
          regenAt: result.data.regenAt,
          status: "AWAKE",
        });
      }
    },
  });

  // Heal finish time
  const healFinishAt = userData && calcHealFinish({ user: userData, timeDiff, boost });
  const healCost = userData && calcHealCost(userData);
  const canAfford = userData && healCost && userData.money >= healCost;
  const canHealOthers = hasRequiredRank(userData?.rank, MEDNIN_MIN_RANK);

  // Heal finish time
  if (!userData) return <Loader explanation="Loading userdata" />;
  if (!access) return <Loader explanation="Accessing Hospital" />;

  const canViewMedicalSquads =
    userData?.userId === "medical_ninja" ||
    ["kage", "elder"].includes(userData?.rank || "");

  const canCreateMedicalSquads = ["kage", "elder"].includes(userData?.rank || "");

  const { data: medicalSquads = [] } = api.medicalNinja.getSquads.useQuery(undefined, {
    enabled: canViewMedicalSquads,
  }) as { data: MedicalNinjaSquad[] };

  const utils = api.useUtils();

  const { mutate: createSquad } = api.medicalNinja.createSquad.useMutation({
    onSuccess: (data) => {
      showMutationToast(data);
      void utils.medicalNinja.getSquads.invalidate();
    },
  });

  const { mutate: joinSquad } = api.medicalNinja.joinSquad.useMutation({
    onSuccess: (data) => {
      showMutationToast(data);
      void utils.medicalNinja.getSquads.invalidate();
    },
  });

  const { mutate: leaveSquad } = api.medicalNinja.leaveSquad.useMutation({
    onSuccess: (data) => {
      showMutationToast(data);
      void utils.medicalNinja.getSquads.invalidate();
    },
  });

  return (
    <ContentBox
      title={hospitalName}
      subtitle="Emergency Department"
      back_href="/village"
      padding={false}
    >
      <Image
        alt="hospital-image"
        src={IMG_BUILDING_HOSPITAL}
        width={512}
        height={195}
        className="w-full"
        priority={true}
      />
      <Tabs defaultValue="hospital" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="hospital">Hospital</TabsTrigger>
          {canViewMedicalSquads && (
            <TabsTrigger value="medical-squads">Medical Ninja Squads</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="hospital">
          {!isPending && isHospitalized && userData && healFinishAt && (
            <div className="p-3">
              <p>You are hospitalized, either wait or pay to expedite treatment.</p>
              <div className="grid grid-cols-2 py-3 gap-2">
                <Button
                  id="check"
                  className="w-full"
                  disabled={healFinishAt && healFinishAt > new Date()}
                  onClick={() => heal({ villageId: userData.villageId })}
                >
                  <Clock className="mr-2 h-6 w-6" />
                  <div>Wait ({<Countdown targetDate={healFinishAt} />})</div>
                </Button>
                <Button
                  id="check"
                  className="w-full"
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
          {!isPending && !isHospitalized && userData && !canHealOthers && (
            <p className="p-3">You are not hospitalized.</p>
          )}
          {!isPending && !isHospitalized && canHealOthers && (
            <HealOthersComponent
              userData={userData}
              timeDiff={timeDiff}
              updateUser={updateUser}
            />
          )}
          {isPending && <Loader explanation="Healing User" />}
        </TabsContent>

        {canViewMedicalSquads && (
          <TabsContent value="medical-squads" className="p-3">
            {canCreateMedicalSquads && (
              <Button
                onClick={() =>
                  createSquad({
                    name: "New Medical Squad",
                    description: "A new medical ninja squad",
                    leader_id: userData.userId,
                    village_id: userData.villageId || "",
                    members: [userData.userId],
                  })
                }
                className="mb-4"
              >
                <Plus className="mr-2 h-4 w-4" />
                Create Medical Ninja Squad
              </Button>
            )}

            {medicalSquads?.map((squad) => (
              <div
                key={squad.id}
                className="mb-4 rounded-lg border border-gray-200 p-4 dark:border-gray-700"
              >
                <h3 className="text-lg font-semibold">{squad.name}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {squad.description}
                </p>
                <div className="mt-2">
                  <h4 className="font-medium">Members:</h4>
                  <ul className="list-inside list-disc">
                    {squad.members.map((memberId) => (
                      <li key={memberId}>{memberId}</li>
                    ))}
                  </ul>
                </div>
                {userData?.userId === "medical_ninja" &&
                  ["chunin", "jonin", "elder"].includes(userData.rank) && (
                    <div className="mt-4">
                      {squad.members.includes(userData.userId) ? (
                        <Button
                          variant="destructive"
                          onClick={() => leaveSquad({ squad_id: squad.id })}
                        >
                          <UserMinus className="mr-2 h-4 w-4" />
                          Leave Squad
                        </Button>
                      ) : (
                        <Button onClick={() => joinSquad({ squad_id: squad.id })}>
                          <UserPlus className="mr-2 h-4 w-4" />
                          Join Squad
                        </Button>
                      )}
                    </div>
                  )}
              </div>
            ))}

            {(!medicalSquads || medicalSquads.length === 0) && (
              <p>No medical ninja squads found.</p>
            )}
          </TabsContent>
        )}
      </Tabs>
    </ContentBox>
  );
}

/**
 * HealOthersComponent is a React functional component that allows users to heal other users in a hospital setting.
 * It calculates the maximum healing capacity based on the user's current chakra and updates it periodically.
 * The component also fetches the list of hospitalized users and provides buttons to heal them by different percentages.
 *
 */
interface HealOthersComponentProps {
  userData: NonNullable<UserWithRelations>;
  timeDiff: number;
  updateUser: (data: Partial<UserWithRelations>) => Promise<void>;
}

const HealOthersComponent: React.FC<HealOthersComponentProps> = (props) => {
  // Settings
  const { userData, timeDiff, updateUser } = props;

  // Maximum heal capacity
  const [maxHeal, setMaxHeal] = useState(
    calcChakraToHealth(
      userData,
      calcCurrent(
        userData.curChakra,
        userData.maxChakra,
        userData.status,
        userData.regeneration,
        userData.regenAt,
        timeDiff,
      ).current,
    ),
  );

  // tRPC utility
  const utils = api.useUtils();

  // How much the user can heal
  useEffect(() => {
    const foo = () => {
      if (userData.curChakra < userData.maxChakra) {
        setMaxHeal(
          calcChakraToHealth(
            userData,
            calcCurrent(
              userData.curChakra,
              userData.maxChakra,
              userData.status,
              userData.regeneration,
              userData.regenAt,
              timeDiff,
            ).current,
          ),
        );
      }
    };
    if (userData.curChakra < userData.maxChakra) {
      foo();
      const interval = setInterval(foo, 1000);
      return () => {
        clearInterval(interval);
      };
    }
  }, [userData, timeDiff]);

  // Mutations
  const { mutate: userHeal, isPending } = api.hospital.userHeal.useMutation({
    onSuccess: async (data) => {
      showMutationToast(data);
      await utils.hospital.getHospitalizedUsers.invalidate();
      if (data.success && userData) {
        await updateUser({
          curChakra: userData.curChakra - (data.chakraCost || 0),
          medicalExperience: userData.medicalExperience + (data.expGain || 0),
        });
      }
    },
  });

  // Queries
  const { data: hospitalized } = api.hospital.getHospitalizedUsers.useQuery(undefined, {
    refetchInterval: 5000,
    enabled: !!userData,
  });
  const allHospitalized = hospitalized
    ?.filter(
      (user) => calcIsInVillage({ x: user.longitude, y: user.latitude }) === true,
    )
    .map((user) => {
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
              lastRegenAt={
                user.userId === userData.userId ? userData.regenAt : undefined
              }
              regen={
                user.userId === userData.userId ? userData.regeneration : undefined
              }
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

  // Render
  return (
    <div>
      {allHospitalized && allHospitalized.length > 0 ? (
        <Table data={allHospitalized} columns={columns} />
      ) : (
        <p className="p-3">There are nobody injured for you to heal</p>
      )}
      {isPending && <Loader explanation="Healing User" />}
    </div>
  );
};
