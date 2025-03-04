import * as React from "react";

import { cn } from "src/libs/shadui";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  isDirty?: boolean;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, isDirty, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-9 w-full rounded-md border border-input bg-white text-slate-900 px-3 py-1 text-sm shadow-xs transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
          className,
          isDirty ? "border-orange-300" : "border-input",
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
