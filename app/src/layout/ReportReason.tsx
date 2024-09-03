import React from "react";
import type { UserReport } from "../../drizzle/schema";
import { parseHtml } from "@/utils/parse";

const ParsedReportJson: React.FC<{ report: Omit<UserReport, "reporterUserId"> }> = (
  props,
) => {
  return (
    <div>
      <b>Report Reason:</b> {parseHtml(props.report.reason)}
      <br />
      {props.report.infraction?.hasOwnProperty("title") && (
        <div>
          <b>Reported Title:</b>
          <hr />
          {parseHtml((props.report.infraction as { title: string }).title)}
          <br />
          <br />
        </div>
      )}
      {props.report.infraction?.hasOwnProperty("summary") && (
        <div>
          <b>Reported Summary:</b>
          <hr />
          {parseHtml((props.report.infraction as { summary: string }).summary)}
          <br />
          <br />
        </div>
      )}
      {props.report.infraction?.hasOwnProperty("content") && (
        <div>
          <b>Reported Content:</b>
          <hr />
          {parseHtml((props.report.infraction as { content: string }).content)}
        </div>
      )}
      {props.report.infraction?.hasOwnProperty("image") && (
        <div>
          <b>Image:</b>
          <hr />
          <img
            src={(props.report.infraction as { image: string }).image}
            width="100%"
            alt="ReportingImage"
          />
        </div>
      )}
      <br />
      <b>System:</b> {props.report.system}
      <br />
      <b>Report time</b> {props.report.createdAt.toLocaleDateString()}
    </div>
  );
};

export default ParsedReportJson;
