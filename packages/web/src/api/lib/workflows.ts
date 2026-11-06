// Background runners for the three brand-intelligence workflows. Every run re-reads the
// reference documents and the product's evidence; results are persisted before they are shown.
import { generateText, Output } from "ai";
import { z } from "zod";
import { desc, eq, inArray } from "drizzle-orm";
import Papa from "papaparse";
import { db } from "../database";
import * as s from "../database/schema";
import type { Member } from "./permissions";
import {
  gateway, TEXT_MODEL, FAL_MODEL, falKey, UNTRUSTED_NOTE, MISSING_REFERENCES, SHOP_ORIGIN,
  fragranceContext, fetchLiveProduct, fetchImage, storeFile, fileBytes, signedReadUrl,
} from "./intelligence";

const now = () => new Date().toISOString();
type Img = { type: "image"; image: Uint8Array; mediaType: string };
const img = (bytes: Uint8Array, mime: string): Img => ({ type: "image", image: bytes, mediaType: mime });
const section = (doc: string, heading: string) => {
  const i = doc.indexOf(heading);
  if (i < 0) return doc;
  const rest = doc.slice(i);
  const next = rest.indexOf("\n## ", heading.length);
  return next < 0 ? rest : rest.slice(0, next);
};
function errorText(e: unknown) {
  return (e instanceof Error ? e.message : String(e)).slice(0, 1500);
}
function profileBlock(ctx: Awaited<ReturnType<typeof fragranceContext>>) {
  return [
    `<fragrance_brief source="fragrance-briefs.md § ${ctx.profile.briefSection}">\n${ctx.section}\n</fragrance_brief>`,
    `<motivation_tag source="product-motivation-tags.csv">\n${JSON.stringify(ctx.tag ?? {}, null, 1)}\n</motivation_tag>`,
    `Evidence tier: ${ctx.profile.evidenceTier}.`,
    ctx.profile.sourceConflict
      ? `KNOWN UNRESOLVED SOURCE CONFLICT (fragrance-briefs.md): ${ctx.profile.sourceConflictText}`
      : "No label-vs-website conflict is marked UNRESOLVED for this product in fragrance-briefs.md.",
    ctx.conflicts.length
      ? "Other open conflicts in the workspace record: " + ctx.conflicts.map((c) => `${c.field}: ${c.explanation}`).join(" | ")
      : "",
  ].filter(Boolean).join("\n\n");
}

// ---------------------------------------------------------------- Workflow 1: audit
const auditSchema = z.object({
  matches: z.array(z.object({
    finding: z.string(), liveEvidence: z.string(), recordEvidence: z.string(),
    recordSource: z.enum(["fragrance-briefs.md", "product-motivation-tags.csv", "Stored identity reference photo"]),
  })),
  hardConflicts: z.array(z.object({
    field: z.string(), liveSays: z.string(), recordSays: z.string(),
    recordSource: z.enum(["fragrance-briefs.md", "product-motivation-tags.csv", "Stored identity reference photo"]),
    whyItMatters: z.string(),
  })),
  uncertainReads: z.array(z.object({
    finding: z.string(), kind: z.enum(["interpretive", "image read", "omission", "evidence gap"]), whyNotAFactualError: z.string(),
  })),
  knownConflictObservation: z.string(),
  imagesReviewed: z.array(z.object({ image: z.string(), observation: z.string() })),
});
export type AuditFindings = z.infer<typeof auditSchema> & {
  knownConflicts: { text: string; source: string; status: string }[];
  liveSource: string;
  missingReferences: string[];
};

export async function runAudit(member: Member, productId: string) {
  const ctx = await fragranceContext(productId);
  const id = crypto.randomUUID();
  const liveUrl = `${SHOP_ORIGIN}/products/${ctx.profile.handle}`;
  await db.insert(s.auditReports).values({
    id, productId, actorId: member.id, createdAt: now(), status: "running", liveUrl, model: TEXT_MODEL, evidenceVersion: ctx.evidenceVersion,
  });
  const work = (async () => {
    try {
      const live = await fetchLiveProduct(ctx.profile.handle);
      await db.update(s.auditReports).set({ fetchedAt: live.fetchedAt, live: JSON.stringify(live) }).where(eq(s.auditReports.id, id));
      const parts: Array<{ type: "text"; text: string } | Img> = [];
      const labels: string[] = [];
      for (const [i, im] of live.images.slice(0, 2).entries()) {
        try {
          const f = await fetchImage(im.src, "shop");
          parts.push(img(f.bytes, f.mime));
          labels.push(`Image ${labels.length + 1}: live Shopify product image ${i + 1}${im.alt ? ` (alt text: "${im.alt}")` : ""}.`);
        } catch (e) {
          labels.push(`Live image ${i + 1} could not be downloaded: ${errorText(e)}`);
        }
      }
      if (ctx.product.referenceId) {
        try {
          const r = await fileBytes(ctx.product.referenceId);
          parts.push(img(r.bytes, r.file.mime));
          labels.push(`Image ${labels.length + 1}: stored identity reference photo of the actual product, uploaded by the brand.`);
        } catch {}
      }
      const known = [
        ...(ctx.profile.sourceConflict ? [{ text: ctx.profile.sourceConflictText, source: "fragrance-briefs.md (marked UNRESOLVED)", status: "Unresolved — a human must confirm which version is current" }] : []),
        ...ctx.conflicts.map((c) => ({ text: `${c.field}: ${c.explanation}`, source: "Workspace conflict record", status: `${c.status} — not resolved by this audit` })),
      ];
      const skill = ctx.need("runable-agent-skill.md").text;
      const { output } = await generateText({
        model: gateway(TEXT_MODEL),
        output: Output.object({ schema: auditSchema }),
        system: [
          "You audit a Go Natural product page against the brand's own evidence records.",
          section(skill, "## Task 1"),
          section(skill, "## Known gaps"),
          UNTRUSTED_NOTE,
        ].join("\n\n"),
        messages: [{
          role: "user",
          content: [
            { type: "text", text: [
              `Product: ${ctx.product.name} (records name: ${ctx.profile.csvName}).`,
              profileBlock(ctx),
              `<live_page url="${live.url}" fetched="${live.fetchedAt}">\nTitle: ${live.title}\nVariants: ${live.variants.map((v) => v.title).join(" | ")}\nDescription:\n${live.text || "[No description text on the live page]"}\n</live_page>`,
              labels.join("\n") || "No images could be reviewed.",
              `Rules:
- matches: a specific point where the live page agrees with a named record. Quote short phrases.
- hardConflicts: only clear factual contradictions (a different note, ingredient, name, format or claim). Name the record that disagrees. Something simply missing from the live page is not a hard conflict; put it under uncertainReads as "omission".
- uncertainReads: interpretive or mood comparisons with the motivation tag, readings of images, omissions and gaps in the evidence. Each must say why it is not a factual error.
- A known UNRESOLVED conflict listed above is pre-existing. Do not report it as a new hard conflict and never pick a winner. In knownConflictObservation, say which recorded version the live text currently resembles, if you can tell, and state that this does not resolve it. Use "" if there is no known conflict.
- Image reads are uncertain unless a label or name visibly contradicts the record.
- Do not produce a score or rating. Keep each finding to one or two sentences.`,
            ].join("\n\n") },
            ...parts,
          ],
        }],
      });
      const findings: AuditFindings = {
        ...output,
        knownConflicts: known,
        liveSource: `Live Shopify page ${live.url} (fetched ${live.fetchedAt})`,
        missingReferences: MISSING_REFERENCES.filter((m) => m === "brand-voice.md" || m === "visual-direction.md"),
      };
      const flags = [
        ...(ctx.profile.sourceConflict ? ["Known source conflict (unresolved)"] : []),
        ...(output.hardConflicts.length ? [`${output.hardConflicts.length} hard conflict${output.hardConflicts.length > 1 ? "s" : ""} with the live page`] : []),
      ];
      await db.update(s.auditReports).set({
        status: "complete", findings: JSON.stringify(findings), flagged: flags.length ? 1 : 0, flagSummary: flags.join(" · "),
      }).where(eq(s.auditReports.id, id));
    } catch (e) {
      console.error("audit failed", e);
      await db.update(s.auditReports).set({
        status: "failed", error: errorText(e),
        flagged: ctx.profile.sourceConflict ? 1 : 0,
        flagSummary: ctx.profile.sourceConflict ? "Known source conflict (unresolved) · audit failed" : "Audit failed",
      }).where(eq(s.auditReports.id, id));
    }
  })();
  return { id, done: work };
}

export const auditRun = { running: false, total: 0, done: 0, failed: 0, startedAt: "", finishedAt: "" };
export async function runAuditAll(member: Member) {
  if (auditRun.running) return;
  const profiles = await db.select({ productId: s.fragranceProfiles.productId }).from(s.fragranceProfiles);
  Object.assign(auditRun, { running: true, total: profiles.length, done: 0, failed: 0, startedAt: now(), finishedAt: "" });
  const queue = profiles.map((p) => p.productId);
  const worker = async () => {
    for (let pid = queue.shift(); pid; pid = queue.shift()) {
      try {
        const { id, done } = await runAudit(member, pid);
        await done;
        const [r] = await db.select().from(s.auditReports).where(eq(s.auditReports.id, id));
        if (r?.status !== "complete") auditRun.failed++;
      } catch {
        auditRun.failed++;
      }
      auditRun.done++;
    }
  };
  void Promise.all([worker(), worker(), worker()]).finally(() => Object.assign(auditRun, { running: false, finishedAt: now() }));
}

// ---------------------------------------------------------------- Workflow 2: territories
const ENTRY_POINTS = ["Ingredient / food", "Material / texture", "Place / atmosphere", "Person / presence", "Ritual / experience", "Concept / contrast"] as const;
const shortlistSchema = z.object({
  routes: z.array(z.object({ index: z.number().int().describe("1-based number of the candidate"), reason: z.string() })),
  reserve: z.array(z.object({ index: z.number().int(), reason: z.string() })),
  summary: z.string(),
});
const territorySchema = z.object({
  evidenceLimits: z.string(),
  territories: z.array(z.object({
    title: z.string(), idea: z.string(),
    entryPoints: z.array(z.enum(ENTRY_POINTS)),
    keyElements: z.array(z.string()),
    palette: z.array(z.object({ name: z.string(), hex: z.string().describe("Exactly #RRGGBB, six hex digits"), role: z.string() })),
    imageReferences: z.array(z.string()),
    reasoning: z.string(),
    evidenceCues: z.array(z.object({ cue: z.string(), source: z.enum(["fragrance-briefs.md", "product-motivation-tags.csv", "quiz-profile-map.csv"]) })),
    sourceChoice: z.string(),
  })),
  shortlist: shortlistSchema,
});
export const territoryRuns = new Map<string, { startedAt: string; error?: string }>();

export async function runTerritories(member: Member, productId: string) {
  const ctx = await fragranceContext(productId);
  if (territoryRuns.get(productId) && !territoryRuns.get(productId)!.error) return;
  territoryRuns.set(productId, { startedAt: now() });
  void (async () => {
    try {
      const method = ctx.need("creative-territory-method.md").text;
      const skill = ctx.need("runable-agent-skill.md").text;
      const quiz = Papa.parse<Record<string, string>>(ctx.need("quiz-profile-map.csv").text, { header: true, skipEmptyLines: true }).data
        .filter((r) => r.fragrance === ctx.profile.csvName);
      const links = await db.select().from(s.territoryProducts).where(eq(s.territoryProducts.productId, productId));
      const prior = [];
      for (const l of links) {
        const [t] = await db.select().from(s.territories).where(eq(s.territories.id, l.territoryId));
        const [d] = await db.select().from(s.territoryDetails).where(eq(s.territoryDetails.territoryId, l.territoryId));
        if (t) prior.push(`- ${t.title}: ${t.idea} [${d?.status ?? "earlier imported proposal"}]`);
      }
      const ref = ctx.product.referenceId ? await fileBytes(ctx.product.referenceId).catch(() => null) : null;
      const { output } = await generateText({
        model: gateway(TEXT_MODEL),
        output: Output.object({ schema: territorySchema }),
        system: [section(skill, "## Task 2"), section(skill, "## Known gaps"), method,
          `Not supplied, so do not cite or imitate them: ${MISSING_REFERENCES.join(", ")}.`].join("\n\n"),
        messages: [{ role: "user", content: [
          { type: "text", text: [
            `Product: ${ctx.product.name}.`,
            profileBlock(ctx),
            quiz.length ? `<quiz_profile_map source="quiz-profile-map.csv">\n${JSON.stringify(quiz)}\n</quiz_profile_map>` : "No quiz-profile-map.csv row for this product.",
            prior.length ? `Earlier directions recorded for this product (look at them before starting over; do not duplicate them):\n${prior.join("\n")}` : "No earlier directions are recorded for this product.",
            ref ? "The attached image is the actual product reference photo. Use it for appearance only, not as scent evidence." : "No product reference photo is stored.",
            `Explore 3 or 4 distinct named candidate directions, then shortlist the ones for ONE comparative moodboard (not one finished image).
- Explore from different entry points; combining them is fine.
- idea: one or two sentences. keyElements: 3 to 6 items, each with its role. palette: 4 or 5 colours with #RRGGBB hex and a role.
- imageReferences: 3 or 4 short descriptions of the reference photographs a designer should gather for this board. They are descriptions to search for, not existing images.
- evidenceCues: quote the specific recorded words that inform the direction, with their file. Never cite something not in the records above.
- reasoning: why the cues support this world; separate sourced fact from interpretation.
- sourceChoice: if a conflict is UNRESOLVED, say which recorded version this direction leans on or that it uses only cues shared by both; otherwise "".
- evidenceLimits: say plainly what the evidence does not cover. If the evidence tier is thin, say so and do not invent detail to compensate.
- shortlist: candidate numbers refer to the order of territories above (1-based).\n${SHORTLIST_RULES}`,
          ].join("\n\n") },
          ...(ref ? [img(ref.bytes, ref.file.mime)] : []),
        ] }],
      });
      const list = output.territories.slice(0, 4);
      if (list.length < 3) throw new Error(`Model returned ${list.length} directions; 3–4 are required. Nothing was saved.`);
      const batchId = crypto.randomUUID();
      const createdAt = now();
      const newIds: string[] = [];
      await db.transaction(async (tx) => {
        for (const [i, t] of list.entries()) {
          const id = `territory-gen-${crypto.randomUUID()}`;
          newIds.push(id);
          await tx.insert(s.territories).values({
            id, title: t.title, idea: t.idea, tone: i % 2 ? "spice" : "cafe", sample: 0,
            notes: `Generated proposal (${TEXT_MODEL}) from fragrance-briefs.md and product-motivation-tags.csv. Evidence limits: ${output.evidenceLimits}`,
          });
          await tx.insert(s.territoryProducts).values({ id: crypto.randomUUID(), territoryId: id, productId });
          await tx.insert(s.territoryDetails).values({
            territoryId: id, productId, batchId, position: i, status: "proposed",
            entryPoints: JSON.stringify(t.entryPoints), elements: JSON.stringify(t.keyElements), palette: JSON.stringify(t.palette),
            imageReferences: JSON.stringify({ described: t.imageReferences, productReferenceId: ctx.product.referenceId ?? null }),
            reasoning: JSON.stringify({ reasoning: t.reasoning, evidenceLimits: output.evidenceLimits, tier: ctx.profile.evidenceTier }),
            evidenceCues: JSON.stringify(t.evidenceCues), sourceChoice: t.sourceChoice, model: TEXT_MODEL,
            evidenceVersion: ctx.evidenceVersion, createdAt, actorId: member.id,
          });
        }
      });
      await db.insert(s.events).values({ id: crypto.randomUUID(), actorId: member.id, type: "Territories proposed", targetId: productId, text: `${list.length} creative directions proposed for ${ctx.product.name}. Proposals, not approvals.`, createdAt: now() });
      // The board shortlist is its own record, separate from the candidates and from the production selection.
      const candidates = list.map((t, i) => ({ index: i + 1, territoryId: newIds[i]!, title: t.title, idea: t.idea }));
      const shortlistId = await saveShortlist({ member, productId, batchId, candidates, pick: output.shortlist, origin: "recommended", model: TEXT_MODEL, evidenceVersion: ctx.evidenceVersion })
        .catch(() => null);
      territoryRuns.delete(productId);
      // One composite comparative moodboard for the shortlist (one fal image), not one image per direction.
      if (shortlistId && falKey()) await runComparativeBoard(member, shortlistId);
    } catch (e) {
      territoryRuns.set(productId, { startedAt: territoryRuns.get(productId)?.startedAt ?? now(), error: errorText(e) });
    }
  })();
}

// ---------------------------------------------------------------- Workflow 3: asset
export const DELIVERABLES = {
  "Hero shot": { aspect: "4:5", placement: "Shopify product page hero", guide: "The product is the clear hero, large in frame, label facing camera and readable." },
  "Ingredient flatlay": { aspect: "1:1", placement: "Shopify / social ingredient image", guide: "Top-down flatlay; the product with the recorded notes arranged around it; the product stays the largest, sharpest object." },
  Banner: { aspect: "16:9", placement: "Website banner", guide: "Wide scene; product on one third; generous empty space on the other side for later copy. No text in the image." },
  "Carousel tile": { aspect: "4:5", placement: "Social carousel tile", guide: "One clear idea per tile; product visible and recognisable at phone size." },
  "Shopify product card": { aspect: "1:1", placement: "Shopify collection card", guide: "Product centred and fully visible on a calm surface; reads clearly at thumbnail size." },
} as const;
export type DeliverableType = keyof typeof DELIVERABLES;
const promptSchema = z.object({
  referenceLock: z.string(), sceneAction: z.string(), composition: z.string(), aestheticEngine: z.string(), constraints: z.string(), reasoning: z.string(),
});
const CRITERIA = ["Concept communication", "Identity / text accuracy", "Hierarchy", "Physical plausibility", "Brief compliance"] as const;
const checkSchema = z.object({
  checks: z.array(z.object({ criterion: z.enum(CRITERIA), verdict: z.enum(["meets", "concern", "fails"]), note: z.string() })),
  visibleText: z.string(),
});
export const firstSentence = (t: string) => (t.match(/^[^.!?]*[.!?]/)?.[0] ?? t).trim();
export const MAX_PROMPT_WORDS = 110;
const words = (t: string) => t.split(/\s+/).filter(Boolean).length;
export function assemble(parts: z.infer<typeof promptSchema>, simplified: boolean) {
  const keys = ["referenceLock", "sceneAction", "composition", "aestheticEngine", "constraints"] as const;
  const full = keys.map((k) => parts[k].trim()).join("\n");
  // Short, plain prompts work best with nano-banana: fall back to the first sentence of each part when over the cap.
  if (simplified) {
    // Retry after no_media_generated: the same five parts, each cut to its first 14 words.
    return keys.map((k) => firstSentence(parts[k]).split(/\s+/).slice(0, 14).join(" ").replace(/[,;:]?$/, ".")).join("\n");
  }
  return words(full) > MAX_PROMPT_WORDS ? keys.map((k) => firstSentence(parts[k])).join("\n") : full;
}

async function setJob(id: string, values: Partial<typeof s.generationJobs.$inferInsert>) {
  await db.update(s.generationJobs).set({ ...values, updatedAt: now() }).where(eq(s.generationJobs.id, id));
}
/** Reference: the stored identity photo, otherwise the live Shopify product image. Never a moodboard or execution. */
async function productReference(member: Member, ctx: Awaited<ReturnType<typeof fragranceContext>>) {
  if (ctx.product.referenceId) return { refId: ctx.product.referenceId, refSource: "Stored product identity reference photo" };
  const live = await fetchLiveProduct(ctx.profile.handle);
  if (!live.images[0]) throw new Error("No product reference photo is stored and the live Shopify page has no image. Upload the actual product photo first.");
  const f = await fetchImage(live.images[0].src, "shop");
  const refId = await storeFile({ ...f, name: `${ctx.profile.handle}-live-shopify.${f.ext}`, ownerId: member.id, scopeType: "product", scopeId: ctx.product.id });
  return { refId, refSource: `Live Shopify product image ${live.images[0].src.split("?")[0]} (downloaded ${live.fetchedAt})` };
}
async function falEdit(prompt: string, refId: string, aspect: string) {
  const res = await fetch(`https://fal.run/${FAL_MODEL}`, {
    method: "POST",
    signal: AbortSignal.timeout(240000),
    headers: { Authorization: `Key ${falKey()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, image_urls: [await signedReadUrl(refId)], aspect_ratio: aspect, output_format: "png", num_images: 1 }),
  });
  const requestId = res.headers.get("x-fal-request-id");
  const body = await res.text();
  if (!res.ok) throw new Error(`fal.ai HTTP ${res.status}: ${body.slice(0, 800)}`);
  const url = (JSON.parse(body) as { images?: { url: string }[] }).images?.[0]?.url;
  if (!url) throw new Error(`fal.ai returned no image (no_media_generated). ${body.slice(0, 400)}`);
  return { url, requestId };
}

// ---------------------------------------------------------------- Workflow 2b: shortlist + comparative moodboard
// runable-agent-skill.md Task 2 (revised): candidates, the board shortlist and the production selection are
// separate records. One composite board compares the shortlisted routes for this fragrance; it does not need a
// route to be Selected. Earlier one-image-per-direction boards (BOARD_TYPE) stay in history, read-only.
export const BOARD_TYPE = "Territory mood board";
export const COMPARATIVE_BOARD_TYPE = "Comparative moodboard";
export const BOARD_TYPES = [BOARD_TYPE, COMPARATIVE_BOARD_TYPE];
/** fal nano-banana/edit has no 16:10; four columns use 16:9, two or three use 3:2 (the examples' ratio). */
export const boardAspect = (columns: number) => (columns >= 4 ? "16:9" : "3:2");
/** The user's saved working board prompts, read from the workspace record on every run. */
const EXAMPLE_PROMPTS = [
  { id: "prompt-board-caramel-source-v1", label: "Caramel Latte territory moodboard v1 — single-fragrance, three routes; the reference for legible comparison" },
  { id: "prompt-board-tipsy-source-v3", label: "Tipsy territory moodboard v3 — single-fragrance, three routes" },
  { id: "prompt-board-four-vanillas-v1", label: "Four Vanillas comparison v1 — RANGE comparison of four fragrances; layout and discipline reference only, not the single-fragrance shortlist rule" },
];
export const SHORTLIST_RULES = `Shortlist the candidates for ONE single-fragrance comparative board (runable-agent-skill.md Task 2.3):
- Recommend three routes by default. With four candidates, compare how well each draws on the product evidence, what it communicates emotionally or sensorially, how clearly it can be shown in an image and what it adds alongside the others. Hold the fourth as a reserve and name it with a short reason (or say it is a near-duplicate of a named route).
- If only two routes are strong, recommend two. Never more than four.
- routes: candidate numbers in board column order, each with a one-sentence reason. reserve: every candidate not on the board, each with a one-sentence reason.
- summary: one or two sentences on why this set works together on one board.`;
type Candidate = { index: number; territoryId: string; title: string; idea: string };
export async function saveShortlist(input: {
  member: Member; productId: string; batchId: string; candidates: Candidate[]; pick: z.infer<typeof shortlistSchema>;
  origin: "recommended" | "creator"; model: string | null; evidenceVersion: string; parentId?: string | null;
}) {
  const byIndex = new Map(input.candidates.map((c) => [c.index, c]));
  const routes = input.pick.routes.filter((r, i, a) => byIndex.has(r.index) && a.findIndex((x) => x.index === r.index) === i).slice(0, 4);
  if (routes.length < 2) throw new Error(`Shortlist needs at least two routes; got ${routes.length}. Nothing was saved.`);
  const on = new Set(routes.map((r) => r.index));
  const reserve = input.candidates.filter((c) => !on.has(c.index)).map((c) => ({
    territoryId: c.territoryId, reason: input.pick.reserve.find((r) => r.index === c.index)?.reason ?? "Not on the board.",
  }));
  const id = crypto.randomUUID();
  await db.insert(s.territoryShortlists).values({
    id, productId: input.productId, batchId: input.batchId,
    territoryIds: JSON.stringify(routes.map((r) => byIndex.get(r.index)!.territoryId)),
    reasons: JSON.stringify(routes.map((r) => ({ territoryId: byIndex.get(r.index)!.territoryId, reason: r.reason }))),
    reserve: JSON.stringify(reserve), summary: input.pick.summary, origin: input.origin, model: input.model,
    evidenceVersion: input.evidenceVersion, parentId: input.parentId ?? null, actorId: input.member.id, createdAt: now(),
  });
  return id;
}
export async function batchCandidates(batchId: string) {
  const ds = (await db.select().from(s.territoryDetails).where(eq(s.territoryDetails.batchId, batchId))).sort((a, b) => a.position - b.position);
  const out: (Candidate & { detail: typeof s.territoryDetails.$inferSelect })[] = [];
  for (const d of ds) {
    const [t] = await db.select().from(s.territories).where(eq(s.territories.id, d.territoryId));
    out.push({ index: out.length + 1, territoryId: d.territoryId, title: t?.title ?? "", idea: t?.idea ?? "", detail: d });
  }
  return out;
}
const candidateText = (cs: Awaited<ReturnType<typeof batchCandidates>>) =>
  cs.map((c) => `${c.index}. "${c.title}" — ${c.idea}\n   Entry points: ${c.detail.entryPoints}\n   Key elements: ${c.detail.elements}\n   Evidence cues: ${c.detail.evidenceCues}`).join("\n");

export const shortlistRuns = new Map<string, { startedAt: string; error?: string }>();
/** Recommends a shortlist for a batch saved before the revised skill (text model only, no fal image). */
export async function recommendShortlist(member: Member, productId: string, batchId: string) {
  if (shortlistRuns.get(batchId) && !shortlistRuns.get(batchId)!.error) return;
  shortlistRuns.set(batchId, { startedAt: now() });
  try {
    const ctx = await fragranceContext(productId);
    const cs = await batchCandidates(batchId);
    if (cs.length < 2) throw new Error("This batch has fewer than two directions.");
    const { output } = await generateText({
      model: gateway(TEXT_MODEL),
      output: Output.object({ schema: shortlistSchema }),
      system: [section(ctx.need("runable-agent-skill.md").text, "## Task 2"), SHORTLIST_RULES].join("\n\n"),
      prompt: [`Product: ${ctx.product.name}.`, profileBlock(ctx), `Saved candidate directions:\n${candidateText(cs)}`].join("\n\n"),
    });
    await saveShortlist({ member, productId, batchId, candidates: cs, pick: output, origin: "recommended", model: TEXT_MODEL, evidenceVersion: ctx.evidenceVersion });
    shortlistRuns.delete(batchId);
  } catch (e) {
    shortlistRuns.set(batchId, { startedAt: shortlistRuns.get(batchId)?.startedAt ?? now(), error: errorText(e) });
  }
}

const boardSchema = z.object({
  header: z.object({ productLine: z.string(), kicker: z.string(), sourceLine: z.string() }),
  columns: z.array(z.object({
    title: z.string(), premise: z.string(), keyElements: z.array(z.string()), palette: z.array(z.string()),
  })),
  scentCues: z.array(z.string()),
  scentCueSource: z.string(),
  prompt: z.string(),
  condensedPrompt: z.string(),
  reasoning: z.string(),
});
const BOARD_CRITERIA = ["Readable typography", "Product identity", "Route distinction", "Evidence fidelity"] as const;
const boardCheckSchema = z.object({
  checks: z.array(z.object({ criterion: z.enum(BOARD_CRITERIA), verdict: z.enum(["meets", "concern", "fails"]), note: z.string() })),
  visibleText: z.string(),
});
type BoardRoute = { t: typeof s.territories.$inferSelect; d: typeof s.territoryDetails.$inferSelect };
/** Writes the board prompt from the saved routes, the evidence and the user's example board prompts (text model only). */
export async function writeBoardPrompt(
  ctx: Awaited<ReturnType<typeof fragranceContext>>, routes: BoardRoute[], aspect: string, ref: Awaited<ReturnType<typeof fileBytes>>,
): Promise<z.infer<typeof boardSchema>> {
          const examples = await db.select().from(s.prompts).where(inArray(s.prompts.id, EXAMPLE_PROMPTS.map((e) => e.id)));
          const exampleText = EXAMPLE_PROMPTS.map((e) => {
            const p = examples.find((x) => x.id === e.id);
            return p ? `<example_prompt name="${e.label}">\n${p.text}\n</example_prompt>` : `[${e.label}: not in the workspace record]`;
          }).join("\n\n");
          const skill = ctx.need("runable-agent-skill.md").text;
          const { output } = await generateText({
            model: gateway(TEXT_MODEL),
            output: Output.object({ schema: boardSchema }),
            system: [
              "You write the image-generation prompt for ONE composite comparative creative-territory moodboard for a Go Natural fragrance.",
              section(skill, "## Task 2"),
              section(skill, "## Known gaps"),
              ctx.need("creative-territory-method.md").text,
              `The brand's own working board prompts follow. They show the expected structure, specificity and tone. Reuse their way of writing, not their content (other products, other routes):\n\n${exampleText}`,
              `Not supplied, so do not cite or imitate them: ${MISSING_REFERENCES.join(", ")}.`,
            ].join("\n\n"),
            messages: [{ role: "user", content: [
              { type: "text", text: [
                `Product: ${ctx.product.name}. Board: ${routes.length} equal columns, landscape ${aspect}, in this order:`,
                routes.map(({ t, d }, i) => `COLUMN ${i + 1}: "${t.title}" — ${t.idea}\n  Entry points: ${d.entryPoints}\n  Key elements: ${d.elements}\n  Palette: ${d.palette}\n  Image references: ${d.imageReferences}\n  Source choice: ${d.sourceChoice || "none"}`).join("\n"),
                profileBlock(ctx),
                "The attached image is the actual product reference photo, passed to the image model as its only input image.",
                `Write the prompt the way the example prompts are written:
  - Open with "Create ONE landscape ${aspect} …" and state that the input image is exact product identity reference only, not layout or photographic style.
  - Header: 'Go Natural' and the product name large, small 'CREATIVE TERRITORY EXPLORATION', and one short source-grounded line built only from recorded description words.
  - Product lock: describe the bottle, cap, liquid colour and label exactly as visible in the reference photo (shape, materials, colours, the label text you can read). Product study once per column with comparable modest prominence; no other perfume bottles; no redesign. Only mention packaging to remove if it is visible in the photo.
  - One block per column: title exactly as saved, a premise subtitle of at most six plain words, the route's visual idea, a main tile and 3–5 supporting tiles (specific, believable photography: gesture, material, light, setting), how light serves the idea, a row of five plain colour swatches, and a two-line KEY ELEMENTS label of at most eight short words in total.
- Never put hex codes or colour names in the prompt as text to print: name the swatch colours for the image model but say the swatches are unlabelled. Every word the board must print should be short, common and quoted exactly once; the image model misspells long or rare words in small type.
  - Footer 'SCENT CUES:' listing only notes recorded in fragrance-briefs.md for this product. If a conflict is UNRESOLVED, use only notes shared by both recorded versions, or omit the footer — never pick a version. If the evidence tier is thin, keep cues to what is recorded. Small bottom note 'Concept studies, not finished campaigns'.
  - Close with typography rules (all text correctly spelled and readable, titles fit their columns) and what to avoid: invented notes, performance or longevity claims, invented logos or signage, extra slogans.
  - Similar length and detail to the examples. condensedPrompt: the same board in at most 170 words, for a retry if the image model returns nothing.
  - header, columns, scentCues: exactly the text that should appear on the board. scentCueSource: which recorded line the cues come from (or why the footer is omitted). reasoning: two or three sentences on what the board compares and the evidence it relies on.`,
              ].join("\n\n") },
              img(ref.bytes, ref.file.mime),
            ] }],
          });
  return output;
}
export const boardRuns = new Set<string>();
/** One composite comparative board for a shortlist: prompt written from the evidence and the user's example prompts. */
export async function runComparativeBoard(member: Member, shortlistId: string, opts: { parentJobId?: string | null; simplified?: boolean } = {}) {
  if (boardRuns.has(shortlistId)) return null;
  const [sl] = await db.select().from(s.territoryShortlists).where(eq(s.territoryShortlists.id, shortlistId));
  if (!sl) throw new Error("Shortlist not found");
  const ids = JSON.parse(sl.territoryIds) as string[];
  const aspect = boardAspect(ids.length);
  const jobId = crypto.randomUUID();
  const date = now();
  boardRuns.add(shortlistId);
  await db.insert(s.generationJobs).values({
    id: jobId, productId: sl.productId, territoryId: ids[0]!, shortlistId, deliverableType: COMPARATIVE_BOARD_TYPE, aspectRatio: aspect,
    status: "building-prompt", falModel: FAL_MODEL, parentJobId: opts.parentJobId ?? null, simplified: opts.simplified ? 1 : 0,
    actorId: member.id, createdAt: date, updatedAt: date,
  });
  void (async () => {
    try {
      const ctx = await fragranceContext(sl.productId);
      const routes: BoardRoute[] = [];
      for (const id of ids) {
        const [t] = await db.select().from(s.territories).where(eq(s.territories.id, id));
        const [d] = await db.select().from(s.territoryDetails).where(eq(s.territoryDetails.territoryId, id));
        if (t && d) routes.push({ t, d });
      }
      const { refId, refSource } = await productReference(member, ctx);
      const ref = await fileBytes(refId);
      await setJob(jobId, { referenceFileId: refId, referenceSource: refSource, evidenceVersion: ctx.evidenceVersion });
      const parent = opts.parentJobId ? (await db.select().from(s.generationJobs).where(eq(s.generationJobs.id, opts.parentJobId)))[0] : null;
      let spec: z.infer<typeof boardSchema>;
      if (parent && parent.promptParts !== "{}") {
        spec = JSON.parse(parent.promptParts);
      } else {
        spec = await writeBoardPrompt(ctx, routes, aspect, ref);
      }
      const prompt = opts.simplified ? spec.condensedPrompt : spec.prompt;
      await setJob(jobId, { status: "generating", prompt, promptParts: JSON.stringify(spec), reasoning: spec.reasoning });
      const { url, requestId } = await falEdit(prompt, refId, aspect);
      await setJob(jobId, { status: "storing", falRequestId: requestId, resultSourceUrl: url });
      // Download immediately; the fal URL is provenance only.
      const result = await fetchImage(url, "fal");
      const fileId = await storeFile({ ...result, name: `${ctx.profile.handle}-comparative-moodboard.${result.ext}`, ownerId: member.id, scopeType: "board", scopeId: shortlistId });
      for (const [i, { t }] of routes.entries()) {
        const existing = await db.select().from(s.boards).where(eq(s.boards.territoryId, t.id));
        await db.insert(s.boards).values({
          id: crypto.randomUUID(), territoryId: t.id, number: Math.max(0, ...existing.map((b) => b.number)) + 1, fileId, createdAt: now(),
          notes: `Full comparative board. This territory is column ${i + 1} of ${routes.length}; preserve the comparative context. Generated (${FAL_MODEL}, job ${jobId}, shortlist ${shortlistId}) from the actual product reference. A proposal, not an approved asset.`,
        });
      }
      await setJob(jobId, { status: "checking", fileId });
      let check: string;
      try {
        const { output } = await generateText({
          model: gateway(TEXT_MODEL),
          output: Output.object({ schema: boardCheckSchema }),
          system: "Review a generated comparative moodboard against what it was meant to show. Be specific and critical. Automated check, not an approval.",
          messages: [{ role: "user", content: [
            { type: "text", text: `Image 1 is the actual product reference. Image 2 is the generated board.\nIntended text — header: ${JSON.stringify(spec.header)}; columns (palette entries are unlabelled swatches, not text): ${JSON.stringify(spec.columns)}; scent cues: ${JSON.stringify(spec.scentCues)}; bottom note: "Concept studies, not finished campaigns" (intended).\nAssess each criterion once: ${BOARD_CRITERIA.join(", ")}. Typography: report misspelled, garbled or missing text. Product identity: compare every bottle with the reference (shape, cap, label text) and count the bottles. Route distinction: do the columns read as different worlds? Evidence fidelity: any invented notes, claims, logos or signage. visibleText: transcribe the board's text.` },
            img(ref.bytes, ref.file.mime),
            img(result.bytes, result.mime),
          ] }],
        });
        check = JSON.stringify(output);
      } catch (e) {
        check = JSON.stringify({ checks: [], visibleText: "", error: `Check could not run: ${errorText(e)}` });
      }
      await setJob(jobId, { status: "complete", selfCheck: check });
      await db.insert(s.events).values({ id: crypto.randomUUID(), actorId: member.id, type: "Comparative moodboard generated", targetId: sl.productId, text: `Comparative moodboard (${routes.map((r) => r.t.title).join(" · ")}) for ${ctx.product.name} generated and stored. Proposal only.`, createdAt: now() });
    } catch (e) {
      await setJob(jobId, { status: "failed", error: errorText(e) }).catch(() => {});
    } finally {
      boardRuns.delete(shortlistId);
    }
  })();
  return jobId;
}

export async function runAsset(member: Member, job: typeof s.generationJobs.$inferSelect) {
  const id = job.id;
  try {
    const ctx = await fragranceContext(job.productId);
    const [t] = await db.select().from(s.territories).where(eq(s.territories.id, job.territoryId));
    const [td] = await db.select().from(s.territoryDetails).where(eq(s.territoryDetails.territoryId, job.territoryId));
    const spec = DELIVERABLES[job.deliverableType as DeliverableType];
    const { refId, refSource } = await productReference(member, ctx);
    const ref = await fileBytes(refId);
    await setJob(id, { referenceFileId: refId, referenceSource: refSource });
    let parts: z.infer<typeof promptSchema>;
    const parent = job.parentJobId ? (await db.select().from(s.generationJobs).where(eq(s.generationJobs.id, job.parentJobId)))[0] : null;
    if (job.simplified && parent?.promptParts && parent.promptParts !== "{}") {
      parts = JSON.parse(parent.promptParts);
    } else {
      const alpha = ctx.need("alphaprompt-system.md").text;
      const skill = ctx.need("runable-agent-skill.md").text;
      const { output } = await generateText({
        model: gateway(TEXT_MODEL),
        output: Output.object({ schema: promptSchema }),
        system: [alpha, section(skill, "## Task 3"),
          "The image model (fal-ai/nano-banana/edit) fails on long, technical prompts. Write each of the five parts as ONE short, plain, instructional sentence of at most 20 words. Whole prompt under 110 words. No camera-spec lists, lens numbers, weights, hashtags or jargon.",
          `product-type-briefs.md, visual-direction.md and brand-voice.md were not supplied. Use only the deliverable notes given.`].join("\n\n"),
        messages: [{ role: "user", content: [
          { type: "text", text: [
            `Deliverable: ${job.deliverableType} · ${spec.placement} · aspect ratio ${spec.aspect}. Workspace deliverable note (not a brand rule): ${spec.guide}`,
            `Selected direction "${t?.title}": ${t?.idea}\nKey elements: ${td?.elements}\nPalette: ${td?.palette}\nSource choice: ${td?.sourceChoice || "none needed"}`,
            profileBlock(ctx),
            job.adjustment ? `Requested adjustment from the creator for this regeneration: ${job.adjustment}` : "",
            "The attached image is the actual product reference. The generated image must keep this exact product.",
            "reasoning: two or three sentences on how the prompt expresses the direction and which evidence it relies on.",
          ].filter(Boolean).join("\n\n") },
          img(ref.bytes, ref.file.mime),
        ] }],
      });
      parts = output;
    }
    const prompt = assemble(parts, !!job.simplified);
    await setJob(id, { status: "generating", prompt, promptParts: JSON.stringify(parts), reasoning: parts.reasoning, evidenceVersion: ctx.evidenceVersion });
    const { url, requestId } = await falEdit(prompt, refId, spec.aspect);
    await setJob(id, { status: "storing", falRequestId: requestId, resultSourceUrl: url });
    // Download immediately; the fal URL is recorded for provenance only, never served.
    const result = await fetchImage(url, "fal");
    let deliverableId = parent?.deliverableId ?? null;
    const versionId = crypto.randomUUID(), promptId = crypto.randomUUID();
    const fileId = await storeFile({ ...result, name: `${ctx.profile.handle}-${job.deliverableType.toLowerCase().replace(/\W+/g, "-")}.${result.ext}`, ownerId: member.id, scopeType: "version", scopeId: versionId });
    await db.transaction(async (tx) => {
      let number = 1;
      if (deliverableId) {
        const vs = await tx.select().from(s.versions).where(eq(s.versions.deliverableId, deliverableId)).orderBy(desc(s.versions.number));
        number = (vs[0]?.number ?? 0) + 1;
        for (const v of vs) if (v.status === "In review") await tx.update(s.versions).set({ status: "Superseded" }).where(eq(s.versions.id, v.id));
        await tx.update(s.deliverables).set({ currentVersionId: versionId }).where(eq(s.deliverables.id, deliverableId));
      } else {
        deliverableId = crypto.randomUUID();
        const [approver] = await tx.select().from(s.members).where(eq(s.members.id, "member-client"));
        await tx.insert(s.deliverables).values({
          id: deliverableId, title: `${ctx.product.name} · ${job.deliverableType} · ${t?.title}`, campaignId: null, territoryId: job.territoryId,
          placement: spec.placement, format: job.deliverableType, targetType: "image", approverId: approver?.id ?? null, currentVersionId: versionId, sample: 0,
          requirements: JSON.stringify({ aspectRatio: spec.aspect, generatedBy: FAL_MODEL, jobId: id, sourceTerritoryId: job.territoryId, placementRules: "product-type-briefs.md not supplied; workspace deliverable defaults used" }),
        });
        await tx.insert(s.deliverableProducts).values({ id: crypto.randomUUID(), deliverableId, productId: ctx.product.id });
      }
      const priorPrompts = await tx.select().from(s.prompts).where(eq(s.prompts.deliverableId, deliverableId));
      await tx.insert(s.prompts).values({
        id: promptId, deliverableId, parentId: priorPrompts.at(-1)?.id ?? null, number: priorPrompts.length + 1,
        purpose: `Generated ${job.deliverableType} · ${FAL_MODEL}`, text: prompt, createdAt: now(), authorId: member.id,
        settings: JSON.stringify({ model: FAL_MODEL, aspect_ratio: spec.aspect, output_format: "png", reference: refSource, referenceFileId: refId, simplified: !!job.simplified }),
        lineage: JSON.stringify({ jobId: id, territoryId: job.territoryId, territoryTitle: t?.title, batchId: td?.batchId, parts, reasoning: parts.reasoning, adjustment: job.adjustment, evidenceVersion: ctx.evidenceVersion, falRequestId: requestId }),
      });
      await tx.insert(s.versions).values({
        id: versionId, deliverableId, number, status: "In review", createdAt: now(), authorId: member.id, promptId,
        summary: `Generated with ${FAL_MODEL} from “${t?.title}”. Pending review — not approved.`,
      });
      await tx.insert(s.slides).values({ id: crypto.randomUUID(), versionId, position: 0, fileId });
    });
    await setJob(id, { status: "checking", deliverableId, versionId, fileId });
    let selfCheck: string;
    try {
      const { output } = await generateText({
        model: gateway(TEXT_MODEL),
        output: Output.object({ schema: checkSchema }),
        system: "Review a generated product image against its brief. Be specific and critical. This is an automated self-check, not an approval.",
        messages: [{ role: "user", content: [
          { type: "text", text: `Image 1 is the actual product reference. Image 2 is the generated ${job.deliverableType} (${spec.aspect}).\nDirection: ${t?.title}: ${t?.idea}\nDeliverable note: ${spec.guide}\nPrompt used:\n${prompt}\n\nAssess each criterion once: ${CRITERIA.join(", ")}. For identity, compare bottle shape, cap, label artwork, logo and text against the reference and report any changed or invented text. visibleText: transcribe text visible on the product label in image 2.` },
          img(ref.bytes, ref.file.mime),
          img(result.bytes, result.mime),
        ] }],
      });
      selfCheck = JSON.stringify(output);
    } catch (e) {
      selfCheck = JSON.stringify({ checks: [], visibleText: "", error: `Self-check could not run: ${errorText(e)}` });
    }
    await db.update(s.prompts).set({ assessment: selfCheck }).where(eq(s.prompts.id, promptId));
    await setJob(id, { status: "complete", selfCheck });
    await db.insert(s.events).values({ id: crypto.randomUUID(), actorId: member.id, type: "Asset generated", targetId: deliverableId!, text: `${job.deliverableType} for ${ctx.product.name} generated and stored. Pending review, not approved.`, createdAt: now() });
  } catch (e) {
    await setJob(id, { status: "failed", error: errorText(e) });
  }
}
