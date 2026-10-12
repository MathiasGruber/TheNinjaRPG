"use client";
import ContentBox from "@/layout/ContentBox";
import { QuestTeams } from "@/layout/QuestTeams";

export default function QuestTeamsPage() {
  return (
    <ContentBox title="Quest Teams" subtitle="Explore Seichi together" padding={false}>
      <QuestTeams />
    </ContentBox>
  );
}
