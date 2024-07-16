"use client";

import { useState, useEffect } from "react";
import NavTabs from "@/layout/NavTabs";
import ItemWithEffects from "@/layout/ItemWithEffects";
import UserSearchSelect from "@/layout/UserSearchSelect";
import BanInfo from "@/layout/BanInfo";
import LoadoutSelector from "@/layout/LoadoutSelector";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { getSearchValidator } from "@/validators/register";
import { useRouter } from "next/navigation";
import { useRequiredUserData } from "@/utils/UserContext";
import { useRequireInVillage } from "@/utils/UserContext";
import { api } from "@/utils/api";
import { showMutationToast } from "@/libs/toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import ContentBox from "@/layout/ContentBox";
import UserRequestSystem from "@/layout/UserRequestSystem";
import Loader from "@/layout/Loader";
import { Swords } from "lucide-react";
import { BATTLE_ARENA_DAILY_LIMIT } from "@/drizzle/constants";
import type { z } from "zod";
import type { GenericObject } from "@/layout/ItemWithEffects";

export default function Arena() {
  // Tab selection
  const [tab, setTab] = useState<"Arena" | "Sparring" | null>(null);

  // Ensure user is in village
  const { userData, access } = useRequireInVillage("/battlearena");

  // Guards
  if (!access) return <Loader explanation="Accessing Battle Arena" />;
  if (!userData) return <Loader explanation="Loading user" />;
  if (userData?.isBanned) return <BanInfo />;

  // Derived values
  const title = tab === "Arena" ? "Arena" : "Sparring";
  const subtitle =
    tab === "Arena"
      ? `Daily Training [${userData?.dailyArenaFights} / ${BATTLE_ARENA_DAILY_LIMIT}]`
      : "PVP Challenges";

  return (
    <>
      <ContentBox
        title={title}
        subtitle={subtitle}
        back_href="/village"
        padding={tab === "Arena"}
        topRightContent={
          <NavTabs
            id="arenaSelection"
            current={tab}
            options={["Arena", "Sparring"]}
            setValue={setTab}
          />
        }
      >
        {tab === "Arena" && <ChallengeAI />}
        {tab === "Sparring" && <ChallengeUser />}
      </ContentBox>
      {tab === "Sparring" && <ActiveChallenges />}
    </>
  );
}

const ChallengeAI: React.FC = () => {
  // Data from database
  const { data: userData } = useRequiredUserData();
  const [aiId, setAiId] = useState<string | undefined>(undefined);

  // tRPC utility
  const utils = api.useUtils();

  // Router for forwarding
  const router = useRouter();

  // Queries
  const { data: aiData } = api.profile.getAllAiNames.useQuery(undefined, {
    staleTime: Infinity,
  });

  const { data: ai } = api.profile.getAi.useQuery(
    { userId: aiId ?? "" },
    { staleTime: Infinity, enabled: !!aiId },
  );

  const sortedAis = aiData
    ?.filter((ai) => !ai.isSummon && ai.inArena)
    .sort((a, b) => {
      if (userData?.level) {
        return Math.abs(a.level - userData.level) - Math.abs(b.level - userData.level);
      }
      return 1;
    });

  // Mutation for starting a fight
  const { mutate: attack, isPending: isAttacking } =
    api.combat.startArenaBattle.useMutation({
      onSuccess: async (data) => {
        if (data.success) {
          await utils.profile.getUser.invalidate();
          router.push("/combat");
          showMutationToast({ ...data, message: "Entering the Arena" });
        } else {
          showMutationToast(data);
        }
      },
    });

  // Set initially selected AI
  useEffect(() => {
    if (!aiId) {
      const selectedAI = sortedAis?.[0];
      if (selectedAI) {
        setAiId(selectedAI.userId);
      }
    }
  }, [sortedAis, aiId]);

  // Loaders
  if (!userData) return <Loader explanation="Loading userdata" />;

  // Derived
  const canDoArena = userData.dailyArenaFights < BATTLE_ARENA_DAILY_LIMIT;

  return (
    <div className="flex flex-col items-center">
      The arena is a fairly basic circular and raw battleground, where you can train &
      test your skills as a ninja. Opponents are various creatures or ninja deemed to be
      at your level.
      {!canDoArena && (
        <h1 className="pb-3 pt-5 font-fontasia text-7xl">Wait till tomorrow</h1>
      )}
      {!isAttacking && canDoArena && (
        <>
          <LoadoutSelector />
          <h1
            className="cursor-pointer pb-3 pt-5 font-fontasia text-7xl hover:text-orange-800"
            onClick={() => ai && attack({ aiId: ai.userId })}
          >
            Enter The Arena
          </h1>
          <div className="rounded-2xl mt-3 w-full">
            <div className="mb-1">
              <Select
                onValueChange={(e) => setAiId(e)}
                defaultValue={aiId}
                value={aiId}
              >
                <SelectTrigger>
                  <SelectValue placeholder={`None`} />
                </SelectTrigger>
                <SelectContent>
                  {sortedAis?.map((ai) => (
                    <SelectItem key={ai.userId} value={ai.userId}>
                      {ai.username} (lvl {ai.level})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {ai && (
              <ItemWithEffects
                item={
                  {
                    id: ai.userId,
                    name: ai.username,
                    image: ai.avatar,
                    description: "",
                    rarity: "COMMON",
                    effects: [],
                    href: `/users/${ai.userId}`,
                    attacks: ai.jutsus?.map((jutsu) =>
                      "jutsu" in jutsu ? jutsu.jutsu?.name : "Unknown",
                    ),
                    ...ai,
                  } as GenericObject
                }
                showStatistic="ai"
              />
            )}
          </div>
        </>
      )}
      {isAttacking && (
        <div className="min-h-64">
          <div className="absolute bottom-0 left-0 right-0 top-0 z-20 m-auto flex flex-col justify-center bg-black opacity-95">
            <div className="m-auto text-white">
              <p className="text-5xl">Entering the Arena</p>
              <Loader />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const ChallengeUser: React.FC = () => {
  // Data from database
  const { data: userData } = useRequiredUserData();

  // User search
  const maxUsers = 1;
  const userSearchSchema = getSearchValidator({ max: maxUsers });
  const userSearchMethods = useForm<z.infer<typeof userSearchSchema>>({
    resolver: zodResolver(userSearchSchema),
  });
  const targetUser = userSearchMethods.watch("users", [])?.[0];

  // tRPC utility
  const utils = api.useUtils();

  // Mutations
  const { mutate: create, isPending } = api.sparring.createChallenge.useMutation({
    onSuccess: async (data) => {
      showMutationToast(data);
      if (data.success) {
        userSearchMethods.setValue("users", []);
        await utils.sparring.getUserChallenges.invalidate();
      }
    },
  });

  // If loading
  if (isPending) return <Loader explanation="Loading" />;
  if (!userData) return <Loader explanation="Loading userdata" />;

  // Render
  return (
    <div>
      <p className="p-2">
        You can directly challenge ninja from across the continent to spar against you
        with no consequence to your alliances or village.
      </p>
      <div className="p-2 mb-5">
        <UserSearchSelect
          useFormMethods={userSearchMethods}
          selectedUsers={[]}
          showYourself={false}
          inline={true}
          maxUsers={maxUsers}
        />
        {targetUser && (
          <Button
            id="challenge"
            className="mt-2 w-full"
            onClick={() => create({ targetId: targetUser.userId })}
          >
            <Swords className="h-5 w-5 mr-2" />
            Challenge Now!
          </Button>
        )}
      </div>
    </div>
  );
};

const ActiveChallenges: React.FC = () => {
  // Data from database
  const { data: userData } = useRequiredUserData();

  // Queries
  const { data: challenges } = api.sparring.getUserChallenges.useQuery(undefined, {
    staleTime: 5000,
  });

  // tRPC utility
  const utils = api.useUtils();

  // Router for forwarding
  const router = useRouter();

  // Mutations
  const { mutate: accept, isPending: isAccepting } =
    api.sparring.acceptChallenge.useMutation({
      onSuccess: async (data) => {
        showMutationToast(data);
        if (data.success) {
          await utils.profile.getUser.invalidate();
          await utils.sparring.getUserChallenges.invalidate();
          router.push("/combat");
        }
      },
    });

  const { mutate: reject, isPending: isRejecting } =
    api.sparring.rejectChallenge.useMutation({
      onSuccess: async (data) => {
        showMutationToast(data);
        if (data.success) {
          await utils.sparring.getUserChallenges.invalidate();
        }
      },
    });

  const { mutate: cancel, isPending: isCancelling } =
    api.sparring.cancelChallenge.useMutation({
      onSuccess: async (data) => {
        showMutationToast(data);
        if (data.success) {
          await utils.sparring.getUserChallenges.invalidate();
        }
      },
    });

  // Derived features
  const isPending = isAccepting || isRejecting || isCancelling;

  // If loading
  if (isPending) return <Loader explanation="Loading" />;
  if (!userData) return null;

  // Render
  return (
    challenges &&
    challenges.length > 0 && (
      <ContentBox
        title="Active Challenges"
        subtitle="Sent to or from you"
        initialBreak={true}
        padding={false}
      >
        <UserRequestSystem
          requests={challenges}
          userId={userData.userId}
          onAccept={accept}
          onReject={reject}
          onCancel={cancel}
        />
      </ContentBox>
    )
  );
};
