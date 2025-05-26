// This file configures the initialization of Sentry on the client.
// The config you add here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: "https://c35c54f99b73b4a3b8a7e60936bc2967@o4507797256601600.ingest.de.sentry.io/4507797262958672",

  // Replay may only be enabled for the client-side
  integrations: [
    Sentry.replayIntegration({ maskAllText: false, blockAllMedia: false }),
  ],

  // Adjust this value in production, or use tracesSampler for greater control
  tracesSampleRate: 0.001,

  // Which errors to ignore from frontend
  ignoreErrors: [
    "window.ethereum",
    "ClerkJS: Token refresh failed",
    "Converting circular structure to JSON",
    "Uncaught NetworkError: Failed to execute 'importScripts' on 'WorkerGlobalScope'",
    "CanvasRenderingContext2D.setTransform",
    "Java bridge method invocation error",
    "Failed to execute 'removeChild' on 'Node': The node to be removed is not a child of this node.",
    "GME Provider is disconnected or locked", // timeout error
    "Connection closed", // timeout error
  ],

  // Only enable Sentry in production
  enabled: process.env.NODE_ENV !== "development",

  // Only on production URLs
  // allowUrls: [/https?:\/\/(www\.)?theninja-rpg\.com.*/],

  /**
   * @function ReplaySessions/Errors
   * @description Captures Replay for 0% of all session, and 100% session with an Error
   */
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 1.0,

  // Setting this option to true will print useful information to the console while you're setting up Sentry.
  debug: false,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
