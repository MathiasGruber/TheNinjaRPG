declare global {
  namespace NodeJS {
    interface ProcessEnv {
      DATABASE_URL: string;
      DISCORD_TICKETS: string;
      DISCORD_CONTENT_UPDATES: string;
      DISCORD_NEWS_UPDATES: string;
      REPLICATE_API_TOKEN: string;
      CAPTCHA_SALT: string;
      PUSHER_APP_ID: string;
      PUSHER_APP_SECRET: string;
      NEXT_PUBLIC_PUSHER_APP_KEY: string;
      NEXT_PUBLIC_PUSHER_APP_CLUSTER: string;
      PAYPAL_CLIENT_SECRET: string;
      NEXT_PUBLIC_PAYPAL_URL: string;
      NEXT_PUBLIC_PAYPAL_CLIENT_ID: string;
      NEXT_PUBLIC_PAYPAL_PLAN_ID_NORMAL: string;
      NEXT_PUBLIC_PAYPAL_PLAN_ID_SILVER: string;
      NEXT_PUBLIC_PAYPAL_PLAN_ID_GOLD: string;
      NEXT_PUBLIC_BASE_URL: string;
    }
  }
}

declare module "@g-loot/react-tournament-brackets";

// We must export something for it to be a module
export {};
