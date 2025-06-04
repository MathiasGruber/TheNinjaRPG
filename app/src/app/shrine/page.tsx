"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { useRequiredUserData } from "@/utils/UserContext";
import { api } from "@/app/_trpc/client";
import { showMutationToast } from "@/libs/toast";
import ContentBox from "@/layout/ContentBox";
import Loader from "@/layout/Loader";
import { Swords } from "lucide-react";
import Image from "next/image";
import StatusBar from "@/layout/StatusBar";
import {
  WAR_SHRINE_HP,
  WAR_SHRINE_IMAGE,
  VILLAGE_SYNDICATE_ID,
} from "@/drizzle/constants";
import RamenShop from "@/layout/RamenShop";
import { type War } from "@/drizzle/schema";

export default function Shrine() {
  // Data from database
  const { data: userData, updateUser } = useRequiredUserData();
  const { data: sectorData } = api.travel.getSectorData.useQuery(
    { sector: userData?.sector || 0 },
    { enabled: !!userData, refetchInterval: 10000 },
  );

  // Router for forwarding
  const router = useRouter();

  // Mutation for starting a fight
  const { mutate: attack, isPending: isAttacking } =
    api.combat.startShrineBattle.useMutation({
      onSuccess: async (result) => {
        if (result.success && result.battleId) {
          await updateUser({
            status: "BATTLE",
            battleId: result.battleId,
            updatedAt: new Date(),
          });
          router.push("/combat");
          showMutationToast({ ...result, message: "Attacking the Shrine" });
        } else {
          showMutationToast(result);
        }
      },
    });

  // Loaders
  if (!userData) return <Loader explanation="Loading userdata" />;
  if (!sectorData) return <Loader explanation="Loading sector data" />;
  if (!userData.villageId) return <Loader explanation="No village found" />;

  // Check if there's an active war in this sector
  const activeWars = sectorData.warData;
  if (!activeWars || activeWars.length === 0) {
    return (
      <>
        <ContentBox
          title="Shrine"
          subtitle={sectorData.sectorData ? "Sector is Claimed" : "Unclaimed Sector"}
          back_href="/travel"
        >
          <div className="flex flex-col items-center">
            {sectorData.sectorData ? (
              <p>
                {" "}
                This sector is claimed by{" "}
                <strong>{sectorData.sectorData.village.name}</strong>. The leader of
                your village or faction can attack the shrine to try and defeat it and
                claim the sector.
              </p>
            ) : (
              <p>
                This sector is unclaimed. The leader of your village or faction can
                attack the shrine to try and defeat it and claim the sector.
              </p>
            )}
          </div>
        </ContentBox>
        <RamenShop initialBreak />
      </>
    );
  }

  // Split wars into user's wars and competing wars
  const userWars = activeWars.filter(
    (war) =>
      war.attackerVillageId === userData.villageId ||
      war.defenderVillageId === userData.villageId,
  );
  const competingWars = activeWars.filter(
    (war) =>
      war.attackerVillageId !== userData.villageId &&
      war.defenderVillageId !== userData.villageId,
  );

  return (
    <div className="space-y-8">
      {userWars.length > 0 && (
        <>
          <ContentBox
            title="Your Wars"
            subtitle={`Sector ${userData.sector}`}
            back_href="/travel"
          >
            <div className="divide-y">
              {userWars.map((war) => (
                <WarCard
                  key={war.id}
                  war={war}
                  villageId={userData.villageId!}
                  sector={userData.sector}
                  onAttack={() => attack({ sector: userData.sector })}
                  isAttacking={isAttacking}
                />
              ))}
            </div>
          </ContentBox>
          <RamenShop />
        </>
      )}

      {competingWars.length > 0 && (
        <ContentBox
          title="Competing Wars"
          subtitle="Other villages trying to claim sector"
        >
          <div className="divide-y">
            {competingWars.map((war) => (
              <WarCard
                key={war.id}
                war={war}
                villageId={userData.villageId!}
                sector={userData.sector}
                onAttack={() => attack({ sector: userData.sector })}
                isAttacking={isAttacking}
              />
            ))}
          </div>
        </ContentBox>
      )}
    </div>
  );
}

// Component to render a single war
const WarCard = ({
  war,
  villageId,
  onAttack,
  isAttacking,
}: {
  war: War & {
    attackerVillage: { name: string; villageGraphic: string };
    defenderVillage: { name: string; villageGraphic: string };
  };
  villageId: string;
  sector: number;
  onAttack: () => void;
  isAttacking: boolean;
}) => {
  const isUserWar =
    war.attackerVillageId === villageId || war.defenderVillageId === villageId;
  const canAttack =
    isUserWar && war.shrineHp > 0 && war.defenderVillageId === VILLAGE_SYNDICATE_ID;

  return (
    <div className="flex flex-col items-center gap-4 p-4">
      <div className="flex w-full items-center justify-between gap-4">
        {/* Attacker Village */}
        <div className="flex flex-col items-center">
          <div className="text-sm font-bold mb-2">Attacker</div>
          <Image
            src={war.attackerVillage.villageGraphic}
            alt={war.attackerVillage.name}
            width={100}
            height={100}
            className={`${war.shrineHp <= 0 ? "opacity-50 grayscale" : ""}`}
          />
          <p className="mt-2 text-sm font-medium">{war.attackerVillage.name}</p>
        </div>

        {/* Shrine */}
        <div className="flex flex-col items-center">
          <Image
            src={WAR_SHRINE_IMAGE}
            alt="War Shrine"
            width={200}
            height={200}
            className={`${war.shrineHp <= 0 ? "opacity-50 grayscale" : ""}`}
          />
          <div className="w-full max-w-md space-y-4">
            <div>
              <p className="text-sm font-medium">Shrine - Sector {war.sector}</p>
              <p className="text-sm text-muted-foreground">
                {war.attackerVillageId === villageId
                  ? "Your village is attacking"
                  : war.defenderVillageId === villageId
                    ? "Your village is defending"
                    : "Competing war"}
              </p>
              {war.shrineHp > 0 && (
                <StatusBar
                  key={war.shrineHp}
                  title="HP"
                  tooltip="Shrine Health"
                  color="bg-red-500"
                  showText={true}
                  status="AWAKE"
                  current={war.shrineHp > 0 ? war.shrineHp : 0}
                  total={WAR_SHRINE_HP}
                />
              )}
            </div>
          </div>
        </div>

        {/* Defender Village */}
        <div className="flex flex-col items-center">
          <div className="text-sm font-bold mb-2">Defender</div>
          <Image
            src={war.defenderVillage.villageGraphic}
            alt={war.defenderVillage.name}
            width={100}
            height={100}
            className={`${war.shrineHp <= 0 ? "opacity-50 grayscale" : ""}`}
          />
          <p className="mt-2 text-sm font-medium">
            {war.defenderVillageId === VILLAGE_SYNDICATE_ID
              ? "Neutral Territory"
              : war.defenderVillage.name}
          </p>
        </div>
      </div>

      <div className="relative w-full">
        {canAttack &&
          (!isAttacking ? (
            <Button
              size="xl"
              decoration="gold"
              animation="pulse"
              className="font-fontasia text-4xl w-full"
              onClick={onAttack}
            >
              <Swords className="h-10 w-10 mr-4" />
              Attack Shrine
            </Button>
          ) : (
            <div className="min-h-64">
              <div className="absolute bottom-0 left-0 right-0 top-0 z-20 m-auto flex flex-col justify-center bg-black opacity-95">
                <div className="m-auto text-white">
                  <p className="text-5xl">Attacking the Shrine</p>
                  <Loader />
                </div>
              </div>
            </div>
          ))}
        {war.shrineHp <= 0 && (
          <div className="text-center space-y-4 mt-4">
            <h3 className="text-2xl font-bold">Shrine Defeated!</h3>
            <p>
              The shrine has been defeated. Quickly return to your village&apos;s Town
              Hall to finalize the war and claim the sector!
            </p>
            <Link href="/travel">
              <Button>Travel to Village</Button>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
};
