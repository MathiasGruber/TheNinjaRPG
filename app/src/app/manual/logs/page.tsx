"use client";

import ContentBox from "@/layout/ContentBox";
import ActionLogs from "@/layout/ActionLog";
import ActionLogFiltering, {
  useFiltering,
  getFilter,
} from "@/layout/ActionLogFiltering";
import { changelogText } from "@/layout/seoTexts";
import { useUserData } from "@/utils/UserContext";

export default function ActionLog() {
  // Queries
  const { data: userData } = useUserData();

  // Two-level filtering
  const state = useFiltering();

  return (
    <>
      {!userData && (
        <ContentBox
          title="Content Log"
          subtitle="Logs for all changes to the game"
          back_href="/manual"
        >
          {changelogText()}
        </ContentBox>
      )}
      <ActionLogs
        state={getFilter(state)}
        initialBreak={!userData}
        back_href={userData ? "/manual" : undefined}
        topRightContent={<ActionLogFiltering state={state} />}
      />
    </>
  );
}
