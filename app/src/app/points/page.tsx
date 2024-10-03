"use client";

import Image from "next/image";
import Table from "@/layout/Table";
import SliderField from "@/layout/SliderField";
import Confirm from "@/layout/Confirm";
import ContentBox from "@/layout/ContentBox";
import Loader from "@/layout/Loader";
import UserSearchSelect from "@/layout/UserSearchSelect";
import NavTabs from "@/layout/NavTabs";
import BanInfo from "@/layout/BanInfo";
import { Button } from "@/components/ui/button";
import { useForm } from "react-hook-form";
import { useState, useEffect } from "react";
import { PayPalScriptProvider, PayPalButtons } from "@paypal/react-paypal-js";
import { getScriptID, destroySDKScript } from "@paypal/react-paypal-js";
import { usePayPalScriptReducer } from "@paypal/react-paypal-js";
import { api, onError } from "@/utils/api";
import { useInfinitePagination } from "@/libs/pagination";
import { useRequiredUserData } from "@/utils/UserContext";
import { reps2dollars, calcFedUgradeCost, fedStatusRepsCost } from "@/utils/paypal";
import { showMutationToast } from "@/libs/toast";
import { getSearchValidator } from "@/validators/register";
import { FederalStatuses } from "@/drizzle/constants";
import { buyRepsSchema } from "@/validators/points";
import { searchPaypalTransactionSchema } from "@/validators/points";
import { zodResolver } from "@hookform/resolvers/zod";
import { nanoid } from "nanoid";
import { Check, ChevronsUp, Search, CalendarDays } from "lucide-react";
import { Input } from "@/components/ui/input";
import { sendGTMEvent } from "@next/third-parties/google";
import { MAX_REPS_PER_MONTH } from "@/drizzle/constants";
import { FED_NORMAL_INVENTORY_SLOTS } from "@/drizzle/constants";
import { FED_SILVER_INVENTORY_SLOTS } from "@/drizzle/constants";
import { FED_GOLD_INVENTORY_SLOTS } from "@/drizzle/constants";
import { FED_NORMAL_JUTSU_SLOTS } from "@/drizzle/constants";
import { FED_SILVER_JUTSU_SLOTS } from "@/drizzle/constants";
import { FED_GOLD_JUTSU_SLOTS } from "@/drizzle/constants";
import { FED_NORMAL_BANK_INTEREST } from "@/drizzle/constants";
import { FED_SILVER_BANK_INTEREST } from "@/drizzle/constants";
import { FED_GOLD_BANK_INTEREST } from "@/drizzle/constants";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/ui/form";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { IMG_AVATAR_DEFAULT } from "@/drizzle/constants";
import { cn } from "@/libs/shadui";
import { format } from "date-fns";
import type { ColumnDefinitionType } from "@/layout/Table";
import type { z } from "zod";
import type { BuyRepsSchema } from "@/validators/points";
import type { SearchPaypalTransactionSchema } from "@/validators/points";
import type { ArrayElement } from "@/utils/typeutils";

const CURRENCY = "USD";
const OPTIONS = {
  "client-id": process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID,
  currency: CURRENCY,
};

/**
 * Main component for doing paypal transactions
 */
export default function PaypalShop() {
  const { data: userData } = useRequiredUserData();
  const [activeTab, setActiveTab] = useState<string>("Reputation");
  const currency = "USD";

  useEffect(() => {
    destroySDKScript(getScriptID(OPTIONS));
  }, [activeTab]);

  const { data: purchasedReps } = api.paypal.getRecentRepsCount.useQuery(
    { userId: userData?.userId ?? "-" },
    { enabled: !!userData },
  );

  if (!userData) return <Loader explanation="Loading userdata" />;

  return (
    <>
      {process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID && (
        <PayPalScriptProvider
          options={{
            ...OPTIONS,
            vault: true,
            intent: activeTab === "Reputation" ? "capture" : "subscription",
          }}
        >
          <ContentBox
            title={activeTab}
            subtitle={`Monthly Reps [${purchasedReps ?? 0} / ${MAX_REPS_PER_MONTH}]`}
            padding={activeTab === "Log" ? false : true}
            topRightContent={
              <>
                <div className="grow"></div>
                <NavTabs
                  current={activeTab}
                  options={["Reputation", "Federal"]}
                  setValue={setActiveTab}
                />
              </>
            }
          >
            {activeTab === "Reputation" && <ReputationStore currency={currency} />}
            {activeTab === "Federal" && <FederalStore />}
          </ContentBox>
          {activeTab === "Reputation" && (
            <TransactionHistory userId={userData.userId} />
          )}
          {activeTab === "Reputation" && <LookupTransaction />}
          {activeTab === "Federal" && <SubscriptionsOverview />}
        </PayPalScriptProvider>
      )}
    </>
  );
}

/**
 * Reputation Store component
 */
const ReputationStore = (props: { currency: string }) => {
  const { data: userData } = useRequiredUserData();
  const [{ isResolved }] = usePayPalScriptReducer();
  const [amount, setAmount] = useState(0);
  const maxUsers = 1;
  let invoiceId = nanoid();

  const utils = api.useUtils();

  const { mutate: buyReps, isPending } = api.paypal.resolveOrder.useMutation({
    onSuccess: async (data) => {
      showMutationToast(data);
      await utils.profile.getUser.invalidate();
    },
  });

  const { data: purchasedReps } = api.paypal.getRecentRepsCount.useQuery(
    { userId: userData?.userId ?? "-" },
    { enabled: !!userData },
  );

  const repFormMethods = useForm<BuyRepsSchema>({
    defaultValues: { reputationPoints: 20 },
    resolver: zodResolver(buyRepsSchema),
  });

  const userSearchSchema = getSearchValidator({ max: maxUsers });
  const userSearchMethods = useForm<z.infer<typeof userSearchSchema>>({
    resolver: zodResolver(userSearchSchema),
  });

  const watchedUsers = userSearchMethods.watch("users", []);
  const watchedPoints = repFormMethods.watch("reputationPoints", 20);
  const selectedUser = watchedUsers?.[0];

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      setAmount(reps2dollars(watchedPoints));
    }, 200);
    return () => clearTimeout(delayDebounceFn);
  }, [watchedPoints, setAmount]);

  useEffect(() => {
    if (userData && userData.username && watchedUsers.length === 0) {
      userSearchMethods.setValue("users", [userData]);
    }
  }, [userData, userSearchMethods, watchedUsers]);

  // No reps for banned users
  if (userData?.isBanned) return <BanInfo hideContentBox />;

  // Set the maximum number of purchaseable points
  const maxPoints = purchasedReps
    ? MAX_REPS_PER_MONTH - purchasedReps
    : MAX_REPS_PER_MONTH;

  return (
    <>
      <div className="text-center text-2xl">
        <SliderField
          id="reputationPoints"
          default={20}
          min={5}
          max={maxPoints}
          unit={`reputation points for $${amount} USD`}
          register={repFormMethods.register}
          setValue={repFormMethods.setValue}
          watchedValue={watchedPoints}
          error={repFormMethods.formState.errors.reputationPoints?.message}
        />
      </div>
      {userData && (
        <UserSearchSelect
          useFormMethods={userSearchMethods}
          selectedUsers={[userData]}
          showYourself={true}
          showAi={false}
          inline={true}
          maxUsers={maxUsers}
        />
      )}
      <div className="grid grid-cols-2 mt-3">
        <div className="bg-slate-500 mx-2 mb-2 rounded-md p-2 font-bold text-center cursor-not-allowed">
          Crypto, Coming Soon
        </div>
        {isResolved && userData && selectedUser && !isPending ? (
          <PayPalButtons
            style={{ layout: "horizontal", tagline: false }}
            forceReRender={[amount, watchedUsers, props.currency]}
            createOrder={(data, actions) => {
              return actions.order.create({
                purchase_units: [
                  {
                    amount: {
                      currency_code: props.currency,
                      value: amount.toString(),
                    },
                    invoice_id: invoiceId,
                    custom_id: `${userData.userId}-${selectedUser.userId}`,
                  },
                ],
              });
            }}
            onApprove={(data, actions) => {
              invoiceId = nanoid();
              if (actions.order) {
                return actions.order.capture().then((details) => {
                  buyReps({ orderId: details.id });
                  // Send GTM event with conversion data
                  const purchaseUnit = details.purchase_units[0];
                  const transaction_id = purchaseUnit?.invoice_id;
                  const currency = purchaseUnit?.amount?.currency_code;
                  const value = purchaseUnit?.amount?.value;
                  if (transaction_id && currency && value) {
                    sendGTMEvent({ ecommerce: null });
                    sendGTMEvent({
                      event: "purchase",
                      transaction_id: transaction_id,
                      currency: currency,
                      value: Number(value),
                      items: [
                        {
                          item_id: "BASIC_REPS",
                          item_name: "REPUTATION POINTS",
                        },
                      ],
                    });
                  }
                });
              } else {
                showMutationToast({
                  success: false,
                  message:
                    "Order not fully completed yet. Please wait for the order to clear, or when you know your transaction ID, contact support through our paypal email",
                  title: "No order",
                });
                return new Promise(() => {
                  return null;
                });
              }
            }}
          />
        ) : (
          <Loader />
        )}
      </div>
      <p className="italic text-slate-500 font-bold text-center">
        PS: Points do carry to final release!
      </p>
    </>
  );
};

/**
 * Subscript paypal button, which needs a subscription plan as input
 */
const PayPalSubscriptionButton = (props: {
  subscriptionPlan: string;
  userId: string;
  buyerId: string;
  imageSrc: string;
  buttonStatus: (typeof FederalStatuses)[number];
  currentUserStatus: (typeof FederalStatuses)[number];
  onSuccess?: () => void;
  onFailure?: () => void;
}) => {
  // User state
  const { data: userData } = useRequiredUserData();

  // tRPC utility
  const utils = api.useUtils();

  // Mutation for starting subscription
  const { mutate: subscribe, isPending: isSubscribing } =
    api.paypal.resolveSubscription.useMutation({
      onSuccess: async (data) => {
        showMutationToast(data);
        await utils.profile.getUser.invalidate();
        if (props.onSuccess) props.onSuccess();
      },
      onError: (error) => {
        onError(error);
        if (props.onFailure) props.onFailure();
      },
    });

  // Mutation for upgrading subscription
  const { mutate: upgrade, isPending: isUpgrading } =
    api.paypal.upgradeSubscription.useMutation({
      onSuccess: async (data) => {
        showMutationToast(data);
        if (data.success) {
          await utils.profile.getUser.invalidate();
          if (props.onSuccess) props.onSuccess();
        }
      },
      onError: (error) => {
        onError(error);
        if (props.onFailure) props.onFailure();
      },
    });

  // Mutation for buyins with reputation points
  const { mutate: buy, isPending: isBuying } = api.paypal.subscribeWithReps.useMutation(
    {
      onSuccess: async (data) => {
        showMutationToast(data);
        if (data.success) {
          await utils.profile.getUser.invalidate();
          if (props.onSuccess) props.onSuccess();
        }
      },
      onError: (error) => {
        onError(error);
        if (props.onFailure) props.onFailure();
      },
    },
  );

  // Loading status
  const isPending = isUpgrading || isSubscribing || isBuying;

  // If not loaded yet, show loader
  if (isPending) return <Loader explanation="Processing..." />;

  const normalBenefits = (
    <>
      <h2 className="font-bold">Normal Support</h2>
      <ul className="mx-2 mb-2 ml-6 list-disc text-xs">
        <li>Blue username in tavern</li>
        <li>+{FED_NORMAL_INVENTORY_SLOTS} Inventory space</li>
        <li>+{FED_NORMAL_JUTSU_SLOTS} Jutsu slot</li>
        <li>+{FED_NORMAL_BANK_INTEREST}% bank interest</li>
        <li>Custom avatar (512KB)</li>
      </ul>
    </>
  );

  const silverBenefits = (
    <>
      <h2 className="font-bold">Silver Support</h2>
      <ul className="mx-2 mb-2 ml-6 list-disc text-xs">
        <li>Silver username in tavern</li>
        <li>+{FED_SILVER_INVENTORY_SLOTS} Inventory space</li>
        <li>+{FED_SILVER_JUTSU_SLOTS} Jutsu slots</li>
        <li>+{FED_SILVER_BANK_INTEREST}% bank interest</li>
        <li>Custom avatar (1MB)</li>
      </ul>
    </>
  );

  const goldBenefits = (
    <>
      <h2 className="font-bold">Gold Support</h2>
      <ul className="mx-2 mb-2 ml-6 list-disc text-xs">
        <li>Gold username in tavern</li>
        <li>+{FED_GOLD_INVENTORY_SLOTS} Inventory space</li>
        <li>+{FED_GOLD_JUTSU_SLOTS} Jutsu slots</li>
        <li>+{FED_GOLD_BANK_INTEREST}% bank interest</li>
        <li>Custom avatar (2MB)</li>
      </ul>
    </>
  );

  // Derived vars
  const current = FederalStatuses.indexOf(props.currentUserStatus);
  const next = FederalStatuses.indexOf(props.buttonStatus);
  const canUpgrade = next > current && props.userId === userData?.userId;
  const hasSubscription = props.currentUserStatus !== "NONE";
  const upgradeCost = calcFedUgradeCost(props.currentUserStatus, props.buttonStatus);

  // Loaders
  if (!userData) return <Loader explanation="Loading userdata" />;

  return (
    <div
      className={`${
        props.currentUserStatus === props.buttonStatus ? "bg-orange-200 rounded-lg" : ""
      }`}
    >
      <div className="relative">
        <Image
          className={`mb-3`}
          src={props.imageSrc}
          alt={props.buttonStatus}
          width={512}
          height={512}
        />
        {props.currentUserStatus === props.buttonStatus && (
          <Check className="absolute top-0 right-0 h-8 w-8 rounded-full bg-green-500 p-1" />
        )}
        {hasSubscription && canUpgrade && (
          <Confirm
            title="Confirm Upgrade"
            button={
              <ChevronsUp className="absolute top-0 right-0 h-8 w-8 rounded-full bg-blue-500 p-1 cursor-pointer hover:bg-green-500" />
            }
            onAccept={(e) => {
              e.preventDefault();
              e.stopPropagation();
              upgrade({ userId: props.userId, plan: props.buttonStatus });
            }}
          >
            You are about to upgrade your federal subscription. This can only be done if
            you own the paypal subscription in question, and only for your own
            character. Note that this action is permanent and will cost {upgradeCost}{" "}
            reputation points. You currently have {userData?.reputationPoints}{" "}
            reputation points. Are you sure?
          </Confirm>
        )}
      </div>
      <div>
        {props.buttonStatus === "NORMAL" && normalBenefits}
        {props.buttonStatus === "SILVER" && silverBenefits}
        {props.buttonStatus === "GOLD" && goldBenefits}
      </div>
      {!hasSubscription && (
        <div className="bg-amber-200 text-black border-2 z-0 border-black p-2 rounded-lg text-center hover:cursor-pointer hover:bg-orange-200">
          <PayPalButtons
            style={{ layout: "horizontal", label: "subscribe", tagline: false }}
            forceReRender={[props.userId]}
            createSubscription={(data, actions) => {
              return actions.subscription.create({
                plan_id: props.subscriptionPlan,
                custom_id: `${props.buyerId}-${props.userId}`,
              });
            }}
            onApprove={(data, actions) => {
              if (data.subscriptionID) {
                subscribe({
                  subscriptionId: data.subscriptionID,
                  orderId: data.orderID,
                });
              } else {
                showMutationToast({
                  success: false,
                  message:
                    "Subscription ID not returned. Please wait for the order to clear, then your status should be updated.",
                  title: "No subscription",
                });
              }
              // Send GTM event with conversion data
              if (actions.order) {
                return actions.order.capture().then((details) => {
                  const purchaseUnit = details.purchase_units[0];
                  const transaction_id = purchaseUnit?.invoice_id;
                  const currency = purchaseUnit?.amount?.currency_code;
                  const value = purchaseUnit?.amount?.value;
                  if (transaction_id && currency && value) {
                    sendGTMEvent({ ecommerce: null });
                    sendGTMEvent({
                      event: "purchase",
                      transaction_id: transaction_id,
                      currency: currency,
                      value: Number(value),
                      items: [
                        {
                          item_id: data.subscriptionID,
                          item_name: props.buttonStatus,
                        },
                      ],
                    });
                  }
                });
              } else {
                return new Promise(() => {
                  return null;
                });
              }
            }}
          />
          {props.buttonStatus === "NORMAL" && (
            <h3 className="font-bold italic">$5 / Month</h3>
          )}
          {props.buttonStatus === "SILVER" && (
            <h3 className="font-bold italic">$10 / Month</h3>
          )}
          {props.buttonStatus === "GOLD" && (
            <h3 className="font-bold italic">$15 / Month</h3>
          )}
        </div>
      )}
      {!hasSubscription && (
        <Confirm
          title="Confirm Upgrade"
          button={
            <div className="bg-amber-200 text-black border-2 border-black p-2 mt-2 rounded-lg text-center hover:cursor-pointer hover:bg-orange-200">
              Or, buy with
              {props.buttonStatus === "NORMAL" && (
                <h3 className="font-bold italic">
                  {fedStatusRepsCost("NORMAL")} Reputation Points
                </h3>
              )}
              {props.buttonStatus === "SILVER" && (
                <h3 className="font-bold italic">
                  {fedStatusRepsCost("SILVER")} Reputation Points
                </h3>
              )}
              {props.buttonStatus === "GOLD" && (
                <h3 className="font-bold italic">
                  {fedStatusRepsCost("GOLD")} Reputation Points
                </h3>
              )}
            </div>
          }
          onAccept={(e) => {
            e.preventDefault();
            e.stopPropagation();
            buy({ userId: props.userId, status: props.buttonStatus });
          }}
        >
          You are about to purchase a federal subscription with reputation points. You
          currently have {userData?.reputationPoints} reputation points. Are you sure?
        </Confirm>
      )}
    </div>
  );
};

/**
 * Federal Store component
 */
const FederalStore = () => {
  const { data: userData } = useRequiredUserData();
  const maxUsers = 1;
  const userSearchSchema = getSearchValidator({ max: maxUsers });
  const userSearchMethods = useForm<z.infer<typeof userSearchSchema>>({
    resolver: zodResolver(userSearchSchema),
  });
  const watchedUsers = userSearchMethods.watch("users", []);
  const selectedUser = watchedUsers?.[0];

  useEffect(() => {
    if (userData && userData.username && watchedUsers.length === 0) {
      userSearchMethods.setValue("users", [userData]);
    }
  }, [userData, userSearchMethods, watchedUsers]);

  const status = selectedUser?.federalStatus;

  // No fed for banned users
  if (userData?.isBanned) return <BanInfo hideContentBox />;

  return (
    <>
      {userData && (
        <UserSearchSelect
          useFormMethods={userSearchMethods}
          selectedUsers={[userData]}
          showYourself={true}
          showAi={false}
          inline={true}
          maxUsers={maxUsers}
        />
      )}
      {status !== "NONE" && (
        <div className="my-3">
          This user already has federal support. If you are the creator of the
          subscription, you should be able to see it in a table below and cancel it.
          Otherwise, please go to your paypal account directly to manage the
          subscription.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-3">
        <div>
          {selectedUser && userData ? (
            <PayPalSubscriptionButton
              subscriptionPlan={process.env.NEXT_PUBLIC_PAYPAL_PLAN_ID_NORMAL}
              userId={selectedUser.userId}
              buyerId={userData.userId}
              imageSrc="/repshop/bronze_fed.webp"
              buttonStatus="NORMAL"
              currentUserStatus={selectedUser.federalStatus}
              onSuccess={() => {
                userSearchMethods.setValue("users", []);
              }}
            />
          ) : (
            <Loader />
          )}
        </div>

        <div>
          {selectedUser && userData ? (
            <PayPalSubscriptionButton
              subscriptionPlan={process.env.NEXT_PUBLIC_PAYPAL_PLAN_ID_SILVER}
              userId={selectedUser.userId}
              buyerId={userData.userId}
              imageSrc="/repshop/silver_fed.webp"
              buttonStatus="SILVER"
              currentUserStatus={selectedUser.federalStatus}
              onSuccess={() => {
                userSearchMethods.setValue("users", []);
              }}
            />
          ) : (
            <Loader />
          )}
        </div>

        <div>
          {selectedUser && userData ? (
            <PayPalSubscriptionButton
              subscriptionPlan={process.env.NEXT_PUBLIC_PAYPAL_PLAN_ID_GOLD}
              userId={selectedUser.userId}
              buyerId={userData.userId}
              imageSrc="/repshop/gold_fed.webp"
              buttonStatus="GOLD"
              currentUserStatus={selectedUser.federalStatus}
              onSuccess={() => {
                userSearchMethods.setValue("users", []);
              }}
            />
          ) : (
            <Loader />
          )}
        </div>
      </div>
    </>
  );
};

/**
 * Subscriptions overview component
 */
const SubscriptionsOverview = () => {
  const { data: subscriptions, refetch } = api.paypal.getPaypalSubscriptions.useQuery();
  const allSubscriptions = subscriptions?.map((subscription) => {
    return {
      ...subscription,
      payer: subscription.createdBy?.avatar,
      receiver: subscription.affectedUser?.avatar,
    };
  });
  type Subscription = ArrayElement<typeof allSubscriptions>;

  const { mutate: cancelSubscription, isPending } =
    api.paypal.cancelPaypalSubscription.useMutation({
      onSuccess: async (data) => {
        showMutationToast(data);
        await refetch();
      },
    });

  const columns: ColumnDefinitionType<Subscription, keyof Subscription>[] = [
    { key: "receiver", header: "Receiver", type: "avatar" },
    { key: "status", header: "Status", type: "string" },
    { key: "federalStatus", header: "Federal", type: "string" },
    { key: "createdAt", header: "Created", type: "date" },
  ];

  return allSubscriptions && allSubscriptions.length > 0 ? (
    <ContentBox
      title="Subscriptions"
      subtitle="Associated with your account."
      padding={false}
      initialBreak={true}
    >
      {isPending ? (
        <Loader />
      ) : (
        <Table
          data={allSubscriptions}
          columns={columns}
          buttons={[
            {
              label: "Cancel",
              onClick: (subscription: Subscription) => {
                cancelSubscription({
                  subscriptionId: subscription.subscriptionId,
                });
              },
            },
          ]}
        />
      )}
    </ContentBox>
  ) : (
    <></>
  );
};

/**
 * Transaction History component
 */
export const TransactionHistory: React.FC<{ userId: string }> = (props) => {
  const { userId } = props;
  const [lastElement, setLastElement] = useState<HTMLDivElement | null>(null);

  const {
    data: transactions,
    fetchNextPage,
    hasNextPage,
  } = api.paypal.getPaypalTransactions.useInfiniteQuery(
    { limit: 10, userId },
    {
      enabled: !!userId,
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      placeholderData: (previousData) => previousData,
    },
  );
  const allTransactions = transactions?.pages
    .map((page) => page.data)
    .flat()
    .map((transaction) => {
      return {
        ...transaction,
        receiver: transaction.affectedUser?.avatar || IMG_AVATAR_DEFAULT,
        value: `${transaction.amount} ${transaction.currency}`,
      };
    });

  type Transaction = ArrayElement<typeof allTransactions>;

  useInfinitePagination({ fetchNextPage, hasNextPage, lastElement });

  const columns: ColumnDefinitionType<Transaction, keyof Transaction>[] = [
    { key: "receiver", header: "Receiver", type: "avatar" },
    { key: "transactionId", header: "Transaction ID", type: "string" },
    { key: "reputationPoints", header: "Points", type: "string" },
    { key: "value", header: "Amount", type: "string" },
    { key: "transactionUpdatedDate", header: "Last Update", type: "string" },
  ];

  // If no previous, do not show
  if (!allTransactions || allTransactions.length === 0) return null;

  return (
    <ContentBox
      title="Transaction History"
      subtitle="Previous purchases"
      initialBreak={true}
      padding={false}
    >
      <Table
        data={allTransactions}
        columns={columns}
        linkPrefix="/users/"
        setLastElement={setLastElement}
      />
    </ContentBox>
  );
};

/**
 * Lookup paypal subscription
 */
const LookupTransaction = () => {
  // tRPC utility
  const utils = api.useUtils();

  // Form
  const searchForm = useForm<SearchPaypalTransactionSchema>({
    resolver: zodResolver(searchPaypalTransactionSchema),
  });

  // Sync transaction
  const { mutate, isPending } = api.paypal.resolveTransaction.useMutation({
    onSuccess: async (data) => {
      showMutationToast(data);
      if (data.success) {
        await utils.profile.getUser.invalidate();
      }
    },
  });

  // Submit handler
  const handleSubmitRequest = searchForm.handleSubmit(
    (data) => mutate(data),
    (errors) => console.error(errors),
  );

  // Render input form
  return (
    <ContentBox
      title="Lookup Transaction"
      subtitle="Missing Points or Fed Support? Check status here!"
      initialBreak={true}
    >
      {isPending && <Loader explanation="Searching..." />}
      {!isPending && (
        <Form {...searchForm}>
          <form onSubmit={handleSubmitRequest} className="relative">
            <div className="relative flex flex-row gap-2">
              <FormField
                control={searchForm.control}
                name="transactionDate"
                render={({ field }) => (
                  <FormItem className="flex flex-col basis-1/2">
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant={"outline"}
                            className={cn(
                              "w-full text-left font-normal text-black",
                              !field.value && "text-muted-foreground",
                            )}
                          >
                            {field.value ? (
                              format(field.value, "PPP")
                            ) : (
                              <span>Pick a date</span>
                            )}
                            <CalendarDays className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          disabled={(date) =>
                            date > new Date() || date < new Date("1900-01-01")
                          }
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormDescription>Approx. date of purchase</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={searchForm.control}
                name="transactionId"
                render={({ field }) => (
                  <FormItem className="basis-1/2">
                    <FormControl>
                      <Input {...field} placeholder="Transaction ID" />
                    </FormControl>
                    <FormDescription>Find on paypal receipt</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button className="absolute top-0 right-0" type="submit">
                <Search className="mr-1 h-5 w-5" />
              </Button>
            </div>
          </form>
        </Form>
      )}
    </ContentBox>
  );
};
