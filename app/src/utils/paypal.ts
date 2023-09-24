import type { FederalStatus } from "../../drizzle/schema";

export const reps2dollars = (reps: number) => {
  return Math.ceil(Math.pow(reps, 1 / 1.305) * 10) / 10;
};

export const dollars2reps = (dollars: number) => {
  return Math.round(Math.pow(dollars, 1.305));
};

export const calcFedUgradeCost = (a: FederalStatus, b: FederalStatus) => {
  let cost: number | null = null;
  if (a === "NORMAL") {
    if (b === "SILVER") {
      cost = 20;
    } else if (b === "GOLD") {
      cost = 40;
    }
  } else if (a === "SILVER" && b === "GOLD") {
    cost = 20;
  }
  return cost;
};

export const plan2FedStatus = (planId: string) => {
  switch (planId) {
    case process.env.NEXT_PUBLIC_PAYPAL_PLAN_ID_NORMAL:
      return "NORMAL";
    case process.env.NEXT_PUBLIC_PAYPAL_PLAN_ID_SILVER:
      return "SILVER";
    case process.env.NEXT_PUBLIC_PAYPAL_PLAN_ID_GOLD:
      return "GOLD";
    default:
      return "NONE";
  }
};

export const fedStatusToPlan = (status: FederalStatus) => {
  switch (status) {
    case "NORMAL":
      return process.env.NEXT_PUBLIC_PAYPAL_PLAN_ID_NORMAL;
    case "SILVER":
      return process.env.NEXT_PUBLIC_PAYPAL_PLAN_ID_SILVER;
    case "GOLD":
      return process.env.NEXT_PUBLIC_PAYPAL_PLAN_ID_GOLD;
    default:
      return null;
  }
};
