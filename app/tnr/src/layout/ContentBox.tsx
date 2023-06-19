import React from "react";
import Link from "next/link";
import { ChevronDoubleLeftIcon } from "@heroicons/react/24/solid";

interface ContentBoxProps {
  children: React.ReactNode;
  title: string;
  back_href?: string;
  subtitle?: string;
  topRightCorntentBreakpoint?: "sm" | "md" | "lg" | "xl" | "2xl";
  topRightContent?: React.ReactNode;
  padding?: boolean;
  initialBreak?: boolean;
}

const ContentBox: React.FC<ContentBoxProps> = (props) => {
  return (
    <>
      {props.initialBreak && <div className="h-4"></div>}
      <div className="sm:container">
        <div
          className={`flex ${
            props.topRightCorntentBreakpoint
              ? `flex-col ${props.topRightCorntentBreakpoint}:flex-row ${props.topRightCorntentBreakpoint}:items-center`
              : "flex-row items-center"
          }`}
        >
          <div>
            <h2 className="text-2xl font-bold text-orange-900">
              {props.back_href ? (
                <Link
                  className="ml-1 flex flex-row items-center hover:text-orange-700"
                  href={props.back_href}
                >
                  <ChevronDoubleLeftIcon className="h-6 w-6" />
                  {props.title}
                </Link>
              ) : (
                <div>{props.title}</div>
              )}
            </h2>

            {props.subtitle && <h3 className=" text-orange-900">{props.subtitle}</h3>}
          </div>
          <div className="grow"></div>
          <div>{props.topRightContent}</div>
        </div>

        <div
          className={`relative border-2 border-double border-amber-900 bg-amber-50 shadow-lg ${
            props.padding === undefined || props.padding ? "p-3" : ""
          }`}
        >
          {props.children}
        </div>
      </div>
    </>
  );
};

export default ContentBox;
