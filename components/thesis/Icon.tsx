"use client";

import type { IconName } from "./icon-names";

type IconProps = {
  name: IconName;
  size?: number;
  label?: string;
  className?: string;
};

/** Kit outline icons via the shared SVG sprite in /public/thesis. */
export function Icon({ name, size = 20, label, className = "" }: IconProps) {
  return (
    <svg
      className={`th-icon ${className}`}
      width={size}
      height={size}
      style={{ width: size, height: size }}
      aria-hidden={label ? undefined : true}
      role={label ? "img" : undefined}
      aria-label={label}
    >
      <use href={`/thesis/icons/sprite.svg#${name}`} xlinkHref={`/thesis/icons/sprite.svg#${name}`} />
    </svg>
  );
}

export function BrandMark({ size = 32, className = "" }: { size?: number; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/thesis/brand/thesis-mark.svg"
      alt=""
      width={size}
      height={Math.round(size * (52 / 48))}
      className={className}
      aria-hidden="true"
    />
  );
}

export type { IconName };
