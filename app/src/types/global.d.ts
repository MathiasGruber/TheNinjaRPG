declare global {
  namespace NodeJS {
    interface ProcessEnv {
      AWS_S3_BUCKET_NAME: string;
      AWS_ACCESS_KEY_ID: string;
      AWS_REGION: string;
      DATABASE_URL: string;
      DISCORD_CONTENT_UPDATES: string;
      DISCORD_NEWS_UPDATES: string;
      AWS_SECRET_ACCESS_KEY: string;
      REPLICATE_API_TOKEN: string;
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
      NEXT_PUBLIC_HIGHLIGHT_IO_PROJECT_ID: string;
    }
  }
}

// We must export something for it to be a module
export {};
