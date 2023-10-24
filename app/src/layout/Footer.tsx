import React from "react";
import Link from "next/link";

const Footer: React.FC = () => {
  return (
    <div className="col-span-6 text-center text-white">
      <p className="text-sm">
        <Link href="/terms" className="hover:text-gray-500">
          Terms of Service
        </Link>{" "}
        -{" "}
        <Link href="/policy" className="hover:text-gray-500">
          Privacy Policy
        </Link>{" "}
        -{" "}
        <Link href="/rules" className="hover:text-gray-500">
          Game Rules
        </Link>
      </p>
      <p className="mb-7 text-sm">TheNinja-RPG © by Studie-Tech ApS - 2005-2023</p>
    </div>
  );
};

export default Footer;
