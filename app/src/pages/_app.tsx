import { AxiomWebVitals } from "next-axiom";
import { ClerkProvider } from "@clerk/nextjs";
import { HighlightInit } from "@highlight-run/next/client";
import { ErrorBoundary } from "@highlight-run/react";
import { GoogleTagManager } from "@next/third-parties/google";
import { UserContextProvider } from "@/utils/UserContext";
import { Toaster } from "@/components/ui/toaster";
import Header from "@/layout/Header";
import { env } from "@/env/client.mjs";
import { api } from "@/utils/api";
import Layout from "@/layout/Layout";
import type { AppType } from "next/app";

import "@uploadthing/react/styles.css";
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
      <UserContextProvider>
        <Header />
        <GoogleTagManager gtmId={env.NEXT_PUBLIC_MEASUREMENT_ID} />
        <Toaster />
        <AxiomWebVitals />
        <HighlightInit
          projectId={process.env.NEXT_PUBLIC_HIGHLIGHT_IO_PROJECT_ID}
          serviceName="tnr-frontend"
          tracingOrigins
          privacySetting="default"
          reportConsoleErrors={true}
          environment={process.env.NODE_ENV}
          networkRecording={{
            enabled: true,
            recordHeadersAndBody: true,
            urlBlocklist: [],
          }}
        />
        <ErrorBoundary showDialog={false}>
          <Layout>
            <Component {...pageProps} />
          </Layout>
        </ErrorBoundary>
      </UserContextProvider>
    </ClerkProvider>
  );
};

export default api.withTRPC(MyApp);
