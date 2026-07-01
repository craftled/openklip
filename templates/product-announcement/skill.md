# Product announcement

Short technical launch video: keep the speaker concise, add one or two validated json-render announcement graphics, then export. Best for abstract products where a structured UI frame explains the value better than stock b-roll.

## Before you edit

```bash
openklip status <slug>
openklip transcript grep <slug> "launch"
openklip overlays <slug>
```

Read enough transcript context to find the hook, product name, main claim, proof point, and feature list.

## Cuts

1. Cut warm-ups, filler, and repeated takes before the real hook.
2. Keep the first strong claim and one proof sentence.
3. Prefer whole phrases or sentences. Do not cut one word out of the middle of a clean sentence.

## Announcement graphic

Use the `json-graphic-add` tool or CLI command. Catalog must be `product-announcement`.

```bash
openklip json-graphic-add <slug> product-announcement <fromSec> <toSec> --spec-file spec.json --track title
```

The spec may use only these components:

- `AnnouncementScene`: full-frame root with `product`, `claim`, and `mood`.
- `HeroStatement`: `eyebrow`, `headline`, and `accent`.
- `FeatureStack`: exactly three feature strings.
- `CodeSnippet`: short `bash`, `ts`, or `json` proof snippet.
- `ProofPoint`: compact `label`, `value`, and `note`.

Place the graphic over the moment where the speaker names the product or makes the main abstract claim. Keep spans around 3-6 seconds. Use `json-graphic-set` to patch the span or spec.

## Look

- Captions stay on.
- Use a light push-in on the speaker before or after the announcement graphic, not under it.
- Avoid stacking b-roll over a full-frame announcement graphic.

## Verify and export

```bash
openklip status <slug>
openklip overlays <slug>
openklip export <slug>
```

Reload the browser after CLI edits. Prefer one writer at a time.
