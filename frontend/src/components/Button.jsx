/**
 * Reusable Button component with variants.
 *
 * Variants: primary (cyan), secondary (outline), danger (red), ghost (transparent)
 * Sizes: sm, md, lg
 * Supports loading state with spinner.
 */
import { HiOutlineArrowPath } from "react-icons/hi2";

const VARIANTS = {
  primary:
    "bg-brand-500 hover:bg-brand-600 text-white shadow-lg shadow-brand-500/20 hover:shadow-brand-500/30",
  secondary:
    "bg-transparent border border-surface-500 hover:border-brand-500 hover:text-brand-400 text-gray-300",
  danger:
    "bg-accent-red/10 hover:bg-accent-red/20 text-accent-red border border-accent-red/20",
  ghost:
    "bg-transparent hover:bg-white/5 text-gray-400 hover:text-gray-200",
};

const SIZES = {
  sm: "px-3 py-1.5 text-xs gap-1.5",
  md: "px-4 py-2 text-sm gap-2",
  lg: "px-6 py-3 text-base gap-2.5",
};

export default function Button({
  children,
  variant = "primary",
  size = "md",
  loading = false,
  disabled = false,
  className = "",
  icon: Icon,
  ...props
}) {
  const isDisabled = disabled || loading;

  return (
    <button
      className={`
        inline-flex items-center justify-center font-medium rounded-lg
        transition-all duration-200 ease-out
        disabled:opacity-50 disabled:cursor-not-allowed
        active:scale-[0.97]
        ${VARIANTS[variant]}
        ${SIZES[size]}
        ${className}
      `}
      disabled={isDisabled}
      {...props}
    >
      {loading ? (
        <HiOutlineArrowPath className="w-4 h-4 animate-spin" />
      ) : Icon ? (
        <Icon className="w-4 h-4" />
      ) : null}
      {children}
    </button>
  );
}
