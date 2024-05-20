import { z } from "zod";
import Link from "next/link";
import ReactHtmlParser from "react-html-parser";
import ContentBox from "@/layout/ContentBox";
import Loader from "@/layout/Loader";
import AvatarImage from "@/layout/Avatar";
import Table, { type ColumnDefinitionType } from "@/layout/Table";
import { ShieldPlus } from "lucide-react";
import {
  Form,
  FormControl,
  FormField,
  FormLabel,
  FormItem,
  FormMessage,
} from "@/components/ui/form";
import { Pencil, DoorOpen, ArrowBigUpDash, ArrowBigDownDash } from "lucide-react";
import { SendHorizontal, Swords, DoorClosed, PiggyBank } from "lucide-react";
import Confirm from "@/layout/Confirm";
import RichInput from "@/layout/RichInput";
import UserRequestSystem from "@/layout/UserRequestSystem";
import { mutateContentSchema } from "@/validators/comments";
import { api } from "@/utils/api";
import { useRouter } from "next/router";
import { useForm } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { zodResolver } from "@hookform/resolvers/zod";
import { clanCreateSchema } from "@/validators/clan";
import { Button } from "@/components/ui/button";
import { showMutationToast } from "@/libs/toast";
import { hasRequiredRank } from "@/libs/train";
import { CLAN_CREATE_PRESTIGE_REQUIREMENT } from "@/drizzle/constants";
import { CLAN_CREATE_RYO_COST } from "@/drizzle/constants";
import { CLAN_RANK_REQUIREMENT } from "@/drizzle/constants";
import { CLAN_MAX_MEMBERS } from "@/drizzle/constants";
import { MAX_TRAINING_BOOST, TRAINING_BOOST_COST } from "@/drizzle/constants";
import { MAX_RYO_BOOST, RYO_BOOST_COST } from "@/drizzle/constants";
import { checkCoLeader } from "@/validators/clan";
import type { BaseServerResponse } from "@/server/api/trpc";
import type { UserRank } from "@/drizzle/constants";
import type { MutateContentSchema } from "@/validators/comments";
import type { UserNindo } from "@/drizzle/schema";
import type { ClanCreateSchema } from "@/validators/clan";
import type { ArrayElement } from "@/utils/typeutils";
import type { UserWithRelations } from "@/server/api/routers/profile";

/**
 * Show an overview of the clans in the village
 */
interface ClansOverviewProps {
  userData: NonNullable<UserWithRelations>;
}

export const ClansOverview: React.FC<ClansOverviewProps> = (props) => {
  // Destructure
  const { userData } = props;

  // tRPC utils
  const utils = api.useUtils();

  // Queries
  const { data } = api.clan.getAll.useQuery(
    { villageId: userData?.villageId as string },
    { enabled: !!userData?.villageId },
  );
  const allClans = data?.map((clan) => ({
    ...clan,
    memberCount: clan.members.length,
    clanInfo: (
      <div className="w-20 text-center">
        <AvatarImage
          href={clan.image}
          alt={clan.name}
          size={100}
          hover_effect={true}
          priority
        />
        {clan.name}
      </div>
    ),
    leaderInfo: (
      <div className="w-20 text-center">
        {clan.leader && (
          <div>
            <AvatarImage
              href={clan.leader.avatar}
              alt={clan.name}
              size={100}
              hover_effect={true}
              priority
            />
            {clan.leader.username}
          </div>
        )}
      </div>
    ),
  }));

  // Table
  type Clan = ArrayElement<typeof allClans>;
  const columns: ColumnDefinitionType<Clan, keyof Clan>[] = [
    { key: "clanInfo", header: "Clan", type: "jsx" },
    { key: "leaderInfo", header: "Leader", type: "jsx" },
    { key: "memberCount", header: "# Members", type: "string" },
    { key: "pvpActivity", header: "PVP Activity", type: "string" },
  ];

  // Mutations
  const { mutate: createClan, isPending: isCreating } = api.clan.createClan.useMutation(
    {
      onSuccess: async (data) => {
        showMutationToast(data);
        await utils.clan.getAll.invalidate();
      },
    },
  );

  // Form
  const createForm = useForm<ClanCreateSchema>({
    resolver: zodResolver(clanCreateSchema),
    defaultValues: { name: "", villageId: "" },
  });

  // Form handlers
  const onSubmit = createForm.handleSubmit((data) => {
    console.log(data);
    createClan({ name: data.name, villageId: userData?.villageId ?? "" });
  });

  // Loaders
  if (isCreating) return <Loader explanation="Creating squad" />;
  if (userData.isOutlaw) return <Loader explanation="Unlikely to find outlaw clans" />;

  // Derived
  const canCreate =
    userData.villagePrestige >= CLAN_CREATE_PRESTIGE_REQUIREMENT &&
    userData.money >= CLAN_CREATE_RYO_COST &&
    hasRequiredRank(userData.rank, CLAN_RANK_REQUIREMENT);

  // Render
  return (
    <ContentBox
      title="Clans"
      subtitle="Fight together"
      back_href="/village"
      padding={false}
      topRightContent={
        <Confirm
          title="Create new Clan"
          proceed_label={canCreate ? "Submit" : "Not enough prestige or Ryo"}
          button={
            <Button id="create-anbu-squad" className="w-full">
              <ShieldPlus className="mr-2 h-5 w-5" />
              Create
            </Button>
          }
          confirmClassName={
            canCreate
              ? "bg-blue-600 text-white hover:bg-blue-700"
              : "bg-red-600 text-white hover:bg-red-700"
          }
          isValid={createForm.formState.isValid}
          onAccept={canCreate ? onSubmit : undefined}
        >
          Create a clan requires at least {CLAN_CREATE_PRESTIGE_REQUIREMENT} village
          prestige, and costs {CLAN_CREATE_RYO_COST} Ryo. You currently have{" "}
          {userData.villagePrestige} prestige and {userData.money} Ryo.
          {canCreate && (
            <Form {...createForm}>
              <form className="space-y-2" onSubmit={onSubmit}>
                <FormField
                  control={createForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Title</FormLabel>
                      <FormControl>
                        <Input placeholder="Name of the new clan" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </form>
            </Form>
          )}
        </Confirm>
      }
    >
      {allClans && allClans.length > 0 && (
        <Table
          data={allClans}
          columns={columns}
          linkPrefix="/clanhall/"
          linkColumn={"id"}
        />
      )}
      {allClans?.length === 0 && (
        <p className="p-3">No current clans in this village</p>
      )}
    </ContentBox>
  );
};

/**
 * Renders the Anbu Orders component.
 *
 * @param props - The component props.
 * @returns The rendered component.
 */
interface ClanOrdersProps {
  clanId: string;
  order: UserNindo | null;
  canPost: boolean;
}

export const ClanOrders: React.FC<ClanOrdersProps> = (props) => {
  // Destructure
  const { clanId, order, canPost } = props;

  // utils
  const utils = api.useUtils();

  // Mutations
  const { mutate: notice } = api.clan.upsertNotice.useMutation({
    onSuccess: async (data) => {
      showMutationToast(data);
      if (data.success) {
        await utils.clan.get.invalidate();
      }
    },
  });

  // Content
  const content = order?.content ?? "No current orders";

  // Order form
  const {
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<MutateContentSchema>({
    defaultValues: { content },
    resolver: zodResolver(mutateContentSchema),
  });
  const onUpdateOrder = handleSubmit((data) => notice({ ...data, clanId }));

  return (
    <ContentBox
      title="Orders"
      subtitle="From clan leader"
      initialBreak={true}
      topRightContent={
        <div>
          {canPost && (
            <Confirm
              title="Update Orders"
              proceed_label="Submit"
              button={
                <Button id="create">
                  <Pencil className="h-5 w-5 mr-2" /> Edit
                </Button>
              }
              onAccept={onUpdateOrder}
            >
              <RichInput
                id="content"
                label="Contents of your orders"
                height="300"
                placeholder={content}
                control={control}
                error={errors.content?.message}
              />
            </Confirm>
          )}
        </div>
      }
    >
      {ReactHtmlParser(content)}
    </ContentBox>
  );
};

/**
 * Renders a component that displays ANBU requests for a squad.
 *
 * @component
 * @param {ClanRequestsProps} props - The component props.
 * @returns {JSX.Element} The rendered component.
 */
interface ClanRequestsProps {
  clanId: string;
  isLeader: boolean;
  userId: string;
  userRank: UserRank;
  userClan: string | null;
}

export const ClanRequests: React.FC<ClanRequestsProps> = (props) => {
  // Destructure
  const { clanId, isLeader, userId, userRank, userClan } = props;

  // Get utils
  const utils = api.useUtils();

  // Query
  const { data: requests } = api.clan.getRequests.useQuery(undefined, {
    staleTime: 5000,
  });

  // How to deal with success responses
  const onSuccess = async (data: BaseServerResponse) => {
    showMutationToast(data);
    if (data.success) {
      await utils.clan.get.invalidate();
      await utils.clan.getRequests.invalidate();
    }
  };

  // Mutation
  const { mutate: create } = api.clan.createRequest.useMutation({ onSuccess });
  const { mutate: accept } = api.clan.acceptRequest.useMutation({ onSuccess });
  const { mutate: reject } = api.clan.rejectRequest.useMutation({ onSuccess });
  const { mutate: cancel } = api.clan.cancelRequest.useMutation({ onSuccess });

  // Loaders
  if (!requests) return <Loader explanation="Loading requests" />;

  // Derived
  const hasPending = requests?.some((req) => req.status === "PENDING");
  const showRequestSystem = (isLeader && requests.length > 0) || !userClan;
  const shownRequests = requests.filter((r) => !isLeader || r.status === "PENDING");
  const sufficientRank = hasRequiredRank(userRank, CLAN_RANK_REQUIREMENT);

  // Do not show?
  if (!showRequestSystem) return null;

  // Render
  return (
    <ContentBox
      title="Request"
      subtitle="Requests for clan"
      initialBreak={true}
      padding={false}
    >
      {/* FOR THOSE WHO CAN SEND REQUESTS */}
      {sufficientRank && !userClan && !hasPending && (
        <div className="p-2">
          <p>Send a request to join this clan</p>
          <Button id="send" className="mt-2 w-full" onClick={() => create({ clanId })}>
            <SendHorizontal className="h-5 w-5 mr-2" />
            Send Request
          </Button>
        </div>
      )}
      {/* SHOW REQUESTS */}
      {shownRequests.length === 0 && <p className="p-2 italic">No current requests</p>}
      {shownRequests.length > 0 && (
        <UserRequestSystem
          requests={shownRequests}
          userId={userId}
          onAccept={accept}
          onReject={reject}
          onCancel={cancel}
        />
      )}
    </ContentBox>
  );
};

/**
 * Show the profile of the user's clan
 */
interface ClanInfoProps {
  userData: NonNullable<UserWithRelations>;
  clanId: string;
  back_href?: string;
}

export const ClanInfo: React.FC<ClanInfoProps> = (props) => {
  // Destructure
  const { userData, clanId, back_href } = props;

  // Get router
  const router = useRouter();

  // Get react query utility
  const utils = api.useUtils();

  // Deposit to bank
  const money = userData?.money ?? 0;
  const fromPocketSchema = z.object({
    amount: z.coerce.number().int().positive().max(money),
  });
  const toBankForm = useForm<z.infer<typeof fromPocketSchema>>({
    resolver: zodResolver(fromPocketSchema),
  });

  // Query
  const { data: clanData } = api.clan.get.useQuery({ clanId });

  // Mutations
  const { mutate: leave } = api.clan.leaveClan.useMutation({
    onSuccess: async (data) => {
      showMutationToast(data);
      if (data.success) {
        await utils.clan.get.invalidate();
        await utils.clan.getRequests.invalidate();
        await router.push("/clanhall");
      }
    },
  });

  const { mutate: demote } = api.clan.demoteMember.useMutation({
    onSuccess: async (data) => {
      showMutationToast(data);
      if (data.success) {
        await utils.clan.get.invalidate();
        await utils.clan.getRequests.invalidate();
      }
    },
  });

  const { mutate: fight } = api.clan.fightLeader.useMutation({
    onSuccess: async (data) => {
      showMutationToast(data);
      if (data.success) {
        await utils.profile.getUser.invalidate();
        await utils.clan.get.invalidate();
        await utils.clan.getRequests.invalidate();
        await router.push("/combat");
      }
    },
  });

  const { mutate: boostTraining } = api.clan.purchaseTrainingBoost.useMutation({
    onSuccess: async (data) => {
      showMutationToast(data);
      if (data.success) {
        await utils.clan.get.invalidate();
      }
    },
  });

  const { mutate: boostRyo } = api.clan.purchaseRyoBoost.useMutation({
    onSuccess: async (data) => {
      showMutationToast(data);
      if (data.success) {
        await utils.clan.get.invalidate();
      }
    },
  });

  const { mutate: toBank, isPending: isDepositing } = api.clan.toBank.useMutation({
    onSuccess: async (data) => {
      showMutationToast(data);
      if (data.success) {
        await utils.profile.getUser.invalidate();
        await utils.clan.get.invalidate();
        toBankForm.reset();
      }
    },
  });
  const onDeposit = toBankForm.handleSubmit((data) => toBank({ ...data, clanId }));

  // Loader
  if (!clanData) return <Loader explanation="Loading clan data" />;
  if (isDepositing) return <Loader explanation="Depositing money" />;

  // Derived
  const inClan = userData.clanId === clanData.id;
  const isLeader = userData.userId === clanData.leaderId;
  const isCoLeader = checkCoLeader(userData.userId, clanData);

  // Render
  return (
    <ContentBox
      title={clanData.name}
      subtitle="Clan Overview"
      back_href={back_href}
      topRightContent={
        <div>
          {inClan && (
            <Confirm
              title="Update Orders"
              proceed_label="Submit"
              button={
                <Button id="send">
                  <DoorOpen className="h-5 w-5 mr-2" />
                  Leave
                </Button>
              }
              onAccept={() => leave({ clanId })}
            >
              Confirm leaving this clan
            </Confirm>
          )}
        </div>
      }
    >
      <div className="grid grid-cols-8">
        <div className="col-span-4 sm:col-span-2">
          <AvatarImage
            href={clanData.image}
            alt={clanData.id}
            size={100}
            hover_effect={true}
            priority
          />
        </div>
        <div className="col-span-4 sm:col-span-6">
          <div className="pt-2 grid grid-cols-1 sm:grid-cols-2">
            <div>
              <p>Village: {clanData.village.name}</p>
              <p>
                Founder:{" "}
                <Link
                  className="font-bold hover:text-orange-500"
                  href={`/users/${clanData.founder.userId}`}
                >
                  {clanData.founder.username}
                </Link>
              </p>
              <p>
                Leader:{" "}
                <Link
                  className="font-bold hover:text-orange-500"
                  href={`/users/${clanData.founder.userId}`}
                >
                  {clanData.leader.username}
                </Link>
              </p>
              <div className="flex flex-row items-center">
                <p>Training boost: {clanData.trainingBoost}%</p>
                {(isLeader || isCoLeader) && (
                  <Confirm
                    title="Boost ryo gain for clan members"
                    proceed_label={
                      clanData.points >= TRAINING_BOOST_COST
                        ? "Submit"
                        : "Cannot afford"
                    }
                    button={
                      <ArrowBigUpDash className="ml-2 h-6 w-6 hover:text-orange-500 hover:cursor-pointer" />
                    }
                    onAccept={() => boostTraining({ clanId })}
                  >
                    {clanData.trainingBoost < MAX_TRAINING_BOOST ? (
                      <p>
                        Boost the training gain for clan members for{" "}
                        {TRAINING_BOOST_COST} clan points. Note that this boost is
                        gradually reduced once per day. You currently have{" "}
                        {clanData.points} points.
                      </p>
                    ) : (
                      <p>Already maxed out the possible boost</p>
                    )}
                  </Confirm>
                )}
              </div>
            </div>
            <div>
              <p>PvP Activity: {clanData.pvpActivity}</p>
              <p>Points: {clanData.points}</p>
              <div className="flex flex-row items-center">
                <p>Bank: {clanData.bank}</p>{" "}
                <Confirm
                  title="Donate to clan"
                  proceed_label="Submit"
                  button={
                    <PiggyBank className="ml-2 h-6 w-6 hover:text-orange-500 hover:cursor-pointer" />
                  }
                  onAccept={onDeposit}
                >
                  <p>
                    Confirm donating money from pocket to clan bank. You currently have{" "}
                    {userData.money} ryo in your pocket.
                  </p>
                  <Form {...toBankForm}>
                    <form onSubmit={onDeposit} className="relative">
                      <FormField
                        control={toBankForm.control}
                        name="amount"
                        render={({ field }) => (
                          <FormItem className="w-full flex flex-col">
                            <FormControl>
                              <Input
                                id="amount"
                                placeholder="Transfer to bank"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </form>
                  </Form>
                </Confirm>
              </div>
              <div className="flex flex-row items-center">
                <p>Ryo gain boost: {clanData.ryoBoost}%</p>{" "}
                {(isLeader || isCoLeader) && (
                  <Confirm
                    title="Boost ryo gain for clan members"
                    proceed_label={
                      clanData.points >= RYO_BOOST_COST ? "Submit" : "Cannot afford"
                    }
                    button={
                      <ArrowBigUpDash className="ml-2 h-6 w-6 hover:text-orange-500 hover:cursor-pointer" />
                    }
                    onAccept={() => boostRyo({ clanId })}
                  >
                    {clanData.ryoBoost < MAX_RYO_BOOST ? (
                      <p>
                        Boost the ryo gain for clan members for {RYO_BOOST_COST} clan
                        points. Note that this boost is gradually reduced once per day.
                        You currently have {clanData.points} points.
                      </p>
                    ) : (
                      <p>Already maxed out the possible boost</p>
                    )}
                  </Confirm>
                )}
              </div>
            </div>
          </div>
          {(isLeader || isCoLeader) && (
            <Button
              id="challenge"
              className="my-2 w-full"
              onClick={() => demote({ clanId, memberId: userData.userId })}
            >
              <DoorClosed className="h-6 w-6 mr-2" />
              Resign as Leader
            </Button>
          )}
          {inClan && !isLeader && (
            <Confirm
              title="Challenge Leader"
              proceed_label="Submit"
              button={
                <Button id={`challenge-leader`} className="w-full my-2">
                  <Swords className="mr-2 h-5 w-5" />
                  Challenge Leader
                </Button>
              }
              onAccept={() => fight({ clanId, villageId: userData.villageId ?? "" })}
            >
              Confirm that you wish to challenge the current leader. Note that
              challenges are carried out as AI vs AI, and if you lose you will be kicked
              out of the clan!
            </Confirm>
          )}
        </div>
      </div>
    </ContentBox>
  );
};

/**
 * Members in a clan
 */
interface ClanMembersProps {
  userId: string;
  clanId: string;
}

export const ClanMembers: React.FC<ClanMembersProps> = (props) => {
  // Destructure
  const { userId, clanId } = props;

  // Get react query utility
  const utils = api.useUtils();

  // Query
  const { data: clanData } = api.clan.get.useQuery({ clanId: clanId });

  // Success handler for reuse
  const onSuccess = async (data: BaseServerResponse) => {
    showMutationToast(data);
    if (data.success) {
      await utils.profile.getUser.invalidate();
      await utils.clan.get.invalidate();
      await utils.clan.getRequests.invalidate();
    }
  };

  // Mutations
  const { mutate: kick } = api.clan.kickMember.useMutation({ onSuccess });
  const { mutate: promote } = api.clan.promoteMember.useMutation({ onSuccess });
  const { mutate: demote } = api.clan.demoteMember.useMutation({ onSuccess });

  // Loader
  if (!clanData) return <Loader explanation="Loading clan data" />;

  // Derived
  const isColeader = checkCoLeader(userId, clanData);
  const isLeader = userId === clanData.leaderId;

  // Adjust members for table
  const members = clanData.members
    .map((member) => {
      const memberIsLeader = member.userId === clanData.leaderId;
      const memberIsColeader = checkCoLeader(member.userId, clanData);
      const memberLeaderLike = memberIsLeader || memberIsColeader;
      return {
        ...member,
        rank: memberIsLeader ? "Leader" : memberIsColeader ? "Coleader" : member.rank,
        actions: (
          <div className="flex flex-row gap-1">
            {member.userId !== userId && (
              <>
                {(isLeader || isColeader) && !memberLeaderLike && (
                  <Confirm
                    title="Kick Member"
                    proceed_label="Submit"
                    button={
                      <Button id={`kick-${member.userId}`}>
                        <DoorOpen className="mr-2 h-5 w-5" />
                        Kick
                      </Button>
                    }
                    onAccept={() => kick({ clanId, memberId: member.userId })}
                  >
                    Confirm that you want to kick this member from the clan.
                  </Confirm>
                )}
                {isLeader && memberLeaderLike && (
                  <Confirm
                    title="Demote Member"
                    button={
                      <Button id={`demote-${member.userId}`}>
                        <ArrowBigDownDash className="mr-2 h-5 w-5" />
                        Demote
                      </Button>
                    }
                    onAccept={() => demote({ clanId, memberId: member.userId })}
                  >
                    Confirm that you want to demote this member to leader of the clan.
                  </Confirm>
                )}
                {(isLeader || (isColeader && !memberLeaderLike)) && (
                  <Confirm
                    title="Promote Member"
                    button={
                      <Button id={`promote-${member.userId}`}>
                        <ArrowBigUpDash className="mr-2 h-5 w-5" />
                        Promote
                      </Button>
                    }
                    onAccept={() => promote({ clanId, memberId: member.userId })}
                  >
                    Confirm that you want to promote this member to leader of the clan.
                  </Confirm>
                )}
              </>
            )}
          </div>
        ),
      };
    })
    .sort((a, b) => {
      if (a.rank === "Leader") return -1;
      if (b.rank === "Leader") return 1;
      if (a.rank === "Coleader") return -1;
      if (b.rank === "Coleader") return 1;
      return 0;
    });

  // Render
  return (
    <ContentBox
      title="Members"
      subtitle={`In the clan [${members.length} / ${CLAN_MAX_MEMBERS}]`}
      initialBreak={true}
      padding={false}
    >
      {members.length === 0 && <p className="p-2 italic">No current members</p>}
      {members.length > 0 && (
        <Table
          data={members}
          columns={[
            { key: "avatar", header: "", type: "avatar" },
            { key: "username", header: "Username", type: "string" },
            { key: "rank", header: "Rank", type: "capitalized" },
            { key: "pvpActivity", header: "PVP Activity", type: "string" },
            { key: "actions", header: "Actions", type: "jsx" },
          ]}
          linkPrefix="/users/"
          linkColumn={"userId"}
        />
      )}
    </ContentBox>
  );
};

/**
 * Show the profile of the user's clan
 */
interface ClanProfileProps {
  clanId: string;
  userData: NonNullable<UserWithRelations>;
  back_href?: string;
}

export const ClanProfile: React.FC<ClanProfileProps> = (props) => {
  // Destructure
  const { clanId, userData, back_href } = props;

  // Queries
  const { data: clanData } = api.clan.get.useQuery({ clanId: clanId });

  // Loaders
  if (!clanId) return <Loader explanation="Which clan?" />;
  if (!clanData) return <Loader explanation="Loading clan data" />;

  // Derived
  const isLeader = userData.userId === clanData.leaderId;
  const isColeader = checkCoLeader(userData.userId, clanData);

  // Render
  return (
    <>
      {/** OVERVIEW */}
      <ClanInfo userData={userData} back_href={back_href} clanId={clanData.id} />
      {/* SHOW ORDERS  */}
      <ClanOrders
        clanId={clanData.id}
        order={clanData.leaderOrder}
        canPost={isLeader || isColeader}
      />
      {/* REQUESTS SYSTEM  */}
      <ClanRequests
        clanId={clanData.id}
        isLeader={isLeader}
        userId={userData.userId}
        userRank={userData.rank}
        userClan={userData.clanId}
      />
      {/* MEMBERS */}
      <ClanMembers userId={userData.userId} clanId={clanData.id} />
    </>
  );
};
