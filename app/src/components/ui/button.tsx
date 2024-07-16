import * as React from "react";
import Image from "next/image";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "src/libs/shadui";

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow hover:bg-primary/70",
        destructive:
          "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90",
        info: "bg-blue-600 text-destructive-foreground shadow-sm hover:bg-destructive/90",
        outline:
          "border border-input bg-white shadow-sm hover:bg-slate-100 hover:text-accent-foreground",
        secondary:
          "bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-10 rounded-md px-8",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  decoration?: "gold" | "none";
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant, size, asChild = false, decoration = "none", ...props },
    ref,
  ) => {
    const Comp = asChild ? Slot : "button";
    return (
      <div className={cn("relative", className)}>
        <Comp
          className={cn(buttonVariants({ variant, size, className }))}
          ref={ref}
          {...props}
        />
        {decoration === "gold" && (
          <>
            <Image
              className="absolute top-[-1px] left-[-3px] scale-x-[-1]"
              src={`/layout/buttondecor.webp`}
              alt="signup-decor-left"
              width={8}
              height={25}
            ></Image>
            <Image
              className="absolute top-[-1px] right-[-3px]"
              src={`/layout/buttondecor.webp`}
              alt="signup-decor-right"
              width={8}
              height={25}
            ></Image>
          </>
        )}
      </div>
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
