"use client";

import clsx from "clsx";
import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "danger" | "ghost";

const VARIANT_CLASSES: Record<Variant, string> = {
  primary: "bg-[#102a83] text-white hover:bg-[#0c1f66]",
  secondary: "bg-[#f1f5f9] text-[#334155] hover:bg-[#e2e8f0]",
  danger: "bg-[#fef2f2] text-[#b91c1c] hover:bg-[#fde2e2]",
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
        "rounded-lg px-3 py-1.5 text-sm max-md:text-[11px] font-medium transition disabled:cursor-not-allowed disabled:opacity-50",
        VARIANT_CLASSES[variant],
        className
      )}
      {...props}
    />
  );
}
