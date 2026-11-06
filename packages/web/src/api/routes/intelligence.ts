import { z } from "zod";
import { and, desc, eq, inArray, notInArray } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { db } from "../database";
import * as s from "../database/schema";
import { authed, creator, productAccess, allowed, event } from "../lib/permissions";
import { FAL_MODEL, MISSING_REFERENCES, fragranceContext, falKey } from "../lib/intelligence";
import {
  runAudit, runAuditAll, auditRun, runTerritories, territoryRuns, runAsset, DELIVERABLES, BOARD_TYPE, BOARD_TYPES, COMPARATIVE_BOARD_TYPE,
  recommendShortlist, shortlistRuns, saveShortlist, batchCandidates, runComparativeBoard, boardRuns, type DeliverableType,
} from "../lib/workflows";

const STALE_MS = 15 * 60 * 1000;
const parse = <T>(text: string | null | undefined, fallback: T): T => {
  try {
    return text ? (JSON.parse(text) as T) : fallback;
  } catch {
    return fallback;
  }
};
function readReport(r: typeof s.auditReports.$inferSelect) {
  const stale = r.status === "running" && Date.now() - Date.parse(r.createdAt) > STALE_MS;
  return {
    ...r,
    status: stale ? "interrupted" : r.status,
    live: parse<Record<string, any>>(r.live, {}),
    findings: parse<Record<string, any> | null>(r.findings, null),
  };
}
function readDetail(d: typeof s.territoryDetails.$inferSelect) {
  return {
    ...d,
    entryPoints: parse<string[]>(d.entryPoints, []),
    elements: parse<string[]>(d.elements, []),
    palette: parse<{ name: string; hex: string; role: string }[]>(d.palette, []),
    imageReferences: parse<{ described: string[]; productReferenceId: string | null }>(d.imageReferences, { described: [], productReferenceId: null }),
    reasoning: parse<{ reasoning: string; evidenceLimits: string; tier: string }>(d.reasoning, { reasoning: d.reasoning, evidenceLimits: "", tier: "" }),
    evidenceCues: parse<{ cue: string; source: string }[]>(d.evidenceCues, []),
  };
}
function readJob(j: typeof s.generationJobs.$inferSelect) {
  const stale = !["complete", "failed"].includes(j.status) && Date.now() - Date.parse(j.updatedAt) > STALE_MS;
  return {
    ...j,
    status: stale ? "interrupted" : j.status,
    promptParts: parse<Record<string, string>>(j.promptParts, {}),
    selfCheck: parse<{ checks: { criterion: string; verdict: string; note: string }[]; visibleText: string; error?: string } | null>(j.selfCheck, null),
  };
}

export const intelligence = {
  /** Fragrance profile, missing references and workflow readiness for a product page. */
  profile: authed.input(z.object({ productId: z.string() })).handler(async ({ input, context: { member } }) => {
    await productAccess(member, input.productId);
    const [profile] = await db.select().from(s.fragranceProfiles).where(eq(s.fragranceProfiles.productId, input.productId));
    const images = await db.select().from(s.productImages).where(eq(s.productImages.productId, input.productId));
    return {
      profile: profile ?? null,
      images,
      missingReferences: MISSING_REFERENCES,
      falConfigured: !!falKey(),
      falModel: FAL_MODEL,
      falPrice: "US$0.0398 per image (fal.ai published price for this model; billed to your fal account)",
      deliverables: Object.entries(DELIVERABLES).map(([name, d]) => ({ name, ...d })),
      territoryRun: territoryRuns.get(input.productId) ?? null,
    };
  }),
  audit: authed.input(z.object({ productId: z.string() })).handler(async ({ input, context: { member } }) => {
    creator(member);
    const { id } = await runAudit(member, input.productId);
    await event(member, "Audit started", input.productId, "Live Shopify page audit against fragrance-briefs.md and product-motivation-tags.csv.");
    return { id };
  }),
  auditAll: authed.handler(async ({ context: { member } }) => {
    creator(member);
    await runAuditAll(member);
    await event(member, "Audit started", "fragrance-range", `Range audit across ${auditRun.total} fragrance products.`);
    return { ...auditRun };
  }),
  reports: authed.input(z.object({ productId: z.string() })).handler(async ({ input, context: { member } }) => {
    await productAccess(member, input.productId);
    const rows = await db.select().from(s.auditReports).where(eq(s.auditReports.productId, input.productId)).orderBy(desc(s.auditReports.createdAt));
    return rows.map(readReport);
  }),
  report: authed.input(z.object({ id: z.string() })).handler(async ({ input, context: { member } }) => {
    const [r] = await db.select().from(s.auditReports).where(eq(s.auditReports.id, input.id));
    if (!r) throw new ORPCError("NOT_FOUND");
    await productAccess(member, r.productId);
    return readReport(r);
  }),
  /** Live flags for the overview: unresolved source conflicts plus mismatches found by the latest audit. */
  flags: authed.handler(async ({ context: { member } }) => {
    const profiles = await db.select().from(s.fragranceProfiles);
    const reports = await db.select().from(s.auditReports).orderBy(desc(s.auditReports.createdAt));
    const items = [];
    for (const p of profiles) {
      if (!(await allowed(member, "product", p.productId))) continue;
      const latest = reports.find((r) => r.productId === p.productId && r.status === "complete");
      const last = reports.find((r) => r.productId === p.productId);
      const f = parse<{ hardConflicts?: unknown[]; uncertainReads?: unknown[] }>(latest?.findings, {});
      items.push({
        productId: p.productId,
        sourceConflict: !!p.sourceConflict,
        sourceConflictText: p.sourceConflictText,
        evidenceTier: p.evidenceTier,
        reportId: latest?.id ?? null,
        auditedAt: latest?.createdAt ?? null,
        hardConflicts: f.hardConflicts?.length ?? 0,
        uncertainReads: f.uncertainReads?.length ?? 0,
        lastStatus: last ? readReport(last).status : null,
        flagged: !!p.sourceConflict || (f.hardConflicts?.length ?? 0) > 0,
      });
    }
    return { items, run: { ...auditRun }, audited: items.filter((i) => i.reportId).length, total: items.length };
  }),
  territories: authed.input(z.object({ productId: z.string() })).handler(async ({ input, context: { member } }) => {
    await productAccess(member, input.productId);
    const ds = await db.select().from(s.territoryDetails).where(eq(s.territoryDetails.productId, input.productId)).orderBy(desc(s.territoryDetails.createdAt));
    const ts = await db.select().from(s.territories);
    const ids = ds.map((d) => d.territoryId);
    const boards = ids.length ? await db.select().from(s.boards).where(inArray(s.boards.territoryId, ids)) : [];
    const boardJobs = await db.select().from(s.generationJobs)
      .where(and(eq(s.generationJobs.productId, input.productId), eq(s.generationJobs.deliverableType, BOARD_TYPE)))
      .orderBy(desc(s.generationJobs.createdAt));
    const boardOf = (territoryId: string) => {
      // Per-direction boards (earlier workflow) stay on the card; comparative boards are shown once for the shortlist.
      const isComp = (x: typeof boards[number]) => x.notes.startsWith("Full comparative board");
      const b = boards.filter((x) => x.territoryId === territoryId && x.fileId && !isComp(x)).sort((a, c) => c.number - a.number)[0];
      const onComparative = boards.some((x) => x.territoryId === territoryId && x.fileId && isComp(x));
      const j = boardJobs.find((x) => x.territoryId === territoryId);
      const job = j ? readJob(j) : null;
      const active = !!job && ["generating", "storing"].includes(job.status);
      const status = b?.fileId ? "complete" : active ? job.status : (job?.status ?? "none");
      return {
        fileId: b?.fileId ?? null,
        status,
        error: status === "failed" ? job?.error ?? null : null,
        prompt: job?.prompt ?? "",
        referenceSource: job?.referenceSource ?? "",
        createdAt: b?.createdAt ?? job?.createdAt ?? null,
        onComparative,
      };
    };
    // Board shortlist per batch: newest row is current. Separate from the candidates and the production selection.
    const batches = [...new Set(ds.map((d) => d.batchId))];
    const sls = batches.length
      ? await db.select().from(s.territoryShortlists).where(inArray(s.territoryShortlists.batchId, batches)).orderBy(desc(s.territoryShortlists.createdAt))
      : [];
    const compJobs = await db.select().from(s.generationJobs)
      .where(and(eq(s.generationJobs.productId, input.productId), eq(s.generationJobs.deliverableType, COMPARATIVE_BOARD_TYPE)))
      .orderBy(desc(s.generationJobs.createdAt));
    const shortlists = batches.map((batchId) => {
      const mine = sls.filter((x) => x.batchId === batchId);
      const cur = mine[0];
      const j = compJobs.find((x) => mine.some((m) => m.id === x.shortlistId));
      const job = j ? readJob(j) : null;
      return {
        batchId,
        run: shortlistRuns.get(batchId) ?? null,
        revisions: mine.length,
        current: cur ? {
          id: cur.id, origin: cur.origin, model: cur.model, summary: cur.summary, createdAt: cur.createdAt,
          territoryIds: parse<string[]>(cur.territoryIds, []),
          reasons: parse<{ territoryId: string; reason: string }[]>(cur.reasons, []),
          reserve: parse<{ territoryId: string; reason: string }[]>(cur.reserve, []),
          boardRunning: boardRuns.has(cur.id),
        } : null,
        board: job ? {
          id: job.id, shortlistId: job.shortlistId, forCurrent: job.shortlistId === cur?.id, status: job.status, error: job.error,
          fileId: job.fileId, prompt: job.prompt, aspectRatio: job.aspectRatio, referenceSource: job.referenceSource, reasoning: job.reasoning,
          selfCheck: job.selfCheck, simplified: !!job.simplified, createdAt: job.createdAt,
          scentCueSource: (job.promptParts as Record<string, unknown>).scentCueSource as string | undefined,
        } : null,
      };
    });
    return {
      run: territoryRuns.get(input.productId) ?? null,
      shortlists,
      items: ds.map((d) => ({ ...readDetail(d), title: ts.find((t) => t.id === d.territoryId)?.title ?? "", idea: ts.find((t) => t.id === d.territoryId)?.idea ?? "", board: boardOf(d.territoryId) })),
    };
  }),
  /** Status of every generated direction the member can see (Creative Library). */
  statuses: authed.handler(async ({ context: { member } }) => {
    const ds = await db.select().from(s.territoryDetails);
    const out: { territoryId: string; productId: string; status: string; createdAt: string }[] = [];
    for (const d of ds) if (await allowed(member, "product", d.productId)) out.push({ territoryId: d.territoryId, productId: d.productId, status: d.status, createdAt: d.createdAt });
    return out;
  }),
  generateTerritories: authed.input(z.object({ productId: z.string() })).handler(async ({ input, context: { member } }) => {
    creator(member);
    await runTerritories(member, input.productId);
    return { started: true };
  }),
  /** Recommend a board shortlist for a batch saved before the revised skill. Text model only; no image is generated. */
  recommendShortlist: authed.input(z.object({ productId: z.string(), batchId: z.string() })).handler(async ({ input, context: { member } }) => {
    creator(member);
    await productAccess(member, input.productId);
    const cs = await batchCandidates(input.batchId);
    if (!cs.length || cs[0]!.detail.productId !== input.productId) throw new ORPCError("NOT_FOUND", { message: "No directions in this batch." });
    void recommendShortlist(member, input.productId, input.batchId);
    await event(member, "Shortlist requested", input.productId, "Board shortlist recommendation requested (text model only, no image).");
    return { started: true };
  }),
  /** Creator swaps routes on the board. Saves a new shortlist row; the earlier one stays in history. */
  swapShortlist: authed.input(z.object({ batchId: z.string(), territoryIds: z.array(z.string()).min(2).max(4) })).handler(async ({ input, context: { member } }) => {
    creator(member);
    const cs = await batchCandidates(input.batchId);
    if (!cs.length) throw new ORPCError("NOT_FOUND", { message: "No directions in this batch." });
    const productId = cs[0]!.detail.productId;
    await productAccess(member, productId);
    if (input.territoryIds.some((id) => !cs.some((c) => c.territoryId === id))) throw new ORPCError("BAD_REQUEST", { message: "Every route must come from this batch." });
    const [prev] = await db.select().from(s.territoryShortlists).where(eq(s.territoryShortlists.batchId, input.batchId)).orderBy(desc(s.territoryShortlists.createdAt)).limit(1);
    const prevReasons = parse<{ territoryId: string; reason: string }[]>(prev?.reasons, []);
    const prevReserve = parse<{ territoryId: string; reason: string }[]>(prev?.reserve, []);
    const idx = (id: string) => cs.find((c) => c.territoryId === id)!.index;
    const reasonOf = (id: string, on: boolean) =>
      (on ? prevReasons.find((r) => r.territoryId === id)?.reason : prevReserve.find((r) => r.territoryId === id)?.reason)
      ?? (on ? "Added to the board by the creator." : "Moved to reserve by the creator.");
    const ctx = await fragranceContext(productId);
    const id = await saveShortlist({
      member, productId, batchId: input.batchId, candidates: cs, origin: "creator", model: null, evidenceVersion: ctx.evidenceVersion, parentId: prev?.id ?? null,
      pick: {
        routes: input.territoryIds.map((t) => ({ index: idx(t), reason: reasonOf(t, true) })),
        reserve: cs.filter((c) => !input.territoryIds.includes(c.territoryId)).map((c) => ({ index: c.index, reason: reasonOf(c.territoryId, false) })),
        summary: "Creator's choice of routes for the comparative board.",
      },
    });
    const titles = input.territoryIds.map((t) => cs.find((c) => c.territoryId === t)!.title);
    await event(member, "Shortlist changed", productId, `Board shortlist set by the creator: ${titles.join(" · ")}. Not a production selection.`);
    return { id };
  }),
  /** One composite comparative moodboard (one fal image) for a shortlist. Does not need a Selected route. */
  generateComparativeBoard: authed
    .input(z.object({ shortlistId: z.string(), parentJobId: z.string().optional(), simplified: z.boolean().optional() }))
    .handler(async ({ input, context: { member } }) => {
      creator(member);
      if (!falKey()) throw new ORPCError("PRECONDITION_FAILED", { message: "fal key not configured. Add FAL_KEY to generate the moodboard; nothing was generated." });
      const [sl] = await db.select().from(s.territoryShortlists).where(eq(s.territoryShortlists.id, input.shortlistId));
      if (!sl) throw new ORPCError("NOT_FOUND", { message: "Shortlist not found." });
      await productAccess(member, sl.productId);
      const id = await runComparativeBoard(member, input.shortlistId, { parentJobId: input.parentJobId ?? null, simplified: input.simplified });
      if (!id) throw new ORPCError("CONFLICT", { message: "A moodboard for this shortlist is already running." });
      await event(member, "Comparative moodboard started", sl.productId, `One comparative moodboard requested via ${FAL_MODEL}${input.simplified ? " (condensed prompt retry)" : ""}. Proposal only.`);
      return { id };
    }),
  selectTerritory: authed.input(z.object({ territoryId: z.string() })).handler(async ({ input, context: { member } }) => {
    creator(member);
    const [d] = await db.select().from(s.territoryDetails).where(eq(s.territoryDetails.territoryId, input.territoryId));
    if (!d) throw new ORPCError("NOT_FOUND", { message: "Only generated directions can be selected here." });
    const date = new Date().toISOString();
    await db.transaction(async (tx) => {
      const all = await tx.select().from(s.territoryDetails).where(eq(s.territoryDetails.productId, d.productId));
      for (const o of all) {
        if (o.territoryId === d.territoryId) continue;
        // Same batch: the other proposals are rejected. Earlier batches: a previous selection returns to proposed.
        const next = o.batchId === d.batchId ? "rejected" : o.status === "selected" ? "proposed" : o.status;
        if (next !== o.status) await tx.update(s.territoryDetails).set({ status: next, decidedAt: date, decidedBy: member.id }).where(eq(s.territoryDetails.territoryId, o.territoryId));
      }
      await tx.update(s.territoryDetails).set({ status: "selected", decidedAt: date, decidedBy: member.id }).where(eq(s.territoryDetails.territoryId, d.territoryId));
    });
    const [t] = await db.select().from(s.territories).where(eq(s.territories.id, d.territoryId));
    await event(member, "Direction selected", d.productId, `“${t?.title}” selected as the input for asset generation. Other directions in the batch marked rejected. Not an asset approval.`);
    return { ok: true };
  }),
  generateAsset: authed
    .input(z.object({
      territoryId: z.string(),
      deliverableType: z.enum(Object.keys(DELIVERABLES) as [DeliverableType, ...DeliverableType[]]),
      adjustment: z.string().max(600).optional(),
      parentJobId: z.string().optional(),
      simplified: z.boolean().optional(),
    }))
    .handler(async ({ input, context: { member } }) => {
      creator(member);
      if (!falKey()) throw new ORPCError("PRECONDITION_FAILED", { message: "fal key not configured. Add FAL_KEY to generate assets; nothing was generated." });
      const [d] = await db.select().from(s.territoryDetails).where(eq(s.territoryDetails.territoryId, input.territoryId));
      if (!d || d.status !== "selected") throw new ORPCError("BAD_REQUEST", { message: "Mark this direction Selected before generating an asset." });
      await fragranceContext(d.productId);
      const busy = await db.select().from(s.generationJobs).where(and(eq(s.generationJobs.productId, d.productId), notInArray(s.generationJobs.deliverableType, BOARD_TYPES)));
      if (busy.some((j) => !["complete", "failed"].includes(j.status) && Date.now() - Date.parse(j.updatedAt) < STALE_MS))
        throw new ORPCError("CONFLICT", { message: "A generation for this product is already running." });
      const date = new Date().toISOString();
      const job = {
        id: crypto.randomUUID(), productId: d.productId, territoryId: d.territoryId, deliverableType: input.deliverableType,
        aspectRatio: DELIVERABLES[input.deliverableType].aspect, status: "building-prompt", falModel: FAL_MODEL,
        adjustment: input.adjustment?.trim() || null, parentJobId: input.parentJobId ?? null, simplified: input.simplified ? 1 : 0,
        actorId: member.id, createdAt: date, updatedAt: date,
      };
      await db.insert(s.generationJobs).values(job);
      const [row] = await db.select().from(s.generationJobs).where(eq(s.generationJobs.id, job.id));
      void runAsset(member, row!);
      await event(member, "Asset generation started", d.productId, `${input.deliverableType} requested via ${FAL_MODEL}${input.simplified ? " (simplified prompt retry)" : ""}.`);
      return { id: job.id };
    }),
  jobs: authed.input(z.object({ productId: z.string().optional() })).handler(async ({ input, context: { member } }) => {
    creator(member);
    // Asset jobs only; mood board jobs are reported with their directions.
    const notBoard = notInArray(s.generationJobs.deliverableType, BOARD_TYPES);
    const rows = input.productId
      ? await db.select().from(s.generationJobs).where(and(eq(s.generationJobs.productId, input.productId), notBoard)).orderBy(desc(s.generationJobs.createdAt))
      : await db.select().from(s.generationJobs).where(notBoard).orderBy(desc(s.generationJobs.createdAt));
    return rows.map(readJob);
  }),
};
