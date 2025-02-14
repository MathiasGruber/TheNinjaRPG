"use client";

import { useEffect, use } from "react";
import { parseHtml } from "@/utils/parse";
import BanInfo from "@/layout/BanInfo";
import Table, { type ColumnDefinitionType } from "@/layout/Table";
import ContentBox from "@/layout/ContentBox";
import Loader from "@/layout/Loader";
import Confirm from "@/layout/Confirm";
import UserRequestSystem from "@/layout/UserRequestSystem";
import RichInput from "@/layout/RichInput";
import AvatarImage from "@/layout/Avatar";
import { mutateContentSchema } from "@/validators/comments";
import { Input } from "@/components/ui/input";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { api } from "@/app/_trpc/client";
import { Button } from "@/components/ui/button";
import { showMutationToast } from "@/libs/toast";
import { useRequireInVillage } from "@/utils/UserContext";
import { SendHorizontal, DoorOpen, FilePenLine } from "lucide-react";
import { Trash2, ArrowBigUpDash } from "lucide-react";
import {
  Form,
  FormControl,
  FormField,
  FormLabel,
  FormItem,
  FormMessage,
} from "@/components/ui/form";
import { UploadButton } from "@/utils/uploadthing";
import { anbuRenameSchema } from "@/validators/anbu";
import { hasRequiredRank } from "@/libs/train";
import { ANBU_MEMBER_RANK_REQUIREMENT } from "@/drizzle/constants";
import type { UserRank } from "@/drizzle/constants";
import type { ArrayElement } from "@/utils/typeutils";
import type { BaseServerResponse } from "@/server/api/trpc";
import type { AnbuRenameSchema } from "@/validators/anbu";
import type { MutateContentSchema } from "@/validators/comments";
import type { UserNindo } from "@/drizzle/schema";
import type { AnbuRouter } from "@/routers/anbu";

export default function ANBUDetails(props: { params: Promise<{ anbuid: string }> }) {
  const params = use(props.params);
  // Get ID
  const squadId = params.anbuid;

  // Must be in allied village
  const { userData, access } = useRequireInVillage("/anbu");

  // Queries
  const { data: squad } = api.anbu.get.useQuery(
    { id: squadId },
    { enabled: !!squadId },
  );

  // Loading states
  if (!userData) return <Loader explanation="Loading userdata" />;
  if (!access) return <Loader explanation="Accessing ANBU" />;
  if (!squad) return <Loader explanation="Loading ANBU squad" />;
  if (userData.isOutlaw) return <Loader explanation="Unlikely to find outlaw ANBU" />;
  if (userData.isBanned) return <BanInfo />;

  // Derived
  const isKage = userData.userId === userData.village?.kageId;
  const isElder = userData.rank === "ELDER";
  const isLeader = userData.userId === squad.leaderId;
  const inSquad = userData.anbuId === squadId;

  return (
    <>
      {/* MEMBER OVERVIEW  */}
      <AnbuMembers
        isKage={isKage}
        isElder={isElder}
        isLeader={isLeader}
        inSquad={inSquad}
        userId={userData.userId}
        squadId={squadId}
        squad={squad}
      />
      {/* ANBU ORDERS */}
      <AnbuOrders
        squadId={squadId}
        title="Superior Orders"
        subtitle={`From kage or elders`}
        type="KAGE"
        order={squad.kageOrder}
        canPost={isKage || isElder}
      />
      <AnbuOrders
        squadId={squadId}
        title="Leader Orders"
        subtitle={`From leader ${squad?.leader?.username}`}
        type="LEADER"
        order={squad.leaderOrder}
        canPost={isLeader}
      />
      {/* REQUESTS SYSTEM  */}
      <AnbuRequests
        squadId={squadId}
        isLeader={isLeader}
        userId={userData.userId}
        userRank={userData.rank}
        userAnbu={userData.anbuId}
      />
    </>
  );
}

interface AnbuMembersProps {
  isKage: boolean;
  isElder: boolean;
  isLeader: boolean;
  inSquad: boolean;
  userId: string;
  squadId: string;
  squad: NonNullable<AnbuRouter["get"]>;
}

const AnbuMembers: React.FC<AnbuMembersProps> = (props) => {
  // Destructure
  const { userId, squad, squadId, isKage, isElder, isLeader, inSquad } = props;

  // Get router
  const router = useRouter();

  // Get react query utility
  const utils = api.useUtils();

  // Mutations
  const onSuccess = async (data: BaseServerResponse) => {
    showMutationToast(data);
    if (data.success) {
      await utils.anbu.get.invalidate();
      await utils.anbu.getRequests.invalidate();
    }
  };

  // Request mutations
  const { mutate: edit } = api.anbu.editSquad.useMutation({ onSuccess });
  const { mutate: kick } = api.anbu.kickMember.useMutation({ onSuccess });
  const { mutate: promote } = api.anbu.promoteMember.useMutation({ onSuccess });
  const { mutate: leave } = api.anbu.leaveSquad.useMutation({
    onSuccess: async (data) => {
      await onSuccess(data);
      router.push("/anbu");
    },
  });
  const { mutate: disband } = api.anbu.disbandSquad.useMutation({
    onSuccess: async (data) => {
      await onSuccess(data);
      router.push("/anbu");
    },
  });

  // Rename Form
  const renameForm = useForm<AnbuRenameSchema>({
    resolver: zodResolver(anbuRenameSchema),
    defaultValues: { name: squad.name, image: squad.image },
  });
  const onEdit = renameForm.handleSubmit((data) => edit({ ...data, squadId }));
  const currentImage = renameForm.watch("image");

  // Set squad name
  useEffect(() => {
    if (squad) {
      renameForm.setValue("name", squad.name);
    }
  }, [renameForm, squad]);

  // Adjust members for table
  const members = squad.members.map((member) => ({
    ...member,
    rank: member.userId === squad.leaderId ? "Leader" : member.rank,
    kickBtn: (
      <div className="flex flex-row gap-1">
        {member.userId !== userId && (
          <Confirm
            title="Kick Member"
            proceed_label="Submit"
            button={
              <Button id={`kick-${member.userId}`}>
                <DoorOpen className="mr-2 h-5 w-5" />
                Kick
              </Button>
            }
            onAccept={() => kick({ squadId, memberId: member.userId })}
          >
            Confirm that you want to kick this member from the squad.
          </Confirm>
        )}
        {(isKage || isElder) && (
          <Confirm
            title="Promote Member"
            proceed_label="Submit"
            button={
              <Button id={`promote-${member.userId}`}>
                <ArrowBigUpDash className="mr-2 h-5 w-5" />
                Promote
              </Button>
            }
            onAccept={() => promote({ squadId, memberId: member.userId })}
          >
            Confirm that you want to promote this member to leader of the squad.
          </Confirm>
        )}
      </div>
    ),
  }));

  // Table
  type Member = ArrayElement<typeof members>;
  const columns: ColumnDefinitionType<Member, keyof Member>[] = [
    { key: "avatar", header: "", type: "avatar" },
    { key: "username", header: "Username", type: "string" },
    { key: "rank", header: "Rank", type: "capitalized" },
    { key: "pvpActivity", header: "PVP Activity", type: "string" },
  ];
  if (isLeader || isKage || isElder) {
    columns.push({ key: "kickBtn", header: "Action", type: "jsx" });
  }

  return (
    <ContentBox
      title={`Squad: ${squad.name}`}
      subtitle={`PVP Activity: ${squad.pvpActivity}`}
      back_href="/anbu"
      padding={false}
      topRightContent={
        <div className="flex flex-row items-center gap-1">
          {isLeader && (
            <Confirm
              title="Rename Squad"
              proceed_label="Submit"
              button={
                <Button id="rename-anbu-squad">
                  <FilePenLine className="mr-2 h-5 w-5" />
                  Edit
                </Button>
              }
              isValid={renameForm.formState.isValid}
              onAccept={onEdit}
            >
              <Form {...renameForm}>
                <form className="space-y-2 grid grid-cols-2" onSubmit={onEdit}>
                  <div>
                    <FormLabel>Squad Image</FormLabel>
                    <AvatarImage
                      href={currentImage}
                      alt={squad.id}
                      size={100}
                      hover_effect={true}
                      priority
                    />
                    <UploadButton
                      endpoint="anbuUploader"
                      onClientUploadComplete={(res) => {
                        const url = res?.[0]?.serverData?.fileUrl;
                        if (url) {
                          renameForm.setValue("image", url, {
                            shouldDirty: true,
                          });
                        }
                      }}
                      onUploadError={(error: Error) => {
                        showMutationToast({ success: false, message: error.message });
                      }}
                    />
                  </div>
                  <FormField
                    control={renameForm.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Title</FormLabel>
                        <FormControl>
                          <Input placeholder="Name of the new squad" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </form>
              </Form>
            </Confirm>
          )}
          {inSquad && (
            <Button id="send" onClick={() => leave({ squadId })}>
              <DoorOpen className="h-5 w-5 mr-2" />
              Leave
            </Button>
          )}
          {(isKage || isElder) && (
            <Confirm
              title="Disband Squad"
              proceed_label="Submit"
              button={
                <Button id="rename-anbu-squad">
                  <Trash2 className="mr-2 h-5 w-5" />
                  Disband
                </Button>
              }
              isValid={renameForm.formState.isValid}
              onAccept={() => disband({ squadId })}
            >
              Confirm that you want to disband this entire squad. Everyone will be
              removed from the squad!
            </Confirm>
          )}
        </div>
      }
    >
      <Table
        data={members}
        columns={columns}
        linkPrefix="/username/"
        linkColumn={"username"}
      />
    </ContentBox>
  );
};

/**
 * Renders the Anbu Orders component.
 *
 * @param props - The component props.
 * @returns The rendered component.
 */
interface AnbuOrdersProps {
  squadId: string;
  title: string;
  subtitle: string;
  type: "KAGE" | "LEADER";
  order: UserNindo | null;
  canPost: boolean;
}

const AnbuOrders: React.FC<AnbuOrdersProps> = (props) => {
  // Destructure
  const { squadId, title, subtitle, type, canPost, order } = props;

  // utils
  const utils = api.useUtils();

  // Mutations
  const { mutate: notice } = api.anbu.upsertNotice.useMutation({
    onSuccess: async (data: BaseServerResponse) => {
      showMutationToast(data);
      if (data.success) {
        await utils.anbu.get.invalidate();
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
  const onUpdateOrder = handleSubmit((data) => notice({ ...data, type, squadId }));

  return (
    <ContentBox
      title={title}
      subtitle={subtitle}
      initialBreak={true}
      topRightContent={
        <div>
          {canPost && (
            <Confirm
              title="Update Orders"
              proceed_label="Submit"
              button={<Button id="create">Edit</Button>}
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
      {parseHtml(content)}
    </ContentBox>
  );
};

/**
 * Renders a component that displays ANBU requests for a squad.
 *
 * @component
 * @param {AnbuRequestsProps} props - The component props.
 * @returns {React.ReactNode} The rendered component.
 */
interface AnbuRequestsProps {
  squadId: string;
  isLeader: boolean;
  userId: string;
  userRank: UserRank;
  userAnbu: string | null;
}

const AnbuRequests: React.FC<AnbuRequestsProps> = (props) => {
  // Destructure
  const { squadId, isLeader, userId, userRank, userAnbu } = props;

  // Get utils
  const utils = api.useUtils();

  // Query
  const { data: requests } = api.anbu.getRequests.useQuery(undefined, {
    enabled: !!squadId,
    staleTime: 5000,
  });

  // How to deal with success responses
  const onSuccess = async (data: BaseServerResponse) => {
    showMutationToast(data);
    if (data.success) {
      await utils.anbu.get.invalidate();
      await utils.anbu.getRequests.invalidate();
    }
  };

  // Mutation
  const { mutate: create, isPending: isCreating } = api.anbu.createRequest.useMutation({
    onSuccess,
  });
  const { mutate: accept, isPending: isAccepting } = api.anbu.acceptRequest.useMutation(
    { onSuccess },
  );
  const { mutate: reject, isPending: isRejecting } = api.anbu.rejectRequest.useMutation(
    { onSuccess },
  );
  const { mutate: cancel, isPending: isCancelling } =
    api.anbu.cancelRequest.useMutation({ onSuccess });

  // Loaders
  if (!requests) return <Loader explanation="Loading requests" />;

  // Derived
  const hasPending = requests?.some((req) => req.status === "PENDING");
  const showRequestSystem = (isLeader && requests.length > 0) || !userAnbu;
  const shownRequests = requests.filter((r) => !isLeader || r.status === "PENDING");
  const sufficientRank = hasRequiredRank(userRank, ANBU_MEMBER_RANK_REQUIREMENT);

  // Do not show?
  if (!showRequestSystem) return null;

  // Render
  return (
    <ContentBox
      title="Request"
      subtitle="Requests for ANBU squad"
      initialBreak={true}
      padding={false}
    >
      {/* FOR THOSE WHO CAN SEND REQUESTS */}
      {sufficientRank && !userAnbu && !hasPending && (
        <div className="p-2">
          <p>Send a request to join this squad</p>
          <Button id="send" className="mt-2 w-full" onClick={() => create({ squadId })}>
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
          isLoading={isCreating || isAccepting || isRejecting || isCancelling}
        />
      )}
    </ContentBox>
  );
};
