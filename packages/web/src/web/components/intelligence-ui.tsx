import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, ShieldAlert, Sparkles, Search, RotateCcw, Loader2 } from "lucide-react";
import { client } from "../lib/api";
import { useAction } from "../queries/workspace";
import {
  useAuditReports,
  useAuditReport,
  useFragranceProfile,
  useGeneratedTerritories,
  useGenerationJobs,
} from "../queries/intelligence";
import { Empty, ErrorBox, Loading, Modal, PrivateImage, Status } from "./workspace-ui";

type Direction = NonNullable<ReturnType<typeof useGeneratedTerritories>["data"]>["items"][number];
type Job = NonNullable<ReturnType<typeof useGenerationJobs>["data"]>[number];

const label = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const when = (d: string | null | undefined) => (d ? new Date(d).toLocaleString() : "—");
const validHex = (h: string) => /^#[0-9A-Fa-f]{6}$/.test(h);
const busy = (s: string) => !["complete", "failed", "interrupted"].includes(s);
const boardActive = (s: string) => ["queued", "generating", "storing"].includes(s);

/** Refresh workspace data (works, territories) once a background run finishes. */
function useSettled(running: boolean) {
  const q = useQueryClient();
  const was = useRef(running);
  useEffect(() => {
    if (was.current && !running) void q.invalidateQueries();
    was.current = running;
  }, [running, q]);
}

// ------------------------------------------------------------------ profile
export function FragranceProfilePanel({ productId }: { productId: string }) {
  const q = useFragranceProfile(productId);
  if (q.isLoading || !q.data) return null;
  const { profile, missingReferences } = q.data;
  return (
    <section className="catalog-note-panel">
      <div className="section-title">
        <h2>Fragrance identity record</h2>
        <span className="family-label">
          {profile ? `Evidence: ${profile.evidenceTier}` : "No identity record"}
        </span>
      </div>
      {profile ? (
        <>
          <dl className="catalog-notes">
            <div>
              <dt>Family</dt>
              <dd>{profile.family}</dd>
            </div>
            <div>
              <dt>Motivation</dt>
              <dd>{profile.motivation}</dd>
            </div>
            <div>
              <dt>Register</dt>
              <dd>
                {profile.flavorRegister} · {profile.confidence} confidence
              </dd>
            </div>
            <div>
              <dt>Companions</dt>
              <dd>{profile.companionNotes}</dd>
            </div>
          </dl>
          {profile.tagNote && <p className="muted small">{profile.tagNote}</p>}
          {profile.evidenceTier === "thin" && (
            <div className="warning">
              <b>Thin evidence</b>
              <p>
                The brief records little more than the notes for this product. Audits and
                directions say what is missing instead of filling the gap.
              </p>
            </div>
          )}
          <details className="catalog-review">
            <summary>Recorded evidence (fragrance-briefs.md § {profile.briefSection})</summary>
            <p>{profile.evidenceNotes}</p>
            <p>
              Tag source: product-motivation-tags.csv ({profile.csvName}) · imported{" "}
              {when(profile.importedAt)}
            </p>
          </details>
        </>
      ) : (
        <p className="muted">
          This product is not in product-motivation-tags.csv, so the audit and direction workflows
          are not available for it.
        </p>
      )}
      <p className="muted small">
        Not supplied, so not used: {missingReferences.join(", ")}.
      </p>
    </section>
  );
}

// ------------------------------------------------------------------ header actions
/** The three workflow buttons on a fragrance product page. Asset generation needs a Selected direction. */
export function WorkflowActions({ productId, onTab }: { productId: string; onTab: (tab: "inputs" | "creative") => void }) {
  const profile = useFragranceProfile(productId);
  const enabled = !!profile.data?.profile;
  const dirs = useGeneratedTerritories(productId, enabled);
  const reports = useAuditReports(productId, enabled);
  const audit = useAction(client.intelligence.audit);
  const generate = useAction(client.intelligence.generateTerritories);
  if (!enabled) return null;
  const auditing = !!reports.data?.some((r) => r.status === "running");
  const generating = !!dirs.data?.run && !dirs.data.run.error;
  const selected = dirs.data?.items.some((d) => d.status === "selected");
  return (
    <>
      <button
        className="btn secondary"
        disabled={audit.isPending || auditing}
        onClick={() => {
          onTab("inputs");
          audit.mutate({ productId });
        }}
      >
        {auditing ? <Loader2 size={16} className="spin" /> : <Search size={16} />}
        {auditing ? "Auditing…" : "Audit"}
      </button>
      <button
        className="btn secondary"
        disabled={generate.isPending || generating}
        onClick={() => {
          onTab("creative");
          generate.mutate({ productId });
        }}
      >
        {generating ? <Loader2 size={16} className="spin" /> : <Sparkles size={16} />}
        {generating ? "Generating…" : "Generate territories"}
      </button>
      <button
        className="btn secondary"
        disabled={!selected}
        title={selected ? "Choose a deliverable for the selected direction" : "Mark a direction Selected first"}
        onClick={() => {
          onTab("creative");
          setTimeout(() => document.getElementById("generate-asset")?.scrollIntoView({ behavior: "smooth" }), 50);
        }}
      >
        <Sparkles size={16} />
        Generate asset
      </button>
      <ErrorBox error={audit.error || generate.error} />
    </>
  );
}

// ------------------------------------------------------------------ audit
export function AuditPanel({
  productId,
  creator,
  openId,
}: {
  productId: string;
  creator: boolean;
  openId?: string | null;
}) {
  const profile = useFragranceProfile(productId);
  const enabled = !!profile.data?.profile;
  const reports = useAuditReports(productId, enabled);
  const run = useAction(client.intelligence.audit);
  const [open, setOpen] = useState<string | null>(openId ?? null);
  useEffect(() => {
    if (openId) setOpen(openId);
  }, [openId]);
  useSettled(!!reports.data?.some((r) => busy(r.status)));
  if (!enabled) return null;
  const running = reports.data?.some((r) => r.status === "running");
  return (
    <section className="evidence-panel">
      <div className="section-title">
        <h3>Live page audit</h3>
        <Search size={18} />
      </div>
      <p className="small muted">
        Compares the live Shopify page text and images with fragrance-briefs.md and the motivation
        tag. Reports matches, hard conflicts and uncertain reads. No score.
      </p>
      {creator && (
        <div className="card-actions">
          <button
            className="btn secondary"
            disabled={run.isPending || running}
            onClick={() => run.mutate({ productId })}
          >
            {running ? <Loader2 size={15} className="spin" /> : <Search size={15} />}
            {running ? "Audit running…" : "Audit live page"}
          </button>
        </div>
      )}
      <ErrorBox error={run.error} />
      <div className="work-list">
        {reports.data?.map((r) => {
          const f = r.findings;
          return (
            <button className="work-row" key={r.id} onClick={() => setOpen(r.id)}>
              <span className="format-mark copy">A</span>
              <span className="row-main">
                <strong>{when(r.createdAt)}</strong>
                <small>
                  {f
                    ? `${f.matches?.length ?? 0} matches · ${f.hardConflicts?.length ?? 0} hard conflicts · ${f.uncertainReads?.length ?? 0} uncertain`
                    : r.status === "failed"
                      ? r.error
                      : "Fetching the live page and comparing…"}
                </small>
              </span>
              <Status value={label(r.status)} />
              <ArrowUpRight size={18} />
            </button>
          );
        })}
      </div>
      {reports.data && !reports.data.length && (
        <p className="muted small">No audit has been run for this product yet.</p>
      )}
      {open && <AuditReportModal id={open} onClose={() => setOpen(null)} />}
    </section>
  );
}

export function AuditReportModal({ id, onClose }: { id: string; onClose: () => void }) {
  const q = useAuditReport(id);
  const r = q.data;
  const f = r?.findings as
    | {
        matches: { finding: string; liveEvidence: string; recordEvidence: string; recordSource: string }[];
        hardConflicts: { field: string; liveSays: string; recordSays: string; recordSource: string; whyItMatters: string }[];
        uncertainReads: { finding: string; kind: string; whyNotAFactualError: string }[];
        knownConflictObservation: string;
        imagesReviewed: { image: string; observation: string }[];
        knownConflicts: { text: string; source: string; status: string }[];
        liveSource: string;
        missingReferences: string[];
      }
    | null
    | undefined;
  return (
    <Modal title={`Audit report · ${when(r?.createdAt)}`} wide onClose={onClose}>
      {q.isLoading && <Loading />}
      <ErrorBox error={q.error} />
      {r && (
        <>
          <p className="muted small">
            <Status value={label(r.status)} /> Live page:{" "}
            <a className="text-link" href={r.liveUrl} target="_blank" rel="noreferrer">
              {r.liveUrl}
            </a>{" "}
            · fetched {when(r.fetchedAt)} · model {r.model} · no overall score by design.
          </p>
          {r.status === "running" && <Loading />}
          {r.error && <div className="error">Audit failed: {r.error}</div>}
          {f && (
            <>
              {!!f.knownConflicts.length && (
                <div className="warning">
                  <b>Pre-existing source conflict — unresolved</b>
                  {f.knownConflicts.map((c, i) => (
                    <p key={i}>
                      {c.text} <br />
                      <small>
                        {c.source} · {c.status}
                      </small>
                    </p>
                  ))}
                  <p>
                    This audit does not resolve it. A human must confirm which version is current.
                  </p>
                  {f.knownConflictObservation && <p>What the live page shows: {f.knownConflictObservation}</p>}
                </div>
              )}
              <div className="section-title">
                <h3>Hard conflicts ({f.hardConflicts.length})</h3>
                <ShieldAlert size={18} />
              </div>
              {f.hardConflicts.length ? (
                f.hardConflicts.map((c, i) => (
                  <article className="conflict-record" key={i}>
                    <header>
                      <h4>{c.field}</h4>
                      <Status value="Open" />
                    </header>
                    <div className="claim-pair">
                      <div>
                        <small>LIVE SHOPIFY PAGE</small>
                        <p>{c.liveSays}</p>
                      </div>
                      <div>
                        <small>RECORD · {c.recordSource.toUpperCase()}</small>
                        <p>{c.recordSays}</p>
                      </div>
                    </div>
                    <p>{c.whyItMatters}</p>
                  </article>
                ))
              ) : (
                <p className="muted small">
                  No new hard conflict between the live page and the records.
                </p>
              )}
              <div className="section-title">
                <h3>Matches ({f.matches.length})</h3>
              </div>
              {f.matches.map((m, i) => (
                <article className="conflict-record" key={i}>
                  <p>{m.finding}</p>
                  <div className="claim-pair">
                    <div>
                      <small>LIVE SHOPIFY PAGE</small>
                      <p>{m.liveEvidence}</p>
                    </div>
                    <div>
                      <small>RECORD · {m.recordSource.toUpperCase()}</small>
                      <p>{m.recordEvidence}</p>
                    </div>
                  </div>
                </article>
              ))}
              <div className="section-title">
                <h3>Uncertain reads ({f.uncertainReads.length})</h3>
              </div>
              <p className="muted small">
                Interpretive or visual readings. These are not factual errors.
              </p>
              {f.uncertainReads.map((u, i) => (
                <article className="conflict-record" key={i}>
                  <header>
                    <h4>{label(u.kind)}</h4>
                    <Status value="Not a factual error" />
                  </header>
                  <p>{u.finding}</p>
                  <p className="small muted">{u.whyNotAFactualError}</p>
                </article>
              ))}
              {!!f.imagesReviewed.length && (
                <details className="catalog-review">
                  <summary>{f.imagesReviewed.length} images reviewed</summary>
                  {f.imagesReviewed.map((m, i) => (
                    <p key={i}>
                      <b>{m.image}</b> — {m.observation}
                    </p>
                  ))}
                </details>
              )}
              <p className="small muted">
                {f.liveSource}. Compared against fragrance-briefs.md and
                product-motivation-tags.csv. Not available: {f.missingReferences.join(", ")}.
              </p>
            </>
          )}
        </>
      )}
    </Modal>
  );
}

// ------------------------------------------------------------------ territories
export function GeneratedDirections({
  productId,
  creator,
  onOpen,
  statusOf,
}: {
  productId: string;
  creator: boolean;
  onOpen: (deliverableId: string) => void;
  statusOf: (deliverableId: string) => string | undefined;
}) {
  const profile = useFragranceProfile(productId);
  const enabled = !!profile.data?.profile;
  const q = useGeneratedTerritories(productId, enabled);
  const generate = useAction(client.intelligence.generateTerritories);
  const select = useAction(client.intelligence.selectTerritory);
  const running = !!q.data?.run && !q.data.run.error;
  useSettled(running);
  if (!enabled) return null;
  const items = q.data?.items ?? [];
  const batches = [...new Set(items.map((d) => d.batchId))];
  const latest = items.filter((d) => d.batchId === batches[0]).sort((a, b) => a.position - b.position);
  const shortlist = q.data?.shortlists.find((x) => x.batchId === batches[0]) ?? null;
  const earlier = items.filter((d) => d.batchId !== batches[0]);
  const selected = items.find((d) => d.status === "selected") ?? null;
  return (
    <section>
      <div className="section-title">
        <h2>Generated directions</h2>
        {creator && (
          <button
            className="btn"
            disabled={generate.isPending || running}
            onClick={() => generate.mutate({ productId })}
          >
            {running ? <Loader2 size={16} className="spin" /> : <Sparkles size={16} />}
            {running ? "Generating directions…" : "Generate territories"}
          </button>
        )}
      </div>
      <p className="muted small">
        3–4 candidate directions from fragrance-briefs.md, product-motivation-tags.csv and
        quiz-profile-map.csv. Three are shortlisted by default (with a named reserve) for one comparative
        moodboard, generated from the shortlist and the actual product photo ({profile.data?.falModel},
        US$0.0398 for the board). The board does not need a Selected direction. Proposals only. Marking
        one Selected afterwards makes it the input for asset generation; it is not an asset approval.
        {profile.data?.profile?.evidenceTier === "thin" &&
          " This product has thin evidence, so directions are deliberately limited to what is recorded."}
      </p>
      <ErrorBox error={generate.error || select.error} />
      {q.data?.run?.error && <div className="error">Last run failed: {q.data.run.error}</div>}
      {latest.length ? (
        <>
          {latest[0]?.reasoning.evidenceLimits && (
            <div className="warning">
              <b>What the evidence does not cover</b>
              <p>{latest[0].reasoning.evidenceLimits}</p>
            </div>
          )}
          <ComparativeBoard
            productId={productId}
            batchId={latest[0]!.batchId}
            candidates={latest}
            shortlist={shortlist}
            creator={creator}
            falConfigured={!!profile.data?.falConfigured}
          />
          <div className="comparison-boards">
            {latest.map((d) => (
              <DirectionCard
                key={d.territoryId}
                d={d}
                onBoard={shortlist?.current ? shortlist.current.territoryIds.indexOf(d.territoryId) : null}
                creator={creator}
                pending={select.isPending}
                onSelect={() => select.mutate({ territoryId: d.territoryId })}
              />
            ))}
          </div>
        </>
      ) : (
        !running && (
          <Empty
            title="No generated directions yet"
            detail="Generate territories to compare 3–4 evidence-grounded directions side by side."
          />
        )
      )}
      {!!earlier.length && (
        <details className="catalog-review">
          <summary>{earlier.length} directions from earlier runs</summary>
          {earlier.map((d) => (
            <p key={d.territoryId}>
              <b>{d.title}</b> · {label(d.status)} · {when(d.createdAt)}
              {creator && d.status !== "selected" && (
                <button className="text-link" onClick={() => select.mutate({ territoryId: d.territoryId })}>
                  Mark selected
                </button>
              )}
            </p>
          ))}
        </details>
      )}
      <AssetGenerator productId={productId} creator={creator} selected={selected} onOpen={onOpen} statusOf={statusOf} />
    </section>
  );
}

type Shortlist = NonNullable<ReturnType<typeof useGeneratedTerritories>["data"]>["shortlists"][number];

/** Board shortlist (its own record) and the one composite comparative moodboard for it. */
function ComparativeBoard({
  productId,
  batchId,
  candidates,
  shortlist,
  creator,
  falConfigured,
}: {
  productId: string;
  batchId: string;
  candidates: Direction[];
  shortlist: Shortlist | null;
  creator: boolean;
  falConfigured: boolean;
}) {
  const recommend = useAction(client.intelligence.recommendShortlist);
  const swap = useAction(client.intelligence.swapShortlist);
  const board = useAction(client.intelligence.generateComparativeBoard);
  const cur = shortlist?.current ?? null;
  const [picked, setPicked] = useState<string[] | null>(null);
  const job = shortlist?.board ?? null;
  const boardBusy = !!cur?.boardRunning || (!!job && busy(job.status));
  const recommending = !!shortlist?.run && !shortlist.run.error;
  useSettled(boardBusy || recommending);
  const title = (id: string) => candidates.find((c) => c.territoryId === id)?.title ?? "Unknown route";
  const chosen = picked ?? cur?.territoryIds ?? [];
  const changed = !!picked && (picked.length !== cur?.territoryIds.length || picked.some((id, i) => cur?.territoryIds[i] !== id));
  const toggle = (id: string) =>
    setPicked(chosen.includes(id) ? chosen.filter((x) => x !== id) : candidates.map((c) => c.territoryId).filter((x) => x === id || chosen.includes(x)));
  const failedNoMedia = !!job?.error?.includes("no_media_generated");
  return (
    <div className="source-choice">
      <div className="eyebrow">COMPARATIVE MOODBOARD · BOARD SHORTLIST</div>
      {cur ? (
        <>
          <h3>On the board: {cur.territoryIds.map(title).join(" · ")}</h3>
          <p>
            {cur.summary} {cur.origin === "creator" ? "Chosen by the creator" : `Recommended by ${cur.model ?? "the model"}`} ·{" "}
            {when(cur.createdAt)}
            {shortlist!.revisions > 1 ? ` · revision ${shortlist!.revisions}, earlier shortlists kept` : ""}. The shortlist is
            separate from the production selection.
          </p>
          <div className="markdown">
            <ul>
              {cur.territoryIds.map((id, i) => (
                <li key={id}>
                  <b>
                    Column {i + 1}: {title(id)}
                  </b>{" "}
                  — {cur.reasons.find((r) => r.territoryId === id)?.reason}
                </li>
              ))}
              {cur.reserve.map((r) => (
                <li key={r.territoryId}>
                  <b>Reserve: {title(r.territoryId)}</b> — {r.reason}
                </li>
              ))}
            </ul>
          </div>
          {creator && candidates.length > 2 && (
            <fieldset>
              <legend>Swap routes on the board (2–4, board order follows the candidate order)</legend>
              <div className="product-checks">
                {candidates.map((c) => (
                  <label key={c.territoryId}>
                    <input type="checkbox" aria-label={`Put ${c.title} on the board`} checked={chosen.includes(c.territoryId)} onChange={() => toggle(c.territoryId)} />
                    {c.title}
                  </label>
                ))}
              </div>
              {changed && (
                <div className="card-actions">
                  <button
                    className="btn secondary"
                    disabled={swap.isPending || chosen.length < 2 || chosen.length > 4}
                    onClick={() => swap.mutate({ batchId, territoryIds: chosen }, { onSuccess: () => setPicked(null) })}
                  >
                    Save board shortlist
                  </button>
                  <button className="text-link" onClick={() => setPicked(null)}>
                    Cancel
                  </button>
                  {(chosen.length < 2 || chosen.length > 4) && <span className="small muted">Choose two to four routes.</span>}
                </div>
              )}
            </fieldset>
          )}
        </>
      ) : (
        <>
          <h3>No board shortlist recorded</h3>
          <p>
            This batch was generated before the revised skill, so no routes were shortlisted for a comparative board.
            A recommendation uses the text model only; no image is generated.
          </p>
          {creator && (
            <div className="card-actions">
              <button
                className="btn secondary"
                disabled={recommend.isPending || recommending}
                onClick={() => recommend.mutate({ productId, batchId })}
              >
                {recommending ? <Loader2 size={16} className="spin" /> : <Sparkles size={16} />}
                {recommending ? "Recommending shortlist…" : "Recommend shortlist"}
              </button>
            </div>
          )}
        </>
      )}
      {shortlist?.run?.error && <div className="error">Shortlist recommendation failed: {shortlist.run.error}</div>}
      <ErrorBox error={recommend.error || swap.error || board.error} />
      {job?.fileId ? (
        <>
          <PrivateImage id={job.fileId} alt="Comparative moodboard" className="board-full" />
          <p className="small muted">
            {job.aspectRatio} · {when(job.createdAt)}
            {job.simplified ? " · condensed prompt retry" : ""}
            {!job.forCurrent && " · made for an earlier shortlist"} · Proposal, not an approved asset.
          </p>
        </>
      ) : job && boardBusy ? (
        <Loading />
      ) : null}
      {job?.error && <div className="error">Moodboard failed: {job.error}</div>}
      {creator && cur && (
        <div className="card-actions">
          <button
            className="btn"
            disabled={!falConfigured || board.isPending || boardBusy || changed}
            onClick={() =>
              board.mutate(
                failedNoMedia && job?.forCurrent
                  ? { shortlistId: cur.id, parentJobId: job.id, simplified: true }
                  : { shortlistId: cur.id },
              )
            }
          >
            {boardBusy ? <Loader2 size={16} className="spin" /> : <Sparkles size={16} />}
            {boardBusy
              ? `${label(job?.status ?? "generating").replace(/-/g, " ")}…`
              : failedNoMedia && job?.forCurrent
                ? "Retry with condensed prompt"
                : job?.fileId && job.forCurrent
                  ? "Regenerate comparative moodboard"
                  : "Generate comparative moodboard"}
          </button>
          {!boardBusy && (
            <span className="small muted">
              One image · about US$0.04 on your fal account.
              {!falConfigured && " fal key not configured."}
            </span>
          )}
        </div>
      )}
      {job?.prompt && (
        <details className="catalog-review">
          <summary>Board prompt & reasoning</summary>
          <p className="small muted">{job.prompt}</p>
          {job.reasoning && <p>Reasoning: {job.reasoning}</p>}
          {job.scentCueSource && <p>Scent cues: {job.scentCueSource}</p>}
          <p>Reference: {job.referenceSource || "—"}</p>
        </details>
      )}
      {job?.selfCheck && (
        <details className="catalog-review" open>
          <summary>Board check (4 criteria)</summary>
          {job.selfCheck.error && <p>{job.selfCheck.error}</p>}
          {job.selfCheck.checks.map((c) => (
            <p key={c.criterion}>
              <b>{c.criterion}:</b> {c.verdict} — {c.note}
            </p>
          ))}
          {job.selfCheck.visibleText && <p>Visible text: {job.selfCheck.visibleText}</p>}
          <p>Automated check, not a review decision.</p>
        </details>
      )}
    </div>
  );
}

function DirectionCard({
  d,
  onBoard,
  creator,
  pending,
  onSelect,
}: {
  d: Direction;
  /** Column index on the current board shortlist, -1 for reserve, null when no shortlist is recorded. */
  onBoard: number | null;
  creator: boolean;
  pending: boolean;
  onSelect: () => void;
}) {
  return (
    <div>
      <article className="territory-card">
        <div className="territory-image">
          {d.board.fileId ? (
            <PrivateImage id={d.board.fileId} alt={`${d.title} mood board`} />
          ) : (
          <div className={`missing-board ${d.position % 2 ? "spice" : "cafe"}`}>
            <span>{d.title}</span>
            <div className="card-actions">
              {d.palette.map((c) => (
                <i
                  key={c.hex + c.name}
                  className="family-dot"
                  style={{ background: validHex(c.hex) ? c.hex : "transparent" }}
                  title={`${c.name} ${c.hex}`}
                />
              ))}
            </div>
            <small>
              {boardActive(d.board.status)
                ? "Generating mood board…"
                : d.board.onComparative
                  ? "Shown on the comparative moodboard · palette preview"
                  : d.board.status === "failed" || d.board.status === "interrupted"
                    ? "Mood board failed · palette preview"
                    : "Palette preview"}
            </small>
          </div>
          )}
        </div>
        <div className="territory-content">
          <div className="territory-meta">
            {d.entryPoints.join(" + ")}
            {onBoard !== null && (onBoard >= 0 ? ` · Board column ${onBoard + 1}` : " · Reserve")}
            <span>
              <Status value={label(d.status)} />
            </span>
          </div>
          <h3>{d.title}</h3>
          <p>{d.idea}</p>
          <div className="markdown">
            <h4>Key elements</h4>
            <ul>
              {d.elements.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
            <h4>Palette</h4>
            <ul>
              {d.palette.map((c) => (
                <li key={c.hex + c.name}>
                  <i className="family-dot" style={{ background: validHex(c.hex) ? c.hex : "transparent" }} />{" "}
                  {c.name} {validHex(c.hex) ? c.hex : `(invalid colour value recorded: “${c.hex}”)`} — {c.role}
                </li>
              ))}
            </ul>
            <h4>Image references to gather</h4>
            <ul>
              {d.imageReferences.described.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
              <li>
                {d.imageReferences.productReferenceId
                  ? "Actual product reference photo (stored)"
                  : "Actual product reference photo: not stored"}
              </li>
            </ul>
            {d.board.error && <div className="error">Mood board failed: {d.board.error}</div>}
            {d.board.prompt && (
              <details className="catalog-review">
                <summary>Earlier per-direction mood board prompt</summary>
                <p className="small muted">{d.board.prompt}</p>
                <p className="small muted">Reference: {d.board.referenceSource || "—"} · {when(d.board.createdAt)}</p>
              </details>
            )}
            <h4>Evidence cues used</h4>
            <ul>
              {d.evidenceCues.map((c, i) => (
                <li key={i}>
                  “{c.cue}” <small>({c.source})</small>
                </li>
              ))}
            </ul>
            <h4>Reasoning</h4>
            <p>{d.reasoning.reasoning}</p>
            {d.sourceChoice && <p className="small muted">Source choice: {d.sourceChoice}</p>}
          </div>
          <footer>
            <span>
              {when(d.createdAt)} · {d.model}
            </span>
            {creator && d.status !== "selected" && (
              <button className="btn secondary" disabled={pending} onClick={onSelect}>
                Mark selected
              </button>
            )}
          </footer>
        </div>
      </article>
    </div>
  );
}

// ------------------------------------------------------------------ assets
function AssetGenerator({
  productId,
  creator,
  selected,
  onOpen,
  statusOf,
}: {
  productId: string;
  creator: boolean;
  selected: Direction | null;
  onOpen: (deliverableId: string) => void;
  statusOf: (deliverableId: string) => string | undefined;
}) {
  const profile = useFragranceProfile(productId);
  const jobs = useGenerationJobs(productId, creator);
  const generate = useAction(client.intelligence.generateAsset);
  const types = profile.data?.deliverables ?? [];
  const [type, setType] = useState("Hero shot");
  const [adjustment, setAdjustment] = useState("");
  const running = !!jobs.data?.some((j) => busy(j.status));
  useSettled(running);
  if (!creator) return null;
  const fal = profile.data?.falConfigured;
  const start = (input: { simplified?: boolean; parentJobId?: string; deliverableType?: string; territoryId?: string }) =>
    generate.mutate({
      territoryId: input.territoryId ?? selected!.territoryId,
      deliverableType: (input.deliverableType ?? type) as "Hero shot",
      adjustment: adjustment.trim() || undefined,
      parentJobId: input.parentJobId,
      simplified: input.simplified,
    });
  return (
    <section id="generate-asset">
      <div className="section-title">
        <h2>Generate asset</h2>
        <span className="family-label">{profile.data?.falModel}</span>
      </div>
      {!fal && <div className="error">fal key not configured. Nothing can be generated until FAL_KEY is added.</div>}
      {selected ? (
        <div className="prompt-card">
          <div>
            <div className="eyebrow">FROM SELECTED DIRECTION</div>
            <h3>{selected.title}</h3>
            <p>
              Uses the actual product reference image and a five-part prompt (Reference Lock → Scene
              & Action → Composition → Aesthetic Engine → Constraints). The result is stored in the
              workspace and lands in review as “In review”, not approved.
            </p>
            <label>
              Deliverable
              <select value={type} onChange={(e) => setType(e.target.value)}>
                {types.map((d) => (
                  <option key={d.name} value={d.name}>
                    {d.name} · {d.aspect} · {d.placement}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Adjustment (optional)
              <textarea
                aria-label="Optional adjustment"
                value={adjustment}
                onChange={(e) => setAdjustment(e.target.value)}
                placeholder="e.g. warmer morning light (also applied when regenerating)"
              />
            </label>
            <small>Cost: {profile.data?.falPrice}</small>
          </div>
          <div className="stack-actions">
            <button className="btn" disabled={!fal || generate.isPending || running} onClick={() => start({})}>
              {running ? <Loader2 size={16} className="spin" /> : <Sparkles size={16} />}
              {running ? "Generating…" : "Generate asset"}
            </button>
          </div>
        </div>
      ) : (
        <div className="warning">
          <b>Select a direction first</b>
          <p>Asset generation is available once one generated direction is marked Selected.</p>
        </div>
      )}
      <ErrorBox error={generate.error} />
      <div className="approved-grid">
        {jobs.data?.map((j) => (
          <JobCard key={j.id} j={j} reviewStatus={j.deliverableId ? statusOf(j.deliverableId) : undefined} onOpen={onOpen} onRetry={(simplified) => start({ simplified, parentJobId: j.id, deliverableType: j.deliverableType, territoryId: j.territoryId })} disabled={!fal || running} />
        ))}
      </div>
    </section>
  );
}

function JobCard({
  j,
  reviewStatus,
  onOpen,
  onRetry,
  disabled,
}: {
  j: Job;
  reviewStatus?: string;
  onOpen: (deliverableId: string) => void;
  onRetry: (simplified: boolean) => void;
  disabled: boolean;
}) {
  const parts = j.promptParts;
  const steps: [string, string][] = [
    ["Reference Lock", parts.referenceLock],
    ["Scene & Action", parts.sceneAction],
    ["Composition", parts.composition],
    ["Aesthetic Engine", parts.aestheticEngine],
    ["Constraints", parts.constraints],
  ];
  return (
    <article className="approved-card">
      <div className="approved-preview">
        {j.fileId ? (
          <PrivateImage id={j.fileId} alt={`${j.deliverableType} generated asset`} />
        ) : j.status === "failed" || j.status === "interrupted" ? (
          <Empty title="No image stored" detail={j.error ?? "The run was interrupted."} />
        ) : (
          <Loading />
        )}
      </div>
      <div>
        <Status value={j.versionId && j.status === "complete" ? (reviewStatus ?? "In review") : label(j.status)} />
        <h3>
          {j.deliverableType} · {j.aspectRatio}
        </h3>
        <p>
          {when(j.createdAt)} · {j.falModel}
          {j.simplified ? " · simplified retry" : ""}
          {j.versionId && (reviewStatus ?? "In review") === "In review" ? " · pending review, not approved" : ""}
        </p>
        {j.deliverableId && j.status === "complete" && (
          <button className="text-link" onClick={() => onOpen(j.deliverableId!)}>
            Open in review <ArrowUpRight size={14} />
          </button>
        )}
        {j.error && <div className="error">{j.error}</div>}
        {(j.status === "failed" || j.status === "interrupted") && (
          <button
            className="btn secondary"
            disabled={disabled}
            onClick={() => onRetry(!!j.error?.includes("no_media_generated"))}
          >
            <RotateCcw size={15} />
            {j.error?.includes("no_media_generated") ? "Retry with simplified prompt" : "Retry"}
          </button>
        )}
        {j.status === "complete" && (
          <button className="btn secondary" disabled={disabled} onClick={() => onRetry(false)}>
            <RotateCcw size={15} />
            Regenerate as new version
          </button>
        )}
        {j.prompt && (
          <details className="catalog-review">
            <summary>Prompt & reasoning</summary>
            {steps.map(([k, v]) => (
              <p key={k}>
                <b>{k}:</b> {v}
              </p>
            ))}
            {j.adjustment && <p>Adjustment: {j.adjustment}</p>}
            <p>Reasoning: {j.reasoning}</p>
            <p>Reference: {j.referenceSource}</p>
          </details>
        )}
        {j.selfCheck && (
          <details className="catalog-review" open>
            <summary>Self-check (5 criteria)</summary>
            {j.selfCheck.error && <p>{j.selfCheck.error}</p>}
            {j.selfCheck.checks.map((c) => (
              <p key={c.criterion}>
                <b>{c.criterion}:</b> {c.verdict} — {c.note}
              </p>
            ))}
            {j.selfCheck.visibleText && <p>Visible text: {j.selfCheck.visibleText}</p>}
            <p>Automated check, not a review decision.</p>
          </details>
        )}
      </div>
    </article>
  );
}
