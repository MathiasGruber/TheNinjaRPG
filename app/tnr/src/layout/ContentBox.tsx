import React from "react";
import Link from "next/link";
import IconChevronLeft from "./IconChevronLeft";

interface ContentBoxProps {
  children: React.ReactNode;
  title: string;
  back_href?: string;
  subtitle?: string;
  topRightContent?: React.ReactNode;
}

const ContentBox: React.FC<ContentBoxProps> = (props) => {
  return (
    <>
      <div className="mb-5 sm:container">
        <div className="flex flex-row items-end">
          <div>
            <h2 className="text-2xl font-bold text-orange-900">
              {props.back_href ? (
                <div className="flex flex-row items-center ">
                  <IconChevronLeft />
                  <Link
                    className="ml-1 hover:text-orange-700"
                    href={props.back_href}
                  >
                    {props.title}
                  </Link>
                </div>
              ) : (
                <div>{props.title}</div>
              )}
            </h2>

            {props.subtitle && (
              <h3 className=" text-orange-900">{props.subtitle}</h3>
            )}
          </div>
          <div className="grow"></div>
          <div>{props.topRightContent}</div>
        </div>

        <div className="border-2 border-double border-amber-900 bg-amber-50 p-3 shadow-lg">
          {props.children}
        </div>
      </div>
    </>
  );
};

export default ContentBox;
