import Image from "next/image";
import Link from "next/link";
import Table from "@/layout/Table";
import SliderField from "@/layout/SliderField";
import Confirm from "@/layout/Confirm";
import ContentBox from "@/layout/ContentBox";
import Loader from "@/layout/Loader";
import UserSearchSelect from "@/layout/UserSearchSelect";
import NavTabs from "@/layout/NavTabs";
import Post from "@/layout/Post";
import ReactCountryFlag from "react-country-flag";
import { Button } from "@/components/ui/button";
import { useAuth } from "@clerk/nextjs";
import { useForm } from "react-hook-form";
import { useState, useEffect } from "react";
import { PayPalScriptProvider, PayPalButtons } from "@paypal/react-paypal-js";
import { getScriptID, destroySDKScript } from "@paypal/react-paypal-js";
import { usePayPalScriptReducer } from "@paypal/react-paypal-js";
import { api, onError } from "@/utils/api";
import { useInfinitePagination } from "@/libs/pagination";
import { useRequiredUserData } from "@/utils/UserContext";
import { reps2dollars, calcFedUgradeCost } from "@/utils/paypal";
import { showMutationToast } from "@/libs/toast";
import { getSearchValidator } from "@/validators/register";
import { FederalStatuses } from "@/drizzle/constants";
import { buyRepsSchema } from "@/validators/points";
import { searchPaypalSchema } from "@/validators/points";
import { zodResolver } from "@hookform/resolvers/zod";
import { nanoid } from "nanoid";
import { Check, ChevronsUp, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/ui/form";
import type { ColumnDefinitionType } from "@/layout/Table";
import type { z } from "zod";
import type { NextPage } from "next";
import type { BuyRepsSchema } from "@/validators/points";
import type { SearchPaypalSchema } from "@/validators/points";
import type { ArrayElement } from "@/utils/typeutils";

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
            subtitle="Premium features"
            padding={activeTab === "Log" ? false : true}
            topRightContent={
              <>
                <div className="grow"></div>
                <NavTabs
                  current={activeTab}
                  options={["Reputation", "Ads", "Federal"]}
                  setValue={setActiveTab}
                />
              </>
            }
          >
            {activeTab === "Reputation" && <ReputationStore currency={currency} />}
            {activeTab === "Federal" && <FederalStore />}
            {activeTab === "Ads" && <RewardedAds />}
          </ContentBox>
          {activeTab === "Reputation" && <TransactionHistory />}
          {activeTab === "Federal" && <SubscriptionsOverview />}
          {activeTab === "Federal" && <LookupSubscription />}
        </PayPalScriptProvider>
      )}
    </>
  );
};

export default PaypalShop;

/**
 * CPALead rewarded ads
 */
const RewardedAds = () => {
  // Fetch all ads
  const { data: ads, isPending } = api.paypal.getCpaLeads.useQuery();
  const [selectedCountry, setSelectedCountry] = useState<string>("US");

  // Filter to relevant
  const relevantAds =
    ads?.offers
      .map((o) => ({ ...o, thr: parseFloat(o.epc) / parseFloat(o.amount) }))
      .filter((o) => o.payout_currency === "USD")
      .filter((o) => !o.dating)
      .filter((o) => o.traffic_type === "incentive")
      .filter((o) => o.thr > 0.05) ?? [];

  // Get unique countries
  const uniqueCountries: string[] = [];
  relevantAds.forEach((ad) => {
    const countries = ad.country.split(":");
    countries.forEach((country) => {
      if (!uniqueCountries.includes(country)) {
        uniqueCountries.push(country);
      }
    });
  });

  // Offers to show to user
  const offersToShow = relevantAds.filter((ad) => ad.country.includes(selectedCountry));

  return (
    <div>
      <p className="italic">
        Select your country to show offers available to you. You may be able to use a
        VPN to fill in offers in other countries.
      </p>
      {isPending && <Loader explanation="Loading offers" />}
      {uniqueCountries.map((countryCode, i) => (
        <ReactCountryFlag
          key={i}
          svg
          countryCode={countryCode}
          style={{
            width: "30px",
            height: "30px",
            margin: "2px",
            ...(selectedCountry === countryCode
              ? {}
              : { filter: "grayscale(90%)", opacity: "0.3", cursor: "pointer" }),
          }}
          onClick={() => setSelectedCountry(countryCode)}
        />
      ))}
      {!isPending && offersToShow.length === 0 && (
        <p className="text-3xl text-center font-bold">Sorry, none available</p>
      )}
      {offersToShow.length > 0 && (
        <div>
          <p className="text-3xl font-bold pt-3 text-center">
            Available Offers: {selectedCountry}
          </p>
          {offersToShow.map((offer, i) => {
            const preview = offer.previews?.[0]?.url;
            const image = preview ? (
              <div className="relative w-24 mr-3">
                <Image
                  src={preview}
                  alt="Ad"
                  sizes="70px"
                  fill
                  style={{
                    objectFit: "contain",
                  }}
                />
              </div>
            ) : null;
            return (
              <Link className="font-bold" href={offer.link} key={i} target="_blank">
                <Post title={offer.title} hover_effect={true} image={image}>
                  {offer.description && (
                    <div>
                      <p className="italic">Earn {offer.amount} reputation points</p>

                      {offer.conversion}
                    </div>
                  )}
                </Post>
              </Link>
            );
          })}
        </div>
      )}
      {ads?.userAgent && <p>User agent: {ads?.userAgent}</p>}
      {ads?.userIp && <p>User IP: {ads?.userIp}</p>}
    </div>
  );
};

/**
 * Reputation Store component
 */
const ReputationStore = (props: { currency: string }) => {
  const { data: userData, refetch: refetchUser } = useRequiredUserData();
  const [{ isResolved }] = usePayPalScriptReducer();
  const [amount, setAmount] = useState(0);
  const maxUsers = 1;
  let invoiceId = nanoid();

  const { mutate: buyReps, isPending } = api.paypal.resolveOrder.useMutation({
    onSuccess: async (data) => {
      showMutationToast(data);
      await refetchUser();
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
        <SliderField
          id="reputationPoints"
          default={20}
          min={5}
          max={1000}
          unit={`reputation points for $${amount}`}
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
  const { data: userData, refetch: refetchUser } = useRequiredUserData();

  // Mutation for starting subscription
  const { mutate: subscribe, isPending: isSubscribing } =
    api.paypal.resolveSubscription.useMutation({
      onSuccess: async (data) => {
        showMutationToast(data);
        await refetchUser();
        props.onSuccess && props.onSuccess();
      },
      onError: (error) => {
        onError(error);
        props.onFailure && props.onFailure();
      },
    });

  // Mutation for upgrading subscription
  const { mutate: upgrade, isPending: isUpgrading } =
    api.paypal.upgradeSubscription.useMutation({
      onSuccess: async (data) => {
        showMutationToast(data);
        if (data.success) {
          await refetchUser();
          props.onSuccess && props.onSuccess();
        }
      },
      onError: (error) => {
        onError(error);
        props.onFailure && props.onFailure();
      },
    });

  // Loading status
  const isPending = isUpgrading || isSubscribing;

  // If not loaded yet, show loader
  if (isPending) return <Loader explanation="Processing..." />;

  const normalBenefits = (
    <>
      <h2 className="font-bold">Normal Support</h2>
      <ul className="m-2 ml-6 list-disc text-xs">
        <li>Blue username in tavern</li>
        <li>+2 Inventory space</li>
        <li>Custom avatar (512KB)</li>
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
        <li>Custom avatar (1MB)</li>
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
        <li>Custom avatar (2MB)</li>
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
          <Check className="absolute top-0 right-0 h-8 w-8 rounded-full bg-green-500 p-1" />
        )}
        {hasSubscription && canUpgrade && (
          <Confirm
            title="Confirm Deletion"
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
              showMutationToast({
                success: false,
                message:
                  "Subscription ID not returned. Please wait for the order to clear, then your status should be updated.",
                title: "No subscription",
              });
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
      placeholderData: (previousData) => previousData,
    },
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
const LookupSubscription = () => {
  // User state
  const { refetch: refetchUser } = useRequiredUserData();

  // Form
  const searchForm = useForm<SearchPaypalSchema>({
    resolver: zodResolver(searchPaypalSchema),
  });

  // Sync subscription
  const { mutate, isPending } = api.paypal.resolveSubscription.useMutation({
    onSuccess: async (data) => {
      showMutationToast(data);
      if (data.success) {
        await refetchUser();
      }
    },
  });

  // Submit handler
  const handleSubmitRequest = searchForm.handleSubmit(
    (data) => mutate({ subscriptionId: data.text }),
    (errors) => console.error(errors),
  );

  // Render input form
  return (
    <ContentBox
      title="Lookup Subscription"
      subtitle="Missing federal support? Check subscription status here!"
      initialBreak={true}
    >
      {isPending && <Loader explanation="Searching..." />}
      {!isPending && (
        <Form {...searchForm}>
          <form onSubmit={handleSubmitRequest} className="relative">
            <FormField
              control={searchForm.control}
              name="text"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button className="absolute top-0 right-0" type="submit">
              <Search className="mr-1 h-5 w-5" />
            </Button>
          </form>
        </Form>
      )}
    </ContentBox>
  );
};
