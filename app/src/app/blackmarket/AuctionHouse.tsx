import { useState } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import ContentBox from "@/layout/ContentBox";
import NavTabs from "@/layout/NavTabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/app/_trpc/client";
import { showMutationToast } from "@/libs/toast";
import type { UserWithRelations } from "@/server/api/routers/profile";
import type { AuctionRequestType } from "@/types/auction";

interface AuctionHouseProps {
  userData: NonNullable<UserWithRelations>;
}

export default function AuctionHouse({ userData }: AuctionHouseProps) {
  const [tab, setTab] = useState<"Request" | "Player Shop" | "Bidding Hall">("Request");

  return (
    <ContentBox
      title="Auction House"
      subtitle="Trade and request items"
      initialBreak={true}
      topRightContent={
        <NavTabs
          id="auction-house"
          current={tab}
          options={["Request", "Player Shop", "Bidding Hall"]}
          setValue={setTab}
        />
      }
    >
      {tab === "Request" && <RequestTab userData={userData} />}
      {tab === "Player Shop" && <PlayerShopTab userData={userData} />}
      {tab === "Bidding Hall" && <BiddingHallTab userData={userData} />}
    </ContentBox>
  );
}

const RequestTab: React.FC<{ userData: NonNullable<UserWithRelations> }> = ({
  userData,
}) => {
  const utils = api.useUtils();

  const RequestFormSchema = z.object({
    type: z.enum(["CRAFT", "REPAIR"] as const),
    details: z.string().min(10).max(500),
    price: z.coerce.number().int().min(1),
    itemId: z.string().optional(),
  });

  const form = useForm<z.infer<typeof RequestFormSchema>>({
    resolver: zodResolver(RequestFormSchema),
    defaultValues: {
      type: "CRAFT",
      details: "",
      price: 0,
    },
  });

  const requestType = form.watch("type");

  const { mutate: createRequest, isPending } = api.auction.createRequest.useMutation({
    onSuccess: async (data) => {
      showMutationToast(data);
      if (data.success) {
        form.reset();
        await utils.auction.getRequests.invalidate();
      }
    },
  });

  const onSubmit = form.handleSubmit((data) => createRequest(data));

  return (
    <div className="p-4">
      <Form {...form}>
        <form onSubmit={onSubmit} className="space-y-4">
          <FormField
            control={form.control}
            name="type"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Request Type</FormLabel>
                <Select
                  onValueChange={field.onChange}
                  defaultValue={field.value}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select request type" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="CRAFT">Craft an Item</SelectItem>
                    <SelectItem value="REPAIR">Repair My Item</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          {requestType === "CRAFT" && (
            <FormField
              control={form.control}
              name="details"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Item Details</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Describe the item you want crafted..."
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          {requestType === "REPAIR" && (
            <FormField
              control={form.control}
              name="itemId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Select Item to Repair</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select an item" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {/* TODO: Add user's unequipped items */}
                      <SelectItem value="item1">Item 1</SelectItem>
                      <SelectItem value="item2">Item 2</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          <FormField
            control={form.control}
            name="price"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Price (Ryo)</FormLabel>
                <FormControl>
                  <Input type="number" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button type="submit" disabled={isPending}>
            Create Request
          </Button>
        </form>
      </Form>
    </div>
  );
};

const PlayerShopTab: React.FC<{ userData: NonNullable<UserWithRelations> }> = ({
  userData,
}) => {
  const utils = api.useUtils();

  const ShopFormSchema = z.object({
    name: z.string().min(3).max(50),
    description: z.string().min(10).max(500),
  });

  const form = useForm<z.infer<typeof ShopFormSchema>>({
    resolver: zodResolver(ShopFormSchema),
  });

  const { mutate: createShop, isPending } = api.auction.createShop.useMutation({
    onSuccess: async (data) => {
      showMutationToast(data);
      if (data.success) {
        form.reset();
        await utils.auction.getShops.invalidate();
      }
    },
  });

  const onSubmit = form.handleSubmit((data) => createShop(data));

  return (
    <div className="p-4">
      <Form {...form}>
        <form onSubmit={onSubmit} className="space-y-4">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Shop Name</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Shop Description</FormLabel>
                <FormControl>
                  <Textarea {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button type="submit" disabled={isPending}>
            Create Shop
          </Button>
        </form>
      </Form>
    </div>
  );
};

const BiddingHallTab: React.FC<{ userData: NonNullable<UserWithRelations> }> = ({
  userData,
}) => {
  const utils = api.useUtils();

  const BidFormSchema = z.object({
    name: z.string().min(3).max(50),
    description: z.string().min(10).max(500),
    rewardType: z.enum(["ITEM", "MATERIAL", "OTHER"] as const),
    rewardDetails: z.string().min(10).max(500),
    startingPrice: z.coerce.number().int().min(1),
    closureDate: z.coerce.date().min(new Date()),
  });

  const form = useForm<z.infer<typeof BidFormSchema>>({
    resolver: zodResolver(BidFormSchema),
  });

  const { mutate: createBid, isPending } = api.auction.createBid.useMutation({
    onSuccess: async (data) => {
      showMutationToast(data);
      if (data.success) {
        form.reset();
        await utils.auction.getBids.invalidate();
      }
    },
  });

  const onSubmit = form.handleSubmit((data) => createBid(data));

  return (
    <div className="p-4">
      <Form {...form}>
        <form onSubmit={onSubmit} className="space-y-4">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Bid Name</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Service Description</FormLabel>
                <FormControl>
                  <Textarea {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="rewardType"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Reward Type</FormLabel>
                <Select
                  onValueChange={field.onChange}
                  defaultValue={field.value}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select reward type" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="ITEM">Item</SelectItem>
                    <SelectItem value="MATERIAL">Material</SelectItem>
                    <SelectItem value="OTHER">Other</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="rewardDetails"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Reward Details</FormLabel>
                <FormControl>
                  <Textarea {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="startingPrice"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Starting Price (Ryo)</FormLabel>
                <FormControl>
                  <Input type="number" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="closureDate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Bid Closure Date</FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button type="submit" disabled={isPending}>
            Create Bid
          </Button>
        </form>
      </Form>
    </div>
  );
};
