import { useEffect } from "react";
import Table, { type ColumnDefinitionType } from "@/layout/Table";
import ContentBox from "@/layout/ContentBox";
import Loader from "@/layout/Loader";
import Confirm from "@/layout/Confirm";
import UserRequestSystem from "@/layout/UserRequestSystem";
import { Input } from "@/components/ui/input";
import { useRouter } from "next/router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { api } from "@/utils/api";
import { Button } from "@/components/ui/button";
import { showMutationToast } from "@/libs/toast";
import { useRequireInVillage } from "@/utils/village";
import { SendHorizontal, DoorOpen, FilePenLine } from "lucide-react";
import { Trash2 } from "lucide-react";
import {
  Form,
  FormControl,
  FormField,
  FormLabel,
  FormItem,
  FormMessage,
} from "@/components/ui/form";
import { anbuRenameSchema } from "@/validators/anbu";
import type { NextPage } from "next";
import type { ArrayElement } from "@/utils/typeutils";
import type { BaseServerResponse } from "@/server/api/trpc";
import type { AnbuRenameSchema } from "@/validators/anbu";

const ANBU: NextPage = () => {
  // Get react query utility
  const utils = api.useUtils();

  // Get ID
  const router = useRouter();
  const squadId = router.query.anbuid as string;

  // Must be in allied village
  const { userData, access } = useRequireInVillage("ANBU");

  // Queries
  const { data: squad } = api.anbu.get.useQuery(
    { id: squadId },
    { enabled: !!squadId },
  );
  const members = squad?.members.map((member) => ({
    ...member,
    rank: member.userId === squad.leaderId ? "Leader" : member.rank,
  }));
  const { data: requests } = api.anbu.getRequests.useQuery(undefined, {
    staleTime: 5000,
  });

  // Mutations
  const onSuccess = async (data: BaseServerResponse) => {
    showMutationToast(data);
    if (data.success) {
      await utils.anbu.get.invalidate();
      await utils.anbu.getRequests.invalidate();
    }
  };

  // Request mutations
  const { mutate: create } = api.anbu.createRequest.useMutation({ onSuccess });
  const { mutate: accept } = api.anbu.acceptRequest.useMutation({ onSuccess });
  const { mutate: reject } = api.anbu.rejectRequest.useMutation({ onSuccess });
  const { mutate: cancel } = api.anbu.cancelRequest.useMutation({ onSuccess });
  const { mutate: rename } = api.anbu.renameSquad.useMutation({ onSuccess });
  const { mutate: leave } = api.anbu.leaveSquad.useMutation({
    onSuccess: async (data) => {
      await onSuccess(data);
      await router.push("/anbu");
    },
  });
  const { mutate: disband } = api.anbu.disbandSquad.useMutation({
    onSuccess: async (data) => {
      await onSuccess(data);
      await router.push("/anbu");
    },
  });

  // Rename Form
  const renameForm = useForm<AnbuRenameSchema>({
    resolver: zodResolver(anbuRenameSchema),
    defaultValues: { name: squad?.name },
  });
  const onRename = renameForm.handleSubmit((data) => rename({ ...data, squadId }));

  // Set squad name
  useEffect(() => {
    if (squad) {
      renameForm.setValue("name", squad.name);
    }
  }, [renameForm, squad]);

  // Loading states
  if (!userData) return <Loader explanation="Loading userdata" />;
  if (!access) return <Loader explanation="Accessing ANBU" />;
  if (!squad) return <Loader explanation="Loading ANBU squad" />;
  if (!requests) return <Loader explanation="Loading requests" />;

  // Table
  type Member = ArrayElement<typeof members>;
  const columns: ColumnDefinitionType<Member, keyof Member>[] = [
    { key: "avatar", header: "", type: "avatar" },
    { key: "username", header: "Username", type: "string" },
    { key: "rank", header: "Rank", type: "capitalized" },
  ];

  // Derived
  const isKage = userData.userId === userData.village?.kageId;
  const isElder = userData.rank === "ELDER";
  const isLeader = userData.userId === squad.leaderId;
  const hasAnbu = userData.anbuId;
  const inSquad = userData.anbuId === squadId;
  const hasPending = requests?.some((req) => req.status === "PENDING");
  const showRequestSystem = (isLeader && requests.length > 0) || !hasAnbu;
  const shownRequests = requests.filter((r) => !isLeader || r.status === "PENDING");

  return (
    <>
      {/* MEMBER OVERVIEW  */}
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
                    Rename
                  </Button>
                }
                isValid={renameForm.formState.isValid}
                onAccept={onRename}
              >
                <Form {...renameForm}>
                  <form className="space-y-2" onSubmit={onRename}>
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
          linkPrefix="/users/"
          linkColumn={"userId"}
        />
      </ContentBox>
      {/* REQUESTS SYSTEM  */}
      {showRequestSystem && (
        <ContentBox
          title="Request"
          subtitle="Requests for ANBU squad"
          initialBreak={true}
          padding={false}
        >
          {/* FOR THOSE WHO CAN SEND REQUESTS */}
          {!hasAnbu && !hasPending && (
            <div className="p-2">
              <p>Send a request to join this squad</p>
              <Button
                id="send"
                className="mt-2 w-full"
                onClick={() => create({ squadId })}
              >
                <SendHorizontal className="h-5 w-5 mr-2" />
                Send Request
              </Button>
            </div>
          )}
          {/* SHOW REQUESTS */}
          {shownRequests.length === 0 && (
            <p className="p-2 italic">No current requests</p>
          )}
          {shownRequests.length > 0 && (
            <UserRequestSystem
              requests={shownRequests}
              userId={userData.userId}
              onAccept={accept}
              onReject={reject}
              onCancel={cancel}
            />
          )}
        </ContentBox>
      )}
    </>
  );
};

export default ANBU;
