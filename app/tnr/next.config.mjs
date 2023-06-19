import bundleAnalyzer from "@next/bundle-analyzer";
import {withAxiom} from "next-axiom";

// @ts-check
/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation.
 * This is especially useful for Docker builds.
 */
!process.env.SKIP_ENV_VALIDATION && (await import("./src/env/server.mjs"));

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

/** @type {import("next").NextConfig} */
const config = {
  reactStrictMode: false,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "theninja-user-uploads.s3.amazonaws.com",
      },
      {
        protocol: "https",
        hostname: "theninja-user-uploads.s3.us-west-2.amazonaws.com",
      },
    ],
  },
  /* If trying out the experimental appDir, comment the i18n config out
   * @see https://github.com/vercel/next.js/issues/41980 */
  i18n: {
    locales: ["en"],
    defaultLocale: "en",
  },
};
export default withAxiom(withBundleAnalyzer(config));
