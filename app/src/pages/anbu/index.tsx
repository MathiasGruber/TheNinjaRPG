import ContentBox from "@/layout/ContentBox";
import Loader from "@/layout/Loader";
import Confirm from "@/layout/Confirm";
import UserSearchSelect from "@/layout/UserSearchSelect";
import {
  Form,
  FormControl,
  FormField,
  FormLabel,
  FormItem,
  FormMessage,
} from "@/components/ui/form";
import Table, { type ColumnDefinitionType } from "@/layout/Table";
import AvatarImage from "@/layout/Avatar";
import { Input } from "@/components/ui/input";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { anbuCreateSchema } from "@/validators/anbu";
import { UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRequireInVillage } from "@/utils/village";
import { api } from "@/utils/api";
import { showMutationToast } from "@/libs/toast";
import { getSearchValidator } from "@/validators/register";
import type { z } from "zod";
import type { AnbuCreateSchema } from "@/validators/anbu";
import type { NextPage } from "next";
import type { ArrayElement } from "@/utils/typeutils";

const ANBU: NextPage = () => {
  // Utils
  const utils = api.useUtils();

  // Must be in allied village
  const { userData, sectorVillage, access } = useRequireInVillage("ANBU");
  const structure = sectorVillage?.structures.find((s) => s.name === "ANBU");

  // Queries
  const { data } = api.anbu.getAll.useQuery(
    { villageId: userData?.villageId as string },
    { enabled: !!userData?.villageId },
  );
  const allSquads = data?.map((squad) => ({
    ...squad,
    memberCount: squad.members.length,
    squadInfo: (
      <div className="w-20 text-center">
        <AvatarImage
          href={squad.image}
          alt={squad.name}
          size={100}
          hover_effect={true}
          priority
        />
        {squad.name}
      </div>
    ),
    leaderInfo: (
      <div className="w-20 text-center">
        {squad.leader && (
          <div>
            <AvatarImage
              href={squad.leader.avatar}
              alt={squad.name}
              size={100}
              hover_effect={true}
              priority
            />
            {squad.leader.username}
          </div>
        )}
      </div>
    ),
  }));

  // Mutations
  const { mutate: createSquad, isPending: isCreating } =
    api.anbu.createSquad.useMutation({
      onSuccess: async (data) => {
        showMutationToast(data);
        await utils.anbu.getAll.invalidate();
      },
    });

  // Form
  const createForm = useForm<AnbuCreateSchema>({
    resolver: zodResolver(anbuCreateSchema),
    defaultValues: { leaderId: "", name: "", villageId: "" },
  });

  // Table
  type Squad = ArrayElement<typeof allSquads>;
  const columns: ColumnDefinitionType<Squad, keyof Squad>[] = [
    { key: "squadInfo", header: "Squad", type: "jsx" },
    { key: "leaderInfo", header: "Leader", type: "jsx" },
    { key: "memberCount", header: "# Members", type: "string" },
    { key: "pvpActivity", header: "PVP Activity", type: "string" },
  ];

  // User search
  const maxUsers = 1;
  const userSearchSchema = getSearchValidator({ max: maxUsers });
  const userSearchMethods = useForm<z.infer<typeof userSearchSchema>>({
    resolver: zodResolver(userSearchSchema),
    defaultValues: { username: "", users: [] },
  });
  const targetUser = userSearchMethods.watch("users", [])?.[0];

  // Loaders
  if (!userData) return <Loader explanation="Loading userdata" />;
  if (!access) return <Loader explanation="Accessing ANBU" />;
  if (!sectorVillage) return <Loader explanation="Loading sector village" />;
  if (!structure) return <Loader explanation="Can not find structure" />;
  if (isCreating) return <Loader explanation="Creating squad" />;

  // Form handlers
  const onSubmit = createForm.handleSubmit((data) => {
    if (!targetUser) {
      showMutationToast({ success: false, message: "Select leader" });
    } else if (!userData.villageId) {
      showMutationToast({ success: false, message: "What is your village?" });
    } else {
      createSquad({
        ...data,
        villageId: userData.villageId,
        leaderId: targetUser.userId,
      });
    }
  });

  // Derived
  const isKage = userData.userId === sectorVillage.kageId;
  const isElder = userData.rank === "ELDER";
  const canCreateMore = allSquads && allSquads?.length < structure.level;

  return (
    <ContentBox
      title="ANBU"
      subtitle="Assigned by Kage & Elders"
      back_href="/village"
      padding={false}
      topRightContent={
        canCreateMore &&
        (isKage || isElder) && (
          <Confirm
            title="Create a new squad"
            proceed_label="Submit"
            button={
              <Button id="create-anbu-squad" className="w-full">
                <UsersRound className="mr-2 h-5 w-5" />
                New Squad
              </Button>
            }
            isValid={createForm.formState.isValid}
            onAccept={onSubmit}
          >
            <Form {...createForm}>
              <form className="space-y-2" onSubmit={onSubmit}>
                <FormLabel>Leader</FormLabel>
                <UserSearchSelect
                  useFormMethods={userSearchMethods}
                  label="Select Leader"
                  selectedUsers={[]}
                  showYourself={false}
                  inline={true}
                  maxUsers={maxUsers}
                />
                <FormField
                  control={createForm.control}
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
        )
      }
    >
      <Table data={allSquads} columns={columns} linkPrefix="/anbu/" linkColumn={"id"} />
    </ContentBox>
  );
};

export default ANBU;
