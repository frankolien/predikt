# Predikt — brand assets

All PNGs are transparent (except the icon tiles, which carry the coal `#0B0D0E` background). Rendered from the app's own SVG mark + Space Grotesk, so they match the live nav/favicon exactly.

**Palette:** coal `#0B0D0E` · chalk `#EEF1F0` · live green `#2FE083` (dark) / `#0F9E58` (light)

## Which file to use

| File | Use |
|---|---|
| `predikt-icon-1024.png` (+512/256/180/64) | App icon / avatar / DoraHacks thumbnail — mark on the dark rounded tile. Works on any background. |
| `predikt-wordmark-dark-2460.png` | Wordmark for **dark** backgrounds (chalk text). Slides, README headers, video lower-thirds. |
| `predikt-wordmark-light-2460.png` | Wordmark for **light** backgrounds (coal text). |
| `predikt-mark-dark-1024.png` (+512) | Just the mark, transparent, chalk — for dark backgrounds. |
| `predikt-mark-light-1024.png` (+512) | Just the mark, transparent, coal — for light backgrounds. |

## Sources
`predikt-icon.svg`, `predikt-mark-dark.svg`, `predikt-mark-light.svg` are the vector sources — re-render any size with:
`rsvg-convert -w 2048 -h 2048 predikt-mark-dark.svg -o out.png`
