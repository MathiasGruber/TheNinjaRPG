import ReactHtmlParser from "react-html-parser";
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
import { Users, BrickWall, Bot, ReceiptJapaneseYen, Info } from "lucide-react";
import { useRequiredUserData } from "@/utils/UserContext";
import { api } from "@/utils/api";
import { showMutationToast } from "@/libs/toast";
import type { NextPage } from "next";
import type { VillageStructure } from "@/drizzle/schema";
import type { MutateContentSchema } from "@/validators/comments";

const VillageOverview: NextPage = () => {
  // State
  const { data: userData } = useRequiredUserData();
  const village_id = userData?.village?.id as string;
  const { data, isFetching } = api.village.get.useQuery(
    { id: village_id },
    { enabled: village_id !== undefined, staleTime: Infinity },
  );

  // tRPC utility
  const utils = api.useUtils();

  // Derived
  const villageData = data?.villageData;
  const notice = villageData?.notice?.content ?? "No notice from the  kage";
  const isKage = userData?.village?.kageId === userData?.userId;
  const title = userData?.village ? `${userData.village.name} Village` : "Village";
  const href = userData?.village ? `/users/village/${userData.villageId}` : "/users";

  // Specific structures
  const walls = villageData?.structures.find((s) => s.name === "Walls");
  const protectors = villageData?.structures.find((s) => s.name === "Protectors");

  // Mutations
  const { mutate, isPending: isUpdating } = api.kage.upsertNotice.useMutation({
    onSuccess: async (data) => {
      showMutationToast(data);
      if (data.success) {
        await utils.village.get.invalidate();
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
    mutate(data);
    reset();
  });

  // Loading states
  if (!userData) return <Loader explanation="Loading userdata" />;

  // Render
  return (
    <>
      <ContentBox
        title={title}
        subtitle="Your Community"
        topRightContent={
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
                      <Users className="w-6 h-6 mr-2" /> {data?.population}
                    </div>
                  </Link>
                </TooltipTrigger>
                <TooltipContent>Total village population</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger>
                  <div className="flex flex-row">
                    <Bot className="w-6 h-6 mr-2" /> lvl. {protectors?.level}
                  </div>
                </TooltipTrigger>
                {protectors && (
                  <TooltipContent>{StructureRewardEntries(protectors)}</TooltipContent>
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
                  Tokens earned through PvP and quests can be used to improve village.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        }
      >
        <div className="grid grid-cols-3 items-center sm:grid-cols-4">
          {villageData?.structures
            .filter((s) => s.hasPage !== 0)
            .map((structure, i) => (
              <div key={i} className="p-2">
                <Link href={`/${structure.name.toLowerCase().replace(" ", "")}`}>
                  <Building
                    structure={structure}
                    key={structure.id}
                    textPosition="bottom"
                    showBar
                  />
                </Link>
              </div>
            ))}
        </div>
        {isFetching && <Loader explanation="Loading Village Information" />}
      </ContentBox>
      <ContentBox
        title="Notice Board"
        subtitle="Information from Kage"
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
        {ReactHtmlParser(notice)}
        {(isFetching || isUpdating) && (
          <Loader explanation="Loading Village Information" />
        )}
      </ContentBox>
    </>
  );
};

export default VillageOverview;

interface BuildingProps {
  structure: VillageStructure;
  showBar?: boolean;
  textPosition: "bottom" | "right";
}

const Building: React.FC<BuildingProps> = (props) => {
  // Destructure
  const { structure, showBar, textPosition } = props;

  // Blocks
  const TextBlock = (
    <div className="text-xs">
      <p className="font-bold">{structure.name}</p>
      <div className="flex flex-row items-center justify-center gap-2">
        <p>Lvl. {structure.level}</p>{" "}
        <TooltipProvider delayDuration={50}>
          <Tooltip>
            <TooltipTrigger>
              <Info className="w-4 h-4" />
            </TooltipTrigger>
            <TooltipContent>{StructureRewardEntries(structure)}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>
  );
  const ImageBlock = (
    <Image
      src={structure.image}
      alt={structure.name}
      width={200}
      height={200}
      priority={true}
    />
  );
  // Render
  return (
    <div
      className={`flex flex-col items-center justify-center text-center ${
        structure.level > 0 ? "hover:opacity-80" : "opacity-30"
      }`}
    >
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
        {ImageBlock}
        {TextBlock}
      </div>
    </div>
  );
};

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
      msgs.push(`Bank Interest: +${structure.bankInterestPerLvl * level}%`);
    }
    if (structure.blackDiscountPerLvl > 0) {
      msgs.push(`Market discount: ${structure.blackDiscountPerLvl * level}%`);
    }
    if (structure.clansPerLvl > 0) {
      msgs.push(`Clans: +${structure.clansPerLvl * level}`);
    }
    if (structure.hospitalSpeedupPerLvl > 0) {
      msgs.push(`Hospital Speed: +${structure.hospitalSpeedupPerLvl * level}%`);
    }
    if (structure.itemDiscountPerLvl > 0) {
      msgs.push(`Item discount: ${structure.itemDiscountPerLvl * level}%`);
    }
    if (structure.patrolsPerLvl > 0) {
      msgs.push(`NPC Patrols: +${structure.patrolsPerLvl * level}`);
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
