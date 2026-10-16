# Design note (v3.3.0)

Written before the visual changes. The product stays a full-width entry terminal: Scan, chart, Today, alerts, journal, and the Labs forward test. No new marketing page, no copied artwork, no copied wording.

Taste Skill v2 (`design-taste-frontend`, installed with `npx skills add Leonxlnx/taste-skill`, source post [Taste Skill v2](https://x.com/LexnLin/status/2110122106537050584)) is the art-direction and browser-check guide. Its own notes say the default skill is for public pages, not dashboards. The parts used here are the ones that still fit a data tool: one accent, one corner system, the same hierarchy in light and dark, no purple gradients, no glass, and a real browser pass at 1440 and 390. The parts left unused are the ones that would invent a landing page: archival photos, a hero, and a ban on monospace. Prices stay in Geist Mono with tabular figures. That is the data, not decoration.

The product direction beside that is the installed `minimalist-ui` skill (quiet surfaces, one family, space) and [Refactoring UI](https://www.refactoringui.com/).

## References

Three concrete sources, looked at before the CSS change. Nothing was copied: no logos, no images, no sentences.

1. **Sombra**, linked from [Designeer](https://www.designeer.xyz/) as a dark-interface source: [sombra.design](https://sombra.design/). The live page is a canvas ("Gradient Composer", one "Motion mode" control) on a near-black field. There is no second chrome color and no card grid. Used for the dark theme: one ground, surfaces a single step lighter, controls sitting on that field.

2. **Lazy**, listed on [Dark Mode Design](https://www.darkmodedesign.com/) and open at [lazy.so](https://lazy.so/). A dark product page with a short sentence, one action, and a lot of air. The grain image and the marketing lines stay there. Used here: sentence-case headings, one accent, space between blocks, the primary button in ink rather than a bright fill.

3. **Dashboard screens.** [Collect UI's dashboard collection](https://collectui.com/designs/dashboard-ui-design-inspiration) and [Screenlane's dashboard flows](https://screenlane.com/screens/all/views/dashboard/) (the live page is Page Flows, [Creating a new dashboard](https://pageflows.com/web/flows/creating-new-dashboard/)). Those flows treat empty and error states as part of the screen, use several columns on a wide desktop, and stack on a phone. Used here: Today is a list of real coin setups plus a plain sentence when fewer than three coins qualify; each alert is a row with a remove action; 1440 stays multi-column and 390 stacks.

## Layout

- The page is the full viewport. `.app` stays `max-width: none`. Side space is a 20–32px gutter so type does not touch the bezel. There is no centered column and no empty side rail.
- Desktop (1440): the scan chart and the setup column stay side by side from 80rem. Today keeps three tiles (setups, next event, pulse) and the watchlist under them.
- Phone (390): one column, the existing bottom nav, 44px targets on coarse pointers. Zone cards stack. Alert and setup rows wrap instead of overflowing.
- Sections are separated by 24–32px. Inside a card, rows are 8–14px apart. That is the Refactoring UI spacing scale (4, 8, 12, 16, 24, 32), not even padding on every box.

## Type

- UI: Geist Variable, already in the app. Body 15px, line-height 1.55. Headings 18px, weight 560, tracking -0.02em.
- Numbers, prices, and the zone-strength word: Geist Mono, tabular figures.
- Labels are smaller and lighter than the values they name (Refactoring UI: de-emphasize the label). Direction confidence stays the large word in the setup panel. Zone strength is a smaller word on each zone so the two cannot be read as the same score.
- Sentence case. The uppercase mono labels that already name data fields (Entry, Stop, TP1) stay, because they are field names in a table, not section eyebrows.

## Color

One accent, clay orange, used for the brand mark, focus, and the selected zone. Long and short keep green and red, and those colors are not used for Strong / OK / Weak. Strength is the word itself: Strong in full ink, OK in secondary ink, Weak in tertiary ink, so the label still works if the hue is missed.

| Role | Light | Dark |
| --- | --- | --- |
| Ground | `#f3f1ec` bone | `#12110e` warm off-black |
| Surface | `#fffcf8` | `#1c1b17` |
| Field | `#ebe8e1` | `#26241f` |
| Ink | `#1c1a16` | `#f3f0e8` |
| Secondary ink | `#5c574e` | `#b7b1a6` |
| Accent | `#d85a1a` | `#e8884a` |
| Long | `#1f7a45` | `#7dcea0` |
| Short | `#c43838` | `#f0a0a0` |

Light is not pure white on pure white. Dark is not pure black with pure white type. Cards separate from the ground by that tone step, not by a drop shadow. Shadows remain only on things that float: the symbol menu, the More menu, and the copy toast.

Corners are one system: 6px on controls, 12px on cards. The bottom nav on a phone is a solid surface, not a blurred pill.

## What did not change

Feature behavior, copy of the confidence line ("signals agreeing, not win chance"), chart line names (Entry top, Stop, TP1, TP2), forward-test scorecards, and the device-only alert store. Zone strength is an extra word on the zone, the chart's entry label, and the copied setup. It is not a new score in the engine's confidence.
