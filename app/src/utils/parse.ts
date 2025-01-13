import ReactHtmlParser from "react-html-parser";
import type { Transform } from "react-html-parser";
import { randomString } from "@/libs/random";
import { IMG_AVATAR_DEFAULT } from "@/drizzle/constants";
import React from "react";

interface HtmlNode {
  type: string;
  name: string;
  attribs?: Record<string, string>;
}

/*
 * Parse HTML string into React components
 * @param html - HTML string to parse
 */
export const parseHtml = (html: string) => {
  const transform: Transform = (node: HtmlNode) => {
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
      const props: React.ImgHTMLAttributes<HTMLImageElement> = {
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
