import type { IconName, ItemKind } from "./types";

/*
 * Every icon and character in Party Trail is drawn from a character grid and
 * rendered as crisp SVG rects. One grid language keeps one stroke weight.
 */

const ICONS: Record<IconName, string[]> = {
  plus: ["...##...", "...##...", "...##...", "########", "########", "...##...", "...##...", "...##..."],
  close: ["##....##", "###..###", ".######.", "..####..", "..####..", ".######.", "###..###", "##....##"],
  inn: ["...##...", "..####..", ".######.", "########", ".#....#.", ".#.##.#.", ".#.##.#.", ".######."],
  flag: ["##......", "######..", "########", "######..", "##......", "#.......", "#.......", "##......"],
  food: ["......##", ".....###", "..#####.", ".######.", "########", "#######.", ".#####..", "..###..."],
  transport: [".######.", "#......#", "#......#", "########", "#.####.#", "########", ".#....#.", "##....##"],
  sight: ["...##...", "...##...", "########", ".######.", "..####..", ".######.", ".##..##.", "##....##"],
  pin: ["..####..", ".######.", "###..###", "###..###", ".######.", "..####..", "...##...", "...##..."],
  locate: ["...##...", "..#..#..", ".#....#.", "##.##.##", "##.##.##", ".#....#.", "..#..#..", "...##..."],
  bell: ["...##...", "..####..", ".######.", ".######.", ".######.", "########", "........", "...##..."],
  bellOff: ["#..##...", ".#####..", ".#.####.", ".##.###.", ".###.##.", "#####.##", "......#.", "...##..#"],
  mail: ["........", "########", "##....##", "#.#..#.#", "#..##..#", "#......#", "########", "........"],
  back: ["....##..", "...##...", "..##....", ".##.....", ".##.....", "..##....", "...##...", "....##.."],
  exit: ["####....", "#.......", "#....#..", "#.######", "#.######", "#....#..", "#.......", "####...."],
  trash: ["..####..", "########", ".######.", ".#.##.#.", ".#.##.#.", ".#.##.#.", ".######.", "........"],
  person: ["...##...", "..####..", "..####..", "...##...", ".######.", "########", "########", "........"],
  check: [".......#", "......##", ".....##.", "#...##..", "##.##...", ".###....", "..#.....", "........"],
  copy: ["#####...", "#...#...", "#.######", "#.#....#", "###....#", "..#....#", "..#....#", "..######"],
};

export const KIND_ICON: Record<ItemKind, IconName> = {
  activity: "flag",
  food: "food",
  transport: "transport",
  sight: "sight",
};

export const KIND_LABEL: Record<ItemKind, string> = {
  activity: "Activity",
  food: "Food & drink",
  transport: "Getting around",
  sight: "Sight",
};

/** Merge horizontal runs into rects so each row is a handful of elements. */
function gridToRects(rows: string[], match: (ch: string) => string | null): string {
  let out = "";
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const fill = match(row[x]);
      if (!fill) {
        x++;
        continue;
      }
      let w = 1;
      while (x + w < row.length && match(row[x + w]) === fill) w++;
      out += `<rect x="${x}" y="${y}" width="${w}" height="1" fill="${fill}"/>`;
      x += w;
    }
  });
  return out;
}

export function iconSvg(name: IconName, size = 16): string {
  const rows = ICONS[name];
  const inner = gridToRects(rows, (ch) => (ch === "#" ? "currentColor" : null));
  return `<svg viewBox="0 0 8 8" width="${size}" height="${size}" shape-rendering="crispEdges" aria-hidden="true" focusable="false">${inner}</svg>`;
}

// ─── Characters ──────────────────────────────────────────────────────────────

export const HERO = [
  "...oooo...",
  "..ohhhho..",
  ".ohhhhhho.",
  ".ohssssho.",
  ".osesseso.",
  "..osssso..",
  ".ottttkto.",
  "ostttkttso",
  "osttktttso",
  ".oppppppo.",
  ".oppooppo.",
  "obbo..obbo",
];

const HAIR = ["#2B1D14", "#6B3E1F", "#C9862C", "#E8D27A", "#8E2F2F", "#3A3A58", "#D9D1C2", "#1F4E5F"];
const SKIN = ["#F6D3B3", "#E8B88E", "#C68A5E", "#9A6440", "#6B4329"];
const TUNIC = ["#C2402A", "#2E7FA8", "#3E8948", "#7D4BA8", "#D9831F", "#178A7A", "#B83A6E", "#3C4FA0"];
const PANTS = ["#3B2F4A", "#4A3B2A", "#2F3B4A", "#5A4632"];

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export type SpritePalette = { hair: string; skin: string; tunic: string; pants: string };

export function paletteFor(seed: string): SpritePalette {
  const h = hashString(seed);
  return {
    hair: HAIR[h % HAIR.length],
    skin: SKIN[(h >>> 4) % SKIN.length],
    tunic: TUNIC[(h >>> 9) % TUNIC.length],
    pants: PANTS[(h >>> 14) % PANTS.length],
  };
}

export function heroColors(seed: string): Record<string, string> {
  const p = paletteFor(seed);
  return {
    o: "#1E1628",
    e: "#1E1628",
    h: p.hair,
    s: p.skin,
    t: p.tunic,
    k: "#7A4E2A", // backpack strap
    p: p.pants,
    b: "#3A2A1C",
  };
}

export function heroSvg(seed: string, scale = 3): string {
  const colors = heroColors(seed);
  const inner = gridToRects(HERO, (ch) => colors[ch] ?? null);
  const w = 10 * scale;
  const h = 12 * scale;
  return `<svg viewBox="0 0 10 12" width="${w}" height="${h}" shape-rendering="crispEdges" aria-hidden="true" focusable="false">${inner}</svg>`;
}

/** Tunic colour doubles as each traveler's identity colour across the UI. */
export function colorFor(seed: string): string {
  return paletteFor(seed).tunic;
}

