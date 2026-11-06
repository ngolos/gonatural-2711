import { z } from "zod";
import { eq } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { db } from "../database";
import * as s from "../database/schema";
import { base } from "../__core/app";
import { auth } from "../auth";
import { readFormat, readEvidence } from "../lib/catalog";
import { authed, allowed, creator, productAccess, workAccess, event } from "../lib/permissions";

export const workspace = {
  demoLogin: base
    .input(z.object({ role: z.enum(["creator", "client", "contributor"]) }))
    .handler(async ({ input }) => {
      const result = await auth.api.signInEmail({
        body: {
          email: `${input.role}@demo.gonatural.workspace`,
          password: process.env[`DEMO_${input.role.toUpperCase()}_PASSWORD`]!,
        },
      });
      return { token: result.token };
    }),
  preview: base.handler(async () => {
    const ps = await db
      .select({
        id: s.products.id,
        name: s.products.name,
        family: s.products.family,
        format: s.products.format,
        sample: s.products.sample,
      })
      .from(s.products)
      .where(eq(s.products.sample, 0));
    return {
      productCount: ps.length,
      realCount: ps.filter((p) => !p.sample).length,
      products: ps.slice(0, 6),
      campaignCount: (await db.select().from(s.campaigns)).length,
    };
  }),
  overview: authed.handler(async ({ context: { member } }) => {
    const ps = await db
      .select({
        id: s.products.id,
        name: s.products.name,
        family: s.products.family,
        format: s.products.format,
        sample: s.products.sample,
        referenceId: s.products.referenceId,
        updatedAt: s.products.updatedAt,
      })
      .from(s.products);
    const allSlides = await db.select().from(s.slides);
    const allVersions = await db.select().from(s.versions);
    const allLinks = await db.select().from(s.deliverableProducts);
    const allFormats = (await db.select().from(s.productFormats)).map(readFormat);
    const allEvidence = await db.select().from(s.catalogEvidence);
    const products: Array<
      (typeof ps)[number] & {
        coverId: string | null;
        formats: ReturnType<typeof readFormat>[];
        catalog: ReturnType<typeof readEvidence>;
      }
    > = [];
    for (const p of ps)
      if (await allowed(member, "product", p.id)) {
        const eligible = allVersions.filter(
          (v) =>
            allLinks.some((l) => l.productId === p.id && l.deliverableId === v.deliverableId) &&
            (member.role === "creator" || v.status !== "Draft"),
        );
        const cover = allSlides.find(
          (sl) =>
            eligible.some((v) => v.id === sl.versionId) && sl.fileId.startsWith("execution-file-"),
        );
        products.push({
          ...p,
          coverId: cover?.fileId ?? null,
          formats: allFormats.filter((f) => f.productId === p.id),
          catalog: readEvidence(allEvidence.find((e) => e.productId === p.id)),
        });
      }
    const cs = await db.select().from(s.campaigns);
    const campaigns: typeof cs = [];
    for (const c of cs) if (await allowed(member, "campaign", c.id)) campaigns.push(c);
    const ds = await db.select().from(s.deliverables);
    const vs = await db.select().from(s.versions);
    const links = await db.select().from(s.deliverableProducts);
    const works: Array<
      (typeof ds)[number] & {
        requirements: Record<string, unknown>;
        current: { id: string; number: number; status: string; createdAt: string } | null;
        productIds: string[];
      }
    > = [];
    for (const d of ds) {
      try {
        await workAccess(member, d.id);
      } catch {
        continue;
      }
      let current = vs.find((v) => v.id === d.currentVersionId);
      if (member.role !== "creator" && current?.status === "Draft")
        current = vs
          .filter((v) => v.deliverableId === d.id && v.status !== "Draft")
          .sort((a, b) => b.number - a.number)[0];
      if (!current && member.role !== "creator") continue;
      works.push({
        ...d,
        requirements: JSON.parse(d.requirements),
        current: current
          ? {
              id: current.id,
              number: current.number,
              status: current.status,
              createdAt: current.createdAt,
            }
          : null,
        productIds: links.filter((l) => l.deliverableId === d.id).map((l) => l.productId),
      });
    }
    const ts = await db.select().from(s.territories);
    const tls = await db.select().from(s.territoryProducts);
    const bs = await db.select().from(s.boards);
    const visibleBoards = bs.filter(
      (b) =>
        !b.fileId ||
        tls
          .filter((l) =>
            bs.some((other) => other.fileId === b.fileId && other.territoryId === l.territoryId),
          )
          .every((l) => products.some((p) => p.id === l.productId)),
    );
    const territories = ts
      .filter((t) =>
        tls.some((l) => l.territoryId === t.id && products.some((p) => p.id === l.productId)),
      )
      .map((t) => ({
        ...t,
        notes: member.role === "creator" ? t.notes : "",
        productIds: tls.filter((l) => l.territoryId === t.id).map((l) => l.productId),
        boards: visibleBoards.filter((b) => b.territoryId === t.id),
      }));
    const people = await db
      .select({ id: s.members.id, role: s.members.role, name: s.user.name })
      .from(s.members)
      .innerJoin(s.user, eq(s.members.userId, s.user.id));
    const es = await db.select().from(s.events);
    const activity =
      member.role === "creator"
        ? es.slice(-12).reverse()
        : es
            .filter(
              (e) =>
                works.some((w) => w.id === e.targetId) || products.some((p) => p.id === e.targetId),
            )
            .slice(-12)
            .reverse();
    const rawPackages = await db.select().from(s.packages);
    const pcs = await db.select().from(s.components);
    const packages = rawPackages
      .filter((p) => !p.campaignId || campaigns.some((c) => c.id === p.campaignId))
      .filter(
        (p) =>
          member.role === "creator" ||
          pcs
            .filter((c) => c.packageId === p.id)
            .every(
              (c) =>
                works.some((w) => w.id === c.deliverableId) &&
                vs.some((v) => v.id === c.versionId && v.status !== "Draft"),
            ),
      )
      .map((p) => {
        const components = pcs
          .filter((c) => c.packageId === p.id)
          .map((c) => ({
            ...c,
            status: vs.find((v) => v.id === c.versionId)?.status,
            title: ds.find((d) => d.id === c.deliverableId)?.title,
            approved: ds.find((d) => d.id === c.deliverableId)?.approvedVersionId === c.versionId,
          }));
        return {
          ...p,
          components,
          ready: components.length > 0 && components.every((c) => c.approved),
        };
      });
    return {
      member,
      products,
      campaigns,
      works,
      territories,
      people,
      activity,
      packages,
      campaignProducts: (await db.select().from(s.campaignProducts)).filter(
        (l) =>
          campaigns.some((c) => c.id === l.campaignId) &&
          products.some((p) => p.id === l.productId),
      ),
    };
  }),
  product: authed
    .input(z.object({ id: z.string() }))
    .handler(async ({ input, context: { member } }) => {
      await productAccess(member, input.id);
      const [p] = await db.select().from(s.products).where(eq(s.products.id, input.id));
      if (!p) throw new ORPCError("NOT_FOUND");
      const conflicts = await db
        .select()
        .from(s.conflicts)
        .where(eq(s.conflicts.productId, input.id));
      const sources = await db.select().from(s.sources).where(eq(s.sources.productId, input.id));
      const intakes = await db.select().from(s.intakes).where(eq(s.intakes.productId, input.id));
      let brief = p.brief;
      if (member.role !== "creator")
        brief = brief.replace(/\*\*Creative history[\s\S]*/, "").trim();
      return {
        ...p,
        brief,
        formats: (
          await db.select().from(s.productFormats).where(eq(s.productFormats.productId, input.id))
        ).map(readFormat),
        catalog: readEvidence(
          (
            await db
              .select()
              .from(s.catalogEvidence)
              .where(eq(s.catalogEvidence.productId, input.id))
          )[0],
        ),
        conflicts,
        sources: sources.filter((x) => member.role === "creator" || !x.creatorOnly),
        intakes,
      };
    }),
  sources: authed.handler(async ({ context: { member } }) => {
    creator(member);
    return db.select().from(s.sources);
  }),
  saveProduct: authed
    .input(z.object({ id: z.string(), brief: z.string().min(1), expectedUpdatedAt: z.string() }))
    .handler(async ({ input, context: { member } }) => {
      creator(member);
      const [p] = await db.select().from(s.products).where(eq(s.products.id, input.id));
      if (!p) throw new ORPCError("NOT_FOUND");
      if (p.updatedAt !== input.expectedUpdatedAt)
        throw new ORPCError("CONFLICT", { message: "Product changed. Reload before saving." });
      const date = new Date().toISOString();
      await db.insert(s.snapshots).values({
        id: crypto.randomUUID(),
        productId: p.id,
        brief: input.brief,
        source: "Creator edit · retained prior source",
        createdAt: date,
      });
      await db
        .update(s.products)
        .set({ brief: input.brief, updatedAt: date })
        .where(eq(s.products.id, p.id));
      await event(
        member,
        "Product updated",
        p.id,
        "Product brief updated. Saved prompt snapshots are unchanged; inspect dependent work before reusing.",
      );
      return { ok: true };
    }),
  createWork: authed
    .input(
      z.object({
        title: z.string().min(1),
        productIds: z.array(z.string()).min(1),
        campaignId: z.string().nullable(),
        territoryId: z.string().nullable(),
        placement: z.string(),
        format: z.string(),
        targetType: z.enum(["image", "copy"]),
        requirements: z.record(z.string(), z.any()),
      }),
    )
    .handler(async ({ input, context: { member } }) => {
      creator(member);
      for (const p of input.productIds) {
        const [exists] = await db.select().from(s.products).where(eq(s.products.id, p));
        if (!exists) throw new ORPCError("NOT_FOUND");
      }
      const id = crypto.randomUUID(),
        vid = crypto.randomUUID();
      const [approver] = await db.select().from(s.members).where(eq(s.members.id, "member-client"));
      await db.transaction(async (tx) => {
        await tx.insert(s.deliverables).values({
          id,
          title: input.title,
          campaignId: input.campaignId,
          territoryId: input.territoryId,
          placement: input.placement,
          format: input.format,
          targetType: input.targetType,
          requirements: JSON.stringify(input.requirements),
          approverId: approver?.id,
          currentVersionId: vid,
          sample: 1,
        });
        for (const p of input.productIds)
          await tx
            .insert(s.deliverableProducts)
            .values({ id: crypto.randomUUID(), deliverableId: id, productId: p });
        await tx.insert(s.versions).values({
          id: vid,
          deliverableId: id,
          number: 1,
          status: "Draft",
          summary: "New production brief",
          createdAt: new Date().toISOString(),
          authorId: member.id,
        });
      });
      await event(member, "Created", id, "Created deliverable with independently versioned scope.");
      return { id };
    }),
  selectDirection: authed
    .input(
      z.object({
        territoryId: z.string(),
        boardId: z.string(),
        productId: z.string(),
        campaignId: z.string().nullable(),
      }),
    )
    .handler(async ({ input, context: { member } }) => {
      if (member.role !== "client")
        throw new ORPCError("FORBIDDEN", {
          message: "Designated client reviewer selects a direction.",
        });
      await productAccess(member, input.productId);
      if (input.campaignId && !(await allowed(member, "campaign", input.campaignId)))
        throw new ORPCError("FORBIDDEN");
      const [b] = await db.select().from(s.boards).where(eq(s.boards.id, input.boardId));
      if (!b || b.territoryId !== input.territoryId) throw new ORPCError("NOT_FOUND");
      const links = await db
        .select()
        .from(s.territoryProducts)
        .where(eq(s.territoryProducts.territoryId, input.territoryId));
      if (!links.some((l) => l.productId === input.productId))
        throw new ORPCError("BAD_REQUEST", {
          message: "Direction does not belong to this product.",
        });
      if (!b.fileId)
        throw new ORPCError("BAD_REQUEST", {
          message: "Upload and inspect the actual board before selecting its version.",
        });
      await db.insert(s.selections).values({
        id: crypto.randomUUID(),
        ...input,
        actorId: member.id,
        createdAt: new Date().toISOString(),
      });
      return { ok: true };
    }),
};
