import { z } from "zod";
import { eq } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { db } from "../database";
import * as s from "../database/schema";
import { authed, creator, workAccess, event } from "../lib/permissions";

async function packet(member: Parameters<typeof creator>[0], id: string) {
  creator(member);
  const d = await workAccess(member, id);
  const links = await db
    .select()
    .from(s.deliverableProducts)
    .where(eq(s.deliverableProducts.deliverableId, id));
  const all = await db.select().from(s.products);
  const products = all.filter((p) => links.some((l) => l.productId === p.id));
  const snapshots = await db.select().from(s.snapshots);
  const ps = products.map((p) => ({
    ...p,
    snapshot: snapshots.filter((x) => x.productId === p.id).at(-1),
  }));
  const [t] = d.territoryId
    ? await db.select().from(s.territories).where(eq(s.territories.id, d.territoryId))
    : [];
  const bs = t ? await db.select().from(s.boards).where(eq(s.boards.territoryId, t.id)) : [];
  const selections = await db.select().from(s.selections);
  const selection = selections
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .find(
      (x) =>
        x.territoryId === d.territoryId &&
        x.campaignId === d.campaignId &&
        links.some((l) => l.productId === x.productId),
    );
  const board = selection
    ? bs.find((b) => b.id === selection.boardId)
    : bs.sort((a, b) => b.number - a.number)[0];
  const sourceSnapshots = (await db.select().from(s.sources)).filter((source) =>
    links.some((l) => l.productId === source.productId),
  );
  const choices = await db
    .select()
    .from(s.sourceChoices)
    .where(eq(s.sourceChoices.deliverableId, d.id));
  const requirements = JSON.parse(d.requirements);
  const warnings = [];
  for (const p of ps)
    if (!p.referenceId) warnings.push(`${p.name}: actual product reference not uploaded.`);
  if (t && !board?.fileId)
    warnings.push(
      "Selected moodboard image not uploaded. Do not infer the photographic treatment.",
    );
  if (t && !selection)
    warnings.push("Territory remains a proposal: no scoped client board selection recorded.");
  const line = {
    productSnapshots: ps.map((p) => ({
      productId: p.id,
      snapshotId: p.snapshot?.id ?? null,
      updatedAt: p.updatedAt,
      brief: p.brief,
      source: p.source,
      referenceId: p.referenceId,
    })),
    territoryId: t?.id ?? null,
    boardId: selection?.boardId ?? board?.id ?? null,
    boardSnapshot: board ?? null,
    sourceSnapshots,
    selected: !!selection,
    sourceChoices: choices,
    requirements,
  };
  const text = `Draft prompt\n\nReference Lock\n${ps.map((p) => `${p.name}: ${p.referenceId ? "Use attached reference " + p.referenceId : "[MISSING: actual product reference]"}. Preserve actual bottle proportions, cap, liquid, label artwork, logo and typography. Do not silently repair packaging.`).join("\n")}\n\nScene & Action\n${selection && t ? t.idea : t ? "[PROPOSAL — not a selected direction] " + t.idea : "[Describe the desired product treatment; a packshot needs no territory.]"}\n\nComposition\nPlacement: ${d.placement}. Format: ${d.format}. Ratio: ${requirements.ratio || "[MISSING]"}. Outputs: ${requirements.outputs || "[MISSING]"}. Packaging: ${requirements.packaging || "[MISSING]"}.\n\nAesthetic Engine\n[Specify light, atmosphere, texture and photographic finish from the actual selected board; missing information is not invented.]\n\nConstraints\n${requirements.exclusions || "[Task-specific exclusions missing]"}\nCopy: ${requirements.copy || "[Copy requirements missing]"}. Product accuracy is mandatory. No unverified performance claims.\n\nMissing / readiness\n${warnings.join("\n") || "Inspect references and source decisions before production."}`;
  const conflicts = (await db.select().from(s.conflicts)).filter((c) =>
    links.some((l) => l.productId === c.productId),
  );
  const sources = (await db.select().from(s.sources)).filter((x) =>
    conflicts.some((c) => [c.leftSourceId, c.rightSourceId].includes(x.id)),
  );
  return {
    deliverable: { ...d, requirements },
    products: ps,
    territory: t,
    board,
    selection,
    warnings,
    lineage: line,
    text,
    conflicts,
    sources,
  };
}
export const production = {
  packet: authed
    .input(z.object({ id: z.string() }))
    .handler(({ input, context: { member } }) => packet(member, input.id)),
  list: authed.handler(async ({ context: { member } }) => {
    creator(member);
    return db.select().from(s.prompts);
  }),
  save: authed
    .input(
      z.object({
        deliverableId: z.string(),
        text: z.string().min(1),
        purpose: z.enum(["Production Alphaprompt", "Exploration", "Targeted revision"]),
        parentId: z.string().nullable(),
        settings: z.record(z.string(), z.any()),
      }),
    )
    .handler(async ({ input, context: { member } }) => {
      const p = await packet(member, input.deliverableId);
      if (input.parentId) {
        const [parent] = await db.select().from(s.prompts).where(eq(s.prompts.id, input.parentId));
        if (!parent)
          throw new ORPCError("BAD_REQUEST", { message: "Parent prompt does not exist." });
      }
      const previous = await db
        .select()
        .from(s.prompts)
        .where(eq(s.prompts.deliverableId, input.deliverableId));
      const id = crypto.randomUUID();
      await db.insert(s.prompts).values({
        id,
        deliverableId: input.deliverableId,
        parentId: input.parentId,
        number: previous.length + 1,
        purpose: input.purpose,
        text: input.text,
        settings: JSON.stringify(input.settings),
        lineage: JSON.stringify(p.lineage),
        authorId: member.id,
        createdAt: new Date().toISOString(),
      });
      await event(
        member,
        "Prompt saved",
        input.deliverableId,
        "Draft prompt saved with frozen product/source snapshots.",
      );
      return { id };
    }),
  assess: authed
    .input(z.object({ id: z.string(), versionId: z.string(), reason: z.string().trim().min(1) }))
    .handler(async ({ input, context: { member } }) => {
      creator(member);
      const [p] = await db.select().from(s.prompts).where(eq(s.prompts.id, input.id));
      const [v] = await db.select().from(s.versions).where(eq(s.versions.id, input.versionId));
      if (!p || !v || v.promptId !== p.id)
        throw new ORPCError("BAD_REQUEST", {
          message: "Success assessment must link to the exact recorded prompt used for the output.",
        });
      await db
        .update(s.prompts)
        .set({
          assessment: JSON.stringify({
            label: "Successful for this execution",
            versionId: v.id,
            actorId: member.id,
            reason: input.reason,
            date: new Date().toISOString(),
          }),
        })
        .where(eq(s.prompts.id, p.id));
      return { ok: true };
    }),
  choice: authed
    .input(
      z.object({
        deliverableId: z.string(),
        conflictId: z.string(),
        sourceId: z.string(),
        reason: z.string().min(1),
      }),
    )
    .handler(async ({ input, context: { member } }) => {
      creator(member);
      await workAccess(member, input.deliverableId);
      const [c] = await db.select().from(s.conflicts).where(eq(s.conflicts.id, input.conflictId));
      const links = await db
        .select()
        .from(s.deliverableProducts)
        .where(eq(s.deliverableProducts.deliverableId, input.deliverableId));
      if (
        !c ||
        !links.some((l) => l.productId === c.productId) ||
        ![c.leftSourceId, c.rightSourceId].includes(input.sourceId)
      )
        throw new ORPCError("BAD_REQUEST");
      await db.insert(s.sourceChoices).values({
        id: crypto.randomUUID(),
        ...input,
        actorId: member.id,
        createdAt: new Date().toISOString(),
      });
      return { ok: true };
    }),
  package: authed
    .input(
      z.object({
        title: z.string().min(1),
        campaignId: z.string().nullable(),
        parentId: z.string().nullable(),
        components: z.array(z.object({ deliverableId: z.string(), versionId: z.string() })).min(1),
      }),
    )
    .handler(async ({ input, context: { member } }) => {
      creator(member);
      for (const c of input.components) {
        const d = await workAccess(member, c.deliverableId);
        const [v] = await db.select().from(s.versions).where(eq(s.versions.id, c.versionId));
        if (!v || v.deliverableId !== d.id || d.campaignId !== input.campaignId)
          throw new ORPCError("BAD_REQUEST", {
            message: "Package components must share the intended approval context.",
          });
      }
      const [parent] = input.parentId
        ? await db.select().from(s.packages).where(eq(s.packages.id, input.parentId))
        : [];
      const id = crypto.randomUUID();
      await db.insert(s.packages).values({
        id,
        title: input.title,
        campaignId: input.campaignId,
        parentId: input.parentId,
        number: (parent?.number ?? 0) + 1,
        createdAt: new Date().toISOString(),
      });
      for (const c of input.components)
        await db.insert(s.components).values({ id: crypto.randomUUID(), packageId: id, ...c });
      return { id };
    }),
};
