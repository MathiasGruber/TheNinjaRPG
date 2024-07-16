import { type NextPage } from "next";
import Loader from "@/layout/Loader";
import ContentBox from "@/layout/ContentBox";
import Confirm from "@/layout/Confirm";
import {
  Form,
  FormControl,
  FormField,
  FormLabel,
  FormItem,
  FormMessage,
} from "@/components/ui/form";
import { api } from "@/utils/api";
import { hasRequiredRank } from "@/libs/train";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { showMutationToast } from "@/libs/toast";
import { ShieldPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { clanCreateSchema } from "@/validators/clan";
import { ClansOverview, ClanProfile } from "@/layout/Clan";
import { CLAN_CREATE_PRESTIGE_REQUIREMENT } from "@/drizzle/constants";
import { CLAN_CREATE_RYO_COST } from "@/drizzle/constants";
import { CLAN_RANK_REQUIREMENT } from "@/drizzle/constants";
import { useRequireInVillage } from "@/utils/UserContext";
import type { ClanCreateSchema } from "@/validators/clan";

const Clans: NextPage = () => {
  // Must be in allied village
  const { userData, access } = useRequireInVillage("/clanhall");

  // tRPC utils
  const utils = api.useUtils();

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
    createClan({ name: data.name, villageId: userData?.villageId ?? "" });
  });

  // Loaders
  if (isCreating) return <Loader explanation="Creating clan" />;
  if (!userData) return <Loader explanation="Loading userdata" />;
  if (!access) return <Loader explanation="Accessing Clan Hall" />;
  if (userData.isOutlaw) return <Loader explanation="Unlikely to find outlaw clans" />;

  // Derived
  const inClan = userData.clanId;
  const canCreate =
    userData.villagePrestige >= CLAN_CREATE_PRESTIGE_REQUIREMENT &&
    userData.money >= CLAN_CREATE_RYO_COST;

  // Render
  if (userData.clanId) {
    return <ClanProfile clanId={userData.clanId} />;
  } else {
    return (
      <ContentBox
        title="Clans"
        subtitle="Fight together"
        back_href="/village"
        padding={false}
        topRightContent={
          <>
            {hasRequiredRank(userData.rank, CLAN_RANK_REQUIREMENT) && !inClan && (
              <Confirm
                title="Create new Clan"
                proceed_label={canCreate ? "Submit" : "Not enough prestige or Ryo"}
                button={
                  <Button id="create-clan" className="w-full">
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
                Create a clan requires at least {CLAN_CREATE_PRESTIGE_REQUIREMENT}{" "}
                village prestige, and costs {CLAN_CREATE_RYO_COST} Ryo. You currently
                have {userData.villagePrestige} prestige and {userData.money} Ryo.
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
            )}
          </>
        }
      >
        <ClansOverview />
      </ContentBox>
    );
  }
};

export default Clans;
