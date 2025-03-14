import * as React from "react";
import { renderToString } from "react-dom/server";
import { cn } from "src/libs/shadui";
import { parseHtml } from "@/utils/parse";
import { X } from "lucide-react";

interface QuoteProps extends React.HTMLAttributes<HTMLQuoteElement> {
  author?: string;
  date?: string;
  onRemove?: () => void;
}

function htmlDecode(input: string) {
  const doc = new DOMParser().parseFromString(input, "text/html");
  return doc.documentElement.textContent;
}

const Quote = React.forwardRef<HTMLQuoteElement, QuoteProps>(
  ({ className, author, date, children, onRemove, ...props }, ref) => {
    const content = htmlDecode(renderToString(children));
    return (
      <blockquote
        ref={ref}
        className={cn(
          "my-4 rounded-lg border-l-4 border-primary bg-accent p-4 shadow-md mr-2 relative",
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
        {onRemove && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onRemove();
            }}
            className="absolute top-2 right-2 p-1 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground"
            aria-label="Remove quote"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </blockquote>
    );
  },
);

Quote.displayName = "Quote";

export { Quote };
