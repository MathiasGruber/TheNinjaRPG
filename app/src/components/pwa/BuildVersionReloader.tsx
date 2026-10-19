"use client";

import { useEffect } from "react";
import { reloadIfOutdated } from "@/libs/buildVersion";
import { usePublicPathname } from "@/utils/routing";

/**
 * Once a tRPC response shows the server running a newer deploy than this tab's bundle,
 * the next route change loads the new page in full instead of rendering it with the old
 * code. The user is already leaving the current page, so nothing in progress is lost.
 */
export const BuildVersionReloader = () => {
  const pathname = usePublicPathname();
  useEffect(() => {
    if (pathname) reloadIfOutdated();
  }, [pathname]);
  return null;
};
