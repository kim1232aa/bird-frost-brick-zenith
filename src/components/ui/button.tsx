import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-xs hover:bg-primary/90",
        destructive:
          "bg-destructive text-white shadow-xs hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60",
        outline:
          "border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80",
        ghost:
          "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        sm: "h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        icon: "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

const stoneContrastTextClass = {
  "text-stone-950": " !text-stone-950 [&_*]:!text-stone-950",
  "text-stone-900": " !text-stone-900 [&_*]:!text-stone-900",
  "text-stone-800": " !text-stone-800 [&_*]:!text-stone-800",
  "text-stone-700": " !text-stone-700 [&_*]:!text-stone-700",
  "text-stone-600": " !text-stone-600 [&_*]:!text-stone-600",
  "text-stone-500": " !text-stone-500 [&_*]:!text-stone-500",
} as const;

function contrastTextClass(className: unknown) {
  if (typeof className !== "string" || className.includes("!text-")) {
    return "";
  }

  if (
    /\bbg-(slate-950|slate-900|stone-950|stone-900|black|foreground)\b/.test(
      className,
    ) &&
    /\btext-white(?:\/\d+)?\b/.test(className)
  ) {
    return " !text-white [&_*]:!text-white";
  }

  const stoneText = className.match(
    /\btext-stone-(950|900|800|700|600|500)\b/,
  )?.[0] as keyof typeof stoneContrastTextClass | undefined;
  if (/\bbg-white\b/.test(className) && stoneText) {
    return stoneContrastTextClass[stoneText];
  }

  return "";
}

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      data-slot="button"
      className={cn(
        buttonVariants({ variant, size, className }),
        contrastTextClass(className),
      )}
      {...props}
    />
  );
}

export { Button, buttonVariants };
