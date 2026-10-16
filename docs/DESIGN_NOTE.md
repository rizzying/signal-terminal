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

## Landing page

The terminal note above still describes `/`. `/welcome` is a separate document, so the full-width scan layout, the hash tabs, and the PWA `start_url` stay as they are. Patterns only: no Tempo assets, logos, or sentences. The one picture is a screenshot of Signal's own chart, taken from the scan view with a setup's zone lines on it.

Measured on the live page at [tempo.xyz](https://tempo.xyz/) (desktop 1440 and phone 390, scrolled through the page) before this layout. Two other sources stayed as checks, not as the page shape.

1. **Tempo.** Ground `#f5f5f5`. A centered pill, about 862×52, sitting 24px from the top, fill `#e9e9e9`, full radius. Wordmark on the left, a black pill (44px, radius 22px, label `#f5f5f5`) on the right. On a phone the same pill goes nearly edge to edge and the extra links disappear. Headline at 53px / 500 / tracking about −0.04em / line-height 0.95, max width 600px, starting 247px down the viewport (144px and 36px type on a phone). Subhead 16px / 500 / `#434343`, 32px under the headline. Two pills side by side, 48px tall, 8px apart: solid black, and a soft gray `rgba(194,194,194,.24)`. A quiet name strip 64px under that, then a full-width picture inset 60px, radius 32px. Later sections use a small tracked label and a 36px / 500 heading, with 100–160px of air above each block.

2. **Cal.com**, open at [cal.com](https://cal.com/). A promise, then a short explanation, then a list of what the product does, then the same action again at the end. Logo walls, testimonials, pricing, and their sentences stay there. Used here: each capability is a short lead-in plus one sentence, and the action repeats in the footer.

3. **[Refactoring UI](https://www.refactoringui.com/).** Labels are smaller and lighter than the text they introduce. The reading measure stays capped. Hierarchy comes from size and weight.

### Layout

- Desktop (1440): fixed pill nav, centered. Headline centered under a large top margin. Subhead one line. Two pills. Then Binance, Hyperliquid, Bulk as plain gray words (no marks). Then the chart card, 32px radius, inset 60px. Sections sit in a 720px column, 120px apart. The closing line and the last pill are centered.
- Phone (390): the pill is `calc(100% - 24px)`, still one row (wordmark, theme, Open Signal). Headline 36px. The two hero pills stay side by side. The chart card inset is 12px, radius 20px. Sections 72px apart.
- Light and dark follow `sig.theme`. Dark inverts the same neutrals: ground `#111`, nav `#2a2a2a`, the solid pill turns white with `#111` type. The chart picture swaps to the dark screenshot.

### Type

Geist Variable, already in the app. Headline 53px desktop / 36px phone, weight 500, tracking −0.04em, line-height 0.95. Subhead and body 16px / 500. Section labels 13px, tracked, faint. The sentence under WHAT IT IS, HOW CONFIDENCE WORKS, and HONEST NOTE is 36px desktop / 28px phone, the same role as Tempo's section heading. Feature lead-ins are 22px; the sentence under each is 16px muted.

### Color

This page does not use the terminal's warm bone or clay. The ground is the neutral `#f5f5f5` measured on Tempo, and the nav pill is `#e9e9e9`. Ink is black. The solid pill is black in light mode and white in dark mode. No gradient, no glass, no second accent.

### Spacing

- Nav 24px from the top (16px on a phone). Headline starts at 247px (144px on a phone).
- 32px from headline to subhead, 32px from subhead to the pills, 8px between pills.
- 64px from the pills to the name strip, 28px from the strip to the chart card.
- 120px before each section on a wide screen, 72px under 48rem. 48px between feature rows (32px on a phone).
