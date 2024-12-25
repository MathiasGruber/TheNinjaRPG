"use client";

/**
 * Adapted from: https://github.com/vercel/next.js/blob/canary/packages/third-parties/src/google/gtm.tsx
 * Modified to use partytown for performance reasons and lighthouse scores
 *
 * TODO: At some point this is likely in the native nextjs package, and can be swapped back
 */

import React from "react";
import Script from "next/script";

type JSONValue = string | number | boolean | JSONValue[] | { [key: string]: JSONValue };

export type GTMParams = {
  gtmId: string;
  gtmScriptUrl?: string;
  dataLayer?: Record<string, JSONValue>;
  dataLayerName?: string;
  auth?: string;
  preview?: string;
  nonce?: string;
};

let currDataLayerName = "dataLayer";

export function GoogleTagManager(props: GTMParams) {
  const {
    gtmId,
    gtmScriptUrl = "https://www.googletagmanager.com/gtm.js",
    dataLayerName = "dataLayer",
    auth,
    preview,
    dataLayer,
    nonce,
  } = props;

  currDataLayerName = dataLayerName;

  const gtmLayer = dataLayerName !== "dataLayer" ? `&l=${dataLayerName}` : "";
  const gtmAuth = auth ? `&gtm_auth=${auth}` : "";
  const gtmPreview = preview ? `&gtm_preview=${preview}&gtm_cookies_win=x` : "";

  return (
    <>
      <script
        data-partytown-config
        dangerouslySetInnerHTML={{
          __html: `
            partytown = {
                lib: "/_next/static/~partytown/",
                forward: ["${dataLayerName}"]           
            };
            `,
        }}
      />
      <Script
        id="_next-gtm-init"
        strategy="worker"
        dangerouslySetInnerHTML={{
          __html: `
      (function(w,l){
        w[l]=w[l]||[];
        w[l].push({'gtm.start': new Date().getTime(),event:'gtm.js'});
        ${dataLayer ? `w[l].push(${JSON.stringify(dataLayer)})` : ""}
      })(window,'${dataLayerName}');`,
        }}
        nonce={nonce}
      />
      <Script
        id="_next-gtm"
        data-ntpc="GTM"
        strategy="worker"
        src={`${gtmScriptUrl}?id=${gtmId}${gtmLayer}${gtmAuth}${gtmPreview}`}
        nonce={nonce}
      />
    </>
  );
}

// eslint-disable-next-line @typescript-eslint/no-wrapper-object-types
export const sendGTMEvent = (data: Object, dataLayerName?: string) => {
  // special case if we are sending events before GTM init and we have custom dataLayerName
  const dataLayer = dataLayerName || currDataLayerName;
  // define dataLayer so we can still queue up events before GTM init
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  window[dataLayer] = window[dataLayer] || [];
  // eslint-disable-next-line
  window[dataLayer].push(data);
};
