"use client";

import { parseHtml } from "@/utils/parse";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import Image from "next/image";
import ContentBox from "@/layout/ContentBox";
import StatusBar from "@/layout/StatusBar";
import Loader from "@/layout/Loader";
import Confirm from "@/layout/Confirm";
import RichInput from "@/layout/RichInput";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { mutateContentSchema } from "@/validators/comments";
import { CircleArrowUp, GitFork } from "lucide-react";
import { Users, BrickWall, Bot, ReceiptJapaneseYen, Info } from "lucide-react";
import { useRequiredUserData } from "@/utils/UserContext";
import { api } from "@/app/_trpc/client";
import { showMutationToast } from "@/libs/toast";
import { calcStructureUpgrade } from "@/utils/village";
import { useRequireInVillage } from "@/utils/UserContext";
import { hasRequiredRank } from "@/libs/train";
import { VILLAGE_REDUCED_GAINS_DAYS } from "@/drizzle/constants";
import { VILLAGE_LEAVE_REQUIRED_RANK } from "@/drizzle/constants";
import { CLANS_PER_STRUCTURE_LEVEL } from "@/drizzle/constants";
import { calcBankInterest } from "@/utils/village";
import { cn } from "src/libs/shadui";
import type { Village } from "@/drizzle/schema";
import type { VillageStructure } from "@/drizzle/schema";
import type { MutateContentSchema } from "@/validators/comments";

export default function VillageOverview() {
  // State
  const { userData, sectorVillage } = useRequireInVillage();

  // Queries
  const { data, isFetching: isFetchingVillage } = api.village.get.useQuery(
    { id: sectorVillage?.id ?? "" },
    { enabled: !!sectorVillage },
  );

  // tRPC utility
  const utils = api.useUtils();

  // Derived
  const villageData = data?.villageData;
  const ownSector = userData?.village?.sector === sectorVillage?.sector;
  const notice = villageData?.notice?.content ?? "No notice at this point";
  const isKage = villageData?.kageId === userData?.userId;
  const title = villageData
    ? `${villageData.name}`
    : userData?.isOutlaw
      ? "Faction"
      : "Village";
  const subtitle = ownSector ? "Your Community" : `Ally of ${userData?.village?.name}`;
  const href = villageData ? `/users/village/${villageData.id}` : "/users";

  // Specific structures
  const walls = villageData?.structures.find((s) => s.name === "Walls");
  const protectors = villageData?.structures.find((s) => s.name === "Protectors");

  // Mutations
  const { mutate: upsertNotice, isPending: isUpdating } =
    api.kage.upsertNotice.useMutation({
      onSuccess: async (data) => {
        showMutationToast(data);
        if (data.success) {
          await utils.village.get.invalidate();
        }
      },
    });

  const { mutate: leaveVillage, isPending: isLeaving } =
    api.village.leaveVillage.useMutation({
      onSuccess: async (data) => {
        showMutationToast(data);
        if (data.success) {
          await utils.profile.getUser.invalidate();
        }
      },
    });

  // Form control
  const {
    handleSubmit,
    reset,
    control,
    formState: { errors },
  } = useForm<MutateContentSchema>({
    defaultValues: { content: notice },
    resolver: zodResolver(mutateContentSchema),
  });

  // Handling submit
  const onSubmit = handleSubmit((data) => {
    upsertNotice(data);
    reset();
  });

  // Loading states
  if (!userData) return <Loader explanation="Loading userdata" />;
  if (!villageData) return <Loader explanation="Loading userdata" />;
  if (isLeaving) return <Loader explanation="Leaving village" />;

  // Overwrite village tokens if user is outlaw
  villageData.tokens = userData.isOutlaw
    ? userData.clan?.points || 0
    : villageData.tokens;

  // Derived
  const canLeave = hasRequiredRank(userData.rank, VILLAGE_LEAVE_REQUIRED_RANK);

  // Render
  return (
    <>
      <ContentBox
        title={title}
        subtitle={subtitle}
        topRightContent={
          <div className="flex flex-row items-center">
            <div className="grid grid-cols-2 gap-1">
              <TooltipProvider delayDuration={50}>
                <Tooltip>
                  <TooltipTrigger>
                    <div className="flex flex-row">
                      <BrickWall className="w-6 h-6 mr-2" /> lvl. {walls?.level}
                    </div>
                  </TooltipTrigger>
                  {walls && (
                    <TooltipContent>{StructureRewardEntries(walls)}</TooltipContent>
                  )}
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger>
                    <Link href={href}>
                      <div className="ml-3 flex flex-row hover:text-orange-500 hover:cursor-pointer">
                        <Users className="w-6 h-6 mr-2" />{" "}
                        {villageData?.populationCount}
                      </div>
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent>
                    Total {userData?.isOutlaw ? "faction" : "village"} population
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger>
                    <div className="flex flex-row">
                      <Bot className="w-6 h-6 mr-2" /> lvl. {protectors?.level}
                    </div>
                  </TooltipTrigger>
                  {protectors && (
                    <TooltipContent>
                      {StructureRewardEntries(protectors)}
                    </TooltipContent>
                  )}
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger>
                    <div className="ml-3 flex flex-row">
                      <ReceiptJapaneseYen className="w-6 h-6 mr-2" />{" "}
                      {villageData?.tokens}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    Tokens earned through PvP and quests can be used to improve{" "}
                    {userData?.isOutlaw ? "faction" : "village"}.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            {!userData.isOutlaw && canLeave && ownSector && (
              <Confirm
                title="Leave Village"
                proceed_label="Submit"
                button={
                  <Button className="w-14 h-12 p-0 ml-2">
                    <GitFork className="h-6 w-6" />
                  </Button>
                }
                onAccept={() => leaveVillage()}
              >
                Do you confirm that you wish to leave your{" "}
                {userData?.isOutlaw ? "faction" : "village"}? Your prestige will be
                reset to 0. Please be aware that if you join another{" "}
                {userData?.isOutlaw ? "faction" : "village"} your training benefits &
                regen will be reduced for {VILLAGE_REDUCED_GAINS_DAYS} days.
              </Confirm>
            )}
          </div>
        }
      >
        <div className="grid grid-cols-3 items-center sm:grid-cols-4">
          {villageData?.structures
            .filter((s) => s.hasPage !== 0)
            .filter((s) => ownSector || s.allyAccess)
            .map((structure, i) => (
              <div key={i} className="p-2">
                <Building
                  structure={structure}
                  village={villageData}
                  key={structure.id}
                  textPosition="bottom"
                  showBar
                />
              </div>
            ))}
        </div>
        {isFetchingVillage && <Loader explanation="Loading Village Information" />}
      </ContentBox>
      {["OUTLAW", "VILLAGE"].includes(sectorVillage?.type || "unknown") && (
        <ContentBox
          title="Notice Board"
          subtitle={`Information from ${sectorVillage?.type === "OUTLAW" ? "Leader" : "Kage"}`}
          initialBreak={true}
          topRightContent={
            isKage && (
              <Confirm
                title="Update Notice"
                proceed_label="Submit"
                button={<Button id="create">Update</Button>}
                onAccept={onSubmit}
              >
                <RichInput
                  id="content"
                  label="Contents of your thread"
                  height="300"
                  placeholder={notice}
                  control={control}
                  error={errors.content?.message}
                />
              </Confirm>
            )
          }
        >
          {parseHtml(notice)}
          {(isFetchingVillage || isUpdating) && (
            <Loader explanation="Loading Village Information" />
          )}
        </ContentBox>
      )}
    </>
  );
}

interface BuildingProps {
  structure: VillageStructure;
  village: Village;
  showBar?: boolean;
  textPosition: "bottom" | "right";
}

const Building: React.FC<BuildingProps> = (props) => {
  // Destructure
  const { structure, village, showBar, textPosition } = props;

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
        {userData && userData?.village?.kageId === userData?.userId && (
          <UpgradeButton
            structure={structure}
            village={village}
            clanId={userData.clanId}
          />
        )}
      </div>
    </div>
  );
  // Render
  return (
    <div className={`flex flex-col items-center justify-center text-center`}>
      {showBar && (
        <div className="w-2/3">
          <StatusBar
            title=""
            tooltip="Health"
            color="bg-red-500"
            showText={false}
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
          />
        </Link>
        {TextBlock}
      </div>
    </div>
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
        <Confirm
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
        </Confirm>
      )}
    </div>
  );
};

/**
 * Generates an array of reward messages based on the level of a village structure.
 * @param structure - The village structure object.
 * @returns An array of reward messages.
 */
const StructureRewardEntries = (structure: VillageStructure) => {
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
