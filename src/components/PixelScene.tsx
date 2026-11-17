"use client";

import { useEffect, useRef } from "react";
import { HERO, heroColors } from "@/lib/sprites";

/*
 * The landing hero: a procedurally drawn overworld at golden hour, rendered at
 * a quarter resolution and scaled up with nearest-neighbour sampling. A party
 * of four walks the trail toward the flag. Static under reduced motion.
 */

const PX = 4; // CSS pixels per scene pixel

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

function mulberry(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function ridge(width: number, seed: number, octaves: [number, number][]): number[] {
  const out = new Array(width).fill(0);
  octaves.forEach(([wavelength, amp], o) => {
    const r = mulberry(seed + o * 101);
    const n = Math.ceil(width / wavelength) + 2;
    const pts = Array.from({ length: n }, () => r());
    for (let x = 0; x < width; x++) {
      const f = x / wavelength;
      const i = Math.floor(f);
      const t = f - i;
      const s = t * t * (3 - 2 * t);
      out[x] += (pts[i] * (1 - s) + pts[i + 1] * s) * amp;
    }
  });
  return out;
}

const SKY: [number, string][] = [
  [0, "#6cb7d6"],
  [0.35, "#9ccfe0"],
  [0.62, "#f3dcae"],
  [0.8, "#f6c58a"],
  [1, "#f2a970"],
];

const PARTY = ["ana-ribeiro", "kenji-mori", "priya-nair", "tom-okafor"];

export function PixelScene() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let W = 0;
    let H = 0;
    let far: number[] = [];
    let mid: number[] = [];
    let trees: { x: number; y: number; h: number }[] = [];
    let raf = 0;
    let last = 0;
    const bg = document.createElement("canvas");

    const layout = () => {
      const rect = canvas.getBoundingClientRect();
      W = Math.max(80, Math.ceil(rect.width / PX));
      H = Math.max(60, Math.ceil(rect.height / PX));
      canvas.width = W;
      canvas.height = H;
      far = ridge(W, 7, [
        [48, 26],
        [17, 8],
        [6, 2],
      ]);
      mid = ridge(W, 31, [
        [60, 14],
        [22, 5],
        [7, 1.5],
      ]);
      const r = mulberry(99);
      trees = [];
      const horizon = Math.round(H * 0.56);
      for (let i = 0; i < Math.round(W / 9); i++) {
        const x = Math.round(r() * W);
        const y = horizon + 4 + Math.round(r() * (H - horizon - 6));
        trees.push({ x, y, h: 5 + Math.round(((y - horizon) / (H - horizon)) * 9) });
      }
      trees.sort((a, b) => a.y - b.y);
    };

    let target: CanvasRenderingContext2D = ctx;
    const rect = (x: number, y: number, w: number, h: number, c: string) => {
      target.fillStyle = c;
      target.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
    };

    // The trail, as a curve from the bottom edge to the far hills.
    const trailAt = (t: number) => {
      const p0 = { x: W * 0.42, y: H + 4 };
      const p1 = { x: W * 1.05, y: H * 0.86 };
      const p2 = { x: W * 0.52, y: H * 0.66 };
      const p3 = { x: W * 0.8, y: H * 0.58 };
      const u = 1 - t;
      return {
        x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
        y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
      };
    };

    const drawSprite = (seed: string, x: number, y: number, frame: number) => {
      const colors = heroColors(seed);
      const bob = frame % 2;
      HERO.forEach((row, ry) => {
        for (let rx = 0; rx < row.length; rx++) {
          const c = colors[row[rx]];
          if (!c) continue;
          // Alternate legs on the walk cycle.
          let dy = ry < 10 ? -bob : 0;
          if (ry >= 10 && ((rx < 5 && bob) || (rx >= 5 && !bob))) dy = -1;
          rect(x + rx, y + ry + dy, 1, 1, c);
        }
      });
    };

    const paintBackground = () => {
      bg.width = W;
      bg.height = H;
      const bctx = bg.getContext("2d");
      if (!bctx) return;
      target = bctx;
      const horizon = Math.round(H * 0.56);

      // Sky with ordered dithering between bands.
      for (let y = 0; y < horizon; y++) {
        const v = y / horizon;
        let i = 0;
        while (i < SKY.length - 2 && v > SKY[i + 1][0]) i++;
        const [a, ca] = SKY[i];
        const [b, cb] = SKY[i + 1];
        const t = (v - a) / (b - a);
        for (let x = 0; x < W; x++) {
          rect(x, y, 1, 1, t > BAYER[(y % 4) * 4 + (x % 4)] ? cb : ca);
        }
      }

      // Sun
      const sx = Math.round(W * 0.82);
      const sy = Math.round(horizon * 0.62);
      const sr = Math.max(6, Math.round(W * 0.035));
      for (let y = -sr; y <= sr; y++) {
        const half = Math.round(Math.sqrt(sr * sr - y * y));
        rect(sx - half, sy + y, half * 2, 1, "#fff1c4");
      }

      // Far mountains with snowline
      for (let x = 0; x < W; x++) {
        const top = Math.round(horizon - 6 - far[x]);
        rect(x, top, 1, horizon - top, "#8b7fb3");
        if (far[x] > 22) rect(x, top, 1, Math.round((far[x] - 22) * 0.6) + 1, "#f4eefc");
      }
      // Mid hills
      for (let x = 0; x < W; x++) {
        const top = Math.round(horizon + 2 - mid[x]);
        rect(x, top, 1, horizon - top + 3, "#5f9a5b");
        rect(x, top, 1, 1, "#7db56e");
      }
      // Meadow, banded toward the viewer
      const bands = ["#5a9a52", "#4f8f4a", "#468545", "#3d7a40"];
      for (let y = horizon + 2; y < H; y++) {
        const b = Math.min(bands.length - 1, Math.floor(((y - horizon) / (H - horizon)) * bands.length));
        rect(0, y, W, 1, bands[b]);
      }
      // Grass tufts
      const gr = mulberry(5);
      for (let i = 0; i < W * 0.6; i++) {
        const x = Math.round(gr() * W);
        const y = horizon + 3 + Math.round(gr() * (H - horizon));
        rect(x, y, 1, 1, "#6fae5f");
      }

      // Trail
      for (let i = 0; i <= 400; i++) {
        const t = i / 400;
        const p = trailAt(t);
        const w = 2 + (1 - t) * 10;
        rect(p.x - w / 2, p.y, w, 2, "#e4c98f");
        rect(p.x - w / 2, p.y + 2, w, 1, "#c9aa6c");
      }

      // Trees, back to front
      for (const tr of trees) {
        for (let row = 0; row < tr.h; row++) {
          const half = Math.round((row / tr.h) * (tr.h * 0.35)) + 1;
          rect(tr.x - half, tr.y - tr.h + row, half * 2 + 1, 1, row % 3 === 0 ? "#2f6a3c" : "#285c35");
        }
        rect(tr.x, tr.y, 1, 2, "#5b3b24");
      }

      target = ctx;
    };

    const draw = (time: number) => {
      ctx.drawImage(bg, 0, 0);
      const horizon = Math.round(H * 0.56);
      // Clouds drift
      const drift = reduce ? 0 : time / 900;
      [
        [0.12, 0.18, 1],
        [0.48, 0.1, 1.4],
        [0.7, 0.3, 0.8],
      ].forEach(([cx, cy, s], i) => {
        const x = ((cx * W + drift * (0.6 + i * 0.3)) % (W + 40)) - 20;
        const y = cy * horizon;
        const w = 22 * s;
        rect(x, y, w, 3, "#fff8ea");
        rect(x + 4 * s, y - 2, w * 0.55, 2, "#fff8ea");
        rect(x + 2, y + 3, w - 4, 1, "#e9dccb");
      });

      // Goal flag at the trail's end
      const goal = trailAt(1);
      const wave = reduce ? 0 : Math.floor(time / 300) % 2;
      rect(goal.x, goal.y - 14, 1, 14, "#3a2a1c");
      rect(goal.x + 1, goal.y - 14, 7, 2, "#d4592a");
      rect(goal.x + 1, goal.y - 12, 8 - wave, 2, "#d4592a");
      rect(goal.x + 1, goal.y - 10, 6, 1, "#a8401c");

      // The party
      const speed = reduce ? 0 : time / 60000;
      const frame = reduce ? 0 : Math.floor(time / 220);
      PARTY.forEach((seed, i) => {
        const t = (0.18 + speed + i * 0.075) % 0.95;
        const p = trailAt(t);
        drawSprite(seed, p.x - 5, p.y - 11, frame + i);
      });
    };

    const loop = (time: number) => {
      if (time - last > 120) {
        draw(time);
        last = time;
      }
      raf = requestAnimationFrame(loop);
    };

    layout();
    paintBackground();
    draw(0);
    if (!reduce) raf = requestAnimationFrame(loop);

    const ro = new ResizeObserver(() => {
      layout();
      paintBackground();
      draw(last);
    });
    ro.observe(canvas);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return <canvas ref={ref} aria-hidden="true" />;
}
