# Design note (v3.5.0)

Visual only. Scans, the forward test, stored data, numbers, and the meaning of the copy stay as they are. The confidence line stays: "Low, Med or High is a weighted score of how strongly the signals agree. It is not a win chance."

The look replaces the warm v3.3 theme and the Tempo landing. The source for the tokens is the Auros style reference supplied for this version: an abyssal terminal, bioluminescent data, one dark surface stack.

## References

Looked at before the CSS change. Nothing was copied: no logos, no images, no sentences.

1. **Auros**, the attached style reference. Canvas Liquid Abyss `#012624`, recessed Liquid Deep `#011d1c`, raised Liquid Kelp `#003734`. Mist `#edfffe` for emphasis, white for headings and nav, silver `#bbc7c6` for body, slate `#707777` for inactive type and borders. Lavender `#fde9ff` only on big stats. The aurora gradient is the main call-to-action and nothing larger. Headings are weight 500 with tight tracking. Cards are 16px, buttons are 6px, and depth is a surface step, not a shadow.

2. **Wintermute**, the brand page at [wintermute.com/brand](https://www.wintermute.com/brand). Night green `#070b09`, then shadow, charcoal, and graphite as the next steps, silver body type, one bright green. Their Gibson green and the pink and blue tertiaries stay there. Used here: a dark ground, surfaces one step lighter, silver for the reading text.

3. **Sombra**, open at [sombra.design](https://sombra.design/), listed among the dark-interface sources on [Designeer](https://www.designeer.xyz/). The live page is one canvas ("Gradient Composer") and one "Motion mode" control. Used here: the landing sphere is one canvas and one motion. [Dark Mode Design](https://www.darkmodedesign.com/) is the gallery that collects this kind of page. Used here: the product stays on one dark theme.

## Light mode

The light toggle is gone. Auros has one surface stack, and a light palette would be colors the spec does not contain. `:root` and `.dark` share the same tokens, so a stored `sig.theme=light` that removes the `dark` class does not change a color. The inline script in `index.html` and `welcome.html` is unchanged, so the content-security-policy hash still matches. React adds `dark` back and sets the theme color to `#012624`.

## Layout

- The terminal stays full-bleed. Gutters stay 24px on a wide screen and 12px on a phone. The bottom nav on a phone is a kelp surface with a 16px corner and a hairline, not a shadow.
- Desktop (1440): Scan keeps the chart and the setup column side by side from 80rem. Today keeps its tiles. The forward test keeps its scorecards.
- Phone (390): one column, the same bottom nav, 44px targets on coarse pointers.
- Landing (`/welcome`): a transparent 80px header (wordmark, two in-page links, the aurora button), then a centered hero. Eyebrow, 61px headline, 16px subhead, the aurora button and a ghost button. A particle sphere sits behind the hero. Under that, the exchange names, a 16px chart card, and three counters. Sections are a 600px column. The footer is the recessed deep color with 120px of vertical padding on a wide screen.

## Type

Inter Variable stands in for Matter. Body is 16px, weight 400, line-height 1.4, color silver. Headings are weight 500. The landing headline is 61px, tracking −0.04em, line-height 1, and white. Section sentences on the landing are 36px. Labels are uppercase Inter: 12px at 0.12em, table headers 10px at 0.15em.

Prices, zone figures, and the chart axis stay Geist Mono with tabular figures. A proportional face would shift columns of prices. That is the only second family.

## Color

| Role | Token |
| --- | --- |
| Ground | `#012624` Liquid Abyss |
| Card | `#003734` Liquid Kelp |
| Recessed | `#011d1c` Liquid Deep |
| Body | `#bbc7c6` silver |
| Heading | `#ffffff` |
| Emphasis | `#edfffe` mist |
| Inactive | `#707777` slate |
| Big stat | `#fde9ff` lavender |
| Focus and selected zone | `#00827c` / `#cbfffc` |
| Up candle and positive P&L | `#5dcea0` |
| Down candle and negative P&L | `#f09595` |

Up and down candles, and positive and negative P&L, stay green and red so a long and a short still read at a glance on the teal canvas. Those two hues are the exception. They are not used for Strong, OK, or Weak. Strength stays the word: full ink, silver, slate.

Lavender is only the big numbers: the landing counters (3 exchanges, 3 entry zones, 9 funding venues, each a count the product already states) and the forward-test and summary stats. The aurora gradient is only `.land-cta`. In-app primary buttons are a flat `#00827c`.

No drop shadows. A floating menu is a kelp surface with a 1px line.

## The sphere

`ParticleSphere` draws dots on a canvas. It is on the landing hero only, not behind the chart, because a field of dots under candles would fight the price. `prefers-reduced-motion: reduce` draws one frame and does not loop. There is no animation library.

## What did not change

Feature behavior, the confidence sentence, chart line names (Entry top, Stop, TP1, TP2), forward-test scorecards, and the device-only alert store. `/` is still the terminal. Hash tabs and the PWA `start_url` stay `/`.
