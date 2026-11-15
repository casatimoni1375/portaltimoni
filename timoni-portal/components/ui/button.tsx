"use client";

import clsx from "clsx";
import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "danger" | "ghost";

const VARIANT_CLASSES: Record<Variant, string> = {
  primary: "bg-[#102a83] text-white hover:bg-[#0c1f66]",
  secondary: "border border-[#102a83]/40 bg-white text-[#102a83] hover:bg-[#f0f3fb]",
  danger: "border border-[#b12532]/40 bg-white text-[#b12532] hover:bg-[#fbeeee]",
  ghost: "text-slate-500 hover:text-slate-800",
};

export function Button({
  variant = "primary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={clsx(
        "rounded-lg px-3 py-1.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50",
        VARIANT_CLASSES[variant],
        className
      )}
      {...props}
    />
  );
}
