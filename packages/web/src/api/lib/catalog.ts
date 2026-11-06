import * as s from "../database/schema";

export type CatalogListing = { title: string; handle: string; variants: string[]; size?: string };
export function readFormat(f: typeof s.productFormats.$inferSelect) {
  return {
    ...f,
    details: JSON.parse(f.details) as CatalogListing[],
    provenance: JSON.parse(f.provenance) as string[],
  };
}
export function readEvidence(e: typeof s.catalogEvidence.$inferSelect | undefined) {
  return e
    ? {
        ...e,
        reviewNotes: JSON.parse(e.reviewNotes) as string[],
        workbookRow: JSON.parse(e.workbookRow) as Record<string, unknown>,
      }
    : null;
}
