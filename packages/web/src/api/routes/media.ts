import { z } from "zod";
import { eq } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { db } from "../database";
import * as s from "../database/schema";
import { s3, bucket, objectStream } from "../lib/storage";
import { imageSize } from "image-size";
import { authed, creator, versionAccess, productAccess, event } from "../lib/permissions";

export const media = {
  presign: authed
    .input(
      z.object({
        name: z.string().min(1),
        mime: z.enum([
          "image/png",
          "image/jpeg",
          "image/webp",
          "application/pdf",
          "text/plain",
          "text/markdown",
        ]),
        size: z
          .number()
          .int()
          .min(1)
          .max(25 * 1024 * 1024),
        scopeType: z.enum(["version", "product", "board", "intake"]),
        scopeId: z.string(),
      }),
    )
    .handler(async ({ input, context: { member } }) => {
      if (input.scopeType === "intake") {
        const [i] = await db.select().from(s.intakes).where(eq(s.intakes.id, input.scopeId));
        if (!i) throw new ORPCError("NOT_FOUND");
        await productAccess(member, i.productId);
        if (i.authorId !== member.id || i.status !== "Submitted") throw new ORPCError("FORBIDDEN");
      } else creator(member);
      if (input.scopeType === "version") {
        const { v, d } = await versionAccess(member, input.scopeId);
        if (d.targetType !== "image" || !input.mime.startsWith("image/"))
          throw new ORPCError("BAD_REQUEST", {
            message: "Image versions require an image original.",
          });
        if (v.status !== "Draft" || d.currentVersionId !== v.id)
          throw new ORPCError("BAD_REQUEST", {
            message: "Published versions are immutable. Create a new draft.",
          });
      }
      if (input.scopeType === "product") await productAccess(member, input.scopeId);
      if (input.scopeType === "board") {
        const [t] = await db
          .select()
          .from(s.territories)
          .where(eq(s.territories.id, input.scopeId));
        if (!t) throw new ORPCError("NOT_FOUND");
      }
      const id = crypto.randomUUID(),
        key = `workspace/uploads/${id}`;
      await db.insert(s.files).values({
        id,
        key,
        name: input.name,
        mime: input.mime,
        size: input.size,
        ownerId: member.id,
        scopeType: input.scopeType,
        scopeId: input.scopeId,
        state: "pending",
      });
      const url = await getSignedUrl(
        s3,
        new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: input.mime }),
        { expiresIn: 300 },
      );
      return { id, url };
    }),
  complete: authed
    .input(
      z.object({
        id: z.string(),
        width: z.number().int().positive().nullable(),
        height: z.number().int().positive().nullable(),
      }),
    )
    .handler(async ({ input, context: { member } }) => {
      const [f] = await db.select().from(s.files).where(eq(s.files.id, input.id));
      if (!f || f.ownerId !== member.id) throw new ORPCError("FORBIDDEN");
      if (f.state === "ready") return { ok: true };
      if (f.scopeType !== "intake") creator(member);
      const object = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: f.key }));
      if (object.ContentLength !== f.size || object.ContentType !== f.mime)
        throw new ORPCError("BAD_REQUEST", {
          message: "Upload size/type mismatch. Retry the original file.",
        });
      const bytes = new Uint8Array(await new Response(await objectStream(f.key)).arrayBuffer());
      if (bytes.length !== f.size)
        throw new ORPCError("BAD_REQUEST", { message: "Original size changed while completing." });
      let width: number | null = null,
        height: number | null = null;
      if (f.mime.startsWith("image/")) {
        try {
          const dimensions = imageSize(bytes);
          const types: Record<string, string> = {
            png: "image/png",
            jpg: "image/jpeg",
            webp: "image/webp",
          };
          if (types[dimensions.type ?? ""] !== f.mime)
            throw new Error("Image header/type mismatch");
          width = dimensions.width;
          height = dimensions.height;
        } catch {
          throw new ORPCError("BAD_REQUEST", {
            message: "Original is not a valid supported image.",
          });
        }
      }
      // Final keys are never presigned for PUT. A still-live upload link can only
      // alter the unused staging object, never a stored version's original.
      const finalKey = `workspace/originals/${f.id}/${crypto.randomUUID()}`;
      await s3.send(
        new PutObjectCommand({ Bucket: bucket, Key: finalKey, Body: bytes, ContentType: f.mime }),
      );
      await db.transaction(async (tx) => {
        if (f.scopeType === "version") {
          const [v] = await tx.select().from(s.versions).where(eq(s.versions.id, f.scopeId));
          const [d] = v
            ? await tx.select().from(s.deliverables).where(eq(s.deliverables.id, v.deliverableId))
            : [];
          if (!v || v.status !== "Draft" || d?.currentVersionId !== v.id)
            throw new ORPCError("CONFLICT", {
              message: "Version was submitted while uploading. Create a new version.",
            });
          const existing = await tx.select().from(s.slides).where(eq(s.slides.versionId, v.id));
          await tx.insert(s.slides).values({
            id: crypto.randomUUID(),
            versionId: v.id,
            position: existing.length + 1,
            fileId: f.id,
          });
        } else if (f.scopeType === "product")
          await tx
            .update(s.products)
            .set({ referenceId: f.id })
            .where(eq(s.products.id, f.scopeId));
        else if (f.scopeType === "board") {
          const bs = await tx.select().from(s.boards).where(eq(s.boards.territoryId, f.scopeId));
          await tx.insert(s.boards).values({
            id: crypto.randomUUID(),
            territoryId: f.scopeId,
            number: Math.max(0, ...bs.map((b) => b.number)) + 1,
            fileId: f.id,
            notes: "Uploaded board reference",
            createdAt: new Date().toISOString(),
          });
        }
        await tx
          .update(s.files)
          .set({ state: "ready", key: finalKey, width, height })
          .where(eq(s.files.id, f.id));
      });
      await event(member, "Upload", f.scopeId, `Stored private original: ${f.name}`);
      return { ok: true };
    }),
};
