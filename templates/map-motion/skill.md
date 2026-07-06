---
description: Place animated map overlays (routes, arcs, globe flyovers)
label: Map motion
---

# Map motion graphics

Use the `map-motion` json-render catalog for animated map overlays powered by mapcn (MapLibre GL).

## Discover

```
openklip graphic list
```

Map overlays are json-render graphics, not template graphics. Use `json-graphic-add` with catalog `map-motion`.

## Place a route reveal

```
openklip json-graphic-add <slug> map-motion <fromSec> <toSec> --spec-file map.json --track broll
```

Example `map.json`:

```json
{
  "mode": "route",
  "theme": "dark",
  "projection": "mercator",
  "animation": "routeReveal",
  "points": [
    { "lng": -74.006, "lat": 40.7128, "label": "NYC" },
    { "lng": -118.2437, "lat": 34.0522, "label": "LA" }
  ],
  "style": {
    "lineColor": "#4285F4",
    "lineWidth": 4,
    "markerColor": "#3b82f6",
    "arcCurvature": 0.2
  }
}
```

Fixture: `tests/fixtures/map-motion-route.json`.

## Modes and animations

| mode | points | animation options |
| --- | --- | --- |
| `route` | 2+ cities | `flyover`, `routeReveal` |
| `arc` | 2 cities | `flyover`, `routeReveal` |
| `markers` | 1+ pins | `flyover` |
| `globe` | 1+ (requires `projection: "globe"`, `animation: "globeSpin"`) | `globeSpin` |

Keep spans **2-6 seconds** so export stays fast. Map tiles load from Carto at export time (network required).

## Patch or remove

```
openklip json-graphic-set <slug> <graphicId> --spec-file map.json
openklip graphic-rm <slug> <graphicId>
```

## Export

```
openklip status <slug> --json
openklip export <slug>
```

Rich map export uses headless Chrome with MapLibre (`chrome-headless-shell` required).
