declare global {
  namespace NodeJS {
    interface ProcessEnv {
      AWS_S3_BUCKET_NAME: string;
      AWS_ACCESS_KEY_ID: string;
      AWS_REGION: string;
      AWS_SECRET_ACCESS_KEY: string;
      REPLICATE_API_TOKEN: string;
      PUSHER_APP_ID: string;
      PUSHER_APP_SECRET: string;
      NEXT_PUBLIC_PUSHER_APP_KEY: string;
      NEXT_PUBLIC_PUSHER_APP_CLUSTER: string;
      PAYPAL_CLIENT_SECRET: string;
      NEXT_PUBLIC_PAYPAL_CLIENT_ID: string;
      NEXT_PUBLIC_PAYPAL_PLAN_ID_NORMAL: string;
      NEXT_PUBLIC_PAYPAL_PLAN_ID_SILVER: string;
      NEXT_PUBLIC_PAYPAL_PLAN_ID_GOLD: string;
    }
  }
}

// We must export something for it to be a module
export {};
