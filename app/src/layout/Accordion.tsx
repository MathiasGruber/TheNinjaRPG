import React from "react";
import { ChevronsDown } from "lucide-react";
import { cn } from "src/libs/shadui";

interface AccordionProps {
  title: string;
  className?: string;
  selectedTitle: string;
  titlePrefix?: string;
  titlePostfix?: string;
  unselectedSubtitle?: string | React.ReactNode;
  selectedSubtitle?: string | React.ReactNode;
  children: string | React.ReactNode;
  options?: React.ReactNode;
  onClick: React.Dispatch<React.SetStateAction<string>>;
}

const Accordion: React.FC<AccordionProps> = (props) => {
  const { title, titlePrefix, titlePostfix } = props;
  const { unselectedSubtitle, selectedSubtitle, children, onClick } = props;

  const active = title === props.selectedTitle;
  return (
    <div
      className={cn(
        "border-b-2 px-3 py-1",
        props.className,
        active ? "" : "hover:bg-popover hover:cursor-pointer",
      )}
      onClick={() => !active && onClick(active ? "" : title)}
    >
      <div className="flex flex-row items-center">
        <div>
          <h2 className="font-bold mt-2">
            {titlePrefix}
            {title}
            {titlePostfix}
          </h2>
          <div className="italic">
            {active && selectedSubtitle}
            {!active && unselectedSubtitle}
          </div>
        </div>
        <div className="grow"></div>
        <div className="flex flex-row items-center">
          {props.options}
          <ChevronsDown
            className={`h-6 w-6 hover:cursor-pointer hover:text-orange-500 ${
              active ? "transform rotate-90" : ""
            }`}
            onClick={() => onClick(active ? "" : title)}
          />
        </div>
      </div>
      {active && children}
    </div>
  );
};

export default Accordion;
