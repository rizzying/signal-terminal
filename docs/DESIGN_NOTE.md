# Design note

Visual only. Pages, copy, controls, and every number stay as they are. The confidence line stays: "Low, Med or High is a weighted score of how strongly the signals agree. It is not a win chance." The forward test, its recording job, and the calculations are untouched.

This replaces the Glassnode light system (cloud canvas, white cards, Inter, blue wash). It does not bring back the earlier dark teal terminal.

## References

Looked at before the CSS change. Nothing was copied: no logos, no images, no sentences.

1. [SaaSFrame on Designeer](https://designeer.xyz/inspiration/saasframe) ([saasframe.io](https://www.saasframe.io/)). Product screens sit in a quiet frame: a short header, then metric blocks, then the working table. Used here for the order of a page. Scorecards first, the trade table after, one filled action.
2. [Screenlane on Designeer](https://designeer.xyz/inspiration/screenlane) ([screenlane.com](https://screenlane.com/)). App screens keep a persistent nav and let the table be the work surface. Used here for the terminal: the same tabs, a content width that stops stretching on a very wide monitor, phone nav parked at the bottom.
3. [Dark Mode Design on Designeer](https://designeer.xyz/inspiration/dark-mode-design) ([darkmodedesign.com](https://www.darkmodedesign.com/)) and [Sombra](https://designeer.xyz/inspiration/sombra) ([sombra.design](https://sombra.design/)). Dark interfaces built from stepped neutrals, not a neon accent on pure black. [Details](https://designeer.xyz/inspiration/details) ([details.so](https://www.details.so/)) for the small motions: press, focus, and a menu that arrives instead of popping.

Refactoring UI, applied inside the skill limits: hierarchy from size and weight, space before rules, one gray family, green and red only where a long and a short have to be told apart.

## Layout

The terminal stays the same pages. The shell is capped at 1440px so a wide monitor does not stretch the tables edge to edge. Cards are a raised surface on a black canvas, 16px padding, 12px corners. Controls inside them are 8px corners. Phone padding is 16px. The bottom nav floats 12px off the screen edge. The "More" list opens as a full-height panel. Targets on a coarse pointer are at least 40px, and the main ones 48px.

The landing keeps its sections and its sentences. The nav is a compact bar, centered, off the top edge. The hero is still two columns (words, then the existing chart image). The feature list is no longer three equal columns: the first item spans the row, and the rest sit in two unequal columns. On a phone it is one column.

## Type

Geist is the only face. Geist Mono is used for prices, R, and table figures, with tabular numbers so columns do not shift. Sizes sit on the standard scale: 12/16, 14/20, 16/24, 20/28, 24/32, 30/36, 36/40, and 48/1 for the landing headline. Weights are 400, 500, and 600, with 700 only on that headline. No italics. Headings use `text-wrap: balance`. Body copy uses `text-wrap: pretty`.

## Color

Flat surfaces from the approved dark scale. No background gradient. The landing headline is the one gradient, on the text only, white to `#9b9b9b`.

| Role | Value |
| --- | --- |
| Canvas | `#000000` |
| Nav, raised band | `#181818` |
| Card | `#1f1f1f` |
| Field, inset | `#272727` |
| Hairline, hover | `#313131` |
| Text | `#ffffff` |
| Secondary text | `#9b9b9b` |
| Filled button | white fill, black label |
| Chart and entry lines | `#ffffff` |
| Up and positive P&L | `#8faf9a` |
| Down and negative P&L | `#c49292` |

Green and red are dim on purpose. They mark direction and P&L only. They are not the accent, and they are not used for Strong, OK, or Weak. A selected zone, book, or chip is a lighter gray with a full white ring. A thin grain sits over the page so the black is not a flat void. Shadows are not used. Depth comes from the surface step.

`:root` and `.dark` share one token block, so a stored light preference cannot paint a second theme. The inline script in `index.html` and `welcome.html` is unchanged.

## Motion

Movement uses `cubic-bezier(0.22, 1, 0.36, 1)`, 500ms for a move and 300ms for a color change. Buttons press to 98% scale. Landing sections rise 32px and fade in once, through `IntersectionObserver`. The honest note lights word by word as each word crosses a line on the page. `prefers-reduced-motion` drops the movement and keeps a color change.

## What did not change

Feature behavior, the words on the pages, chart line names, forward-test scorecards, filters, the Filled and Not filled table, Export CSV, and the device-only stores. `/` is still the terminal. Hash tabs and the PWA start URL stay `/`. No new page, setting, or calculation.
