"use client";

import Link from "next/link";
import Image from "next/image";
import StatusBar from "@/layout/StatusBar";
import Confirm2 from "@/layout/Confirm2";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { CircleArrowUp } from "lucide-react";
import { Info } from "lucide-react";
import { RefreshCw } from "lucide-react";
import { useRequiredUserData } from "@/utils/UserContext";
import { api } from "@/app/_trpc/client";
import { showMutationToast } from "@/libs/toast";
import { calcStructureUpgrade } from "@/utils/village";
import { CLANS_PER_STRUCTURE_LEVEL } from "@/drizzle/constants";
import { calcBankInterest } from "@/utils/village";
import { cn } from "src/libs/shadui";
import { canAdministrateWars } from "@/utils/permissions";
import type { Village } from "@/drizzle/schema";
import type { VillageStructure } from "@/drizzle/schema";

interface BuildingProps {
  structure: VillageStructure;
  village: Village;
  showBar?: boolean;
  textPosition: "bottom" | "right";
  showUpgrade?: boolean;
  showNumbers?: boolean;
}

const Building: React.FC<BuildingProps> = (props) => {
  // Destructure
  const { structure, village, showBar, textPosition, showUpgrade, showNumbers } = props;

  // State
  const { data: userData } = useRequiredUserData();

  // Blocks
  const TextBlock = (
    <div className="text-xs">
      <p className="font-bold">{structure.name}</p>
      <div className="flex flex-row items-center justify-center gap-1">
        <p>Lvl. {structure.level}</p>{" "}
        <TooltipProvider delayDuration={50}>
          <Tooltip>
            <TooltipTrigger>
              <Info className="w-4 h-4" />
            </TooltipTrigger>
            <TooltipContent>{StructureRewardEntries(structure)}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
        {userData && userData?.village?.kageId === userData?.userId && showUpgrade && (
          <UpgradeButton
            structure={structure}
            village={village}
            clanId={userData.clanId}
          />
        )}
        {userData && canAdministrateWars(userData.role) && (
          <RestoreStructureButton structureId={structure.id} />
        )}
      </div>
    </div>
  );
  // Render
  return (
    <div className={`flex flex-col items-center justify-center text-center relative`}>
      {showBar && (
        <div className="w-2/3">
          <StatusBar
            key={structure.curSp}
            title=""
            tooltip="Health"
            color="bg-red-500"
            showText={showNumbers}
            current={structure.curSp}
            total={structure.maxSp}
          />
        </div>
      )}
      <div
        className={`grid ${textPosition === "right" ? "grid-cols-2" : ""} items-center`}
      >
        <Link href={structure.route}>
          <Image
            className={`${structure.level > 0 ? "hover:opacity-80" : "opacity-30"}`}
            src={structure.image}
            alt={structure.name}
            width={200}
            height={200}
            priority={true}
            id={`tutorial${structure.route.replace("/", "-")}`}
          />
        </Link>
        {TextBlock}
      </div>
    </div>
  );
};

export default Building;

const RestoreStructureButton = ({ structureId }: { structureId: string }) => {
  const utils = api.useUtils();

  const { mutate: restorePoints, isPending } =
    api.village.restoreStructurePoints.useMutation({
      onSuccess: async (data) => {
        showMutationToast(data);
        if (data.success) {
          await utils.village.get.invalidate();
        }
      },
    });

  return (
    <Confirm2
      title="Restore Structure Points"
      proceed_label="Restore"
      onAccept={() => restorePoints({ structureId })}
      button={
        <RefreshCw
          className={cn(
            "h-4 w-4 hover:text-orange-500 hover:cursor-pointer",
            isPending && "animate-spin",
          )}
        />
      }
    >
      <p>Are you sure you want to restore this structure to full health?</p>
      <p>This will set the structure points to maximum.</p>
    </Confirm2>
  );
};

const UpgradeButton = ({
  structure,
  village,
  clanId,
}: {
  structure: VillageStructure;
  village: Village;
  clanId: string | null;
}) => {
  const utils = api.useUtils();

  const { data } = api.village.get.useQuery({ id: structure.villageId }, {});

  const { mutate: purchase, isPending: isPurchasing } =
    api.kage.upgradeStructure.useMutation({
      onSuccess: async (data) => {
        showMutationToast(data);
        if (data.success) {
          await utils.village.get.invalidate();
        }
      },
    });

  const currentFunds = data?.villageData.tokens ?? 0;
  const { cost, tax, discount, total } = calcStructureUpgrade(structure, {
    ...village,
    structures: data?.villageData.structures || [],
  });
  const canAfford = total <= currentFunds;
  const canLevel = structure.level < structure.maxLevel && structure.level !== 0;

  return (
    <div>
      {canAfford && canLevel && (
        <Confirm2
          title="Upgrade Structure"
          proceed_label="Upgrade"
          onAccept={() =>
            purchase({
              structureId: structure.id,
              villageId: structure.villageId,
              clanId: clanId,
            })
          }
          button={
            <CircleArrowUp
              className={cn(
                "h-4 w-4 hover:text-orange-500 hover:cursor-pointer",
                isPurchasing && "animate-spin",
              )}
            />
          }
        >
          <p>
            Upgrading this structure will cost a total of {total} village tokens (base
            cost of {cost} + {tax} population tax - {discount} discounted from town hall
            level).
          </p>
          <p>You currently have {currentFunds} village tokens.</p>
        </Confirm2>
      )}
    </div>
  );
};

/**
 * Generates an array of reward messages based on the level of a village structure.
 * @param structure - The village structure object.
 * @returns An array of reward messages.
 */
export const StructureRewardEntries = (structure: VillageStructure) => {
  const { level } = structure;
  const msgs: string[] = [];
  if (level > 0) {
    if (structure.anbuSquadsPerLvl > 0) {
      msgs.push(`Anbu Squads: +${structure.anbuSquadsPerLvl * level}`);
    }
    if (structure.arenaRewardPerLvl > 0) {
      msgs.push(`Arena Rewards: +${structure.arenaRewardPerLvl * level}%`);
    }
    if (structure.bankInterestPerLvl > 0) {
      msgs.push(
        `Bank Interest: +${calcBankInterest(structure.bankInterestPerLvl * level)}%`,
      );
    }
    if (structure.blackDiscountPerLvl > 0) {
      msgs.push(`Market discount: ${structure.blackDiscountPerLvl * level}%`);
    }
    if (structure.clansPerLvl > 0) {
      msgs.push(`Clans: +${structure.clansPerLvl * level * CLANS_PER_STRUCTURE_LEVEL}`);
    }
    if (structure.hospitalSpeedupPerLvl > 0) {
      msgs.push(`Hospital Speed: +${structure.hospitalSpeedupPerLvl * level}%`);
    }
    if (structure.itemDiscountPerLvl > 0) {
      msgs.push(`Item discount: ${structure.itemDiscountPerLvl * level}%`);
    }
    if (structure.patrolsPerLvl > 0) {
      msgs.push(`Patrol attacking enemies: +${structure.patrolsPerLvl * level}%`);
    }
    if (structure.ramenDiscountPerLvl > 0) {
      msgs.push(`Ramen discount: ${structure.ramenDiscountPerLvl * level}%`);
    }
    if (structure.regenIncreasePerLvl > 0) {
      msgs.push(`Regen in Village: +${structure.regenIncreasePerLvl * level}%`);
    }
    if (structure.sleepRegenPerLvl > 0) {
      msgs.push(`Sleep Regen: +${structure.sleepRegenPerLvl * level}%`);
    }
    if (structure.structureDiscountPerLvl > 0) {
      msgs.push(`Structure Discount: ${structure.structureDiscountPerLvl * level}%`);
    }
    if (structure.trainBoostPerLvl > 0) {
      msgs.push(`Training Boost: +${structure.trainBoostPerLvl * level}%`);
    }
    if (structure.villageDefencePerLvl > 0) {
      msgs.push(`Village Defence: +${structure.villageDefencePerLvl * level}%`);
    }
  }
  if (msgs.length === 0) msgs.push("No rewards for this structure");
  return msgs.map((e, i) => <p key={i}>{e}</p>);
};
