"use client";

import { useState } from "react";
import NavTabs from "@/layout/NavTabs";
import ActionLogs from "@/layout/ActionLog";

export default function ActionLog() {
  const tabNames = [
    "ai",
    "user",
    "jutsu",
    "bloodline",
    "item",
    "badge",
    "clan",
  ] as const;
  const [activeTab, setActiveTab] = useState<(typeof tabNames)[number]>("ai");

  return (
    <ActionLogs
      table={activeTab}
      back_href="/manual"
      topRightContent={
        <NavTabs
          fontSize="text-xs"
          current={activeTab}
          options={Object.values(tabNames)}
          setValue={setActiveTab}
        />
      }
    />
  );
}
