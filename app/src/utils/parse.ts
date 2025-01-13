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
      const {
        src,
        alt: originalAlt,
        className,
        id,
        style,
        width,
        height,
      } = node.attribs;
      const props: React.ImgHTMLAttributes<HTMLImageElement> = {
        src,
        alt: originalAlt || randomString(10),
        className,
        id,
        style: style ? JSON.parse(style) : undefined,
        width,
        height,
        onError: (e: React.SyntheticEvent<HTMLImageElement>) => {
          const target = e.currentTarget;
          target.onerror = null;
          target.src = IMG_AVATAR_DEFAULT;
        },
      };
      const cleanProps = Object.fromEntries(
        Object.entries(props).filter(([_, value]) => value !== undefined),
      ) as React.ImgHTMLAttributes<HTMLImageElement>;

      return React.createElement("img", cleanProps);
    } else if (node.type === "tag" && node.name === "h1") {
      node.name = "h2";
    }
    return undefined;
  };

  return ReactHtmlParser(html, { transform });
};
