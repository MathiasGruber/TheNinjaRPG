"use client";

import ActionLogs from "@/layout/ActionLog";
import ActionLogFiltering, {
  useFiltering,
  getFilter,
} from "@/layout/ActionLogFiltering";

export default function ActionLog() {
  // Two-level filtering
  const state = useFiltering();

  return (
    <ActionLogs
      state={getFilter(state)}
      back_href="/manual"
      topRightContent={<ActionLogFiltering state={state} />}
    />
  );
}
