import { type z } from "zod";
import Image from "next/image";
import { type NextPage } from "next";
import { useAuth } from "@clerk/nextjs";
import { useState, useEffect } from "react";
import { PayPalScriptProvider, PayPalButtons } from "@paypal/react-paypal-js";
import {
  usePayPalScriptReducer,
  getScriptID,
  destroySDKScript,
} from "@paypal/react-paypal-js";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { nanoid } from "nanoid";
import { CheckIcon } from "@heroicons/react/24/outline";
import { ChevronDoubleUpIcon } from "@heroicons/react/24/outline";

import SliderField from "../layout/SliderField";
import Confirm from "../layout/Confirm";
import ContentBox from "../layout/ContentBox";
import Loader from "../layout/Loader";
import UserSearchSelect from "../layout/UserSearchSelect";
import NavTabs from "../layout/NavTabs";
import Table, { type ColumnDefinitionType } from "../layout/Table";

import { api } from "../utils/api";
import { useInfinitePagination } from "../libs/pagination";
import { useRequiredUserData } from "../utils/UserContext";
import { reps2dollars, calcFedUgradeCost } from "../utils/paypal";
import { show_toast } from "../libs/toast";
import { type BuyRepsSchema, buyRepsSchema } from "../validators/points";
import { getSearchValidator } from "../validators/register";
import { FederalStatuses } from "../../drizzle/constants";
import type { ArrayElement } from "../utils/typeutils";

const CURRENCY = "USD";
const OPTIONS = {
  "client-id": process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID,
  currency: CURRENCY,
};

/**
 * Main component for doing paypal transactions
 */
const PaypalShop: NextPage = () => {
  const { data: userData } = useRequiredUserData();
  const [activeTab, setActiveTab] = useState<string>("Reputation");
  const currency = "USD";

  useEffect(() => {
    destroySDKScript(getScriptID(OPTIONS));
  }, [activeTab]);

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
            subtitle="Premium game features"
            padding={activeTab === "History" ? false : true}
            topRightContent={
              <>
                <div className="grow"></div>
                <NavTabs
                  current={activeTab}
                  options={["Reputation", "Federal", "History"]}
                  setValue={setActiveTab}
                />
              </>
            }
          >
            {activeTab === "Reputation" && <ReputationStore currency={currency} />}
            {activeTab === "Federal" && <FederalStore />}
            {activeTab === "History" && <TransactionHistory />}
          </ContentBox>
          {activeTab === "Federal" && <SubscriptionsOverview />}
        </PayPalScriptProvider>
      )}
    </>
  );
};

export default PaypalShop;

/**
 * Reputation Store component
 */
const ReputationStore = (props: { currency: string }) => {
  const { data: userData, refetch: refetchUser } = useRequiredUserData();
  const [{ isResolved }] = usePayPalScriptReducer();
  const [amount, setAmount] = useState(0);
  const maxUsers = 1;
  let invoiceId = nanoid();

  const { mutate: buyReps, isLoading } = api.paypal.resolveOrder.useMutation({
    onSuccess: async () => {
      show_toast("Successfully bought reputation points", "Order finished", "success");
      await refetchUser();
    },
    onError: (error) => {
      show_toast("Error on resolving invoice", error.message, "error");
    },
  });

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

  return (
    <>
      <div className="text-center text-2xl">
        <p className="text-3xl font-bold">Cost: ${amount}</p>
        <p className="italic text-red-800 font-bold">
          NOTE: Points do carry over to final release!
        </p>
        <SliderField
          id="reputationPoints"
          default={20}
          min={5}
          max={1000}
          unit="reputation points"
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
          inline={true}
          maxUsers={maxUsers}
        />
      )}
      {isResolved && userData && selectedUser && !isLoading ? (
        <PayPalButtons
          style={{ layout: "horizontal" }}
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
              });
            } else {
              show_toast(
                "No order",
                "Order not fully completed yet. Please wait for the order to clear, or when you know your transaction ID, contact support through our paypal email",
                "info"
              );
              return new Promise(() => {
                return null;
              });
            }
          }}
        />
      ) : (
        <Loader />
      )}
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
  buttonStatus: typeof FederalStatuses[number];
  currentUserStatus: typeof FederalStatuses[number];
  onSuccess?: () => void;
  onFailure?: () => void;
}) => {
  // User state
  const { data: userData, refetch: refetchUser } = useRequiredUserData();

  // Mutation for starting subscription
  const { mutate: subscribe, isLoading: isSubscribing } =
    api.paypal.resolveSubscription.useMutation({
      onSuccess: async () => {
        show_toast("Successfully started subscription", "Order finished", "success");
        await refetchUser();
        props.onSuccess && props.onSuccess();
      },
      onError: (error) => {
        show_toast("Error on resolving subscription", error.message, "error");
        props.onFailure && props.onFailure();
      },
    });

  // Mutation for upgrading subscription
  const { mutate: upgrade, isLoading: isUpgrading } =
    api.paypal.upgradeSubscription.useMutation({
      onSuccess: async (data) => {
        if (data.success) {
          show_toast("Upgraded subscription", "Success", "success");
          await refetchUser();
          props.onSuccess && props.onSuccess();
        } else {
          show_toast("Error on upgrading subscription", data.message, "error");
        }
      },
      onError: (error) => {
        show_toast("Error on resolving subscription", error.message, "error");
        props.onFailure && props.onFailure();
      },
    });

  // Loading status
  const isLoading = isUpgrading || isSubscribing;

  // If not loaded yet, show loader
  if (isLoading) return <Loader explanation="Processing..." />;

  const normalBenefits = (
    <>
      <h2 className="font-bold">Normal Support</h2>
      <ul className="m-2 ml-6 list-disc text-xs">
        <li>Blue username in tavern</li>
        <li>+2 Inventory space</li>
        <li>Custom avatar (128kb)</li>
        <li>One extra jutsu slot</li>
      </ul>
    </>
  );

  const silverBenefits = (
    <>
      <h2 className="font-bold">Silver Support</h2>
      <ul className="m-2 ml-6 list-disc text-xs">
        <li>Silver username in tavern</li>
        <li>+5 Inventory space</li>
        <li>Custom avatar (256kb)</li>
        <li>Two extra jutsu slots</li>
      </ul>
    </>
  );

  const goldBenefits = (
    <>
      <h2 className="font-bold">Gold Support</h2>
      <ul className="m-2 ml-6 list-disc text-xs">
        <li>Gold username in tavern</li>
        <li>+10 Inventory space</li>
        <li>Custom avatar (512kb)</li>
        <li>Three extra jutsu slots</li>
      </ul>
    </>
  );

  // Derived vars
  const current = FederalStatuses.indexOf(props.currentUserStatus);
  const next = FederalStatuses.indexOf(props.buttonStatus);
  const canUpgrade = next > current && props.userId === userData?.userId;
  const hasSubscription = props.currentUserStatus !== "NONE";
  const upgradeCost = calcFedUgradeCost(props.currentUserStatus, props.buttonStatus);

  return (
    <>
      <div className="relative">
        <Image
          className={`mb-3 ${
            props.currentUserStatus === props.buttonStatus ? "" : "opacity-30"
          }`}
          src={props.imageSrc}
          alt="Silver"
          width={512}
          height={512}
        />
        {props.currentUserStatus === props.buttonStatus && (
          <CheckIcon className="absolute top-0 right-0 h-8 w-8 rounded-full bg-green-500 p-1" />
        )}
        {hasSubscription && canUpgrade && (
          <Confirm
            title="Confirm Deletion"
            button={
              <ChevronDoubleUpIcon className="absolute top-0 right-0 h-8 w-8 rounded-full bg-blue-500 p-1 cursor-pointer hover:bg-green-500" />
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
      <div
        className={props.currentUserStatus === props.buttonStatus ? "" : "opacity-30"}
      >
        {props.buttonStatus === "NORMAL" && normalBenefits}
        {props.buttonStatus === "SILVER" && silverBenefits}
        {props.buttonStatus === "GOLD" && goldBenefits}
      </div>
      {!hasSubscription && (
        <PayPalButtons
          style={{ layout: "horizontal", label: "subscribe" }}
          forceReRender={[props.userId]}
          createSubscription={(data, actions) => {
            return actions.subscription.create({
              plan_id: props.subscriptionPlan,
              custom_id: `${props.buyerId}-${props.userId}`,
            });
          }}
          onApprove={(data) => {
            if (data.subscriptionID) {
              subscribe({
                subscriptionId: data.subscriptionID,
                orderId: data.orderID,
              });
            } else {
              show_toast(
                "No subscription",
                "Subscription ID not returned. Please wait for the order to clear, then your status should be updated.",
                "info"
              );
            }
            return new Promise(() => {
              return null;
            });
          }}
        />
      )}
    </>
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

  return (
    <>
      {userData && (
        <UserSearchSelect
          useFormMethods={userSearchMethods}
          selectedUsers={[userData]}
          showYourself={true}
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

      <div className="flex flex-col lg:flex-row">
        <div className="m-3 basis-1/3">
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

        <div className="m-3 basis-1/3">
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

        <div className="m-3 basis-1/3">
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
      payer: subscription.createdBy.avatar,
      receiver: subscription.affectedUser.avatar,
    };
  });
  type Subscription = ArrayElement<typeof allSubscriptions>;

  const { mutate: cancelSubscription, isLoading } =
    api.paypal.cancelPaypalSubscription.useMutation({
      onSuccess: async () => {
        await refetch();
        show_toast("Successfully canceled subscription", "Canceled", "success");
      },
      onError: (error) => {
        show_toast("Error on cancelling subscription", error.message, "error");
      },
    });

  const columns: ColumnDefinitionType<Subscription, keyof Subscription>[] = [
    { key: "receiver", header: "Receiver", type: "avatar", width: 7 },
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
      {isLoading ? (
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
const TransactionHistory = () => {
  const { userId } = useAuth();
  const [lastElement, setLastElement] = useState<HTMLDivElement | null>(null);

  const {
    data: transactions,
    fetchNextPage,
    hasNextPage,
  } = api.paypal.getPaypalTransactions.useInfiniteQuery(
    { limit: 10 },
    {
      enabled: !!userId,
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      keepPreviousData: true,
    }
  );
  const allTransactions = transactions?.pages
    .map((page) => page.data)
    .flat()
    .map((transaction) => {
      return {
        ...transaction,
        receiver: transaction.affectedUser.avatar,
        value: `${transaction.amount} ${transaction.currency}`,
      };
    });

  type Transaction = ArrayElement<typeof allTransactions>;

  useInfinitePagination({ fetchNextPage, hasNextPage, lastElement });

  const columns: ColumnDefinitionType<Transaction, keyof Transaction>[] = [
    { key: "receiver", header: "Receiver", type: "avatar", width: 7 },
    { key: "transactionId", header: "Transaction ID", type: "string" },
    { key: "reputationPoints", header: "Points", type: "string" },
    { key: "value", header: "Amount", type: "string" },
    { key: "transactionUpdatedDate", header: "Last Update", type: "string" },
  ];

  return (
    <Table
      data={allTransactions}
      columns={columns}
      linkPrefix="/users/"
      setLastElement={setLastElement}
    />
  );
};
