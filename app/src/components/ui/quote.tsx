import * as React from "react";
import { renderToString } from "react-dom/server";
import { cn } from "src/libs/shadui";
import { parseHtml } from "@/utils/parse";
interface QuoteProps extends React.HTMLAttributes<HTMLQuoteElement> {
  author?: string;
  date?: string;
}

function htmlDecode(input: string) {
  const doc = new DOMParser().parseFromString(input, "text/html");
  return doc.documentElement.textContent;
}

const Quote = React.forwardRef<HTMLQuoteElement, QuoteProps>(
  ({ className, author, date, children, ...props }, ref) => {
    const content = htmlDecode(renderToString(children));
    return (
      <blockquote
        ref={ref}
        className={cn(
          "my-4 rounded-lg border-l-4 border-primary bg-accent p-4 shadow-md mr-2",
          className,
        )}
        {...props}
      >
        {author && (
          <div className="mb-2 text-sm font-semibold text-muted-foreground">
            Quoted from {author}
            {date && ` on ${date}`}
          </div>
        )}
        <div className="italic text-foreground">{parseHtml(content || "")}</div>
      </blockquote>
    );
  },
);

Quote.displayName = "Quote";

export { Quote };
