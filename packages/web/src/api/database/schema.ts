import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
export * from "./auth-schema";

export const members = sqliteTable('members', { id: text('id').primaryKey(), userId: text('user_id').notNull().unique(), role: text('role').notNull(), productOwner: integer('product_owner').default(0), sample: integer('sample').default(1) });
export const access = sqliteTable('access', { id: text('id').primaryKey(), memberId: text('member_id').notNull(), targetType: text('target_type').notNull(), targetId: text('target_id').notNull() });
export const products = sqliteTable('products', { id: text('id').primaryKey(), name: text('name').notNull(), family: text('family').notNull(), format: text('format').notNull(), sample: integer('sample').notNull().default(0), brief: text('brief').notNull(), source: text('source').notNull(), updatedAt: text('updated_at').notNull(), referenceId: text('reference_id') });
export const productFormats = sqliteTable('product_formats', {
  id: text('id').primaryKey(), productId: text('product_id').notNull(), type: text('type').notNull(),
  details: text('details').notNull(), provenance: text('provenance').notNull(), reviewNote: text('review_note').notNull().default(''),
});
export const catalogEvidence = sqliteTable('catalog_evidence', {
  productId: text('product_id').primaryKey(), familyColor: text('family_color').notNull(),
  labelNumber: text('label_number'), topNotes: text('top_notes').notNull(), heartNotes: text('heart_notes').notNull(),
  baseNotes: text('base_notes').notNull(), notesSource: text('notes_source').notNull(),
  reviewNotes: text('review_notes').notNull(), workbookRow: text('workbook_row').notNull(),
});
export const sources = sqliteTable('sources', { id: text('id').primaryKey(), productId: text('product_id'), type: text('type').notNull(), title: text('title').notNull(), text: text('text').notNull(), capturedAt: text('captured_at').notNull(), fileId: text('file_id'), creatorOnly: integer('creator_only').default(1) });
export const snapshots = sqliteTable('snapshots', { id: text('id').primaryKey(), productId: text('product_id').notNull(), brief: text('brief').notNull(), source: text('source').notNull(), createdAt: text('created_at').notNull() });
export const campaigns = sqliteTable('campaigns', { id: text('id').primaryKey(), name: text('name').notNull(), brief: text('brief').notNull(), sample: integer('sample').default(1), dates: text('dates') });
export const campaignProducts = sqliteTable('campaign_products', { id: text('id').primaryKey(), campaignId: text('campaign_id').notNull(), productId: text('product_id').notNull() });
export const territories = sqliteTable('territories', { id: text('id').primaryKey(), title: text('title').notNull(), idea: text('idea').notNull(), notes: text('notes').notNull(), tone: text('tone').notNull(), sample: integer('sample').default(1) });
export const territoryProducts = sqliteTable('territory_products', { id: text('id').primaryKey(), territoryId: text('territory_id').notNull(), productId: text('product_id').notNull() });
export const boards = sqliteTable('boards', { id: text('id').primaryKey(), territoryId: text('territory_id').notNull(), number: integer('number').notNull(), fileId: text('file_id'), notes: text('notes').notNull(), createdAt: text('created_at').notNull() });
export const selections = sqliteTable('selections', { id: text('id').primaryKey(), territoryId: text('territory_id').notNull(), boardId: text('board_id').notNull(), productId: text('product_id').notNull(), campaignId: text('campaign_id'), actorId: text('actor_id').notNull(), createdAt: text('created_at').notNull() });
export const deliverables = sqliteTable('deliverables', { id: text('id').primaryKey(), title: text('title').notNull(), campaignId: text('campaign_id'), territoryId: text('territory_id'), placement: text('placement').notNull(), format: text('format').notNull(), requirements: text('requirements').notNull(), targetType: text('target_type').notNull().default('image'), approverId: text('approver_id'), currentVersionId: text('current_version_id'), approvedVersionId: text('approved_version_id'), sample: integer('sample').default(1) });
export const deliverableProducts = sqliteTable('deliverable_products', { id: text('id').primaryKey(), deliverableId: text('deliverable_id').notNull(), productId: text('product_id').notNull() });
export const versions = sqliteTable('versions', { id: text('id').primaryKey(), deliverableId: text('deliverable_id').notNull(), number: integer('number').notNull(), status: text('status').notNull(), text: text('text').notNull().default(''), summary: text('summary').notNull(), createdAt: text('created_at').notNull(), authorId: text('author_id').notNull(), promptId: text('prompt_id') });
export const slides = sqliteTable('slides', { id: text('id').primaryKey(), versionId: text('version_id').notNull(), position: integer('position').notNull(), fileId: text('file_id').notNull() });
export const files = sqliteTable('files', { id: text('id').primaryKey(), key: text('key').notNull(), name: text('name').notNull(), mime: text('mime').notNull(), size: integer('size').notNull(), ownerId: text('owner_id').notNull(), scopeType: text('scope_type').notNull(), scopeId: text('scope_id').notNull(), state: text('state').notNull().default('pending'), width: integer('width'), height: integer('height') });
export const comments = sqliteTable('comments', { id: text('id').primaryKey(), versionId: text('version_id').notNull(), slideId: text('slide_id'), parentId: text('parent_id'), authorId: text('author_id').notNull(), body: text('body').notNull(), x: real('x'), y: real('y'), visibility: text('visibility').notNull(), resolved: integer('resolved').default(0), createdAt: text('created_at').notNull(), sample: integer('sample').default(0) });
export const decisions = sqliteTable('decisions', { id: text('id').primaryKey(), targetType: text('target_type').notNull(), versionId: text('version_id').notNull(), actorId: text('actor_id').notNull(), action: text('action').notNull(), reason: text('reason').notNull(), scope: text('scope').notNull(), createdAt: text('created_at').notNull(), sample: integer('sample').default(0) });
export const prompts = sqliteTable('prompts', { id: text('id').primaryKey(), deliverableId: text('deliverable_id').notNull(), parentId: text('parent_id'), number: integer('number').notNull(), purpose: text('purpose').notNull(), text: text('text').notNull(), settings: text('settings').notNull(), lineage: text('lineage').notNull(), createdAt: text('created_at').notNull(), authorId: text('author_id').notNull(), assessment: text('assessment') });
export const conflicts = sqliteTable('conflicts', { id: text('id').primaryKey(), productId: text('product_id').notNull(), field: text('field').notNull(), leftSourceId: text('left_source_id').notNull(), rightSourceId: text('right_source_id').notNull(), explanation: text('explanation').notNull(), materiality: text('materiality').notNull(), status: text('status').notNull(), ownerId: text('owner_id'), resolution: text('resolution') });
export const sourceChoices = sqliteTable('source_choices', { id: text('id').primaryKey(), deliverableId: text('deliverable_id').notNull(), conflictId: text('conflict_id').notNull(), sourceId: text('source_id').notNull(), reason: text('reason').notNull(), actorId: text('actor_id').notNull(), createdAt: text('created_at').notNull() });
export const intakes = sqliteTable('intakes', { id: text('id').primaryKey(), productId: text('product_id').notNull(), number: integer('number').notNull(), text: text('text').notNull(), status: text('status').notNull(), authorId: text('author_id').notNull(), createdAt: text('created_at').notNull(), clarification: text('clarification'), confirmation: text('confirmation') });
export const packages = sqliteTable('release_packages', { id: text('id').primaryKey(), title: text('title').notNull(), campaignId: text('campaign_id'), number: integer('number').notNull(), parentId: text('parent_id'), createdAt: text('created_at').notNull() });
export const components = sqliteTable('package_components', { id: text('id').primaryKey(), packageId: text('package_id').notNull(), deliverableId: text('deliverable_id').notNull(), versionId: text('version_id').notNull() });
export const events = sqliteTable('events', { id: text('id').primaryKey(), actorId: text('actor_id').notNull(), type: text('type').notNull(), targetId: text('target_id').notNull(), text: text('text').notNull(), createdAt: text('created_at').notNull() });

/**
 * Define your database schema here, then apply it with `bun run db:push`
 * (from packages/web). Re-export any generated schema from this file
 * (e.g. Better Auth's auth-schema.ts) so drizzle generates complete migrations.
 * Table patterns and conventions: skills/app/references/api.md
 */
// Brand creative intelligence (additive). Imported from the user's fragrance briefs and
// motivation-tag CSV for the 29 fragrances only; other catalog products have no row.
export const fragranceProfiles = sqliteTable('fragrance_profiles', {
  productId: text('product_id').primaryKey(), csvName: text('csv_name').notNull(), briefSection: text('brief_section').notNull(),
  handle: text('handle').notNull(), evidenceNotes: text('evidence_notes').notNull(), family: text('family').notNull(),
  motivation: text('motivation').notNull(), flavorRegister: text('flavor_register').notNull(), confidence: text('confidence').notNull(),
  companionNotes: text('companion_notes').notNull(), tagNote: text('tag_note').notNull(), crossListedTo: text('cross_listed_to').notNull().default(''),
  sourceConflict: integer('source_conflict').notNull().default(0), sourceConflictText: text('source_conflict_text').notNull().default(''),
  evidenceTier: text('evidence_tier').notNull(), sourceVersion: text('source_version').notNull(), importedAt: text('imported_at').notNull(),
});
export const productImages = sqliteTable('product_images', {
  id: text('id').primaryKey(), productId: text('product_id').notNull(), fileId: text('file_id').notNull(), formatType: text('format_type'),
  role: text('role').notNull(), sourceName: text('source_name').notNull(), provenance: text('provenance').notNull(), createdAt: text('created_at').notNull(),
});
export const auditReports = sqliteTable('audit_reports', {
  id: text('id').primaryKey(), productId: text('product_id').notNull(), actorId: text('actor_id').notNull(), createdAt: text('created_at').notNull(),
  status: text('status').notNull(), liveUrl: text('live_url').notNull(), fetchedAt: text('fetched_at'), live: text('live').notNull().default('{}'),
  findings: text('findings').notNull().default('{}'), flagged: integer('flagged').notNull().default(0), flagSummary: text('flag_summary').notNull().default(''),
  model: text('model').notNull(), evidenceVersion: text('evidence_version').notNull(), error: text('error'),
});
export const territoryDetails = sqliteTable('territory_details', {
  territoryId: text('territory_id').primaryKey(), productId: text('product_id').notNull(), batchId: text('batch_id').notNull(), position: integer('position').notNull(),
  status: text('status').notNull(), entryPoints: text('entry_points').notNull(), elements: text('elements').notNull(), palette: text('palette').notNull(),
  imageReferences: text('image_references').notNull(), reasoning: text('reasoning').notNull(), evidenceCues: text('evidence_cues').notNull(),
  sourceChoice: text('source_choice').notNull().default(''), model: text('model').notNull(), evidenceVersion: text('evidence_version').notNull(),
  createdAt: text('created_at').notNull(), actorId: text('actor_id').notNull(), decidedAt: text('decided_at'), decidedBy: text('decided_by'),
});
export const generationJobs = sqliteTable('generation_jobs', {
  id: text('id').primaryKey(), productId: text('product_id').notNull(), territoryId: text('territory_id').notNull(), deliverableType: text('deliverable_type').notNull(),
  aspectRatio: text('aspect_ratio').notNull(), status: text('status').notNull(), prompt: text('prompt').notNull().default(''), promptParts: text('prompt_parts').notNull().default('{}'),
  reasoning: text('reasoning').notNull().default(''), referenceFileId: text('reference_file_id'), referenceSource: text('reference_source').notNull().default(''),
  falModel: text('fal_model').notNull(), falRequestId: text('fal_request_id'), falStatusUrl: text('fal_status_url'), falResponseUrl: text('fal_response_url'), adjustment: text('adjustment'), resultSourceUrl: text('result_source_url'), deliverableId: text('deliverable_id'),
  versionId: text('version_id'), fileId: text('file_id'), selfCheck: text('self_check'), error: text('error'), parentJobId: text('parent_job_id'),
  simplified: integer('simplified').notNull().default(0), evidenceVersion: text('evidence_version').notNull().default(''),
  actorId: text('actor_id').notNull(), createdAt: text('created_at').notNull(), updatedAt: text('updated_at').notNull(),
  shortlistId: text('shortlist_id'),
});
// Board shortlist for one batch of candidate directions (runable-agent-skill.md Task 2.3). Append-only:
// a creator swap writes a new row; the newest row per batch is current. Separate from the production selection.
export const territoryShortlists = sqliteTable('territory_shortlists', {
  id: text('id').primaryKey(), productId: text('product_id').notNull(), batchId: text('batch_id').notNull(),
  territoryIds: text('territory_ids').notNull(), reserve: text('reserve').notNull().default('[]'), reasons: text('reasons').notNull().default('[]'),
  summary: text('summary').notNull().default(''), origin: text('origin').notNull(), model: text('model'), evidenceVersion: text('evidence_version').notNull().default(''),
  parentId: text('parent_id'), actorId: text('actor_id').notNull(), createdAt: text('created_at').notNull(),
});
