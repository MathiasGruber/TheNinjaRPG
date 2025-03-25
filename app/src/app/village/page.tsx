"use client";

import { parseHtml } from "@/utils/parse";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import ContentBox from "@/layout/ContentBox";
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
import { GitFork } from "lucide-react";
import { Users, BrickWall, Bot, ReceiptJapaneseYen } from "lucide-react";
import { api } from "@/app/_trpc/client";
import { showMutationToast } from "@/libs/toast";
import { useRequireInVillage } from "@/utils/UserContext";
import { hasRequiredRank } from "@/libs/train";
import { VILLAGE_REDUCED_GAINS_DAYS } from "@/drizzle/constants";
import { VILLAGE_LEAVE_REQUIRED_RANK } from "@/drizzle/constants";
import Building from "@/layout/Building";
import { StructureRewardEntries } from "@/layout/Building";
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
              <div
                key={i}
                className="p-2"
                id={`tutorial-${structure.route.replace("/", "")}`}
              >
                <Building
                  structure={structure}
                  village={villageData}
                  key={structure.id}
                  textPosition="bottom"
                  showBar
                  showUpgrade
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
