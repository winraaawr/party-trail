import { heroSvg } from "@/lib/sprites";

/** A traveler's pixel character, deterministic from their user id. */
export function Avatar({ seed, size = "md", label }: { seed: string; size?: "sm" | "md"; label?: string }) {
  const scale = size === "sm" ? 2 : 3;
  return (
    <span
      className={`avatar${size === "sm" ? " avatar--sm" : ""}`}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      title={label}
    >
      <span className="sprite" dangerouslySetInnerHTML={{ __html: heroSvg(seed, scale) }} />
    </span>
  );
}
