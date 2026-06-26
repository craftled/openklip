// Skill router: map a free-text intent (typed in the agent sidebar) to a named
// skill and an ordered sequence of OpenKlip CLI commands. The GUI shows these so
// a human — or an external agent reading the thread — can run the exact loop on
// the same project.json the editor edits. Pure + deterministic (unit-testable).

export interface SkillMatch {
  id: string;
  steps: string[];
  title: string;
}

interface SkillRule {
  build: (slug: string, intent: string) => string[];
  id: string;
  test: RegExp;
  title: string;
}

const ok = (s: string) => `openklip ${s}`;

const RULES: SkillRule[] = [
  {
    id: "filler",
    title: "Cut filler words",
    test: /\b(filler|ums?|uhs?|you know|like|sort of|kind of)\b/i,
    build: (slug) => [
      ok(`transcript ${slug}`),
      ok(`cut ${slug} --text "um" --all`),
      ok(`cut ${slug} --text "uh" --all`),
      ok(`cut ${slug} --text "you know" --all`),
      ok(`status ${slug}`),
    ],
  },
  {
    id: "captions",
    title: "Toggle captions",
    test: /\b(caption|captions|subtitle|subtitles)\b/i,
    build: (slug, intent) => {
      const off = /\b(off|disable|hide|remove|no)\b/i.test(intent);
      return [
        ok(`captions ${slug} ${off ? "off" : "on"}`),
        ok(`status ${slug}`),
      ];
    },
  },
  {
    id: "vignette",
    title: "Toggle vignette",
    test: /\bvignette\b/i,
    build: (slug, intent) => {
      const off = /\b(off|disable|remove|no)\b/i.test(intent);
      return [ok(`look ${slug} vignette ${off ? "off" : "on"}`)];
    },
  },
  {
    id: "zoom",
    title: "Add a push-in zoom",
    test: /\b(zoom|push.?in|punch.?in)\b/i,
    build: (slug) => [
      ok(`zoom-add ${slug} <fromSec> <toSec> --scale 1.15 --ramp 0.6`),
      ok(`status ${slug}`),
    ],
  },
  {
    id: "broll",
    title: "Add b-roll cover",
    test: /\bb-?roll\b/i,
    build: (slug) => [
      ok(`assets ${slug}`),
      ok(`broll-add ${slug} <assetId> <fromSec> <toSec>`),
      ok(`status ${slug}`),
    ],
  },
  {
    id: "title",
    title: "Add a title card",
    test: /\b(title|lower.?third|caption card|headline)\b/i,
    build: (slug) => [
      ok(`title-add ${slug} <fromSec> <toSec> "Your title" --position lower`),
      ok(`status ${slug}`),
    ],
  },
  {
    id: "export",
    title: "Render the cut",
    test: /\b(export|render|final|publish)\b/i,
    build: (slug) => [ok(`status ${slug}`), ok(`export ${slug}`)],
  },
  {
    id: "status",
    title: "Review the edit",
    test: /\b(status|summary|health|review|check)\b/i,
    build: (slug) => [ok(`status ${slug}`), ok(`doctor ${slug}`)],
  },
  {
    id: "cut",
    title: "Cut by phrase",
    test: /\b(cut|remove|delete|trim|drop)\b/i,
    build: (slug) => [
      ok(`transcript ${slug}`),
      ok(`cut ${slug} --text "phrase to remove"`),
      ok(`status ${slug}`),
    ],
  },
  {
    id: "transcript",
    title: "Read the transcript",
    test: /\b(transcript|read|words?|what.?s in)\b/i,
    build: (slug) => [ok(`transcript ${slug}`)],
  },
];

const ORIENTATION = (slug: string): SkillMatch => ({
  id: "orientation",
  title: "OpenKlip agent loop",
  steps: [
    ok(`transcript ${slug}`),
    ok(`status ${slug}`),
    ok(`cut ${slug} --text "filler phrase"`),
    ok(`export ${slug}`),
  ],
});

export function routeIntent(intent: string, slug: string): SkillMatch {
  for (const rule of RULES) {
    if (rule.test.test(intent)) {
      return {
        id: rule.id,
        title: rule.title,
        steps: rule.build(slug, intent),
      };
    }
  }
  return ORIENTATION(slug);
}

export function listSkills(): Array<{ id: string; title: string }> {
  return RULES.map((r) => ({ id: r.id, title: r.title }));
}
