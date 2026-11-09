import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * The three information kinds (Section 1 of the spec) each get their own badge variant
 * so they look different everywhere: verified, seasonal, prediction. Plus demo + danger.
 */
export const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        outline: "border-border text-foreground",
        verified: "border-transparent bg-verified text-verified-foreground",
        seasonal: "border-transparent bg-seasonal text-seasonal-foreground",
        prediction: "border-dashed border-prediction bg-prediction/15 text-prediction",
        demo: "border-transparent bg-demo text-demo-foreground",
        danger: "border-transparent bg-danger text-danger-foreground",
        salt: "border-transparent bg-salt text-white",
        fresh: "border-transparent bg-fresh text-white",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
