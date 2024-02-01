import { useState } from "react";
import { type NextPage } from "next";
import { z } from "zod";
import Image from "next/image";
import ContentBox from "@/layout/ContentBox";
import Loader from "@/layout/Loader";
import InputField from "@/layout/InputField";
import UserSearchSelect from "@/layout/UserSearchSelect";
import Table, { type ColumnDefinitionType } from "@/layout/Table";
import { useInfinitePagination } from "@/libs/pagination";
import { getSearchValidator } from "@/validators/register";
import { api } from "@/utils/api";
import { show_toast } from "@/libs/toast";
import { BanknotesIcon, BuildingLibraryIcon } from "@heroicons/react/24/outline";
import { ChevronDoubleLeftIcon } from "@heroicons/react/24/outline";
import { ChevronDoubleRightIcon } from "@heroicons/react/24/outline";
import { ChevronDoubleUpIcon } from "@heroicons/react/24/outline";
import { useRequiredUserData } from "@/utils/UserContext";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { type ArrayElement } from "@/utils/typeutils";

const Bank: NextPage = () => {
  // State
  const [lastElement, setLastElement] = useState<HTMLDivElement | null>(null);

  // User data
  const { data: userData } = useRequiredUserData();
  const money = userData?.money ?? 0;
  const bank = userData?.bank ?? 0;

  // tRPC utils
  const utils = api.useUtils();

  // Schemas
  const fromPocketSchema = z.object({
    amount: z.number().int().positive().max(money),
  });
  const fromBankSchema = z.object({
    amount: z.number().int().positive().max(bank),
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
  const { mutate: toBank, isLoading: l1 } = api.bank.toBank.useMutation({
    onSuccess: async (data) => {
      if (data.success) {
        show_toast("Transfer to bank", data.message, "success");
        await utils.profile.getUser.invalidate();
      } else {
        show_toast("Transfer to bank", data.message, "info");
      }
    },
    onError: (error) => {
      show_toast("Error transferring", error.message, "error");
    },
  });

  const { mutate: toPocket, isLoading: l2 } = api.bank.toPocket.useMutation({
    onSuccess: async (data) => {
      if (data.success) {
        show_toast("Transfer to pocket", data.message, "success");
        await utils.profile.getUser.invalidate();
      } else {
        show_toast("Transfer to pocket", data.message, "info");
      }
    },
    onError: (error) => {
      show_toast("Error transferring", error.message, "error");
    },
  });

  const { mutate: transfer, isLoading: l3 } = api.bank.transfer.useMutation({
    onSuccess: async (data) => {
      if (data.success) {
        show_toast("Transfer to user", data.message, "success");
        await utils.profile.getUser.invalidate();
      } else {
        show_toast("Transfer to user", data.message, "info");
      }
    },
    onError: (error) => {
      show_toast("Error transferring", error.message, "error");
    },
  });

  // User search
  const maxUsers = 1;
  const userSearchSchema = getSearchValidator({ max: maxUsers });
  const userSearchMethods = useForm<z.infer<typeof userSearchSchema>>({
    resolver: zodResolver(userSearchSchema),
  });
  const targetUser = userSearchMethods.watch("users", [])?.[0];

  // User search for ledger sender
  const userSearchSchemaFrom = getSearchValidator({ max: maxUsers });
  const userSearchMethodsFrom = useForm<z.infer<typeof userSearchSchemaFrom>>({
    resolver: zodResolver(userSearchSchemaFrom),
  });
  const targetUserFrom = userSearchMethodsFrom.watch("users", [])?.[0];

  // User search for ledger receiver
  const userSearchSchemaTo = getSearchValidator({ max: maxUsers });
  const userSearchMethodsTo = useForm<z.infer<typeof userSearchSchemaTo>>({
    resolver: zodResolver(userSearchSchemaTo),
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
      keepPreviousData: true,
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
      show_toast("Transfer to user", "No receiver selected", "info");
    }
  });

  // Loading screens
  if (!userData) return <Loader explanation="Loading userdata" />;
  if (l1 || l2 || l3) return <Loader explanation="Transferring money" />;

  return (
    <>
      <ContentBox
        title="Bank"
        subtitle="Save money & earn 1% interest / day"
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
            <BanknotesIcon className="h-20 w-20" />
            <p className="text-lg">{money} ryo</p>
            <h2 className="font-bold text-xl">Money on hand</h2>
            <div className="w-full px-4">
              <InputField
                type="number"
                id="amount"
                register={toBankForm.register}
                error={toBankForm.formState.errors.amount?.message}
                placeholder="Transfer to bank"
                options={
                  <button
                    type="submit"
                    className={`absolute top-0 right-0 px-2.5 h-full text-white bg-amber-900 hover:bg-red-800 border-amber-900 rounded-r-lg border`}
                    onClick={async (e) => {
                      e.preventDefault();
                      await onDeposit();
                    }}
                  >
                    <ChevronDoubleRightIcon className="h-5 w-5" />
                  </button>
                }
              />
            </div>
          </div>
          <div className="flex flex-col items-center">
            <BuildingLibraryIcon className="h-20 w-20" />
            <p className="text-lg">{bank} ryo</p>
            <h2 className="font-bold text-xl">Money in bank</h2>
            <div className="w-full px-4">
              <InputField
                type="number"
                id="amount"
                register={toPocketForm.register}
                error={toPocketForm.formState.errors.amount?.message}
                placeholder="Transfer to pocket"
                options={
                  <button
                    type="submit"
                    className={`absolute top-0 right-0 px-2.5 h-full text-white bg-amber-900 hover:bg-red-800 border-amber-900 rounded-r-lg border`}
                    onClick={async (e) => {
                      e.preventDefault();
                      await onWithdraw();
                    }}
                  >
                    <ChevronDoubleLeftIcon className="h-5 w-5" />
                  </button>
                }
              />
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
            selectedUsers={[]}
            showYourself={false}
            inline={true}
            maxUsers={maxUsers}
          />
          <InputField
            type="number"
            id="amount"
            register={toUserForm.register}
            error={toUserForm.formState.errors.amount?.message}
            placeholder="Amount to transfer"
            options={
              <button
                type="submit"
                className={`absolute top-0 right-0 px-2.5 h-full text-white bg-amber-900 hover:bg-red-800 border-amber-900 rounded-r-lg border`}
                onClick={async (e) => {
                  e.preventDefault();
                  await onTransfer();
                }}
              >
                <ChevronDoubleUpIcon className="h-5 w-5" />
              </button>
            }
          />
        </div>
      </ContentBox>
      <ContentBox
        title="Bank Ledger"
        subtitle="Search historical transactions"
        initialBreak={true}
        padding={false}
      >
        <div className="w-full px-4 py-4">
          <UserSearchSelect
            useFormMethods={userSearchMethodsFrom}
            selectedUsers={[]}
            showYourself={true}
            inline={false}
            maxUsers={maxUsers}
          />
          <UserSearchSelect
            useFormMethods={userSearchMethodsTo}
            selectedUsers={[]}
            showYourself={true}
            inline={false}
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
