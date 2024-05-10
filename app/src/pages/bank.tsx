import { useState } from "react";
import { type NextPage } from "next";
import { z } from "zod";
import BanInfo from "@/layout/BanInfo";
import Image from "next/image";
import ContentBox from "@/layout/ContentBox";
import Loader from "@/layout/Loader";
import UserSearchSelect from "@/layout/UserSearchSelect";
import Table, { type ColumnDefinitionType } from "@/layout/Table";
import { useInfinitePagination } from "@/libs/pagination";
import { getSearchValidator } from "@/validators/register";
import { api } from "@/utils/api";
import { showMutationToast } from "@/libs/toast";
import { Coins, Landmark, ChevronsUp, ChevronsRight, ChevronsLeft } from "lucide-react";
import { useRequireInVillage } from "@/utils/village";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { structureBoost } from "@/utils/village";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/ui/form";
import type { ArrayElement } from "@/utils/typeutils";

const Bank: NextPage = () => {
  // State
  const [lastElement, setLastElement] = useState<HTMLDivElement | null>(null);

  // User data
  const { userData, access } = useRequireInVillage("/bank");
  const money = userData?.money ?? 0;
  const bank = userData?.bank ?? 0;

  // Current interest
  const interest = structureBoost("bankInterestPerLvl", userData?.village?.structures);

  // tRPC utils
  const utils = api.useUtils();

  // Schemas
  const fromPocketSchema = z.object({
    amount: z.coerce.number().int().positive().max(money),
  });
  const fromBankSchema = z.object({
    amount: z.coerce.number().int().positive().max(bank),
  });

  // Forms
  const toBankForm = useForm<z.infer<typeof fromPocketSchema>>({
    resolver: zodResolver(fromPocketSchema),
  });
  const toPocketForm = useForm<z.infer<typeof fromBankSchema>>({
    resolver: zodResolver(fromBankSchema),
  });
  const toUserForm = useForm<z.infer<typeof fromBankSchema>>({
    resolver: zodResolver(fromBankSchema),
  });

  // Mutations
  const { mutate: toBank, isPending: l1 } = api.bank.toBank.useMutation({
    onSuccess: async (data) => {
      showMutationToast(data);
      if (data.success) {
        await utils.profile.getUser.invalidate();
        toBankForm.reset();
      }
    },
  });

  const { mutate: toPocket, isPending: l2 } = api.bank.toPocket.useMutation({
    onSuccess: async (data) => {
      showMutationToast(data);
      if (data.success) {
        await utils.profile.getUser.invalidate();
        toPocketForm.reset();
      }
    },
  });

  const { mutate: transfer, isPending: l3 } = api.bank.transfer.useMutation({
    onSuccess: async (data) => {
      showMutationToast(data);
      if (data.success) {
        await utils.profile.getUser.invalidate();
        toUserForm.reset();
      }
    },
  });

  // User search
  const maxUsers = 1;
  const userSearchSchema = getSearchValidator({ max: maxUsers });
  const userSearchMethods = useForm<z.infer<typeof userSearchSchema>>({
    resolver: zodResolver(userSearchSchema),
    defaultValues: { username: "", users: [] },
  });
  const targetUser = userSearchMethods.watch("users", [])?.[0];

  // User search for ledger sender
  const userSearchSchemaFrom = getSearchValidator({ max: maxUsers });
  const userSearchMethodsFrom = useForm<z.infer<typeof userSearchSchemaFrom>>({
    resolver: zodResolver(userSearchSchemaFrom),
    defaultValues: { username: "", users: [] },
  });
  const targetUserFrom = userSearchMethodsFrom.watch("users", [])?.[0];

  // User search for ledger receiver
  const userSearchSchemaTo = getSearchValidator({ max: maxUsers });
  const userSearchMethodsTo = useForm<z.infer<typeof userSearchSchemaTo>>({
    resolver: zodResolver(userSearchSchemaTo),
    defaultValues: { username: "", users: [] },
  });
  const targetUserTo = userSearchMethodsTo.watch("users", [])?.[0];

  // Getting bank transers
  const {
    data: ledger,
    fetchNextPage,
    hasNextPage,
  } = api.bank.getTransfers.useInfiniteQuery(
    {
      limit: 30,
      senderId: targetUserFrom?.userId,
      receiverId: targetUserTo?.userId,
    },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      placeholderData: (previousData) => previousData,
      staleTime: 1000 * 60 * 5, // every 5min
    },
  );
  const allTransfers = ledger?.pages
    .map((page) => page.data)
    .flat()
    .map((entry) => ({
      ...entry,
      sender: entry.sender.username,
      receiver: entry.receiver.username,
    }));
  type Transfer = ArrayElement<typeof allTransfers>;

  useInfinitePagination({
    fetchNextPage,
    hasNextPage,
    lastElement,
  });

  // Table component
  const columns: ColumnDefinitionType<Transfer, keyof Transfer>[] = [
    { key: "sender", header: "Sender", type: "string" },
    { key: "receiver", header: "Receiver", type: "string" },
    { key: "amount", header: "Amount", type: "string" },
    { key: "createdAt", header: "Date", type: "date" },
  ];

  // Submit handlers
  const onDeposit = toBankForm.handleSubmit((data) => toBank(data));
  const onWithdraw = toPocketForm.handleSubmit((data) => toPocket(data));
  const onTransfer = toUserForm.handleSubmit((data) => {
    if (targetUser) {
      transfer({ targetId: targetUser.userId, amount: data.amount });
    } else {
      showMutationToast({ success: false, message: "No receiver selected" });
    }
  });

  // Loading screens
  if (!userData) return <Loader explanation="Loading userdata" />;
  if (!access) return <Loader explanation="Accessing Bank" />;
  if (userData.isBanned) return <BanInfo />;
  if (l1 || l2 || l3) return <Loader explanation="Transferring money" />;

  return (
    <>
      <ContentBox
        title="Bank"
        subtitle={`Save money & earn ${interest}% interest / day`}
        back_href="/village"
        padding={false}
      >
        <Image
          alt="welcome"
          src="/bank.webp"
          width={512}
          height={195}
          className="w-full"
          priority={true}
        />
        <div className="grid grid-cols-2 text-center my-4">
          <div className="flex flex-col items-center">
            <Coins className="h-20 w-20" />
            <p className="text-lg">{money} ryo</p>
            <h2 className="font-bold text-xl">Money on hand</h2>
            <div className="w-full px-4 pt-3">
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
                  <Button className="absolute top-0 right-0" type="submit">
                    <ChevronsRight className="h-5 w-5" />
                  </Button>
                </form>
              </Form>
            </div>
          </div>
          <div className="flex flex-col items-center">
            <Landmark className="h-20 w-20" />
            <p className="text-lg">{bank} ryo</p>
            <h2 className="font-bold text-xl">Money in bank</h2>
            <div className="w-full px-4 pt-3">
              <Form {...toPocketForm}>
                <form onSubmit={onWithdraw} className="relative">
                  <FormField
                    control={toPocketForm.control}
                    name="amount"
                    render={({ field }) => (
                      <FormItem className="w-full flex flex-col">
                        <FormControl>
                          <Input
                            id="amount"
                            placeholder="Transfer to pocket"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button className="absolute top-0 right-0" type="submit">
                    <ChevronsLeft className="h-5 w-5" />
                  </Button>
                </form>
              </Form>
            </div>
          </div>
        </div>
      </ContentBox>
      <ContentBox
        title="Transfer"
        subtitle="Bank to Bank Transfers"
        initialBreak={true}
        padding={false}
      >
        <div className="w-full px-4 py-4">
          <UserSearchSelect
            useFormMethods={userSearchMethods}
            label="Search for receiver"
            selectedUsers={[]}
            showYourself={false}
            inline={true}
            maxUsers={maxUsers}
          />
          <Form {...toUserForm}>
            <form onSubmit={onTransfer} className="relative px-1 mr-1 mt-2">
              <FormField
                control={toUserForm.control}
                name="amount"
                render={({ field }) => (
                  <FormItem className="w-full flex flex-col">
                    <FormControl>
                      <Input id="amount" placeholder="Amount to transfer" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button className="absolute top-0 right-0" type="submit">
                <ChevronsUp className="h-5 w-5" />
              </Button>
            </form>
          </Form>
        </div>
      </ContentBox>
      <ContentBox
        title="Bank Ledger"
        subtitle="Search historical transactions"
        initialBreak={true}
        padding={false}
      >
        <div className="w-full flex flex-col gap-2 px-2 py-2">
          <UserSearchSelect
            useFormMethods={userSearchMethodsFrom}
            label="Search sender"
            selectedUsers={[]}
            showYourself={true}
            inline={true}
            maxUsers={maxUsers}
          />
          <UserSearchSelect
            useFormMethods={userSearchMethodsTo}
            label="Search receiver"
            selectedUsers={[]}
            showYourself={true}
            inline={true}
            maxUsers={maxUsers}
          />
        </div>
        <Table data={allTransfers} columns={columns} setLastElement={setLastElement} />
        <p className="p-2 italic text-xs">
          Note: All transactions in Seichi are on a public blockchain ledger. This means
          that all transactions are public and can be viewed by anyone.{" "}
        </p>
      </ContentBox>
    </>
  );
};

export default Bank;
