import { useState, useEffect } from "react";
import NavTabs from "@/layout/NavTabs";
import Table, { type ColumnDefinitionType } from "@/layout/Table";
import ItemWithEffects from "@/layout/ItemWithEffects";
import UserSearchSelect from "@/layout/UserSearchSelect";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { capitalizeFirstLetter } from "@/utils/sanitize";
import { getSearchValidator } from "@/validators/register";
import { useSafePush } from "@/utils/routing";
import { useRequiredUserData } from "@/utils/UserContext";
import { useRequireInVillage } from "@/utils/village";
import { api } from "@/utils/api";
import { showMutationToast } from "@/libs/toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import ContentBox from "@/layout/ContentBox";
import Loader from "@/layout/Loader";
import { Swords, Check, X, Trash2 } from "lucide-react";
import type { z } from "zod";
import type { UserChallenge } from "@/drizzle/schema";
import type { ChallengeState, UserRank } from "@/drizzle/constants";
import type { GenericObject } from "@/layout/ItemWithEffects";
import type { NextPage } from "next";
import type { ArrayElement } from "@/utils/typeutils";

const Arena: NextPage = () => {
  // Tab selection
  const [tab, setTab] = useState<"Arena" | "Sparring" | null>(null);

  // Ensure user is in village
  useRequireInVillage();

  // Derived values
  const title = tab === "Arena" ? "Arena" : "Sparring";
  const subtitle = tab === "Arena" ? "Fight Training" : "PVP Challenges";

  return (
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
  );
};

const ChallengeAI: React.FC = () => {
  // Data from database
  const { data: userData } = useRequiredUserData();
  const [aiId, setAiId] = useState<string | undefined>(undefined);

  // tRPC utility
  const utils = api.useUtils();

  // Router for forwarding
  const router = useSafePush();

  // Queries
  const { data: aiData } = api.profile.getAllAiNames.useQuery(undefined, {
    staleTime: Infinity,
  });

  const { data: ai } = api.profile.getAi.useQuery(
    { userId: aiId ?? "" },
    { staleTime: Infinity, enabled: !!aiId },
  );

  const sortedAis = aiData
    ?.filter((ai) => !ai.isSummon)
    .sort((a, b) => {
      if (userData?.level) {
        return Math.abs(a.level - userData.level) - Math.abs(b.level - userData.level);
      }
      return 1;
    });

  // Mutation for starting a fight
  const { mutate: attack, isLoading: isAttacking } =
    api.combat.startArenaBattle.useMutation({
      onSuccess: async (data) => {
        showMutationToast({ success: data.success, message: "You enter the arena" });
        if (data.success) {
          await utils.profile.getUser.invalidate();
          await router.push("/combat");
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

  if (!userData) return <Loader explanation="Loading userdata" />;

  return (
    <div>
      The arena is a fairly basic circular and raw battleground, where you can train &
      test your skills as a ninja. Opponents are various creatures or ninja deemed to be
      at your level.
      {!isAttacking && (
        <>
          <h1
            className="cursor-pointer pb-3 pt-5 text-center font-fontasia text-8xl hover:text-orange-800"
            onClick={() => ai && attack({ aiId: ai.userId })}
          >
            Enter The Arena
          </h1>
          <div className="rounded-2xl mt-3">
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
            <div className="m-auto text-center text-white">
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

  // Queries
  const { data, refetch } = api.sparring.getUserChallenges.useQuery(undefined, {
    staleTime: 5000,
  });

  // Table for challenges sent
  const challengesSent = data
    ?.filter((c) => c.challengerId === userData?.userId)
    .map((c) => ({
      challenged: <ChallengeUserInfo user={c.challenged} />,
      status: <ChallengeStatusBox status={c.status} />,
      actions: <ChallengeActionsBox challenge={c} />,
    }));
  type SparSent = ArrayElement<typeof challengesSent>;
  const sentColumns: ColumnDefinitionType<SparSent, keyof SparSent>[] = [
    { key: "challenged", header: "Challenged", type: "jsx" },
    { key: "status", header: "Status", type: "jsx" },
    { key: "actions", header: "Actions", type: "jsx" },
  ];

  // Table for challenges received
  const challengesReceived = data
    ?.filter((c) => c.challengedId === userData?.userId)
    .map((c) => ({
      challenger: <ChallengeUserInfo user={c.challenger} />,
      status: <ChallengeStatusBox status={c.status} />,
      actions: <ChallengeActionsBox challenge={c} />,
    }));
  type SparReceived = ArrayElement<typeof challengesReceived>;
  const receivedColumns: ColumnDefinitionType<SparReceived, keyof SparReceived>[] = [
    { key: "challenger", header: "Challenger", type: "jsx" },
    { key: "status", header: "Status", type: "jsx" },
    { key: "actions", header: "Actions", type: "jsx" },
  ];

  // User search
  const maxUsers = 1;
  const userSearchSchema = getSearchValidator({ max: maxUsers });
  const userSearchMethods = useForm<z.infer<typeof userSearchSchema>>({
    resolver: zodResolver(userSearchSchema),
  });
  const targetUser = userSearchMethods.watch("users", [])?.[0];

  // Create mutation
  const { mutate: create, isLoading } = api.sparring.createChallenge.useMutation({
    onSuccess: async (data) => {
      showMutationToast(data);
      if (data.success) {
        userSearchMethods.setValue("users", []);
        await refetch();
      }
    },
  });

  // Show loaders
  if (isLoading) return <Loader explanation="Loading challenges" />;
  if (!userData) return <Loader explanation="Loading userdata" />;

  // Render
  return (
    <div>
      <p className="p-2">
        You can directly challenging ninja from across the continent to spar against you
        with no consequence to your alliances or village.
      </p>
      <div className="p-2">
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

      {challengesSent && challengesSent.length > 0 && (
        <Table data={challengesSent} columns={sentColumns} />
      )}
      {challengesReceived && challengesReceived.length > 0 && (
        <Table data={challengesReceived} columns={receivedColumns} />
      )}
    </div>
  );
};

export default Arena;

const ChallengeActionsBox: React.FC<{ challenge: UserChallenge }> = ({ challenge }) => {
  // Data from database
  const { data: userData } = useRequiredUserData();

  // tRPC utility
  const utils = api.useUtils();

  // Router for forwarding
  const router = useSafePush();

  // Mutations
  const { mutate: accept, isLoading: isAccepting } =
    api.sparring.acceptChallenge.useMutation({
      onSuccess: async (data) => {
        showMutationToast(data);
        if (data.success) {
          await utils.profile.getUser.invalidate();
          await utils.sparring.getUserChallenges.invalidate();
          await router.push("/combat");
        }
      },
    });

  const { mutate: reject, isLoading: isRejecting } =
    api.sparring.rejectChallenge.useMutation({
      onSuccess: async (data) => {
        showMutationToast(data);
        if (data.success) {
          await utils.sparring.getUserChallenges.invalidate();
        }
      },
    });

  const { mutate: cancel, isLoading: isCancelling } =
    api.sparring.cancelChallenge.useMutation({
      onSuccess: async (data) => {
        showMutationToast(data);
        if (data.success) {
          await utils.sparring.getUserChallenges.invalidate();
        }
      },
    });

  // Derived features
  const isLoading = isAccepting || isRejecting || isCancelling;

  // If loading
  if (isLoading) return <Loader explanation="Loading" />;

  if (challenge.status === "PENDING") {
    if (challenge.challengerId === userData?.userId) {
      return (
        <Button
          className="w-full"
          id="cancel"
          onClick={() => cancel({ challengeId: challenge.id })}
        >
          <Trash2 className="h-5 w-5 mr-2" />
          Cancel
        </Button>
      );
    } else {
      return (
        <div className="grid grid-cols-2 gap-1">
          <Button id="accept" onClick={() => accept({ challengeId: challenge.id })}>
            <Check className="h-5 w-5 mr-2" />
            Accept
          </Button>
          <Button id="reject" onClick={() => reject({ challengeId: challenge.id })}>
            <X className="h-5 w-5 mr-2" />
            Reject
          </Button>
        </div>
      );
    }
  }
  return null;
};

const ChallengeStatusBox: React.FC<{ status: ChallengeState }> = ({ status }) => {
  switch (status) {
    case "PENDING":
      return (
        <div className="bg-amber-300 p-2 rounded-md border-2 border-amber-400 text-amber-600 font-bold">
          Pending
        </div>
      );
    case "ACCEPTED":
      return (
        <div className="bg-green-300 p-2 rounded-md border-2 border-green-400 text-green-600 font-bold">
          Accepted
        </div>
      );
    case "REJECTED":
      return (
        <div className="bg-red-300 p-2 rounded-md border-2 border-red-400 text-red-600 font-bold">
          Rejected
        </div>
      );
    case "CANCELLED":
      return (
        <div className="bg-slate-300 p-2 rounded-md border-2 border-slate-400 text-slate-600 font-bold">
          Cancelled
        </div>
      );
  }
};

const ChallengeUserInfo: React.FC<{
  user: { username: string; level: number; rank: UserRank };
}> = ({ user }) => {
  return (
    <div>
      <p className="font-bold">{user.username}</p>
      <p>
        Lvl. {user.level} {capitalizeFirstLetter(user.rank)}
      </p>
    </div>
  );
};
