# Party Trail: design system

**World:** a sunlit 16-bit overworld. The map is the overworld, travelers are party members, and the itinerary is the trail you walk. The world supplies type, palette, density and one signature move. Navigation and controls stay standard web controls (tabs, buttons, inputs).

**Mode:** the trip screen is *Operate* (a working tool first). The landing page is *Persuade* (the overworld scene leads).

## Signature move
The itinerary is drawn as a trail. Stops are numbered waypoints joined by a dashed ember path. The walked part goes muted, the next stop hops, and friends stand on the map as their own pixel characters with name tags in their tunic colour.

## Material
- **Pixel frame** (`.px`): a 3px border built from four zero-blur box-shadows, which leaves the corners notched. This is the only container treatment. Never use rounded corners.
- **Bevel**: buttons carry a 3px inset light top and dark bottom, and press down 2px on `:active`.
- **Depth**: floating layers (hero card, toasts, map buttons) add one soft offset shadow (`--shadow`). There are no hard offset block shadows.
- **Pixel unit** `--u: 3px` drives frames, bevels, focus rings and tab underlines.

## Type
- **Jersey 10** (`--font-big`): display. Trip names, the hero headline, times, invite codes.
- **Pixelify Sans** (`--font-ui`): UI voice. Buttons, tabs, labels, row titles.
- **Atkinson Hyperlegible Next** (`--font-copy`): body and metadata, chosen for legibility outdoors on a phone.

## Palette (light / night)
| Token | Light | Night | Job |
|---|---|---|---|
| `--shell` | #2B2145 | #0C0915 | top bar, toasts (dusk plum) |
| `--ground` | #EADFC4 | #120E1E | page ground (sand) |
| `--panel` | #FBF5E6 | #1E1830 | panels |
| `--ink` | #241B33 | #F3EAD6 | text, frames |
| `--ember` | #B9461C | #E2703A | primary action, the trail ahead, "next" |
| `--gold` | #E9B23C | #F0C058 | focus ring, highlights, selection |
| `--grass` | #3E7F45 | #5FAE66 | live / on states |
| `--sea` | #2C6E8E | #5AA6C8 | stays (inns) |

Each traveler's identity colour is their sprite's tunic (`colorFor(userId)`).

## Icons & sprites
All icons are 8×8 grids and characters are 10×12 grids (`src/lib/sprites.ts`), rendered as crisp SVG rects. Add new icons as grids, never as emoji or a third-party icon set.

## Motion
Stepped and sparse: sprites bob (`steps(2)`), the next stop hops, the live dot blinks, and toasts wipe in. All of it is disabled under `prefers-reduced-motion`.
