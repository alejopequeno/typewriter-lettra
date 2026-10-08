# Baking the font

The atlas in `public/fonts` is generated, but its inputs live here so the bake
is reproducible from a clean checkout.

```bash
pnpm bake:font
```

That runs lettra's baker over `tools/fonts/CourierPrime-Regular.ttf` with
`tools/charset.txt`, writing `public/fonts/courier-400.json` and
`courier-400.png`.

The charset is ASCII printable plus the accents, inverted marks and quotation
marks Spanish actually needs — including `«»`, which no lettra preset carries.
Characters missing from the charset render as `?`, so anything you want typed
has to be in that file.

Courier Prime bakes with zero kerning pairs, which is correct: it is
monospaced, so every glyph advances by the same amount and there is nothing to
kern.

## Why Courier Prime and not a distressed face

Faces like Special Elite have the wear drawn into the outlines, so the same
letter comes out broken the same way every time. The wear here is in the
shader instead (`src/gl/materials/ink-material.ts`), seeded per struck
character, so it never repeats.

Courier Prime is SIL OFL 1.1 — see https://quoteunquoteapps.com/courierprime.
