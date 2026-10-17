# Design note (v3.6.0)

Visual only. Scans, the forward test, stored data, numbers, and the meaning of the copy stay as they are. The confidence line stays: "Low, Med or High is a weighted score of how strongly the signals agree. It is not a win chance."

The look replaces the Auros dark teal stack. The source for the tokens is the attached Glassnode design system: a light research canvas, white cards, black buttons, and dark bands only where a page is built from alternating sections.

## References

Looked at before the CSS change. Nothing was copied: no logos, no images, no sentences.

1. **Glassnode**, the attached style reference, and the live studio at [studio.glassnode.com](https://studio.glassnode.com/). The studio is a dense asset table on a light page (`theme-color` `#000000`). Used here: cloud `#edeff2` as the canvas, white cards with a 1px `#dedfe1` hairline, 2px corners, black filled buttons, ghost buttons, Inter, and `#e2e7fc` as the only wash. The chart line on the hero widget is `#4a6cf7` over that wash, which is the line color the spec names.

2. **Messari**, requested at [messari.io](https://messari.io/), which redirected to [Blockworks Intel](https://app.blockworks.com/?from=messari). The page is price and research tables (`theme-color` `#1a1a1a`). Used here: one dark band color, `#1a1a1a`, for the landing sections and the footer, with fog `#a0a0a0` for the reading text on that ground.

3. **Koyfin**, the marketing page at [koyfin.com](https://www.koyfin.com/). A light page: headline, short description, two actions, then feature sections. Used here: the landing order. A two-column hero (words and actions on the left, a chart card on the right), then a dark band, a light card grid, a dark close, and a dark footer.

## Light and dark

The theme toggle does not return. In this spec, dark is a band color on the landing (`#1a1a1a`), not a second theme for the terminal. Today, Scan, Market, Watchlist, Forward test, Backtest, Calendar, Wallets, Journal, and Settings all sit on the same light canvas.

`:root` and `.dark` share one token block, including `--bg:#edeff2`. A stored `sig.theme=light` that strips the `dark` class, or a stored dark preference that leaves it, cannot change a color. The inline script in `index.html` and `welcome.html` is unchanged, so the content-security-policy hash `sha256-j2RV/yS2KqN55+n381ZvyAMRj+yYXrSW4paJpk4kO0k=` still matches. React still adds `dark` and sets the theme color to `#edeff2`.

## Layout

- The terminal stays full-bleed. Gutters stay 24px on a wide screen and 12px on a phone. Cards are white, 16px padding, 2px corners, and a 1px hairline. The bottom nav on a phone is a white surface with a 2px corner and a hairline.
- Desktop (1440): Scan keeps the chart and the setup column side by side from 80rem. Today keeps its tiles. The forward test keeps its scorecards.
- Phone (390): one column, the same bottom nav, 44px targets on coarse pointers.
- Landing (`/welcome`): a white 64px bar (lowercase wordmark, 14px links, a ghost button and a black button). The hero is two columns on `#edeff2`: the headline, the description, and the two actions on the left; a white chart card on the right, with the only large shadow in the product. Under that, the exchange names in one weight and one gray, with no logos. A `#1a1a1a` band holds two alternating columns (sentence, then a white line drawing). A light band holds the feature cards. A dark band closes with the honest note and a white button. The footer is the same dark ground.

## Type

Inter is the only face in the terminal, including prices, which stay tabular so columns of figures do not shift. Body is 16px, weight 400, line-height 1.5. UI labels are 14px, weight 500. Headings are weight 700 with default tracking. The landing headline is the only other face: Space Grotesk, 56px, weight 700, line-height 1.2. On a phone that headline is 32px.

## Color

| Role | Token |
| --- | --- |
| Canvas | `#edeff2` cloud |
| Card, input, nav | `#ffffff` |
| Inset | `#f7f8fa` paper |
| Text and filled button | `#000000` |
| Dark band and footer | `#1a1a1a` |
| Nav links | `#333333` graphite |
| Body on light | `#5a5a5a` iron |
| Muted | `#666666` slate, `#808080` steel |
| Body on dark | `#a0a0a0` fog |
| Hairline | `#dedfe1` mist |
| Wash, the only accent | `#e2e7fc` |
| Chart, entry, and OI lines | `#4a6cf7` |
| Up candle and positive P&L | `#2f6b45` |
| Down candle and negative P&L | `#9a3d3d` |

Up and down candles, and positive and negative P&L, stay green and red so a long and a short still read at a glance. Those two hues are the exception. They are muted so they sit on the light canvas. They are not used for Strong, OK, or Weak. Strength stays the word.

`#e2e7fc` is the only UI wash: a selected zone, a selected book, a selected chip. `#4a6cf7` is only a line on a chart (entry, structure marks, open interest, backtest equity). A wash that pale would disappear on white, and the spec already names `#4a6cf7` as the chart line. Buttons stay black.

No gradients and no glows. The only drop shadows are the black button (`0 2px 4px rgba(0,0,0,.04)`) and the hero chart card (that shadow, plus `0 8px 32px rgba(0,0,0,.08)`). Everything else is a 1px hairline.

## What did not change

Feature behavior, the confidence sentence, chart line names (Entry top, Stop, TP1, TP2), forward-test scorecards, and the device-only alert store. `/` is still the terminal. Hash tabs and the PWA `start_url` stay `/`. The particle sphere and the aurora gradient are gone.
