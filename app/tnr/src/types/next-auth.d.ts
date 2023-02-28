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
      AWS_S3_ACCESS_KEY_ID: string;
      AWS_S3_SECRET_ACCESS_KEY: string;
      REPLICATE_API_TOKEN: string;
    }
  }
}
