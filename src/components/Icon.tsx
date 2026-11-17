import { iconSvg } from "@/lib/sprites";
import type { IconName } from "@/lib/types";

export function Icon({ name, size = 16, label }: { name: IconName; size?: number; label?: string }) {
  return (
    <span
      className="sprite"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      dangerouslySetInnerHTML={{ __html: iconSvg(name, size) }}
    />
  );
}
