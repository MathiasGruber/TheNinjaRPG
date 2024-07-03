import { z } from "zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import ContentBox from "@/layout/ContentBox";
import Shop from "@/layout/Shop";
import Loader from "@/layout/Loader";
import NavTabs from "@/layout/NavTabs";
import Confirm from "@/layout/Confirm";
import AvatarImage from "@/layout/Avatar";
import { ReceiptJapaneseYen, ShoppingCart, X } from "lucide-react";
import Table, { type ColumnDefinitionType } from "@/layout/Table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrentBloodline, PurchaseBloodline } from "@/layout/Bloodline";
import { useRequiredUserData } from "@/utils/UserContext";
import { api } from "@/utils/api";
import { secondsFromDate } from "@/utils/time";
import { showMutationToast } from "@/libs/toast";
import { useInfinitePagination } from "@/libs/pagination";
import { RYO_FOR_REP_DAYS_FROZEN } from "@/drizzle/constants";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import type { NextPage } from "next";
import type { ArrayElement } from "@/utils/typeutils";
import type { UserWithRelations } from "@/server/api/routers/profile";

const BlackMarket: NextPage = () => {
  // Tab selection
  const [tab, setTab] = useState<"Bloodline" | "Item" | "Ryo" | null>(null);

  // Settings
  const { data: userData } = useRequiredUserData();

  // Loaders
  if (!userData) return <Loader explanation="Loading userdata" />;

  // Render
  return (
    <>
      <ContentBox
        title="Black Market"
        subtitle="Special Abilities and Items"
        back_href="/village"
        topRightContent={
          <NavTabs
            id="hospital-page"
            current={tab}
            options={["Bloodline", "Item", "Ryo"]}
            setValue={setTab}
          />
        }
      >
        <div>
          Welcome to the Black Market. Here you can purchase special abilities, items,
          and currency. You can:
          <ol className="pt-3">
            <li>
              <i> - Have a bloodline genetically infused.</i>
            </li>
            <li>
              <i> - Buy special items.</i>
            </li>
            <li>
              <i> - Exchange ryo for reputation points.</i>
            </li>
          </ol>
        </div>
      </ContentBox>
      {tab === "Bloodline" && <Bloodline userData={userData} />}
      {tab === "Ryo" && <RyoShop userData={userData} />}
      {tab === "Item" && (
        <Shop
          userData={userData}
          defaultType="CONSUMABLE"
          initialBreak={true}
          minRepsCost={1}
          subtitle="Buy rare items"
        />
      )}
    </>
  );
};

export default BlackMarket;

/**
 * Purchase & Remove Bloodlines
 */
const Bloodline: React.FC<{ userData: NonNullable<UserWithRelations> }> = ({
  userData,
}) => {
  // Loaders
  if (!userData) return <Loader explanation="Loading userdata" />;

  // Derived
  const bloodlineId = userData.bloodlineId;

  return (
    <>
      {bloodlineId && (
        <CurrentBloodline bloodlineId={bloodlineId} initialBreak={true} />
      )}
      <PurchaseBloodline initialBreak={true} />
    </>
  );
};

/**
 * Exchange Reputation points for Ryo
 */
const RyoShop: React.FC<{ userData: NonNullable<UserWithRelations> }> = ({
  userData,
}) => {
  // State
  const [lastElement, setLastElement] = useState<HTMLDivElement | null>(null);

  // Utility
  const utils = api.useUtils();

  // Mutations
  const { mutate: create, isPending: isCreating } =
    api.blackmarket.createOffer.useMutation({
      onSuccess: async (data) => {
        showMutationToast(data);
        if (data.success) {
          await utils.profile.getUser.invalidate();
          await utils.blackmarket.getRyoOffers.invalidate();
        }
      },
    });

  const { mutate: delist, isPending: isDelisting } =
    api.blackmarket.delistOffer.useMutation({
      onSuccess: async (data) => {
        showMutationToast(data);
        if (data.success) {
          await utils.profile.getUser.invalidate();
          await utils.blackmarket.getRyoOffers.invalidate();
        }
      },
    });

  const { mutate: accept, isPending: isAccepting } =
    api.blackmarket.takeOffer.useMutation({
      onSuccess: async (data) => {
        showMutationToast(data);
        if (data.success) {
          await utils.profile.getUser.invalidate();
          await utils.blackmarket.getRyoOffers.invalidate();
        }
      },
    });

  const isLoading = isCreating || isDelisting || isAccepting;

  // Query
  const { data, fetchNextPage, hasNextPage } =
    api.blackmarket.getRyoOffers.useInfiniteQuery(
      { limit: 30 },
      {
        getNextPageParam: (lastPage) => lastPage.nextCursor,
        placeholderData: (previousData) => previousData,
        staleTime: 1000 * 60 * 30, // every 30min
      },
    );
  const allOffers = data?.pages
    .map((page) => page.data)
    .flat()
    .map((offer) => {
      const hasRyo = userData.money >= offer.requestedRyo;
      const owner = offer.creatorUserId === userData.userId;
      const canDelist =
        new Date() >=
        secondsFromDate(3600 * 24 * RYO_FOR_REP_DAYS_FROZEN, offer.createdAt);
      return {
        ...offer,
        info: (
          <div className="w-20 text-center">
            <AvatarImage href={offer.avatar} alt={offer.username} size={100} />
            <p>{offer.username}</p>
          </div>
        ),
        actions: (
          <div className="flex flex-row gap-1">
            {hasRyo && !owner && (
              <Button onClick={() => accept({ offerId: offer.id })}>
                <ShoppingCart className="h-5 w-5 mr-2" />
                Buy
              </Button>
            )}
            {owner && canDelist && (
              <Button onClick={() => delist({ offerId: offer.id })}>
                <X className="h-6 w-6" />
              </Button>
            )}
            {owner && !canDelist && (
              <p className="text-center">
                Created at
                <br /> {offer.createdAt.toLocaleDateString()}
              </p>
            )}
          </div>
        ),
      };
    });
  type Offer = ArrayElement<typeof allOffers>;

  // Infinite scrolling
  useInfinitePagination({
    fetchNextPage,
    hasNextPage,
    lastElement,
  });

  // Columns
  const columns: ColumnDefinitionType<Offer, keyof Offer>[] = [
    { key: "info", header: "User", type: "jsx" },
    { key: "repsForSale", header: "Reps", type: "string" },
    { key: "requestedRyo", header: "Ryo Cost", type: "string" },
    { key: "ryoPerRep", header: "Ryo per Rep", type: "string" },
    { key: "actions", header: "Actions", type: "jsx" },
  ];

  // New offer form
  const FormSchema = z.object({
    reps: z.coerce.number().int().min(1),
    ryo: z.coerce.number().int().min(1),
  });
  type FormSchemaType = z.infer<typeof FormSchema>;
  const form = useForm<FormSchemaType>({
    resolver: zodResolver(FormSchema),
    defaultValues: { reps: 0, ryo: 0 },
  });
  const offerReps = form.watch("reps");
  const offerRyo = form.watch("ryo");
  const onSubmit = form.handleSubmit((data) => create(data));

  // Derived
  const tradeableReps = Math.max(userData.reputationPoints - 5, 0);

  return (
    <ContentBox
      title="Ryo Shop"
      subtitle="Trade for reputation points"
      initialBreak={true}
      padding={false}
    >
      {/* CREATE OFFERS */}
      {tradeableReps > 0 && (
        <>
          <p className="p-3">
            You have <b>{tradeableReps} reputation points</b> and{" "}
            <b>{userData.money} ryo</b> in your pocket. You may list reputation points
            here for sale, so that other users may buy them for a pre-determined amount
            of ryo. Once listed, your sale cannot be delisted for{" "}
            {RYO_FOR_REP_DAYS_FROZEN} days. You can not trade the first 5 reputation
            points given on your account.
          </p>
          <p className="px-3 pb-3 italic">
            NB. Bought reputation points are not transfered on reset to beta/final
            release, but are rather restored to the original purchaser.
          </p>
          {!isLoading && (
            <Form {...form}>
              <form>
                <div className="grid grid-cols-2 gap-3 px-3">
                  <FormField
                    control={form.control}
                    name="reps"
                    render={({ field }) => (
                      <FormItem className="w-full">
                        <FormLabel>Reps to Sell</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="ryo"
                    render={({ field }) => (
                      <FormItem className="w-full">
                        <FormLabel>Ryo Request</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="px-3 py-2">
                  <Confirm
                    title="Create Offer"
                    proceed_label={
                      offerReps > 0 && offerRyo > 0 ? "Confirm" : "Fill in values"
                    }
                    isValid={!isLoading && offerReps > 0}
                    confirmClassName={
                      offerReps > 0 && offerRyo > 0
                        ? "bg-blue-600 text-white hover:bg-blue-700"
                        : "bg-red-600 text-white hover:bg-red-700"
                    }
                    button={
                      <Button type="submit" className="w-full">
                        <ReceiptJapaneseYen className="w-5 h-5 mr-2" />
                        Create offer
                      </Button>
                    }
                    onAccept={async (e) => {
                      e.preventDefault();
                      await onSubmit();
                    }}
                  >
                    {offerReps > 0 && offerRyo > 0 && (
                      <p>
                        Confirm that you wish to put {offerReps} reputation points up
                        for sale for a price of {offerRyo} ryo. This offer will be
                        listed for at least {RYO_FOR_REP_DAYS_FROZEN} days, after which
                        you can delist them.
                      </p>
                    )}
                    {(offerReps === 0 || offerRyo === 0) && (
                      <p>Must enter reputation & reputation values above 0.</p>
                    )}
                  </Confirm>
                </div>
              </form>
            </Form>
          )}
        </>
      )}
      {/* TABLE OF CURRENT OFFERS */}
      {!isLoading && allOffers && allOffers.length > 0 && (
        <Table data={allOffers} columns={columns} setLastElement={setLastElement} />
      )}
      {!allOffers?.length && (
        <p className="p-3 bg-orange-100 mt-3">No offers currently listed.</p>
      )}
      {/* LOADERS */}
      {isLoading && <Loader explanation="Loading" />}
    </ContentBox>
  );
};
