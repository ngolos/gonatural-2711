import { useState, useEffect } from "react";
import {
  Plus,
  ArrowUpRight,
  ShieldAlert,
  CheckCircle2,
  Edit3,
  MessageSquare,
  ArrowLeftRight,
} from "lucide-react";
import Markdown from "react-markdown";
import { useProduct, useAction } from "../queries/workspace";
import {
  Workspace,
  WorkRow,
  Loading,
  ErrorBox,
  Empty,
  Status,
  Modal,
  PrivateImage,
  UploadButton,
} from "../components/workspace-ui";
import { CreateBrief } from "./libraries";
import {
  AuditPanel,
  GeneratedDirections,
  WorkflowActions,
} from "../components/intelligence-ui";
import { useTerritoryStatuses } from "../queries/intelligence";
import { client } from "../lib/api";
export default function ProductDetail({
  w,
  id,
  go,
}: {
  w: Workspace;
  id: string;
  go: (p: string) => void;
}) {
  const q = useProduct(id);
  const search = new URLSearchParams(window.location.search);
  const reportId = search.get("report");
  const statuses = useTerritoryStatuses();
  const [tab, setTab] = useState(
      search.get("tab") === "creative" ? "Creative directions" : "Product inputs & information",
    ),
    [creating, setCreating] = useState(false),
    [edit, setEdit] = useState(false),
    [brief, setBrief] = useState(""),
    [inputOpen, setInputOpen] = useState(false),
    [inputText, setInputText] = useState(""),
    [inputFields, setInputFields] = useState({
      description: "",
      notes: "",
      mandatory: "",
      restrictions: "",
      variant: "",
      launch: "",
    }),
    [compare, setCompare] = useState(false),
    [action, setAction] = useState<{ kind: string; id: string; sourceId?: string } | null>(null),
    [reason, setReason] = useState("");
  const save = useAction(client.workspace.saveProduct),
    submit = useAction(client.intake.submit),
    clarify = useAction(client.intake.clarify),
    confirm = useAction(client.intake.confirm),
    conflict = useAction(client.intake.conflict);
  const p = q.data;
  useEffect(() => {
    if (p) setBrief(p.brief);
  }, [p]);
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} />;
  if (!p) return <Empty title="Product not found" />;
  const works = w.works.filter((d) => d.productIds.includes(p.id));
  const evergreen = works.filter((d) => !d.campaignId);
  const territory = w.territories.filter((t) => t.productIds.includes(p.id));
  const creator = w.member.role === "creator";
  const tabs = [
    "Product inputs & information",
    "Creative directions",
    "Shopify & evergreen assets",
    "Campaign work",
    "Production history",
  ];
  return (
    <div>
      <button className="text-link back" onClick={() => go("/products")}>
        ← Products
      </button>
      <div className="page-heading compact">
        <div>
          <div className="eyebrow">
            {p.sample ? "FICTIONAL NAVIGATION SAMPLE" : "COLLECTED PRODUCT RECORD"} / {p.id}
          </div>
          <h1>{p.name}</h1>
          <p>
            {p.family} · {p.formats.length} available product types ·{" "}
            {p.referenceId ? "Product reference attached" : "Actual product reference not uploaded"}
          </p>
        </div>
        {creator ? (
          <div className="packet-actions">
            <WorkflowActions
              productId={p.id}
              onTab={(t) =>
                setTab(t === "creative" ? "Creative directions" : "Product inputs & information")
              }
            />
            <button className="btn" onClick={() => setCreating(true)}>
              <Plus size={16} />
              New production brief
            </button>
          </div>
        ) : (
          <button className="btn" onClick={() => setInputOpen(true)}>
            <Plus size={16} />
            Submit product inputs
          </button>
        )}
      </div>
      {p.formats.length > 0 && (
        <section className="catalog-formats" aria-label="Available product types">
          <div className="section-title">
            <h2>Available product types</h2>
          </div>
          <div className="catalog-format-grid">
            {p.formats.map((f) => (
              <article key={f.id} className="catalog-format-card">
                <h3>{f.type}</h3>
              </article>
            ))}
          </div>
        </section>
      )}
      <div className="tabs product-tabs">
        {tabs.map((t) => (
          <button key={t} className={tab === t ? "active" : ""} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </div>
      {tab === "Product inputs & information" ? (
        <div className="product-detail-grid">
          <div>
            {p.catalog && (
              <section className="catalog-note-panel">
                <div className="section-title">
                  <h2>Catalog scent profile</h2>
                  <span className="family-label">
                    <i className="family-dot" style={{ background: p.catalog.familyColor }} />
                    {p.family}
                  </span>
                </div>
                <dl className="catalog-notes">
                  <div>
                    <dt>Top</dt>
                    <dd>{p.catalog.topNotes}</dd>
                  </div>
                  <div>
                    <dt>Heart</dt>
                    <dd>{p.catalog.heartNotes}</dd>
                  </div>
                  <div>
                    <dt>Base</dt>
                    <dd>{p.catalog.baseNotes}</dd>
                  </div>
                </dl>
              </section>
            )}
            <section className="source-panel">
              <div className="section-title">
                <h2>The product foundation</h2>
                {creator && (
                  <button className="text-link" onClick={() => setEdit(true)}>
                    <Edit3 size={14} />
                    Edit / paste brief
                  </button>
                )}
              </div>
              <div className="markdown">
                <Markdown>{p.brief}</Markdown>
              </div>
            </section>
            <section className="intake-panel">
              <div className="section-title">
                <h2>Client product inputs</h2>
                <button className="text-link" onClick={() => setInputOpen(true)}>
                  <Plus size={15} />
                  New revision
                </button>
              </div>
              <p className="muted">
                Client submissions are versioned evidence. Corrections do not overwrite confirmed
                input or silently settle competing claims.
              </p>
              {p.intakes.length > 1 && (
                <button className="btn secondary" onClick={() => setCompare(true)}>
                  <ArrowLeftRight size={15} />
                  Compare latest input revisions
                </button>
              )}
              {p.intakes.length ? (
                p.intakes
                  .slice()
                  .reverse()
                  .map((i) => (
                    <article className="intake-record" key={i.id}>
                      <header>
                        <h3>Product input v{i.number}</h3>
                        <Status value={i.status} />
                      </header>
                      <small>
                        {w.people.find((x) => x.id === i.authorId)?.name ?? "Submitter"} ·{" "}
                        {new Date(i.createdAt).toLocaleString()}
                      </small>
                      <pre>{i.text}</pre>
                      {i.clarification && (
                        <div className="warning">
                          <b>Clarification requested</b>
                          <p>{i.clarification}</p>
                        </div>
                      )}
                      {i.confirmation && (
                        <div className="success">
                          Confirmed scope: {JSON.parse(i.confirmation).scope}
                        </div>
                      )}
                      <div className="card-actions">
                        {i.status === "Submitted" && creator && (
                          <button
                            className="btn secondary"
                            onClick={() => {
                              setAction({ kind: "clarify", id: i.id });
                              setReason("");
                            }}
                          >
                            Request clarification
                          </button>
                        )}
                        {i.status === "Submitted" && !!w.member.productOwner && (
                          <button
                            className="btn secondary"
                            onClick={() => {
                              setAction({ kind: "confirm", id: i.id });
                              setReason("");
                            }}
                          >
                            Confirm product information
                          </button>
                        )}
                        {i.status === "Needs clarification" && (
                          <button
                            className="btn"
                            onClick={() => {
                              setInputText(i.text);
                              setInputOpen(true);
                            }}
                          >
                            Submit corrected revision
                          </button>
                        )}
                        {i.authorId === w.member.id && i.status === "Submitted" && (
                          <UploadButton
                            scopeType="intake"
                            scopeId={i.id}
                            label="Attach packaging / reference"
                          />
                        )}
                      </div>
                    </article>
                  ))
              ) : (
                <Empty
                  title="No client submission yet"
                  detail="Add product information, approved wording, restrictions and reference files."
                />
              )}
            </section>
          </div>
          <aside className="product-side">
            {false && <AuditPanel productId={p.id} creator={creator} openId={reportId} />}
            <section className="reference-panel">
              <div className="section-title">
                <h3>Product identity reference</h3>
              </div>
              {p.referenceId ? (
                <PrivateImage id={p.referenceId} alt={p.name} />
              ) : (
                <Empty
                  title="Reference not uploaded"
                  detail="Generated executions and moodboards do not replace the actual SKU photo."
                />
              )}
              {creator && (
                <UploadButton
                  scopeType="product"
                  scopeId={p.id}
                  label="Upload actual product photo"
                />
              )}
            </section>
            <section className="evidence-panel">
              <div className="section-title">
                <h3>Evidence & source conflicts</h3>
                <ShieldAlert size={18} />
              </div>
              {p.conflicts.length ? (
                p.conflicts.map((c) => (
                  <article className="conflict-record" key={c.id}>
                    <header>
                      <h4>{c.field}</h4>
                      <Status value={c.status} />
                    </header>
                    <span className="small muted">{c.materiality}</span>
                    <p>{c.explanation}</p>
                    <div className="claim-pair">
                      {[c.leftSourceId, c.rightSourceId].map((sid, index) => (
                        <div key={sid}>
                          <small>RECORDED SOURCE {index ? "B" : "A"}</small>
                          <p>
                            {p.sources.find((s) => s.id === sid)?.text ?? "Source not available"}
                          </p>
                        </div>
                      ))}
                    </div>
                    {c.resolution && (
                      <div className="small muted">
                        Last decision: {JSON.parse(c.resolution).reason}
                      </div>
                    )}
                    {c.status !== "Resolved" && (
                      <div className="card-actions">
                        {creator && (
                          <button
                            className="text-link"
                            onClick={() => {
                              setAction({ kind: "conflict-clarify", id: c.id });
                              setReason("");
                            }}
                          >
                            Request clarification <MessageSquare size={13} />
                          </button>
                        )}
                        {!!w.member.productOwner && (
                          <button
                            className="text-link"
                            onClick={() => {
                              setAction({
                                kind: "conflict-resolve",
                                id: c.id,
                                sourceId: c.leftSourceId,
                              });
                              setReason("");
                            }}
                          >
                            Resolve with evidence <CheckCircle2 size={13} />
                          </button>
                        )}
                      </div>
                    )}
                  </article>
                ))
              ) : (
                <p className="muted">
                  No conflict is recorded for this product. That is not a fresh verification of all
                  claims.
                </p>
              )}
              <p className="small muted">
                An execution-specific source choice does not resolve an underlying conflict. Product
                confirmation is separate from asset approval.
              </p>
            </section>
          </aside>
        </div>
      ) : tab === "Creative directions" ? (
        <div>
        <GeneratedDirections
          productId={p.id}
          creator={creator}
          onOpen={(id) => go("/review/" + id)}
          statusOf={(id) => w.works.find((d) => d.id === id)?.current?.status}
        />
        <div className="section-title">
          <h2>All directions for this product</h2>
        </div>
        <div className="territory-grid">
          {territory.map((t) => {
            const b = t.boards.filter((b) => b.fileId).sort((a, b) => b.number - a.number)[0];
            return (
              <article className="territory-card" key={t.id}>
                <button
                  className="territory-image"
                  onClick={() => go("/creative?territory=" + t.id)}
                >
                  {b?.fileId ? (
                    <PrivateImage id={b.fileId} alt={t.title} />
                  ) : (
                    <Empty title="Board not uploaded" />
                  )}
                </button>
                <div className="territory-content">
                  <button
                    className="territory-title"
                    onClick={() => go("/creative?territory=" + t.id)}
                  >
                    {t.title}
                    <ArrowUpRight size={16} />
                  </button>
                  <p>{t.idea}</p>
                  <small>
                    {(() => {
                      const st = statuses.data?.find((x) => x.territoryId === t.id)?.status;
                      return st
                        ? `Generated direction · ${st.charAt(0).toUpperCase() + st.slice(1)}`
                        : `Proposal · Board version ${b?.number ?? "not recorded"}`;
                    })()}
                  </small>
                </div>
              </article>
            );
          })}
          {!territory.length && (
            <Empty
              title="No directions linked yet"
              detail="A straightforward packshot can proceed without inventing a territory."
            />
          )}
        </div>
        </div>
      ) : tab === "Shopify & evergreen assets" ? (
        <div>
          <div className="completeness">
            {[
              "Packshot",
              "Lifestyle image",
              "Ingredient image",
              "Product description",
              "Alt text",
            ].map((f) => {
              const ds = evergreen.filter((d) => d.format === f);
              const approved = ds.some((d) => d.approvedVersionId);
              return (
                <div key={f}>
                  <small>{f}</small>
                  <b>{approved ? "Approved" : ds.length ? "In progress" : "Not yet assigned"}</b>
                </div>
              );
            })}
          </div>
          <p className="muted small">
            Suggested components, not universal Shopify requirements. Dimensions belong to each
            brief. Nothing here implies Shopify publishing.
          </p>
          <div className="work-list">
            {evergreen.map((d) => (
              <WorkRow key={d.id} work={d} w={w} onOpen={(id) => go("/review/" + id)} />
            ))}
          </div>
        </div>
      ) : tab === "Campaign work" ? (
        <div>
          {w.campaigns
            .filter((c) =>
              w.campaignProducts.some((l) => l.campaignId === c.id && l.productId === p.id),
            )
            .map((c) => (
              <section className="campaign-work-group" key={c.id}>
                <div className="section-title">
                  <h2>{c.name}</h2>
                  <button className="text-link" onClick={() => go("/campaigns/" + c.id)}>
                    Campaign view <ArrowUpRight size={16} />
                  </button>
                </div>
                <div className="work-list">
                  {works
                    .filter((d) => d.campaignId === c.id)
                    .map((d) => (
                      <WorkRow key={d.id} work={d} w={w} onOpen={(id) => go("/review/" + id)} />
                    ))}
                </div>
              </section>
            ))}
          {!works.some((d) => d.campaignId) && <Empty title="No campaign deliverables linked" />}
        </div>
      ) : (
        <div>
          <p className="muted">
            Each execution retains its versions, comments, files and recorded prompt. Missing
            lineage is reported, never reconstructed.
          </p>
          <div className="work-list">
            {works.map((d) => (
              <WorkRow key={d.id} work={d} w={w} onOpen={(id) => go("/review/" + id)} />
            ))}
          </div>
        </div>
      )}
      {creating && (
        <CreateBrief
          w={w}
          productId={p.id}
          onClose={() => setCreating(false)}
          onCreated={(id) => go("/production/" + id)}
        />
      )}
      {edit && (
        <Modal title="Edit the collected product brief" wide onClose={() => setEdit(false)}>
          <p className="muted">
            Saving creates a new source snapshot. Existing prompts and approvals will not be
            rewritten.
          </p>
          <textarea
            aria-label="Product brief"
            className="large-textarea"
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
          />
          <ErrorBox error={save.error} />
          <div className="modal-footer">
            <button
              className="btn"
              disabled={save.isPending}
              onClick={async () => {
                try {
                  await save.mutateAsync({ id: p.id, brief, expectedUpdatedAt: p.updatedAt });
                  setEdit(false);
                } catch {}
              }}
            >
              {save.isPending ? "Saving…" : "Save new snapshot"}
            </button>
          </div>
        </Modal>
      )}
      {inputOpen && (
        <Modal title="Submit a product-input revision" wide onClose={() => setInputOpen(false)}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const text =
                inputText ||
                Object.entries(inputFields)
                  .map(([k, v]) => k + ": " + (v || "[Not supplied]"))
                  .join("\n");
              try {
                await submit.mutateAsync({ productId: p.id, text });
                setInputOpen(false);
                setInputText("");
              } catch {}
            }}
          >
            <p className="muted">
              {p.name} · Incomplete submissions are allowed. Upload packaging/reference files after
              submission. This does not approve creative assets.
            </p>
            {inputText ? (
              <label>
                Correction
                <textarea
                  aria-label="Product correction"
                  className="large-textarea"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                />
              </label>
            ) : (
              <div className="form-grid">
                {Object.entries(inputFields).map(([key, value]) => (
                  <label key={key}>
                    {
                      (
                        {
                          description: "Description",
                          notes: "Note pyramid / facts",
                          mandatory: "Mandatory wording / approved claims",
                          restrictions: "Restrictions / corrections",
                          variant: "Variant / format",
                          launch: "Launch details",
                        } as Record<string, string>
                      )[key]
                    }
                    <textarea
                      aria-label="Product input field"
                      value={value}
                      onChange={(e) => setInputFields((f) => ({ ...f, [key]: e.target.value }))}
                    />
                  </label>
                ))}
              </div>
            )}
            <ErrorBox error={submit.error} />
            <div className="modal-footer">
              <button className="btn" disabled={submit.isPending}>
                {submit.isPending ? "Submitting…" : "Submit new revision"}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {compare && (
        <Modal title="Product input before / after" wide onClose={() => setCompare(false)}>
          <div className="text-comparison">
            {p.intakes.slice(-2).map((i) => (
              <section key={i.id}>
                <h3>
                  Input v{i.number} · {i.status}
                </h3>
                <pre>{i.text}</pre>
              </section>
            ))}
          </div>
          <p className="small muted">
            Previous source evidence and confirmations remain traceable.
          </p>
        </Modal>
      )}
      {action && (
        <Modal
          title={
            action.kind.includes("resolve")
              ? "Resolve this source conflict"
              : action.kind === "confirm"
                ? "Confirm product information"
                : "Request clarification"
          }
          onClose={() => setAction(null)}
        >
          <p className="muted">
            State the exact scope and supporting reason. This decision does not approve unrelated
            creative work.
          </p>
          {action.kind === "conflict-resolve" && (
            <label>
              Supporting source
              <select
                value={action.sourceId}
                onChange={(e) => setAction((a) => (a ? { ...a, sourceId: e.target.value } : a))}
              >
                {(() => {
                  const c = p.conflicts.find((c) => c.id === action.id)!;
                  return [c.leftSourceId, c.rightSourceId].map((sid) => (
                    <option key={sid} value={sid}>
                      {p.sources.find((s) => s.id === sid)?.text}
                    </option>
                  ));
                })()}
              </select>
            </label>
          )}
          <label>
            Reason / confirmation scope
            <textarea
              aria-label="Reason and confirmation scope"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="What has been clarified or confirmed, and why?"
            />
          </label>
          <ErrorBox error={clarify.error || confirm.error || conflict.error} />
          <div className="modal-footer">
            <button
              className="btn"
              disabled={
                !reason.trim() || clarify.isPending || confirm.isPending || conflict.isPending
              }
              onClick={async () => {
                try {
                  if (action.kind === "clarify")
                    await clarify.mutateAsync({ id: action.id, reason });
                  else if (action.kind === "confirm")
                    await confirm.mutateAsync({ id: action.id, scope: reason });
                  else
                    await conflict.mutateAsync({
                      id: action.id,
                      action:
                        action.kind === "conflict-resolve" ? "Resolve" : "Request clarification",
                      reason,
                      sourceId: action.sourceId ?? null,
                    });
                  setAction(null);
                } catch {}
              }}
            >
              Record scoped decision
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
