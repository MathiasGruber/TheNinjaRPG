import React from "react";

interface ContentBoxProps {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
}

const ContentBox: React.FC<ContentBoxProps> = (props) => {
  return (
    <>
      <div className="mb-5 sm:container">
        <h2 className="text-2xl font-bold text-orange-900">{props.title}</h2>
        {props.subtitle && (
          <h3 className=" text-orange-900">{props.subtitle}</h3>
        )}
        <div className="border-2 border-double border-amber-900 bg-amber-50 p-3 shadow-lg">
          {props.children}
        </div>
      </div>
    </>
  );
};

export default ContentBox;
