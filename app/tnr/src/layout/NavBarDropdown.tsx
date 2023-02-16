import React, { useState } from "react";
import Link from "next/link";

export interface NavBarDropdownLink {
  href: string;
  name: string;
  icon?: React.ReactNode;
  onClick?: () => Promise<undefined>;
}

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
    <div className="relative inline-block">
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

            {props.links?.map((link) => (
              <Link
                key={link.name}
                className="flex w-full justify-between px-4 py-2 text-left text-sm leading-5 text-gray-700"
                href={link.href}
                onClick={async () => {
                  await link.onClick?.();
                  setOpen(false);
                }}
              >
                {link.name}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
export default NavBarDropdown;
