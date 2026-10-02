# PiScope artwork

## Current app icon

Generated on 2026-10-02 with the built-in `imagegen` tool using OpenAI
`gpt-image-2`, without reference images or third-party logos. The mark combines
**π**, an observation ring and a live-signal dot, matching the dashboard's navy,
light-blue and green palette. It is project branding, not a measured result.

- [Full-size PNG](../public/icon.png): 1024 × 1024, suitable for social avatars.
- [Sidebar PNG](../public/icon-64.png): 64 × 64, displayed at 36 × 36.
- [Apple touch icon](../public/apple-touch-icon.png): 180 × 180, for home-screen bookmarks.
- [Favicon](../public/favicon.ico): 16, 32 and 48 px images in one ICO file.

The generated source was normalized to 1024 px; smaller assets were derived
with ImageMagick and stripped of metadata. ImageMagick is only an asset-editing
tool, not an application dependency. The original tool sidecar (containing
local paths) is not included. Public assets are served through an explicit
allowlist; pairing and private history protections are unchanged.

### Icon generation prompt

```text
Create the final app icon for PiScope, an independent local-first dashboard for the Pi coding agent that lets developers observe project and agent progress. One square 1024x1024 icon, no presentation mockup. Minimal flat vector-style identity, extremely crisp smooth geometry, recognizable at 16px and 32px. Full-bleed solid deep navy background #17263E, no outer frame and no baked-in rounded-square corners. Center a bold simple lowercase Greek pi symbol (π), built with a thick straight horizontal cap and two thick gently curved legs, in warm off-white #F3F7FF. Surround this pi with one generous circular observation/lens ring in soft sky blue #A9C9FF, thick enough to survive reduction. Integrate one small bright cyan #71DCAD observation dot into a short gap at the ring's upper-right, as a quiet live-signal accent. Keep symbol and ring spatially separated, no collisions, well-balanced optical centering. The circular symbol occupies roughly 72 percent of the canvas, with generous even padding. Only this single strong glyph-in-ring mark on navy. No wordmark, no Latin letters, no numbers, no tiny details, no crosshairs, no telescope drawing, no eye or face, no gradients, no glow, no drop shadows, no texture, no 3D, no watermark, no additional objects, no existing brand logo. Original modern developer-tool icon, restrained and purposeful.
```

## Historical project cover

This artwork belongs to the earlier **Agent Desk** name. It is kept as historical
provenance and is no longer used in PiScope's READMEs. The current README uses a
real UI screenshot with synthetic data instead.

- Asset: [agent-desk-cover.png](agent-desk-cover.png).
- Created for Agent Desk on 2026-09-26 with the built-in `image_gen` tool.
- Original generated artwork, with no reference image or third-party logo.
- Conceptual project illustration; not a screenshot or measured result.
- The actual demo screenshot is [preview.png](preview.png).

## Generation prompt

```text
Use case: ads-marketing.
Asset type: original wide README cover illustration for the open-source project Agent Desk. Generate one polished landscape image, approximately 2:1 aspect ratio.
Primary request: represent a local, model-independent dashboard that observes AI agent workflows, task states, and test reports.
Scene and style: premium minimal editorial 3D illustration on a very light warm-white background, matte paper and ceramic surfaces, soft natural shadows. Restrained charcoal typography, forest green and pale sage accents, a tiny muted amber status accent. Calm, precise, inviting, spacious.
Composition: large readable title in the open left third. In the right two-thirds, an elegant shallow isometric workspace with three small abstract agent tiles linked by thin paths to an upright observation panel. Show a few clean task cards with a progress ring, check mark, pause mark, and a small report page. All elements belong to one compact local workspace, suggesting transparent coordination and reliable local records. Strong simple silhouette and plenty of negative space. The objects should feel tactile and beautifully crafted, not like a literal screenshot or a technical architecture diagram.
Text, verbatim: "Agent Desk" as the large title; "Local-first. Model-independent." as the smaller subtitle. No other text or numerals.
Constraints: light background throughout; clean and highly readable at GitHub README width; no robots, faces, brains, neon, dark panels, code walls, cloud icon, provider logos, GitHub logo, invented statistics, watermark, frame, or device-brand marks. This is a conceptual project illustration, not a real application screenshot.
```
