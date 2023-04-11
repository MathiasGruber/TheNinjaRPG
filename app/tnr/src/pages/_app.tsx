import { ClerkProvider } from "@clerk/nextjs";
import { type AppType } from "next/app";

import { api } from "../utils/api";
import Layout from "../layout/Layout";

import "../styles/globals.css";

const MyApp: AppType = ({ Component, pageProps }) => {
  return (
    <ClerkProvider
      {...pageProps}
      appearance={{
        variables: {
          colorPrimary: "#ce7e00",
          colorText: "black",
        },
      }}
    >
      <Layout>
        <Component {...pageProps} />
      </Layout>
    </ClerkProvider>
  );
};

export default api.withTRPC(MyApp);
