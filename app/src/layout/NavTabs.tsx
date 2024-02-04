import { useEffect } from "react";
import React from "react";

interface NavTabsProps {
  id?: string;
  current: string | null;
  options: string[] | readonly string[];
  fontSize?: "text-xs" | "text-sm" | "text-base";
  setValue: React.Dispatch<React.SetStateAction<any>>;
}

const NavTabs: React.FC<NavTabsProps> = (props) => {
  // Destructure
  const { id, current, options, setValue } = props;

  // If we do not have a current value, get from localStorage or select first one
  useEffect(() => {
    if (!current && id) {
      const select = localStorage.getItem(id) || options[0];
      if (select) {
        setValue(select);
        localStorage.setItem(id, select);
      }
    }
  }, [id, current, options, setValue]);

  // Derived features
  const fontSize = props.fontSize ? props.fontSize : "text-sm";

  // Render
  return (
    <>
      <div
        className={`border-b border-gray-700 text-center ${fontSize} font-medium text-gray-400 flex flex-row items-end`}
      >
        <ul className="-mb-px flex flex-wrap">
          {options.map((option) => (
            <li className="mr-2" key={option}>
              <a
                href="#"
                className={
                  option === current
                    ? "active inline-block rounded-t-lg border-b-2 border-blue-600 pb-4 pt-2 pl-4 pr-4 text-blue-600"
                    : "inline-block rounded-t-lg border-b-2 border-transparent pb-4 pt-2 pl-4 pr-4 hover:border-gray-300 hover:text-gray-600"
                }
                onClick={(e) => {
                  e.preventDefault();
                  setValue(option);
                  if (id) localStorage.setItem(id, option);
                }}
              >
                {option}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
};

export default NavTabs;
