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
        <div className="py-5">
          <b>Reported Title:</b>
          <hr />
          {parseHtml((props.report.infraction as { title: string }).title)}
          <br />
          <br />
        </div>
      )}
      {props.report.infraction?.hasOwnProperty("summary") && (
        <div className="py-5">
          <b>Reported Summary:</b>
          <hr />
          {parseHtml((props.report.infraction as { summary: string }).summary)}
          <br />
          <br />
        </div>
      )}
      {props.report.infraction?.hasOwnProperty("content") && (
        <div className="py-5">
          <b>Reported Content:</b>
          <hr />
          {parseHtml((props.report.infraction as { content: string }).content)}
        </div>
      )}
      {props.report.infraction?.hasOwnProperty("image") && (
        <div className="py-5">
          <b>Image:</b>
          <hr />
          <img
            src={(props.report.infraction as { image: string }).image}
            width="100%"
            alt="ReportingImage"
          />
        </div>
      )}
      <b>System:</b> {props.report.system}
      <br />
      <b>Report time</b> {props.report.createdAt.toLocaleString()}
      <br />
      <b>Report ID</b> {props.report.id}
    </div>
  );
};

export default ParsedReportJson;
