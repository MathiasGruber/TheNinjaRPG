export { reportWebVitals } from "next-axiom";
import { ClerkProvider, MultisessionAppSupport } from "@clerk/nextjs";
import { HighlightInit } from "@highlight-run/next/client";
import { ErrorBoundary } from "@highlight-run/react";
import Link from "next/link";
import Header from "../layout/Header";
import CookieConsent from "react-cookie-consent";
import { ToastContainer } from "react-toastify";
import { type AppType } from "next/app";

import { api } from "../utils/api";
import Layout from "../layout/Layout";

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
      <Header />
      <ToastContainer />
      <CookieConsent>
        This website uses cookies to enhance the user experience. Please read our{" "}
        <Link href="/policy" className="text-amber-500 font-bold">
          Privacy Policy
        </Link>{" "}
        before continuing.
      </CookieConsent>
      <HighlightInit
        projectId={process.env.NEXT_PUBLIC_HIGHLIGHT_IO_PROJECT_ID}
        serviceName="tnr-frontend"
        enableStrictPrivacy={true}
        reportConsoleErrors={true}
        enablePerformanceRecording={true}
        networkRecording={{
          enabled: true,
          recordHeadersAndBody: true,
          urlBlocklist: [],
        }}
      />
      <ErrorBoundary>
        <MultisessionAppSupport>
          <Layout>
            <Component {...pageProps} />
          </Layout>
        </MultisessionAppSupport>
      </ErrorBoundary>
    </ClerkProvider>
  );
};

export default api.withTRPC(MyApp);
