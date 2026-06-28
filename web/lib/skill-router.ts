// Skill router: map a free-text intent (typed in the agent sidebar) to a named
// skill and an ordered sequence of OpenKlip CLI commands. The GUI shows these so
// a human : or an external agent reading the thread : can run the exact loop on
// the same project.json the editor edits. Pure + deterministic (unit-testable).

export interface SkillMatch {
  id: string;
  steps: string[];
  title: string;
}

interface SkillRule {
  build: (slug: string, intent: string) => string[];
  description: string;
  id: string;
  invokeText: string;
  test: RegExp;
  title: string;
}

const ok = (s: string) => `openklip ${s}`;

const RULES: SkillRule[] = [
  {
    id: "filler",
    title: "Cut filler words",
    description:
      "Grep and cut um, uh, you know, and similar filler across the transcript.",
    invokeText: "Cut all filler words",
    test: /\b(filler|ums?|uhs?|you know|like|sort of|kind of)\b/i,
    build: (slug) => [
      ok(`transcript grep ${slug} "um" --all`),
      ok(`transcript grep ${slug} "uh" --all`),
      ok(`transcript grep ${slug} "you know" --all`),
      ok(`cut ${slug} --text "um" --all`),
      ok(`cut ${slug} --text "uh" --all`),
      ok(`cut ${slug} --text "you know" --all`),
      ok(`status ${slug} --json`),
    ],
  },
  {
    id: "captions",
    title: "Toggle captions",
    description: "Turn burned captions on or off for export.",
    invokeText: "Toggle captions",
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
    description: "Enable or disable the vignette look flag.",
    invokeText: "Toggle vignette",
    test: /\bvignette\b/i,
    build: (slug, intent) => {
      const off = /\b(off|disable|remove|no)\b/i.test(intent);
      return [ok(`look ${slug} vignette ${off ? "off" : "on"}`)];
    },
  },
  {
    id: "zoom",
    title: "Add a push-in zoom",
    description: "Place a push-in zoom on a spoken emphasis phrase.",
    invokeText: "Add a push-in zoom on emphasis",
    test: /\b(zoom|push.?in|punch.?in)\b/i,
    build: (slug) => [
      ok(`zoom-add-phrase ${slug} "emphasis phrase" --scale 1.15 --ramp 0.6`),
      ok(`overlays ${slug} --json`),
    ],
  },
  {
    id: "broll",
    title: "Add b-roll cover",
    description: "Cover a spoken span with a registered b-roll asset.",
    invokeText: "Add b-roll cover",
    test: /\bb-?roll\b/i,
    build: (slug) => [
      ok(`assets ${slug}`),
      ok(`broll-add-phrase ${slug} <assetId> "spoken phrase"`),
      ok(`overlays ${slug} --json`),
    ],
  },
  {
    id: "title",
    title: "Add a title card",
    description: "Burn a lower third or title at a spoken phrase.",
    invokeText: "Add a title card",
    test: /\b(title|lower.?third|caption card|headline)\b/i,
    build: (slug) => [
      ok(
        `title-add-phrase ${slug} "spoken phrase" "Title\\nSubtitle" --position lower`
      ),
      ok(`overlays ${slug} --json`),
    ],
  },
  {
    id: "export",
    title: "Render the cut",
    description: "Review the edit, then export output/out.mp4.",
    invokeText: "Export the final cut",
    test: /\b(export|render|final|publish)\b/i,
    build: (slug) => [ok(`status ${slug} --json`), ok(`export ${slug}`)],
  },
  {
    id: "status",
    title: "Review the edit",
    description: "Summarize words, ranges, overlays, and run doctor.",
    invokeText: "Review the edit status",
    test: /\b(status|summary|health|review|check)\b/i,
    build: (slug) => [ok(`status ${slug} --json`), ok(`doctor ${slug}`)],
  },
  {
    id: "cut",
    title: "Cut by phrase",
    description: "Grep a phrase, cut the first matching run, verify status.",
    invokeText: "Cut a phrase from the transcript",
    test: /\b(cut|remove|delete|trim|drop)\b/i,
    build: (slug) => [
      ok(`transcript grep ${slug} "phrase to remove"`),
      ok(`cut ${slug} --text "phrase to remove"`),
      ok(`status ${slug} --json`),
    ],
  },
  {
    id: "template",
    title: "Load edit template",
    description: "Show the project template skill and run the playbook loop.",
    invokeText: "Apply template talking-head",
    test: /\bapply template\b/i,
    build: (slug, intent) => {
      const id =
        intent.match(/apply template ([a-z][a-z0-9-]*)/i)?.[1] ?? "talking-head";
      return [
        ok(`template show ${id}`),
        ok(`transcript grep ${slug} "filler"`),
        ok(`status ${slug} --json`),
        ok(`export ${slug}`),
      ];
    },
  },
  {
    id: "transcript",
    title: "Read the transcript",
    description: "Grep phrases and slice word context before editing.",
    invokeText: "Read the transcript",
    test: /\b(transcript|read|words?|what.?s in)\b/i,
    build: (slug) => [
      ok(`transcript grep ${slug} "..."`),
      ok(`transcript span ${slug} w0 --context 3`),
    ],
  },
];

const ORIENTATION = (slug: string): SkillMatch => ({
  id: "orientation",
  title: "OpenKlip agent loop",
  steps: [
    ok("template show talking-head"),
    ok(`transcript grep ${slug} "filler"`),
    ok(`status ${slug} --json`),
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

export interface WorkflowSkillListing {
  description: string;
  id: string;
  invokeText: string;
  slash: string;
  title: string;
}

export function listWorkflowSkills(): WorkflowSkillListing[] {
  return RULES.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    slash: r.id,
    invokeText: r.invokeText,
  }));
}
