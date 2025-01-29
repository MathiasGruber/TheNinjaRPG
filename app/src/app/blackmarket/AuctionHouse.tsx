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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

interface AuctionHouseProps {
  userData: NonNullable<UserWithRelations>;
}

const ShopDetails: React.FC<{
  shopId: string;
  onBack: () => void;
}> = ({ shopId, onBack }) => {
  const { data: shop } = api.auction.getShop.useQuery({ shopId });
  const { data: items } = api.auction.getShopItems.useQuery({ shopId });

  if (!shop) {
    return (
      <div className="flex h-[600px] items-center justify-center">
        <p className="text-gray-500 dark:text-gray-400">Loading shop...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Button variant="outline" size="sm" onClick={onBack}>
          Back to Shops
        </Button>
        <h2 className="text-xl font-bold">{shop.name}</h2>
      </div>
      <p className="text-sm text-gray-700 dark:text-gray-300">{shop.description}</p>
      {shop.notice && (
        <div className="rounded-md bg-yellow-50 p-4 dark:bg-yellow-900/10">
          <p className="text-sm text-yellow-800 dark:text-yellow-200">
            {shop.notice}
          </p>
        </div>
      )}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {items?.map((item) => (
          <Card key={item.id}>
            <CardHeader>
              <CardTitle>{item.name}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  Quantity: {item.quantity}
                </span>
                <span className="font-medium text-gray-900 dark:text-gray-100">
                  {item.price} Ryo
                </span>
              </div>
              <Button className="mt-4 w-full" variant="outline">
                Purchase
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default function AuctionHouse({ userData }: AuctionHouseProps) {
  const [tab, setTab] = useState<"Request" | "Player Shop" | "Bidding Hall">("Request");
  const [selectedShopId, setSelectedShopId] = useState<string | null>(null);
  const isCrafterOrHunter = ["CRAFTER", "HUNTER"].includes(userData.role);

  const { data: requestPages } = api.auction.getRequests.useInfiniteQuery(
    { limit: 10 },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    }
  );

  const { data: shopPages } = api.auction.getShops.useInfiniteQuery(
    { limit: 10 },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    }
  );

  const { data: bidPages } = api.auction.getBids.useInfiniteQuery(
    { limit: 10 },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    }
  );

  const { mutate: acceptRequest } = api.auction.acceptRequest.useMutation({
    onSuccess: async (data) => {
      showMutationToast(data);
      if (data.success) {
        await utils.auction.getRequests.invalidate();
      }
    },
  });

  const { mutate: completeRequest } = api.auction.completeRequest.useMutation({
    onSuccess: async (data) => {
      showMutationToast(data);
      if (data.success) {
        await utils.auction.getRequests.invalidate();
      }
    },
  });

  const { mutate: acceptBid } = api.auction.acceptBid.useMutation({
    onSuccess: async (data) => {
      showMutationToast(data);
      if (data.success) {
        await utils.auction.getBids.invalidate();
      }
    },
  });

  const { mutate: completeBid } = api.auction.completeBid.useMutation({
    onSuccess: async (data) => {
      showMutationToast(data);
      if (data.success) {
        await utils.auction.getBids.invalidate();
      }
    },
  });

  const { mutate: cancelBid } = api.auction.cancelBid.useMutation({
    onSuccess: async (data) => {
      showMutationToast(data);
      if (data.success) {
        await utils.auction.getBids.invalidate();
      }
    },
  });

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
      <div className="p-4">
        {tab === "Request" && (
          <Tabs defaultValue="list" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="list">Browse Requests</TabsTrigger>
              <TabsTrigger value="create">Create Request</TabsTrigger>
            </TabsList>
            <TabsContent value="list">
              <ScrollArea className="h-[600px]">
                <RequestList
                  requests={requestPages?.pages.flatMap((page) => page.data) ?? []}
                  onAccept={(id) => acceptRequest({ requestId: id })}
                  onComplete={(id) => completeRequest({ requestId: id })}
                  isCrafterOrHunter={isCrafterOrHunter}
                />
              </ScrollArea>
            </TabsContent>
            <TabsContent value="create">
              <RequestTab userData={userData} />
            </TabsContent>
          </Tabs>
        )}
        {tab === "Player Shop" && (
          <>
            {selectedShopId ? (
              <ShopDetails
                shopId={selectedShopId}
                onBack={() => setSelectedShopId(null)}
              />
            ) : (
              <Tabs defaultValue="list" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="list">Browse Shops</TabsTrigger>
                  <TabsTrigger value="manage">Manage Shop</TabsTrigger>
                </TabsList>
                <TabsContent value="list">
                  <ScrollArea className="h-[600px]">
                    <ShopList
                      shops={shopPages?.pages.flatMap((page) => page.data) ?? []}
                      onVisit={(id) => setSelectedShopId(id)}
                    />
                  </ScrollArea>
                </TabsContent>
                <TabsContent value="manage">
                  <PlayerShopTab userData={userData} />
                </TabsContent>
              </Tabs>
            )}
          </>
        )}
        {tab === "Bidding Hall" && (
          <Tabs defaultValue="list" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="list">Browse Bids</TabsTrigger>
              <TabsTrigger value="create">Create Bid</TabsTrigger>
            </TabsList>
            <TabsContent value="list">
              <ScrollArea className="h-[600px]">
                <BidList
                  bids={bidPages?.pages.flatMap((page) => page.data) ?? []}
                  onAccept={(id) => acceptBid({ bidId: id })}
                  onComplete={(id) => completeBid({ bidId: id })}
                  onCancel={(id) => cancelBid({ bidId: id })}
                  isModerator={["MODERATOR", "ADMIN"].includes(userData.role)}
                />
              </ScrollArea>
            </TabsContent>
            <TabsContent value="create">
              <BiddingHallTab userData={userData} />
            </TabsContent>
          </Tabs>
        )}
      </div>
    </ContentBox>
  );
}

const RequestList: React.FC<{
  requests: {
    id: string;
    type: AuctionRequestType;
    details: string;
    price: number;
    creatorId: string;
    status: "PENDING" | "ACCEPTED" | "COMPLETED";
    acceptedById?: string;
    createdAt: Date;
  }[];
  onAccept: (requestId: string) => void;
  onComplete: (requestId: string) => void;
  isCrafterOrHunter: boolean;
}> = ({ requests, onAccept, onComplete, isCrafterOrHunter }) => {
  return (
    <div className="space-y-4">
      {requests.map((request) => (
        <div
          key={request.id}
          className="rounded-lg border p-4 shadow-sm dark:border-gray-800"
        >
          <div className="flex items-center justify-between">
            <div>
              <span className="inline-flex items-center rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-700/10 dark:bg-blue-400/10 dark:text-blue-400 dark:ring-blue-400/30">
                {request.type}
              </span>
              <span className="ml-2 inline-flex items-center rounded-md bg-gray-50 px-2 py-1 text-xs font-medium text-gray-600 ring-1 ring-inset ring-gray-500/10 dark:bg-gray-400/10 dark:text-gray-400 dark:ring-gray-400/30">
                {request.status}
              </span>
            </div>
            <div className="text-sm text-gray-500 dark:text-gray-400">
              {new Date(request.createdAt).toLocaleDateString()}
            </div>
          </div>
          <p className="mt-2 text-sm text-gray-700 dark:text-gray-300">
            {request.details}
          </p>
          <div className="mt-4 flex items-center justify-between">
            <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
              {request.price} Ryo
            </div>
            <div className="space-x-2">
              {isCrafterOrHunter && request.status === "PENDING" && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onAccept(request.id)}
                >
                  Accept
                </Button>
              )}
              {request.status === "ACCEPTED" &&
                request.acceptedById === request.creatorId && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onComplete(request.id)}
                  >
                    Complete
                  </Button>
                )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

const ShopList: React.FC<{
  shops: {
    id: string;
    name: string;
    description: string;
    ownerId: string;
    notice?: string;
    createdAt: Date;
  }[];
  onVisit: (shopId: string) => void;
}> = ({ shops, onVisit }) => {
  return (
    <div className="space-y-4">
      {shops.map((shop) => (
        <Card key={shop.id}>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>{shop.name}</span>
              <Button variant="outline" size="sm" onClick={() => onVisit(shop.id)}>
                Visit Shop
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              {shop.description}
            </p>
            {shop.notice && (
              <div className="mt-4 rounded-md bg-yellow-50 p-4 dark:bg-yellow-900/10">
                <p className="text-sm text-yellow-800 dark:text-yellow-200">
                  {shop.notice}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

const BidList: React.FC<{
  bids: {
    id: string;
    name: string;
    description: string;
    reward: {
      type: "ITEM" | "MATERIAL" | "OTHER";
      details: string;
    };
    startingPrice: number;
    closureDate: Date;
    creatorId: string;
    status: "ACTIVE" | "COMPLETED" | "CANCELLED";
    acceptedById?: string;
    createdAt: Date;
  }[];
  onAccept: (bidId: string) => void;
  onComplete: (bidId: string) => void;
  onCancel: (bidId: string) => void;
  isModerator: boolean;
}> = ({ bids, onAccept, onComplete, onCancel, isModerator }) => {
  return (
    <div className="space-y-4">
      {bids.map((bid) => (
        <Card key={bid.id}>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span>{bid.name}</span>
                <Badge
                  variant={
                    bid.status === "ACTIVE"
                      ? "default"
                      : bid.status === "COMPLETED"
                      ? "success"
                      : "destructive"
                  }
                >
                  {bid.status}
                </Badge>
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400">
                Closes {new Date(bid.closureDate).toLocaleDateString()}
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              {bid.description}
            </p>
            <div className="mt-4 flex items-center justify-between">
              <div>
                <Badge variant="outline" className="mr-2">
                  {bid.reward.type}
                </Badge>
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  {bid.reward.details}
                </span>
              </div>
              <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                {bid.startingPrice} Ryo
              </div>
            </div>
            <div className="mt-4 flex justify-end space-x-2">
              {bid.status === "ACTIVE" && !bid.acceptedById && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onAccept(bid.id)}
                >
                  Accept
                </Button>
              )}
              {bid.status === "ACTIVE" && bid.acceptedById && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onComplete(bid.id)}
                >
                  Complete
                </Button>
              )}
              {isModerator && bid.status === "ACTIVE" && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => onCancel(bid.id)}
                >
                  Cancel
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

const RequestTab: React.FC<{ userData: NonNullable<UserWithRelations> }> = ({
  userData,
}) => {
  const utils = api.useUtils();
  const isCrafterOrHunter = ["CRAFTER", "HUNTER"].includes(userData.role);

  const { data: requestPages, fetchNextPage, hasNextPage } = api.auction.getRequests.useInfiniteQuery(
    { limit: 10 },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    }
  );

  const { mutate: acceptRequest } = api.auction.acceptRequest.useMutation({
    onSuccess: async (data) => {
      showMutationToast(data);
      if (data.success) {
        await utils.auction.getRequests.invalidate();
      }
    },
  });

  const { mutate: completeRequest } = api.auction.completeRequest.useMutation({
    onSuccess: async (data) => {
      showMutationToast(data);
      if (data.success) {
        await utils.auction.getRequests.invalidate();
      }
    },
  });

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
