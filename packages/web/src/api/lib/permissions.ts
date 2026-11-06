import { eq, and } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { db } from "../database";
import * as s from "../database/schema";
import { auth } from "../auth";
import { base } from "../__core/app";

export type Member = typeof s.members.$inferSelect;
const requestGrants = new WeakMap<Member, Set<string>>();
export const authed = base.use(async ({ context, next }) => {
  const session = await auth.api.getSession({ headers: context.headers });
  if (!session) throw new ORPCError("UNAUTHORIZED");
  const [member] = await db.select().from(s.members).where(eq(s.members.userId, session.user.id));
  if (!member)
    throw new ORPCError("FORBIDDEN", {
      message:
        "This account has no workspace membership. Use a labeled sample identity to explore the demo.",
    });
  if (member.role !== "creator") {
    const grants = await db.select().from(s.access).where(eq(s.access.memberId, member.id));
    requestGrants.set(member, new Set(grants.map((g) => `${g.targetType}:${g.targetId}`)));
  }
  return next({ context: { member, user: session.user } });
});
export function creator(m: Member) {
  if (m.role !== "creator")
    throw new ORPCError("FORBIDDEN", { message: "Creator access required." });
}
export async function allowed(m: Member, type: string, id: string) {
  if (m.role === "creator") return true;
  const grants = requestGrants.get(m);
  if (grants) return grants.has(`${type}:${id}`);
  return (
    (
      await db
        .select()
        .from(s.access)
        .where(
          and(
            eq(s.access.memberId, m.id),
            eq(s.access.targetType, type),
            eq(s.access.targetId, id),
          ),
        )
    ).length > 0
  );
}
export async function productAccess(m: Member, id: string) {
  if (!(await allowed(m, "product", id))) throw new ORPCError("FORBIDDEN");
}
export async function workAccess(m: Member, id: string) {
  const [d] = await db.select().from(s.deliverables).where(eq(s.deliverables.id, id));
  if (!d) throw new ORPCError("NOT_FOUND");
  if (m.role !== "creator") {
    if (d.campaignId) {
      if (!(await allowed(m, "campaign", d.campaignId))) throw new ORPCError("FORBIDDEN");
    }
    const links = await db
      .select()
      .from(s.deliverableProducts)
      .where(eq(s.deliverableProducts.deliverableId, id));
    for (const link of links) await productAccess(m, link.productId);
    if (!links.length) throw new ORPCError("FORBIDDEN");
  }
  return d;
}
export async function versionAccess(m: Member, id: string) {
  const [v] = await db.select().from(s.versions).where(eq(s.versions.id, id));
  if (!v) throw new ORPCError("NOT_FOUND");
  const d = await workAccess(m, v.deliverableId);
  if (m.role !== "creator" && v.status === "Draft")
    throw new ORPCError("FORBIDDEN", { message: "Unpublished draft." });
  return { v, d };
}
export async function fileAccess(m: Member, id: string) {
  const [f] = await db.select().from(s.files).where(eq(s.files.id, id));
  if (!f || f.state !== "ready") throw new ORPCError("NOT_FOUND");
  if (f.scopeType === "version") await versionAccess(m, f.scopeId);
  else if (f.scopeType === "product") await productAccess(m, f.scopeId);
  else if (f.scopeType === "board") {
    const boards = await db.select().from(s.boards).where(eq(s.boards.fileId, f.id));
    const allLinks = await db.select().from(s.territoryProducts);
    const links = allLinks.filter(
      (l) => l.territoryId === f.scopeId || boards.some((b) => b.territoryId === l.territoryId),
    );
    if (!links.length) throw new ORPCError("FORBIDDEN");
    for (const link of links) await productAccess(m, link.productId);
  } else if (f.scopeType === "intake") {
    const [i] = await db.select().from(s.intakes).where(eq(s.intakes.id, f.scopeId));
    if (!i) throw new ORPCError("NOT_FOUND");
    await productAccess(m, i.productId);
  } else creator(m);
  return f;
}
export async function event(m: Member, type: string, id: string, text: string) {
  await db
    .insert(s.events)
    .values({
      id: crypto.randomUUID(),
      actorId: m.id,
      type,
      targetId: id,
      text,
      createdAt: new Date().toISOString(),
    });
}
