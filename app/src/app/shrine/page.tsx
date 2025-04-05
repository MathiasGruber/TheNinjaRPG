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
import { WAR_SHRINE_HP, WAR_SHRINE_IMAGE } from "@/drizzle/constants";

export default function Shrine() {
  // Data from database
  const { data: userData, updateUser } = useRequiredUserData();
  const { data: sectorData } = api.travel.getSectorData.useQuery(
    { sector: userData?.sector || 0 },
    { enabled: !!userData },
  );

  // Router for forwarding
  const router = useRouter();

  // Mutation for starting a fight
  const { mutate: attack, isPending: isAttacking } =
    api.combat.startShrineWar.useMutation({
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

  // Check if there's an active war in this sector
  const activeWar = sectorData.warData;
  if (!activeWar || activeWar.status !== "ACTIVE") {
    return (
      <ContentBox title="Shrine" subtitle="No active war in this sector">
        <div className="flex flex-col items-center p-4">
          <p>There is no active sector war in this sector.</p>
        </div>
      </ContentBox>
    );
  }

  // Check if shrine is already defeated
  if (activeWar.shrineHp <= 0) {
    return (
      <ContentBox title="Shrine" subtitle={`Sector ${activeWar.sectorNumber} War`}>
        <div className="flex flex-col items-center gap-4 p-4">
          <Image
            src={WAR_SHRINE_IMAGE}
            alt="War Shrine"
            width={200}
            height={200}
            className="rounded-lg opacity-50"
          />
          <div className="text-center space-y-4">
            <h3 className="text-2xl font-bold">Shrine Defeated!</h3>
            <p>
              The shrine has been defeated. Return to your village&apos;s Town Hall to
              finalize the war and claim your rewards!
            </p>
            <Link href="/travel">
              <Button>Travel to Village</Button>
            </Link>
          </div>
        </div>
      </ContentBox>
    );
  }

  return (
    <ContentBox title="Shrine" subtitle={`Sector ${activeWar.sectorNumber} War`}>
      <div className="flex flex-col items-center gap-4 p-4">
        <Image
          src={WAR_SHRINE_IMAGE}
          alt="War Shrine"
          width={200}
          height={200}
          className="rounded-lg"
        />
        <div className="w-full max-w-md space-y-2">
          <div>
            <p className="text-sm font-medium">
              Shrine - Sector {activeWar.sectorNumber}
            </p>
            <StatusBar
              title="HP"
              tooltip="Shrine Health"
              color="bg-red-500"
              showText={true}
              status="AWAKE"
              current={activeWar.shrineHp > 0 ? activeWar.shrineHp : 0}
              total={WAR_SHRINE_HP}
            />
          </div>
          {!isAttacking ? (
            <Button
              size="xl"
              decoration="gold"
              animation="pulse"
              className="font-fontasia text-4xl w-full"
              onClick={() => attack({ sector: userData.sector })}
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
          )}
        </div>
      </div>
    </ContentBox>
  );
}
