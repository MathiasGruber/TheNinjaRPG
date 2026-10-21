"use client";

import { BarChart3, CircleCheckBig, CircleMinus, InfoIcon, Pencil } from "lucide-react";
import { useState } from "react";
import { api } from "@/app/_trpc/client";
import { useLocalStorage } from "@/hooks/localstorage";
import ContentBox from "@/layout/ContentBox";
import { CountsChart, StackedCountsChart } from "@/layout/ContentCompletenessCharts";
import ItemWithEffects from "@/layout/ItemWithEffects";
import Link from "@/layout/Link";
import Loader from "@/layout/Loader";
import Modal from "@/layout/Modal";
import NavTabs from "@/layout/NavTabs";
import Table, { type ColumnDefinitionType } from "@/layout/Table";
import WordCloud from "@/layout/Wordcloud";
import { canChangeContent } from "@/utils/permissions";
import type { ArrayElement } from "@/utils/typeutils";
import { useUserData } from "@/utils/UserContext";

export default function ManualBloodlineBalance() {
  // State
  const availFilters = ["Incomplete", "Diversity"];
  type Tab = (typeof availFilters)[number];
  const [filter, setFilter] = useLocalStorage<Tab>("bloodComplete", "Incomplete", true);

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedBloodlineId, setSelectedBloodlineId] = useState<string>("");

  // User data for permissions
  const { data: userData } = useUserData();

  // Queries
  const { data, isPending } = api.bloodline.getAll.useQuery({ limit: 500 }, {});
  const allBloodlines = data?.data;

  // Bloodline details query for modal
  const { data: bloodlineDetails, isPending: isBloodlineDetailsPending } =
    api.bloodline.get.useQuery(
      { id: selectedBloodlineId },
      { enabled: !!selectedBloodlineId },
    );

  // Check if user can edit bloodlines
  const canEdit = canChangeContent(userData?.role ?? "USER");

  // Table processing
  const processed = allBloodlines
    ?.map((bloodline) => {
      // Checks
      const classification = !bloodline.statClassification ? 1 : 0;
      const effects = bloodline.effects.length === 0 ? 1 : 0;
      const description = bloodline.description.length < 50 ? 1 : 0;
      const total = classification + effects + description;
      // Return summary

      return {
        name: bloodline.name,
        links: (
          <div className="flex items-center gap-2">
            <Link href={`/manual/bloodline/statistics/${bloodline.id}`}>
              <BarChart3 className="h-4 w-4 text-muted-foreground hover:text-primary" />
            </Link>
            {canEdit && (
              <Link href={`/manual/bloodline/edit/${bloodline.id}`}>
                <Pencil className="h-4 w-4 text-muted-foreground hover:text-primary" />
              </Link>
            )}
            <InfoIcon
              className="h-4 w-4 text-muted-foreground hover:text-primary"
              onClick={() => {
                setSelectedBloodlineId(bloodline.id);
                setIsModalOpen(true);
              }}
            />
          </div>
        ),
        classification: classification ? (
          <CircleMinus className="h-4 w-4 text-red-500" />
        ) : (
          <CircleCheckBig className="h-4 w-4 text-green-500" />
        ),
        effects: effects ? (
          <CircleMinus className="h-4 w-4 text-red-500" />
        ) : (
          <CircleCheckBig className="h-4 w-4 text-green-500" />
        ),
        description: description ? (
          <CircleMinus className="h-4 w-4 text-red-500" />
        ) : (
          <CircleCheckBig className="h-4 w-4 text-green-500" />
        ),
        total: total,
      };
    })
    .sort((a, b) => b.total - a.total);

  // Table
  type Row = ArrayElement<typeof processed>;
  const columns: ColumnDefinitionType<Row, keyof Row>[] = [
    { key: "name", header: "Bloodline", type: "string" },
    { key: "links", header: "Links", type: "jsx" },
    { key: "classification", header: "Classification", type: "jsx" },
    { key: "effects", header: "Effects", type: "jsx" },
    { key: "description", header: "Description", type: "jsx" },
  ];

  // Counts per classification
  const classCounts = allBloodlines?.reduce<Record<string, number>>((acc, curr) => {
    const key = curr.statClassification || "N/A";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  // Counts per rank
  const rankCounts = allBloodlines?.reduce<Record<string, number>>((acc, curr) => {
    const key = curr.rank || "N/A";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  // Counts per effect type and calculation (for stacked bar chart)
  const effectTypeCalculationCounts = allBloodlines?.reduce<
    Record<string, Record<string, number>>
  >((acc, bloodline) => {
    bloodline.effects.forEach((effect) => {
      const effectType = effect.type;
      const calculation = effect.calculation || "static";

      if (!acc[effectType]) {
        acc[effectType] = {};
      }
      acc[effectType][calculation] = (acc[effectType][calculation] || 0) + 1;
    });
    return acc;
  }, {});

  // Sort effect types by total count (descending)
  const sortedEffectTypeCalculationCounts = effectTypeCalculationCounts
    ? Object.fromEntries(
        Object.entries(effectTypeCalculationCounts)
          .map(([effectType, calculations]) => ({
            effectType,
            calculations,
            total: Object.values(calculations).reduce((sum, count) => sum + count, 0),
          }))
          .sort((a, b) => b.total - a.total)
          .map(({ effectType, calculations }) => [effectType, calculations]),
      )
    : undefined;

  // Wordcloud
  const allText = allBloodlines?.map((b) => b.description).join(" ");

  return (
    <>
      <ContentBox
        title="Completeness"
        subtitle="Missing information etc."
        defaultBackHref="/manual/bloodline"
        padding={false}
        topRightContent={
          <NavTabs current={filter} options={availFilters} setValue={setFilter} />
        }
      >
        <p className="p-3">
          The aim of this overview is to highlight any missing information in content,
          such that we can ensure that content is complete & diverse.
        </p>
        {isPending && <Loader explanation="Loading data" />}
        {!isPending && filter === "Incomplete" && (
          <Table data={processed} columns={columns} />
        )}
        {!isPending && filter === "Diversity" && (
          <div className="p-3">
            <p className="bold text-xl">Description Wordcloud</p>
            <WordCloud text={allText} />
            <p className="bold text-xl">Classifications</p>
            <CountsChart data={classCounts} />
            <p className="bold text-xl">Ranking</p>
            <CountsChart data={rankCounts} />
            <p className="bold text-xl">Effect Types</p>
            <StackedCountsChart data={sortedEffectTypeCalculationCounts} />
          </div>
        )}
      </ContentBox>

      {/* Bloodline Details Modal */}
      <Modal
        title="Bloodline Details"
        isOpen={isModalOpen}
        setIsOpen={setIsModalOpen}
        proceed_label={null}
      >
        {isBloodlineDetailsPending ? (
          <Loader explanation="Loading bloodline details" />
        ) : (
          bloodlineDetails && (
            <ItemWithEffects item={bloodlineDetails} showStatistic="bloodline" />
          )
        )}
      </Modal>
    </>
  );
}
