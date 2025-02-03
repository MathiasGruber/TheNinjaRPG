"use client";

import React from "react";
import Link from "next/link";
import { ChevronsLeft } from "lucide-react";

export interface ContentBoxProps {
  children: React.ReactNode;
  title: string;
  back_href?: string;
  subtitle?: string | React.ReactNode;
  topRightCorntentBreakpoint?: "sm" | "md" | "lg" | "xl" | "2xl";
  topRightContent?: React.ReactNode;
  bottomRightContent?: React.ReactNode;
  padding?: boolean;
  noBorder?: boolean;
  initialBreak?: boolean;
  noRightAlign?: boolean;
  alreadyHasH1?: boolean;
  onBack?: () => void;
}

const ContentBox: React.FC<ContentBoxProps> = (props) => {
  // Title to be shown
  const title = props.back_href ? (
    <Link
      className="ml-1 flex flex-row items-center hover:text-orange-700"
      onClick={() => props.onBack && props.onBack()}
      href={props.back_href}
      suppressHydrationWarning
    >
      <ChevronsLeft className="h-6 w-6" />
      {props.title}
    </Link>
  ) : (
    <div suppressHydrationWarning>{props.title}</div>
  );
  // Show the content box
  return (
    <>
      {props.initialBreak && <div className="h-4"></div>}
      <div className="sm:container">
        <div
          className={`flex  ${
            props.topRightCorntentBreakpoint
              ? `flex-col ${props.topRightCorntentBreakpoint}:flex-row ${props.topRightCorntentBreakpoint}:items-center`
              : "flex-row items-center"
          }`}
        >
          <div className="self-start">
            {props.initialBreak || props.alreadyHasH1 ? (
              <h2 className="text-2xl font-bold text-background-foreground">{title}</h2>
            ) : (
              <h1 className="text-2xl font-bold text-background-foreground">{title}</h1>
            )}
            {props.subtitle && !props.initialBreak && !props.alreadyHasH1 && (
              <h2 className=" text-background-foreground" suppressHydrationWarning>
                {props.subtitle}
              </h2>
            )}
            {props.subtitle && (props.initialBreak || props.alreadyHasH1) && (
              <h3 className=" text-background-foreground" suppressHydrationWarning>
                {props.subtitle}
              </h3>
            )}
          </div>
          <div className="flex flex-row grow">
            {!props.noRightAlign && <div className="grow "></div>}
            <div className={props.noRightAlign ? "grow " : ""}>
              {props.topRightContent}
            </div>
          </div>
        </div>

        <div
          className={`relative ${!props.noBorder ? "border-2 border-double" : ""} bg-card shadow-lg ${
            props.padding === undefined || props.padding ? "p-3" : ""
          } text-card-foreground`}
        >
          {props.children}
        </div>
      </div>
      {props.bottomRightContent && (
        <div className="mt-2">
          <div className="flex flex-row justify-end">{props.bottomRightContent}</div>
        </div>
      )}
    </>
  );
};

export default ContentBox;
