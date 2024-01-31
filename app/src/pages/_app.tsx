import { AxiomWebVitals } from "next-axiom";
import { ClerkProvider } from "@clerk/nextjs";
import { HighlightInit } from "@highlight-run/next/client";
import { ErrorBoundary } from "@highlight-run/react";
import Link from "next/link";
import Script from "next/script";
import Header from "@/layout/Header";
import CookieConsent, { getCookieConsentValue } from "react-cookie-consent";
import { ToastContainer } from "react-toastify";
import { type AppType } from "next/app";

import { env } from "@/env/client.mjs";
import { api } from "@/utils/api";
import Layout from "@/layout/Layout";

import "@uploadthing/react/styles.css";
import "../styles/globals.css";

const MyApp: AppType = ({ Component, pageProps }) => {
  const cookieConsent = getCookieConsentValue("TNR-cookie-conscent");

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
      {cookieConsent === "true" && (
        <>
          <Script
            strategy="afterInteractive"
            src={`https://www.googletagmanager.com/gtag/js?id=${env.NEXT_PUBLIC_MEASUREMENT_ID}`}
          />
          <Script
            id="google-tag-manager"
            strategy="afterInteractive"
            dangerouslySetInnerHTML={{
              __html: `window.dataLayer = window.dataLayer || []; function gtag(){dataLayer.push(arguments);} gtag('js', new Date()); gtag('config', '${env.NEXT_PUBLIC_MEASUREMENT_ID}', {page_path: window.location.pathname});`,
            }}
          />
        </>
      )}
      <ToastContainer />
      <CookieConsent cookieName="TNR-cookie-conscent">
        This website uses cookies to enhance the user experience. Please read our{" "}
        <Link href="/policy" className="text-amber-500 font-bold">
          Privacy Policy
        </Link>{" "}
        before continuing.
      </CookieConsent>
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
    </ClerkProvider>
  );
};

export default api.withTRPC(MyApp);
