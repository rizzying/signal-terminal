# Design note

Visual only. Pages, copy, controls, and every number stay as they are. The confidence line stays: "Low, Med or High is a weighted score of how strongly the signals agree. It is not a win chance." The forward test, its recording job, and the calculations are untouched.

This replaces the flat black terminal from the previous pass. The owner said that mood felt sad. The new mood is warm daylight: a paper canvas, white work surfaces, one coral accent, and green and red that read at a glance. It is still a trading terminal. It does not return to the Glassnode cool gray, and it does not return to a black screen with a neon mark.

## References

Looked at before the color change. Nothing was copied: no logos, no images, no sentences.

1. [Saaspo on Designeer](https://designeer.xyz/inspiration/saaspo) ([saaspo.com](https://saaspo.com/)). SaaS pages there are bright product screens: a light field, a clear primary action, and numbers that sit on white. Used here for the page temperature. The terminal opens on paper, the cards are white, and the filled action is the one warm accent.
2. [Land-book on Designeer](https://designeer.xyz/inspiration/land-book) ([land-book.com](https://land-book.com/)). The gallery's own pages, and the landing work it files, use a light ground with a single saturated action instead of a dark frame. Used here for the landing: warm paper, a coral "Open Signal", and section bands that step from paper to white to a flat peach tint. No background gradient.
3. [Details on Designeer](https://designeer.xyz/inspiration/details) ([details.so](https://www.details.so/)). Small motions stay: press to 98%, a focus ring, and a menu that arrives. The accent is reserved for the current tab, the filled button, and the selected chip, so the rest of the terminal can stay quiet and readable.

Refactoring UI, inside the skill limits: hierarchy from size and weight, one warm gray family, space before extra rules, and color only where it carries meaning. Green and red are for direction and P&L. The accent is for selection and the primary action. Strong, OK, and Weak stay in the ink scale.

The redesign skill's type, spacing, radius, and motion values are unchanged. Its default dark surface list is the thing that made the last pass feel heavy, so this pass adapts the color values only. The skill allows that adaptation in its Design Values section. Backgrounds stay flat. The landing headline is the only gradient, and it is on the text.

## Layout

The terminal stays the same pages. The shell is still capped at 1440px. Cards are white on warm paper, 16px padding, 12px corners. Controls inside them are 8px corners. Phone padding is 16px. The bottom nav floats 12px off the screen edge on a warm translucent bar. The "More" list opens as a full-height paper panel. Targets on a coarse pointer are at least 40px, and the main ones 48px.

The landing keeps its sections and its sentences. The nav is a compact bar, centered, off the top edge. The hero is still two columns. The feature list is still the first item across the row, then two unequal columns. On a phone it is one column. The feature band is a flat peach field so that section feels warmer than the paper around it.

## Type

Geist is the only face. Geist Mono is used for prices, R, and table figures, with tabular numbers so columns do not shift. Sizes sit on the standard scale: 12/16, 14/20, 16/24, 20/28, 24/32, 30/36, 36/40, and 48/1 for the landing headline. Weights are 400, 500, and 600, with 700 only on that headline. No italics. Headings use `text-wrap: balance`. Body copy uses `text-wrap: pretty`.

## Color

Flat surfaces. No background gradient. The landing headline fades from `#1c1712` to `#7a7064`, left to right, on the text only. That fade stays in the warm ink family. A cool gray fade on this paper would mix two gray families.

| Role | Value |
| --- | --- |
| Canvas | `#f6f0e4` |
| Nav, raised band | `#fffaf4` |
| Card | `#ffffff` |
| Field, inset | `#f3eadc` |
| Hairline, hover | `#e6dccb`, hover `#efe4d2` |
| Text | `#1c1712` |
| Secondary text | `#5f564c` |
| Accent | `#e15a1c` |
| Text on the accent | `#1c1712` |
| Selected tint | `#fff1e6` |
| Chart and entry lines | `#1c1712` |
| Up and positive P&L | `#0c8f58` |
| Down and negative P&L | `#e11d3a` |

The accent is a coral, saturated enough to feel awake and still under a shout. Dark ink sits on it so a 16px label stays readable. Green and red are vivid so a profit and a loss separate immediately. They are not the accent. A selected zone, book, or filter is the peach tint with a coral ring. The current tab, the filled button, and an on chip use the solid coral. A thin grain sits over the page so the paper is not a flat void. Card depth is the step from paper to white, plus a hairline all the way around. Floating menus use one warm shadow.

`:root` and `.dark` share one token block, so a stored light preference cannot paint a second theme. The inline script in `index.html` and `welcome.html` is unchanged.

## Motion

Movement uses `cubic-bezier(0.22, 1, 0.36, 1)`, 500ms for a move and 300ms for a color change. Buttons press to 98% scale. Landing sections rise 32px and fade in once, through `IntersectionObserver`. The honest note lights word by word as each word crosses a line on the page. `prefers-reduced-motion` drops the movement and keeps a color change.

## What did not change

Feature behavior, the words on the pages, chart line names, forward-test scorecards, filters, the Filled and Not filled table, Export CSV, and the device-only stores. `/` is still the terminal. Hash tabs and the PWA start URL stay `/`. No new page, setting, or calculation.
