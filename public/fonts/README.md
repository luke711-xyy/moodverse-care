# MOSIC console fonts

Self-hosted console type inspired by the user's retro spacecraft references. No runtime Google Fonts requests.

- Rajdhani, Indian Type Foundry: Latin WOFF2 weights 500 and 600, obtained from the official Google Fonts CSS API (`https://fonts.googleapis.com/css2?family=Rajdhani:wght@500;600&display=swap`). SIL Open Font License, included as `rajdhani-OFL.txt`.
- ZCOOL QingKe HuangYou: WOFF2 subset of the fixed Chinese console labels, obtained from the official Google Fonts CSS API with its `text` parameter. SIL Open Font License, included as `zcool-OFL.txt`. Other Chinese characters retain the existing platform fallback; names and user content are never translated or altered.

The three font files total about 31 KiB. These are a stylistic match, not a claim to identify or license the exact typeface in the reference image.

## Physical keys and window controls

- [Unifont from Fontsource](https://fontsource.org/fonts/unifont), GNU Unifont Authors: the user-selected regular-weight (400) face for the physical personal/exploration keys, navigation caption and settings key. Source: `@fontsource/unifont@5.3.0`, font version `v13.0.06`, original `files/unifont-latin-400-normal.woff2`. Despite its package filename, the source contains the Chinese key labels as well as Latin. The included `unifont-OFL.txt` is the package's SIL Open Font License.
- The active `unifont-controls-400.woff2` is a 39,680-byte subset covering printable ASCII and the non-ASCII characters in the music UI source (889 requested code points). It extends the original 2,336-byte `unifont-key-legends-400.woff2` subset so expanded-terminal and popup controls also render their Chinese action labels in Unifont. Source name, copyright and license metadata are preserved.
- Font files are served locally with `font-display: swap` and no synthetic bold. Only physical key legends and window controls use Unifont; prose, headings, form inputs, song metadata and CRT readouts retain their existing font stacks. Control positions, row heights and classifier geometry are unchanged. The new asset URL also avoids reusing the previous immutable, fixed-key-only font cache.
