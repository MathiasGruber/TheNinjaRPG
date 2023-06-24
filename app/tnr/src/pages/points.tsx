import { type z } from "zod";
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

import SliderField from "../layout/SliderField";
import ContentBox from "../layout/ContentBox";
import Loader from "../layout/Loader";
import UserSearchSelect from "../layout/UserSearchSelect";
import NavTabs from "../layout/NavTabs";
import Table, { type ColumnDefinitionType } from "../layout/Table";

import { api } from "../utils/api";
import { useInfinitePagination } from "../libs/pagination";
import { useRequiredUserData } from "../utils/UserContext";
import { reps2dollars } from "../utils/paypal";
import { show_toast } from "../libs/toast";
import { type BuyRepsSchema, buyRepsSchema } from "../validators/points";
import { getSearchValidator } from "../validators/register";
import { type ArrayElement } from "../utils/typeutils";

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
  onSuccess?: () => void;
  onFailure?: () => void;
}) => {
  const subscribe = api.paypal.resolveSubscription.useMutation({
    onSuccess: () => {
      show_toast("Successfully started subscription", "Order finished", "success");
      props.onSuccess && props.onSuccess();
    },
    onError: (error) => {
      show_toast("Error on resolving subscription", error.message, "error");
      props.onFailure && props.onFailure();
    },
  });

  return (
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
          subscribe.mutate({
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
      {selectedUser?.federalStatus === "NONE" ? (
        <div className="flex flex-col lg:flex-row">
          <div className="m-3 basis-1/3">
            <h2 className="font-bold">Normal Support</h2>
            <ul className="m-2 ml-6 list-disc">
              <li>Blue username in tavern</li>
              <li>+2 Inventory space</li>
              <li>Custom avatar (200kb)</li>
              <li>One extra jutsu slot</li>
            </ul>
            {selectedUser && userData ? (
              <PayPalSubscriptionButton
                subscriptionPlan={process.env.NEXT_PUBLIC_PAYPAL_PLAN_ID_NORMAL}
                userId={selectedUser.userId}
                buyerId={userData.userId}
                onSuccess={() => {
                  userSearchMethods.setValue("users", []);
                }}
              />
            ) : (
              <Loader />
            )}
          </div>

          <div className="m-3 basis-1/3">
            <h2 className="font-bold">Silver Support</h2>
            <ul className="m-2 ml-6 list-disc">
              <li>Silver username in tavern</li>
              <li>+5 Inventory space</li>
              <li>Custom avatar (500kb)</li>
              <li>Two extra jutsu slots</li>
            </ul>
            {selectedUser && userData ? (
              <PayPalSubscriptionButton
                subscriptionPlan={process.env.NEXT_PUBLIC_PAYPAL_PLAN_ID_SILVER}
                userId={selectedUser.userId}
                buyerId={userData.userId}
                onSuccess={() => {
                  userSearchMethods.setValue("users", []);
                }}
              />
            ) : (
              <Loader />
            )}
          </div>

          <div className="m-3 basis-1/3">
            <h2 className="font-bold">Gold Support</h2>
            <ul className="m-2 ml-6 list-disc">
              <li>Gold username in tavern</li>
              <li>+10 Inventory space</li>
              <li>Custom avatar (750kb)</li>
              <li>Three extra jutsu slots</li>
            </ul>
            {selectedUser && userData ? (
              <PayPalSubscriptionButton
                subscriptionPlan={process.env.NEXT_PUBLIC_PAYPAL_PLAN_ID_GOLD}
                userId={selectedUser.userId}
                buyerId={userData.userId}
                onSuccess={() => {
                  userSearchMethods.setValue("users", []);
                }}
              />
            ) : (
              <Loader />
            )}
          </div>
        </div>
      ) : (
        <div className="my-3">
          This user already has federal support. If you are the creator of the
          subscription, you should be able to see it in a table below and cancel it.
          Otherwise, please go to your paypal account directly to manage the
          subscription.
        </div>
      )}
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
