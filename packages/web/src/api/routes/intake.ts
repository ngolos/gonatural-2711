import { z } from "zod";
import { eq } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { db } from "../database";
import * as s from "../database/schema";
import { authed, creator, productAccess, event } from "../lib/permissions";
export const intake = {
  submit: authed
    .input(z.object({ productId: z.string(), text: z.string().trim().min(1) }))
    .handler(async ({ input, context: { member } }) => {
      await productAccess(member, input.productId);
      const previous = await db
        .select()
        .from(s.intakes)
        .where(eq(s.intakes.productId, input.productId));
      const id = crypto.randomUUID();
      await db.insert(s.intakes).values({
        id,
        productId: input.productId,
        number: previous.length + 1,
        text: input.text,
        status: "Submitted",
        authorId: member.id,
        createdAt: new Date().toISOString(),
      });
      await event(
        member,
        "Intake submitted",
        input.productId,
        "New client-input revision submitted; previous input retained.",
      );
      return { id };
    }),
  clarify: authed
    .input(z.object({ id: z.string(), reason: z.string().trim().min(1) }))
    .handler(async ({ input, context: { member } }) => {
      creator(member);
      const [i] = await db.select().from(s.intakes).where(eq(s.intakes.id, input.id));
      if (!i || i.status !== "Submitted") throw new ORPCError("BAD_REQUEST");
      await db
        .update(s.intakes)
        .set({ status: "Needs clarification", clarification: input.reason })
        .where(eq(s.intakes.id, i.id));
      await event(member, "Clarification", i.productId, input.reason);
      return { ok: true };
    }),
  confirm: authed
    .input(z.object({ id: z.string(), scope: z.string().trim().min(1) }))
    .handler(async ({ input, context: { member } }) => {
      if (!member.productOwner)
        throw new ORPCError("FORBIDDEN", {
          message:
            "Product-owner permission required. Asset approval does not grant this permission.",
        });
      const [i] = await db.select().from(s.intakes).where(eq(s.intakes.id, input.id));
      if (!i || i.status !== "Submitted")
        throw new ORPCError("BAD_REQUEST", {
          message: "Confirm a clear submitted revision, not an unresolved clarification.",
        });
      await productAccess(member, i.productId);
      const date = new Date().toISOString();
      await db
        .update(s.intakes)
        .set({
          status: "Confirmed",
          confirmation: JSON.stringify({ actorId: member.id, date, scope: input.scope }),
        })
        .where(eq(s.intakes.id, i.id));
      await db.insert(s.sources).values({
        id: crypto.randomUUID(),
        productId: i.productId,
        type: "Client-confirmed input",
        title: `Client input v${i.number} · ${input.scope}`,
        text: i.text,
        capturedAt: date,
        creatorOnly: 0,
      });
      await db.insert(s.decisions).values({
        id: crypto.randomUUID(),
        targetType: "product-input",
        versionId: i.id,
        actorId: member.id,
        action: "Confirm product information",
        reason: input.scope,
        scope: input.scope,
        createdAt: date,
        sample: 1,
      });
      await event(
        member,
        "Product confirmation",
        i.productId,
        "Client product input confirmed within stated scope. Existing source conflicts and saved prompts were not rewritten.",
      );
      return { ok: true };
    }),
  conflict: authed
    .input(
      z.object({
        id: z.string(),
        action: z.enum(["Request clarification", "Resolve"]),
        reason: z.string().trim().min(1),
        sourceId: z.string().nullable(),
      }),
    )
    .handler(async ({ input, context: { member } }) => {
      const [c] = await db.select().from(s.conflicts).where(eq(s.conflicts.id, input.id));
      if (!c) throw new ORPCError("NOT_FOUND");
      await productAccess(member, c.productId);
      if (input.action === "Resolve") {
        if (!member.productOwner)
          throw new ORPCError("FORBIDDEN", {
            message: "Only the authorized product owner resolves product facts.",
          });
        if (!input.sourceId || ![c.leftSourceId, c.rightSourceId].includes(input.sourceId))
          throw new ORPCError("BAD_REQUEST", {
            message: "Choose and cite supporting source evidence.",
          });
      } else creator(member);
      const date = new Date().toISOString();
      await db
        .update(s.conflicts)
        .set({
          status: input.action === "Resolve" ? "Resolved" : "Clarification requested",
          resolution: JSON.stringify({
            actorId: member.id,
            date,
            reason: input.reason,
            sourceId: input.sourceId,
          }),
        })
        .where(eq(s.conflicts.id, c.id));
      await db.insert(s.decisions).values({
        id: crypto.randomUUID(),
        targetType: "product-conflict",
        versionId: c.id,
        actorId: member.id,
        action: input.action,
        reason: input.reason,
        scope: `${c.productId} · ${c.field} · source ${input.sourceId ?? "pending"}`,
        createdAt: date,
        sample: 1,
      });
      await event(
        member,
        input.action,
        c.productId,
        `${c.field}: ${input.reason}. Review affected downstream work; historical snapshots remain unchanged.`,
      );
      return { ok: true };
    }),
};
