# Go Natural workspace — acceptance and handover

## Verdict

**Working desktop-first web demo; not production-ready client access.** The React/Hono workspace has persistent product evidence, creative boards, production packets, versioned image/copy review, exact-version decisions and private originals. Two workflow journeys passed automated HTTP tests. Browser and restricted-access checks also passed.

The deliberate sample-login endpoints allow visitors to assume demo creator, reviewer and contributor identities. Private storage and role checks work, but **those public demo identities are not a production security boundary**. Remove sample-login access and establish real assigned memberships before sharing confidential client work through a published portal.

## What is in the workspace

- Eight sourced products, 94 original fictional navigation products and one additional fictional CSV acceptance record: **103 product records** after testing.
- Four supplied comparative moodboards, two verbatim exploration prompts, five Art Deco executions, three Talya executions and the supplied Talya manifest.
- Original source documents retained privately, alongside recorded evidence conflicts rather than a silently reconciled product story.
- Shared campaign/product associations; independent deliverable versions, comments, decisions, prompts and frozen package component references.
- Clearly labeled acceptance records, borrowed image fixtures and demonstration decisions retained so the tested histories can be inspected. They are not Go Natural product executions or client approvals.

**All eight supplied execution records remain Draft.** The test journeys used separate demonstration deliverables. No supplied execution was approved, published or regenerated.

Actual SKU identity photographs are still missing. In particular, the manifest's recorded `products/Talya.webp` input was not supplied. Execution previews do not become product-reference evidence.

## Verification

**59 named checks passed:** 34 workflow checks, eight restricted-access/storage checks and 17 browser checks. This is functional acceptance, not a penetration test, production load test or complete accessibility audit.

| Area | Verified outcome |
|---|---|
| Build | Root build, all package typechecks and lint passed; lint reported zero errors and warnings. Mobile/desktop boilerplate passing does not mean those platforms were implemented or delivered. |
| Product navigation | Search, list/grid switching and session-scoped filter retention; actual imported execution previews remain distinct from identity references. |
| Source controls | Reviewer cannot retrieve creator source originals or production prompts; client-facing brief strips creator history. |
| Scoped access | A restricted member sees only its granted product; campaign access alone cannot reveal work for ungranted products; package and association metadata are filtered. |
| Comparative boards | Full vanilla comparison requires access to every represented product, not just its first territory. |
| Storage | Anonymous object-storage reads fail; unauthenticated API reads fail; direct draft reads by reviewer fail. Download access changes immediately after a grant is revoked, without signing out. |
| Upload immutability | Completion stores a separate final original whose key is never presigned for PUT. Reusing an unexpired staging upload link cannot replace the stored original. Image dimensions are read server-side; supplied client dimensions are not trusted. |
| Review | Three-slide ordering, normalized pins, replies, resolution and exact-version history persist. Incomplete carousels cannot be submitted. |
| Decisions | Contributor approval denied; blank change reason denied; stale selection rejected; explicit approval records the version, actor and scope. |
| Release retention | A new draft does not remove the previous approved release; replacement supersedes it; revocation removes it from current approved releases without deleting history. |
| Separate scopes | Copy decisions do not approve images. Product-input confirmation and execution source choice do not resolve underlying product conflicts. |
| Packages | Readiness follows exact frozen image/copy component approvals, not the newest version automatically. Replacing an asset makes an old package no longer ready. |
| Originals/export | Downloaded image bytes match uploaded originals. Full backup ZIP contains relational records, originals and a file manifest; reviewer cannot download that backup. |
| CSV | Preview/apply reports duplicate rows; repeated stable IDs update instead of creating duplicate products. |
| Browser | All eight supplied executions render; Talya prompt displays verbatim; carousel navigation, zoom and version comparison work. Native modal focus and Escape behavior passed. No page-level overflow at 390px for tested product and review screens; no browser runtime exceptions in those tests. |
| Authentication | Sample identities, email/password login, reload persistence and sign-out passed. Google is wired through managed auth but an external Google sign-in was not completed in acceptance. |

## The two tested journeys

### 1. Evidence → prompt → image review → revision/release history

A client selected an actual Caramel Latte board version. A separate demonstration deliverable retained a frozen product snapshot and a saved prompt. Three borrowed image fixtures were uploaded to test exact-original storage and carousel behavior—not to depict or validate Caramel Latte.

The reviewer pinned a location on slide two; a reply and resolved thread persisted. Approval applied only to that image version. Later drafts retained the prior release and old pins. A reasoned change request, replacement approval, supersession and revocation all retained their own version histories.

### 2. Intake → independent copy review → frozen package

A contributor submitted explicitly fictional product input. Contributor confirmation was denied; scoped product-owner confirmation retained a source record without clearing the existing conflict.

An exploratory source choice did not allow disputed almond/milk copy through the current claim gate. Removing the disputed wording allowed an independent copy approval. A package froze specific image and copy versions; a subsequent replacement did not silently update that package.

## Remaining gaps and boundaries

### Before real client use

1. Replace open demo identities with invitations, assigned memberships and workspace administration; review the complete security model.
2. Upload original SKU identity references and confirm consequential product/source conflicts with the authorized product owner.
3. Complete real Google sign-in acceptance and production-origin/session testing.
4. Add production concurrency, transaction and referential-integrity testing. Sequential stale-decision checks passed; simultaneous upload completions, competing edits and decision races were not load-tested.
5. Review accessibility and contrast at working sizes. Keyboard checks cover specific interactions, not the full application.

### Partial implementations

- Claims blocking is a narrow keyword heuristic around the recorded almond/milk/condensed conflicts, **not comprehensive factual, regulatory or semantic claim validation**.
- Image count is enforced; exact placement aspect ratios, pixel requirements and packaging accuracy still require human inspection.
- New prompts retain product and source snapshots, board metadata and execution choices. Historical imported prompts retain only the provenance actually supplied; missing generation settings are not invented.
- Contextual prompt-success assessment exists but uses an exact output version ID rather than a friendly output chooser. Reuse still needs deliberate adaptation.
- Batch decision API exists; full batch-review UX remains incomplete.
- Release packages freeze component references and readiness. A dedicated package-only originals ZIP/release delivery workflow is not implemented.
- CSV mapping/import is supported. There is no live Shopify sync, watched-folder ingest or general bulk file-association importer.
- Full backup is export-only; no self-service restore importer. ZIP creation buffers originals in memory and needs scaling work. Staging/orphan upload cleanup is not yet automated.
- The client bundle is approximately 921 kB minified / 274 kB gzipped and triggers Vite's chunk-size warning; code splitting is still recommended.

### Not implemented

Live image generation, video review, publishing to Shopify/ad platforms, outbound invitations, multi-tenant administration, desktop-native workflows and a mobile application are not delivered. No platform publishing or paid generation was performed.

## Operate and inspect

- Open the delivered web preview and choose **creator**, **reviewer**, or **contributor**. Every sample action remains a demonstration.
- Creator: Products → product evidence/intake; Creative Library → boards, exact prompts and imported executions; deliverable → Production packet or Review.
- Reviewer: inspect submitted versions; approve/request changes only for the designated exact scope.
- Approved Assets shows current approved demonstration releases; it does not mean the supplied images have approval.
- Import/export includes mapped CSV preview, original source retrieval, JSON records and full private backup.

Implementation: `/home/user/go-natural`, web service port **4200**, launched with `bun run dev` in the persistent `go-natural-web` tmux session. The root `.env` contains provisioned credentials and demo secrets; do not put it in a public repository or export it with client deliverables.

Evidence files retained in the app root: `acceptance-results.json`, `access-acceptance-results.json`, `browser-acceptance-results.json`; reproducible scripts in `scripts/acceptance.py`, `scripts/access-acceptance.ts`, and `scripts/browser-acceptance.py`. Workflow scripts create additional labeled acceptance data when rerun.