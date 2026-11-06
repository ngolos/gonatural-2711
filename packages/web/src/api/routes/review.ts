import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { db } from "../database";
import * as s from "../database/schema";
import { authed, creator, workAccess, versionAccess, event, type Member } from "../lib/permissions";

async function disputed(v: typeof s.versions.$inferSelect) {
  if (!v.text) return [];
  const links = await db
    .select()
    .from(s.deliverableProducts)
    .where(eq(s.deliverableProducts.deliverableId, v.deliverableId));
  const cs = await db.select().from(s.conflicts);
  return cs.filter(
    (c) =>
      links.some((l) => l.productId === c.productId) &&
      c.status !== "Resolved" &&
      c.materiality !== "Packaging metadata" &&
      /\b(almond|milk|condensed)\b/i.test(v.text),
  );
}
async function decide(
  m: Member,
  input: {
    versionId: string;
    expectedCurrentVersionId: string;
    action: "Approve" | "Request changes" | "Revoke";
    reason: string;
  },
) {
  const { v, d } = await versionAccess(m, input.versionId);
  if (input.action === "Revoke") {
    creator(m);
    if (d.approvedVersionId !== v.id)
      throw new ORPCError("CONFLICT", { message: "This is not the current approved release." });
  } else {
    if (d.approverId !== m.id)
      throw new ORPCError("FORBIDDEN", {
        message: "Only this deliverable’s designated approver can make a decision.",
      });
    if (v.id !== d.currentVersionId || d.currentVersionId !== input.expectedCurrentVersionId)
      throw new ORPCError("CONFLICT", {
        message: "Stale version selection. Reload and inspect the current version.",
      });
    if (v.status !== "In review")
      throw new ORPCError("BAD_REQUEST", { message: "Only submitted versions are eligible." });
    if (input.action === "Request changes" && !input.reason.trim())
      throw new ORPCError("BAD_REQUEST", { message: "A change request needs a reason." });
    if (input.action === "Approve" && (await disputed(v)).length)
      throw new ORPCError("BAD_REQUEST", {
        message:
          "Disputed claim in this copy: confirm the product source or remove the wording first. Image approval is independent.",
      });
  }
  await db.transaction(async (tx) => {
    const [live] = await tx.select().from(s.deliverables).where(eq(s.deliverables.id, d.id));
    const [lv] = await tx.select().from(s.versions).where(eq(s.versions.id, v.id));
    if (
      input.action === "Revoke"
        ? live.approvedVersionId !== v.id
        : live.currentVersionId !== input.expectedCurrentVersionId || lv.status !== "In review"
    )
      throw new ORPCError("CONFLICT", { message: "Version changed while deciding." });
    if (input.action === "Approve") {
      if (live.approvedVersionId && live.approvedVersionId !== v.id)
        await tx
          .update(s.versions)
          .set({ status: "Superseded" })
          .where(eq(s.versions.id, live.approvedVersionId));
      await tx.update(s.versions).set({ status: "Approved" }).where(eq(s.versions.id, v.id));
      await tx
        .update(s.deliverables)
        .set({ approvedVersionId: v.id })
        .where(eq(s.deliverables.id, d.id));
    } else if (input.action === "Revoke") {
      await tx
        .update(s.deliverables)
        .set({ approvedVersionId: null })
        .where(eq(s.deliverables.id, d.id));
      await tx.update(s.versions).set({ status: "Revoked" }).where(eq(s.versions.id, v.id));
    } else
      await tx
        .update(s.versions)
        .set({ status: "Changes requested" })
        .where(eq(s.versions.id, v.id));
    await tx.insert(s.decisions).values({
      id: crypto.randomUUID(),
      targetType: d.targetType,
      versionId: v.id,
      actorId: m.id,
      action: input.action,
      reason: input.reason,
      scope: `${d.id} · ${d.placement} · ${d.format}`,
      createdAt: new Date().toISOString(),
      sample: 1,
    });
  });
  await event(
    m,
    input.action,
    d.id,
    `${input.action} · ${d.title} · v${v.number} (demonstration workspace)`,
  );
  return { ok: true };
}
const decisionInput = z.object({
  versionId: z.string(),
  expectedCurrentVersionId: z.string(),
  action: z.enum(["Approve", "Request changes", "Revoke"]),
  reason: z.string().default(""),
});
export const review = {
  get: authed
    .input(z.object({ id: z.string() }))
    .handler(async ({ input, context: { member } }) => {
      const d = await workAccess(member, input.id);
      let versions = await db.select().from(s.versions).where(eq(s.versions.deliverableId, d.id));
      if (member.role !== "creator") versions = versions.filter((v) => v.status !== "Draft");
      const allSlides = await db.select().from(s.slides);
      const allComments = await db.select().from(s.comments);
      const allDecisions = await db.select().from(s.decisions);
      const files = await db
        .select({
          id: s.files.id,
          name: s.files.name,
          mime: s.files.mime,
          width: s.files.width,
          height: s.files.height,
          state: s.files.state,
        })
        .from(s.files);
      const items = [];
      for (const v of versions)
        items.push({
          ...v,
          promptId: member.role === "creator" ? v.promptId : null,
          slides: allSlides
            .filter((x) => x.versionId === v.id)
            .map((sl) => ({ ...sl, file: files.find((f) => f.id === sl.fileId) })),
          comments: allComments.filter(
            (c) => c.versionId === v.id && (member.role === "creator" || c.visibility === "client"),
          ),
          decisions: allDecisions.filter((x) => x.versionId === v.id),
          claims: await disputed(v),
        });
      const links = await db
        .select()
        .from(s.deliverableProducts)
        .where(eq(s.deliverableProducts.deliverableId, d.id));
      const ps = await db.select().from(s.products);
      const products = ps
        .filter((p) => links.some((l) => l.productId === p.id))
        .map((p) => ({
          id: p.id,
          name: p.name,
          referenceId: p.referenceId,
          updatedAt: p.updatedAt,
        }));
      return {
        deliverable: { ...d, requirements: JSON.parse(d.requirements) },
        versions: items.sort((a, b) => b.number - a.number),
        products,
      };
    }),
  comment: authed
    .input(
      z.object({
        versionId: z.string(),
        slideId: z.string().nullable(),
        parentId: z.string().nullable(),
        body: z.string().trim().min(1).max(5000),
        x: z.number().min(0).max(1).nullable(),
        y: z.number().min(0).max(1).nullable(),
        visibility: z.enum(["client", "creator"]),
      }),
    )
    .handler(async ({ input, context: { member } }) => {
      const { v, d } = await versionAccess(member, input.versionId);
      if (v.id !== d.currentVersionId || ["Approved", "Superseded", "Revoked"].includes(v.status))
        throw new ORPCError("BAD_REQUEST", {
          message: "This version is closed. Add new feedback on the active version.",
        });
      if (input.visibility === "creator") creator(member);
      if (input.slideId) {
        const [slide] = await db.select().from(s.slides).where(eq(s.slides.id, input.slideId));
        if (!slide || slide.versionId !== v.id) throw new ORPCError("BAD_REQUEST");
      }
      if (
        (input.x !== null || input.y !== null) &&
        (!input.slideId || input.x === null || input.y === null)
      )
        throw new ORPCError("BAD_REQUEST");
      if (input.parentId) {
        const [parent] = await db
          .select()
          .from(s.comments)
          .where(eq(s.comments.id, input.parentId));
        if (!parent || parent.versionId !== v.id || parent.visibility !== input.visibility)
          throw new ORPCError("BAD_REQUEST");
      }
      await db.insert(s.comments).values({
        id: crypto.randomUUID(),
        ...input,
        authorId: member.id,
        resolved: 0,
        createdAt: new Date().toISOString(),
        sample: 1,
      });
      await event(member, "Comment", d.id, `Feedback added to v${v.number}.`);
      return { ok: true };
    }),
  resolve: authed
    .input(z.object({ id: z.string(), resolved: z.boolean() }))
    .handler(async ({ input, context: { member } }) => {
      const [c] = await db.select().from(s.comments).where(eq(s.comments.id, input.id));
      if (!c) throw new ORPCError("NOT_FOUND");
      await versionAccess(member, c.versionId);
      if (c.visibility === "creator") creator(member);
      if (member.role !== "creator" && c.authorId !== member.id) throw new ORPCError("FORBIDDEN");
      await db
        .update(s.comments)
        .set({ resolved: input.resolved ? 1 : 0 })
        .where(eq(s.comments.id, c.id));
      return { ok: true };
    }),
  newVersion: authed
    .input(
      z.object({
        id: z.string(),
        expectedCurrentVersionId: z.string(),
        summary: z.string().trim().min(1),
        text: z.string().default(""),
        promptId: z.string().nullable().default(null),
      }),
    )
    .handler(async ({ input, context: { member } }) => {
      creator(member);
      const d = await workAccess(member, input.id);
      if (d.currentVersionId !== input.expectedCurrentVersionId) throw new ORPCError("CONFLICT");
      const id = crypto.randomUUID();
      await db.transaction(async (tx) => {
        const [live] = await tx.select().from(s.deliverables).where(eq(s.deliverables.id, d.id));
        if (live.currentVersionId !== input.expectedCurrentVersionId)
          throw new ORPCError("CONFLICT");
        const vs = await tx.select().from(s.versions).where(eq(s.versions.deliverableId, d.id));
        await tx.insert(s.versions).values({
          id,
          deliverableId: d.id,
          number: Math.max(0, ...vs.map((v) => v.number)) + 1,
          status: "Draft",
          text: input.text,
          summary: input.summary,
          promptId: input.promptId,
          createdAt: new Date().toISOString(),
          authorId: member.id,
        });
        await tx
          .update(s.deliverables)
          .set({ currentVersionId: id })
          .where(eq(s.deliverables.id, d.id));
      });
      await event(
        member,
        "New draft",
        d.id,
        "New immutable version created; prior approvals and comments retained.",
      );
      return { id };
    }),
  submit: authed
    .input(z.object({ versionId: z.string() }))
    .handler(async ({ input, context: { member } }) => {
      creator(member);
      const { v, d } = await versionAccess(member, input.versionId);
      if (v.status !== "Draft" || d.currentVersionId !== v.id)
        throw new ORPCError("CONFLICT", { message: "Only the current draft can be submitted." });
      if (d.targetType === "image") {
        const slides = await db.select().from(s.slides).where(eq(s.slides.versionId, v.id));
        const required = Number(JSON.parse(d.requirements).outputs) || 1;
        if (slides.length !== required)
          throw new ORPCError("BAD_REQUEST", {
            message: `This version requires exactly ${required} image original(s); ${slides.length} uploaded.`,
          });
        const files = await db.select().from(s.files);
        if (
          slides.some(
            (sl) =>
              !files.some(
                (f) => f.id === sl.fileId && f.state === "ready" && f.mime.startsWith("image/"),
              ),
          )
        )
          throw new ORPCError("BAD_REQUEST", {
            message: "All slides must have ready image originals.",
          });
      }
      if (d.targetType === "copy" && !v.text.trim())
        throw new ORPCError("BAD_REQUEST", { message: "Save a text version before submitting." });
      if (!d.approverId)
        throw new ORPCError("BAD_REQUEST", { message: "Assign an approver before submission." });
      const result = await db
        .update(s.versions)
        .set({ status: "In review" })
        .where(and(eq(s.versions.id, v.id), eq(s.versions.status, "Draft")))
        .returning();
      if (!result.length) throw new ORPCError("CONFLICT");
      await event(member, "Submitted", d.id, `Submitted v${v.number} to designated Demo reviewer.`);
      return { ok: true };
    }),
  decide: authed
    .input(decisionInput)
    .handler(({ input, context: { member } }) => decide(member, input)),
  batch: authed
    .input(z.object({ items: z.array(decisionInput).min(1).max(30) }))
    .handler(async ({ input, context: { member } }) => {
      const results = [];
      for (const item of input.items) {
        try {
          await decide(member, item);
          results.push({ id: item.versionId, ok: true, reason: "" });
        } catch (e) {
          results.push({
            id: item.versionId,
            ok: false,
            reason: e instanceof Error ? e.message : "Ineligible",
          });
        }
      }
      return results;
    }),
  approved: authed.handler(async ({ context: { member } }) => {
    const ds = await db.select().from(s.deliverables);
    const results = [];
    for (const d of ds)
      if (d.approvedVersionId) {
        try {
          await workAccess(member, d.id);
        } catch {
          continue;
        }
        const [v] = await db
          .select()
          .from(s.versions)
          .where(eq(s.versions.id, d.approvedVersionId));
        if (!v || v.status !== "Approved") continue;
        const decisions = await db
          .select()
          .from(s.decisions)
          .where(eq(s.decisions.versionId, v.id));
        const ss = await db.select().from(s.slides).where(eq(s.slides.versionId, v.id));
        const fs = await db.select().from(s.files);
        const links = await db
          .select()
          .from(s.deliverableProducts)
          .where(eq(s.deliverableProducts.deliverableId, d.id));
        results.push({
          deliverable: d,
          version: v,
          decision: decisions.filter((x) => x.action === "Approve").at(-1),
          slides: ss.map((sl) => ({
            ...sl,
            file: fs.find((f) => f.id === sl.fileId)
              ? {
                  id: sl.fileId,
                  name: fs.find((f) => f.id === sl.fileId)!.name,
                  width: fs.find((f) => f.id === sl.fileId)!.width,
                  height: fs.find((f) => f.id === sl.fileId)!.height,
                }
              : null,
          })),
          productIds: links.map((l) => l.productId),
        });
      }
    return results;
  }),
};
