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
      {cookieConsent === "true" && (
        <Script id="google-tag-manager" strategy="afterInteractive">
          {`
        (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
        new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
        j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
        'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
        })(window,document,'script','dataLayer','${env.NEXT_PUBLIC_MEASUREMENT_ID}');
        `}
        </Script>
      )}
      <Header />
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
