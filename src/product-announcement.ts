import {
  defineCatalog,
  type Spec,
  VisibilityConditionSchema,
  validateSpec,
} from "@json-render/core";
import { schema } from "@json-render/react/schema";
import { z } from "zod";

export const PRODUCT_ANNOUNCEMENT_CATALOG = "product-announcement" as const;
export const PRODUCT_ANNOUNCEMENT_WIDTH = 1920;
export const PRODUCT_ANNOUNCEMENT_HEIGHT = 1080;
export const PRODUCT_ANNOUNCEMENT_FPS = 30;
export const PRODUCT_ANNOUNCEMENT_LIMITS = {
  codeChars: 240,
  elementIdChars: 64,
  elements: 40,
  featureChars: 96,
  specBytes: 12_000,
  textChars: 180,
  childrenPerElement: 12,
} as const;

const HexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const AnnouncementTextSchema = z
  .string()
  .min(1)
  .max(PRODUCT_ANNOUNCEMENT_LIMITS.textChars);
const AnnouncementFeatureSchema = z
  .string()
  .min(1)
  .max(PRODUCT_ANNOUNCEMENT_LIMITS.featureChars);
const AnnouncementCodeSchema = z
  .string()
  .min(1)
  .max(PRODUCT_ANNOUNCEMENT_LIMITS.codeChars);

const JsonRenderElementSchema = z.object({
  type: z.string().min(1).max(PRODUCT_ANNOUNCEMENT_LIMITS.elementIdChars),
  props: z.record(z.string(), z.unknown()).default({}),
  children: z
    .array(z.string().min(1).max(PRODUCT_ANNOUNCEMENT_LIMITS.elementIdChars))
    .max(PRODUCT_ANNOUNCEMENT_LIMITS.childrenPerElement)
    .default([]),
  visible: VisibilityConditionSchema.default(true),
});

export const ProductAnnouncementSpecSchema = z
  .object({
    root: z.string().min(1).max(PRODUCT_ANNOUNCEMENT_LIMITS.elementIdChars),
    elements: z.record(
      z.string().min(1).max(PRODUCT_ANNOUNCEMENT_LIMITS.elementIdChars),
      JsonRenderElementSchema
    ),
  })
  .superRefine((spec, ctx) => {
    const elementCount = Object.keys(spec.elements).length;
    if (elementCount > PRODUCT_ANNOUNCEMENT_LIMITS.elements) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["elements"],
        message: `must include ${PRODUCT_ANNOUNCEMENT_LIMITS.elements} or fewer elements`,
      });
    }
  });

export type ProductAnnouncementSpec = z.infer<
  typeof ProductAnnouncementSpecSchema
>;

export const ProductAnnouncementCatalogSchema = z.literal(
  PRODUCT_ANNOUNCEMENT_CATALOG
);
export type ProductAnnouncementCatalog = z.infer<
  typeof ProductAnnouncementCatalogSchema
>;

export const productAnnouncementCatalog = defineCatalog(schema, {
  components: {
    AnnouncementScene: {
      description: "Full-frame product announcement composition.",
      props: z.object({
        product: AnnouncementTextSchema,
        claim: AnnouncementTextSchema,
        mood: z.enum(["technical", "launch", "proof"]),
      }),
      slots: ["default"],
    },
    CodeSnippet: {
      description: "Short technical proof snippet for abstract launches.",
      props: z.object({
        code: AnnouncementCodeSchema,
        language: z.enum(["bash", "ts", "json"]),
      }),
    },
    FeatureStack: {
      description: "Three compact product capability bullets.",
      props: z.object({
        items: z.array(AnnouncementFeatureSchema).length(3),
      }),
    },
    HeroStatement: {
      description: "Main claim for the product announcement.",
      props: z.object({
        accent: HexColorSchema,
        eyebrow: AnnouncementTextSchema,
        headline: AnnouncementTextSchema,
      }),
    },
    ProofPoint: {
      description: "Small quantified proof point.",
      props: z.object({
        label: AnnouncementTextSchema,
        note: AnnouncementTextSchema,
        value: AnnouncementTextSchema,
      }),
    },
  },
  actions: {},
});

export interface ProductAnnouncementValidation {
  issues: string[];
  spec?: ProductAnnouncementSpec;
  success: boolean;
}

function issuePath(path: PropertyKey[]): string {
  return path.length > 0 ? path.map(String).join(".") : "props";
}

function specByteLength(rawSpec: unknown): number | null {
  try {
    return Buffer.byteLength(JSON.stringify(rawSpec), "utf8");
  } catch {
    return null;
  }
}

function validateProductAnnouncementGraph(
  spec: ProductAnnouncementSpec
): string[] {
  const issues: string[] = [];
  const reachable = new Set<string>();
  const visiting = new Set<string>();
  const root = spec.elements[spec.root];
  if (!root) {
    return [`root: unknown element ${spec.root}`];
  }

  const visit = (elementKey: string, path: string[]): void => {
    if (visiting.has(elementKey)) {
      issues.push(`${[...path, elementKey].join(" -> ")}: cyclic child graph`);
      return;
    }
    if (reachable.has(elementKey)) {
      return;
    }
    const element = spec.elements[elementKey];
    if (!element) {
      const parent = path.at(-1) ?? "root";
      issues.push(`${parent}: unknown child ${elementKey}`);
      return;
    }
    visiting.add(elementKey);
    for (const childKey of element.children) {
      visit(childKey, [...path, elementKey]);
    }
    visiting.delete(elementKey);
    reachable.add(elementKey);
  };

  visit(spec.root, []);
  for (const elementKey of Object.keys(spec.elements)) {
    if (!reachable.has(elementKey)) {
      issues.push(
        `${elementKey}: orphaned element is not reachable from root ${spec.root}`
      );
    }
  }
  return issues;
}

export function validateProductAnnouncementSpec(
  rawSpec: unknown
): ProductAnnouncementValidation {
  const byteLength = specByteLength(rawSpec);
  if (byteLength === null) {
    return {
      issues: ["Spec must be JSON-serializable"],
      success: false,
    };
  }
  if (byteLength > PRODUCT_ANNOUNCEMENT_LIMITS.specBytes) {
    return {
      issues: [
        `Spec is too large: ${byteLength} bytes exceeds ${PRODUCT_ANNOUNCEMENT_LIMITS.specBytes}`,
      ],
      success: false,
    };
  }

  const parsed = ProductAnnouncementSpecSchema.safeParse(rawSpec);
  if (!parsed.success) {
    return {
      issues: parsed.error.issues.map(
        (issue) => `${issuePath(issue.path)}: ${issue.message}`
      ),
      success: false,
    };
  }

  const structure = productAnnouncementCatalog.validate(parsed.data);
  if (!(structure.success && structure.data)) {
    return {
      issues: structure.error?.issues.map(
        (issue) => `${issuePath(issue.path)}: ${issue.message}`
      ) ?? ["Spec failed json-render structural validation"],
      success: false,
    };
  }

  const normalized = ProductAnnouncementSpecSchema.parse(structure.data);
  const graphIssues = validateProductAnnouncementGraph(normalized);
  if (graphIssues.length > 0) {
    return {
      issues: graphIssues,
      success: false,
    };
  }

  const graph = validateSpec(normalized as Spec, { checkOrphans: true });
  if (!(graph.valid && graph.issues.length === 0)) {
    return {
      issues: graph.issues.map((issue) => issue.message),
      success: false,
    };
  }

  const spec: ProductAnnouncementSpec = {
    root: normalized.root,
    elements: {},
  };
  const issues: string[] = [];

  for (const [elementKey, element] of Object.entries(normalized.elements)) {
    const component =
      productAnnouncementCatalog.data.components[
        element.type as keyof typeof productAnnouncementCatalog.data.components
      ];
    if (!component) {
      issues.push(`${elementKey}: unknown component ${element.type}`);
      continue;
    }

    const propsResult = component.props.safeParse(element.props);
    if (!propsResult.success) {
      const detail = propsResult.error.issues
        .map((issue) => `${issuePath(issue.path)}: ${issue.message}`)
        .join("; ");
      issues.push(`${elementKey}: ${detail}`);
      continue;
    }

    spec.elements[elementKey] = {
      ...element,
      props: propsResult.data as Record<string, unknown>,
    };
  }

  return {
    issues,
    spec: issues.length === 0 ? spec : undefined,
    success: issues.length === 0,
  };
}

export function assertProductAnnouncementSpec(
  rawSpec: unknown
): ProductAnnouncementSpec {
  const result = validateProductAnnouncementSpec(rawSpec);
  if (result.success && result.spec) {
    return result.spec;
  }
  throw new Error(
    `invalid product announcement spec: ${result.issues.join("; ")}`
  );
}

export function parseProductAnnouncementSpecJson(
  rawJson: string
): ProductAnnouncementSpec {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`invalid product announcement spec JSON: ${detail}`);
  }
  return assertProductAnnouncementSpec(parsed);
}

export interface ProductAnnouncementSpecInput {
  accent?: string;
  claim?: string;
  code?: string;
  eyebrow?: string;
  features?: string[];
  headline?: string;
  language?: "bash" | "ts" | "json";
  mood?: "technical" | "launch" | "proof";
  product?: string;
  proofLabel?: string;
  proofNote?: string;
  proofValue?: string;
}

function threeFeatures(
  features: string[] | undefined
): [string, string, string] {
  const defaults: [string, string, string] = [
    "Catalog-constrained layouts",
    "No arbitrary generated code",
    "Native React render path",
  ];
  if (!features) {
    return defaults;
  }
  return [
    features[0]?.trim() || defaults[0],
    features[1]?.trim() || defaults[1],
    features[2]?.trim() || defaults[2],
  ];
}

export function buildProductAnnouncementSpec(
  input: ProductAnnouncementSpecInput = {}
): ProductAnnouncementSpec {
  const features = threeFeatures(input.features);
  return assertProductAnnouncementSpec({
    root: "scene",
    elements: {
      scene: {
        type: "AnnouncementScene",
        props: {
          product: input.product ?? "OpenKlip",
          claim:
            input.claim ??
            "Agent-first announcement videos from structured UI specs",
          mood: input.mood ?? "technical",
        },
        children: ["hero", "features", "snippet", "proof"],
        visible: true,
      },
      hero: {
        type: "HeroStatement",
        props: {
          accent: input.accent ?? "#f0b429",
          eyebrow: input.eyebrow ?? "Product update",
          headline:
            input.headline ?? "JSON specs become export-ready motion graphics",
        },
        children: [],
        visible: true,
      },
      features: {
        type: "FeatureStack",
        props: { items: features },
        children: [],
        visible: true,
      },
      snippet: {
        type: "CodeSnippet",
        props: {
          code:
            input.code ??
            "openklip json-graphic-add demo product-announcement 4.2 8.2",
          language: input.language ?? "bash",
        },
        children: [],
        visible: true,
      },
      proof: {
        type: "ProofPoint",
        props: {
          label: input.proofLabel ?? "Agent surface",
          value: input.proofValue ?? "1 JSON spec",
          note: input.proofNote ?? "validated before render",
        },
        children: [],
        visible: true,
      },
    },
  });
}

export const sampleProductAnnouncementSpec = buildProductAnnouncementSpec();
