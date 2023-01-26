import React, { useState } from "react";
import Link from "next/link";
import {
  ShieldExclamationIcon,
  InformationCircleIcon,
  ShieldCheckIcon,
} from "@heroicons/react/24/outline";
import type { NavBarDropdownLink } from "../libs/menus";

interface NavBarDropdownProps {
  icon: React.ReactNode;
  topElement?: React.ReactNode;
  topElementLink?: string;
  position: "left" | "right";
  links?: NavBarDropdownLink[];
}

const NavBarDropdown: React.FC<NavBarDropdownProps> = (props) => {
  const [open, setOpen] = useState<boolean>(false);
  return (
    <div className="relative z-50 inline-block">
      <button onClick={() => setOpen(!open)}>{props.icon}</button>

      {open && (
        <div
          className={`dropdown-menu origin-top-${props.position} -translate-y-2 scale-95 transform transition-all duration-300`}
        >
          <div
            className={`absolute ${props.position}-0 mt-2 w-56 origin-top-${props.position} divide-y divide-gray-100 rounded-md border border-gray-200 bg-white shadow-lg outline-none`}
          >
            {props.topElementLink ? (
              <Link href={props.topElementLink} onClick={() => setOpen(false)}>
                {props.topElement}
              </Link>
            ) : (
              <div>{props.topElement}</div>
            )}

            {props.links?.map((link) => {
              if (!link.icon && link.color) {
                if (link.color === "red") {
                  link.icon = <ShieldExclamationIcon className="mr-2 h-6 w-6" />;
                } else if (link.color === "blue") {
                  link.icon = <InformationCircleIcon className="mr-2 h-6 w-6" />;
                } else if (link.color === "green") {
                  link.icon = <ShieldCheckIcon className="mr-2 h-6 w-6" />;
                }
              }
              return (
                <div
                  key={link.name}
                  className={`flex flex-row items-center ${
                    link.color ? `bg-${link.color}-500` : ""
                  }`}
                >
                  <div className="px-2">{link.icon && link.icon}</div>
                  <Link
                    className="flex w-full justify-between px-1 py-2 text-left text-sm leading-5 text-gray-700"
                    href={link.href}
                    onClick={async () => {
                      await link.onClick?.();
                      setOpen(false);
                    }}
                  >
                    {link.name}
                  </Link>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
export default NavBarDropdown;
