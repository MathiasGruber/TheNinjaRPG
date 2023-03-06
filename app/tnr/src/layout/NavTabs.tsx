import React from "react";

interface NavTabsProps {
  current: string;
  options: string[];
  setValue: React.Dispatch<React.SetStateAction<string>>;
}

const NavTabs: React.FC<NavTabsProps> = (props) => {
  return (
    <>
      <div className="border-b border-gray-700 text-center text-sm font-medium text-gray-400">
        <ul className="-mb-px flex flex-wrap">
          {props.options.map((option) => (
            <li className="mr-2" key={option}>
              <a
                href="#"
                className={
                  option === props.current
                    ? "active inline-block rounded-t-lg border-b-2 border-blue-600 p-4 text-blue-600"
                    : "inline-block rounded-t-lg border-b-2 border-transparent p-4 hover:border-gray-300 hover:text-gray-600"
                }
                onClick={(e) => {
                  e.preventDefault();
                  props.setValue(option);
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
