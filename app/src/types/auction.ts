export type AuctionRequestType = "CRAFT" | "REPAIR";

export interface AuctionRequest {
  id: string;
  type: AuctionRequestType;
  details: string;
  price: number;
  creatorId: string;
  createdAt: Date;
  status: "PENDING" | "ACCEPTED" | "COMPLETED";
  acceptedById?: string;
}

export interface PlayerShop {
  id: string;
  name: string;
  description: string;
  ownerId: string;
  createdAt: Date;
  notice?: string;
}

export interface ShopItem {
  id: string;
  shopId: string;
  itemId: string;
  price: number;
  quantity: number;
}

export interface Bid {
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
}
