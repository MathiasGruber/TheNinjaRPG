import React from "react";
import Link from "next/link";

const Footer: React.FC = () => {
  return (
    <div className="col-span-6 text-center text-white">
      <p className="text-sm">
        <Link
          href="https://app.termly.io/document/terms-of-service/71d95c2f-d6eb-4e3c-b480-9f0b9bb87830"
          target="_blank"
          className="hover:text-gray-500"
        >
          Terms of Service
        </Link>{" "}
        -{" "}
        <Link
          href="https://app.termly.io/document/privacy-policy/9fea0bba-1061-47c0-8f28-0f724f06cc0e"
          target="_blank"
          className="hover:text-gray-500"
        >
          Privacy Policy
        </Link>{" "}
        -{" "}
        <Link
          href="https://app.termly.io/document/cookie-policy/971fe8a9-3613-41a0-86ad-8e08e7be93d7"
          target="_blank"
          className="hover:text-gray-500"
        >
          Cookie Policy
        </Link>{" "}
        -{" "}
        <Link href="/rules" className="hover:text-gray-500">
          Game Rules
        </Link>{" "}
        -{" "}
        <Link href="/staff" className="hover:text-gray-500">
          Staff
        </Link>
      </p>
      <p className="mb-7 text-sm">TheNinja-RPG © by Studie-Tech ApS - 2005-2024</p>
    </div>
  );
};

export default Footer;
