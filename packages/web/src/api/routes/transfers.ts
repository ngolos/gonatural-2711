import { z } from "zod";
import { db } from "../database";
import * as s from "../database/schema";
import { authed, creator, event } from "../lib/permissions";
export async function exportRecords() {
  const tableMap = {
    members: s.members,
    access: s.access,
    products: s.products,
    productFormats: s.productFormats,
    catalogEvidence: s.catalogEvidence,
    sources: s.sources,
    snapshots: s.snapshots,
    campaigns: s.campaigns,
    campaignProducts: s.campaignProducts,
    territories: s.territories,
    territoryProducts: s.territoryProducts,
    boards: s.boards,
    selections: s.selections,
    deliverables: s.deliverables,
    deliverableProducts: s.deliverableProducts,
    versions: s.versions,
    slides: s.slides,
    files: s.files,
    comments: s.comments,
    decisions: s.decisions,
    prompts: s.prompts,
    conflicts: s.conflicts,
    sourceChoices: s.sourceChoices,
    intakes: s.intakes,
    packages: s.packages,
    components: s.components,
    events: s.events,
    fragranceProfiles: s.fragranceProfiles,
    productImages: s.productImages,
    auditReports: s.auditReports,
    territoryDetails: s.territoryDetails,
    generationJobs: s.generationJobs,
  };
  const records: Record<string, unknown> = {};
  for (const [name, table] of Object.entries(tableMap))
    records[name] = await db.select().from(table);
  return {
    schemaVersion: 2,
    exportedAt: new Date().toISOString(),
    notice:
      "Independent proposal; sample decisions are demonstration data. Authentication passwords/sessions are excluded. Originals are in originals/ within the backup archive.",
    records,
  };
}
export const transfers = {
  export: authed.handler(async ({ context: { member } }) => {
    creator(member);
    return exportRecords();
  }),
  import: authed
    .input(
      z.object({
        filename: z.string(),
        rows: z
          .array(
            z.object({
              id: z.string(),
              name: z.string(),
              family: z.string(),
              format: z.string(),
              brief: z.string(),
            }),
          )
          .max(1000),
        apply: z.boolean(),
      }),
    )
    .handler(async ({ input, context: { member } }) => {
      creator(member);
      const existing = await db.select().from(s.products);
      const seen = new Set<string>();
      const errors: string[] = [];
      const valid: typeof input.rows = [];
      let added = 0,
        updated = 0;
      for (let i = 0; i < input.rows.length; i++) {
        const row = input.rows[i];
        if (!row.id.trim() || !row.name.trim()) {
          errors.push(`Row ${i + 2}: stable ID and name required.`);
          continue;
        }
        if (seen.has(row.id)) {
          errors.push(`Row ${i + 2}: duplicate stable ID ${row.id}; skipped.`);
          continue;
        }
        seen.add(row.id);
        valid.push(row);
        if (existing.some((p) => p.id === row.id)) updated++;
        else added++;
      }
      if (input.apply) {
        const date = new Date().toISOString();
        await db.transaction(async (tx) => {
          for (const row of valid) {
            const old = existing.find((p) => p.id === row.id);
            const brief = row.brief || old?.brief || "Product brief not supplied.";
            await tx.insert(s.snapshots).values({
              id: crypto.randomUUID(),
              productId: row.id,
              brief,
              source: input.filename,
              createdAt: date,
            });
            await tx
              .insert(s.products)
              .values({
                ...row,
                brief,
                family: row.family || "Not classified",
                format: row.format || "Not specified",
                source: `Imported ${input.filename}`,
                updatedAt: date,
                sample: 0,
              })
              .onConflictDoUpdate({
                target: s.products.id,
                set: {
                  name: row.name,
                  family: row.family || old?.family || "Not classified",
                  format: row.format || old?.format || "Not specified",
                  brief,
                  source: `Imported ${input.filename}`,
                  updatedAt: date,
                },
              });
          }
        });
        await event(
          member,
          "CSV import",
          "workspace",
          `${added} new, ${updated} updates, ${errors.length} skipped rows from ${input.filename}. Prior snapshots retained; inspect dependent work.`,
        );
      }
      return { added, updated, errors, applied: input.apply };
    }),
};
