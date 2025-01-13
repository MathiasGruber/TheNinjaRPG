import ReactHtmlParser, { Transform } from "react-html-parser";
import { randomString } from "@/libs/random";
import { IMG_AVATAR_DEFAULT } from "@/drizzle/constants";
import React from "react";

/*
 * Parse HTML string into React components
 * @param html - HTML string to parse
 */
export const parseHtml = (html: string) => {
  const transform: Transform = (node) => {
    if (
      node.type === "directive" ||
      node.type === "style" ||
      node.type === "script" ||
      (node.type === "tag" && node.name === "body") ||
      (node.type === "tag" && node.name === "html") ||
      (node.type === "tag" && node.name === "meta") ||
      (node.type === "tag" && node.name === "title") ||
      (node.type === "tag" && node.name === "head")
    ) {
      return null;
    } else if (node.type === "tag" && node.name === "img" && node.attribs) {
      const props = {
        ...node.attribs,
        alt: randomString(10),
        onError: (e: React.SyntheticEvent<HTMLImageElement>) => {
          const target = e.currentTarget;
          target.onerror = null;
          target.src = IMG_AVATAR_DEFAULT;
        },
      };
      return React.createElement("img", props);
    } else if (node.type === "tag" && node.name === "h1") {
      node.name = "h2";
    }
    return undefined;
  };

  return ReactHtmlParser(html, { transform });
};
