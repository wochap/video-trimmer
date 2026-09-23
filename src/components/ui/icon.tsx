import type { Icon as PhosphorIcon, IconProps } from "@phosphor-icons/react";

// Single place for the default Phosphor weight; callers may still override it.
export function Icon({
  icon: Glyph,
  weight = "regular",
  size = 16,
  ...props
}: IconProps & { icon: PhosphorIcon }) {
  return <Glyph weight={weight} size={size} aria-hidden {...props} />;
}
