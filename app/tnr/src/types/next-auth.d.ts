import { type DefaultSession, type DefaultUser } from "next-auth";

declare module "next-auth" {
  /**
   * Returned by `useSession`, `getSession` and received as a prop on the `SessionProvider` React Context
   */
  interface Session {
    user?: {
      id: string;
      role: string;
      isBanned: boolean;
    } & DefaultSession["user"];
  }
  interface User extends DefaultUser {
    role: string;
    isBanned: boolean;
  }
}

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
