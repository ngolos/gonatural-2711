import { useEffect, useState, useRef } from "react";
import { Save, Copy, Download, ArrowUpRight, GitBranch, Check, ArrowLeftRight } from "lucide-react";
import { usePacket, usePrompts, useAction } from "../queries/workspace";
import {
  Workspace,
  Loading,
  ErrorBox,
  Empty,
  Status,
  PrivateImage,
  Modal,
} from "../components/workspace-ui";
import { CreateBrief } from "./libraries";
import { client } from "../lib/api";
import { saveBlob } from "../lib/files";
export default function ProductionPage({
  w,
  id,
  go,
}: {
  w: Workspace;
  id: string;
  go: (path: string) => void;
}) {
  const q = usePacket(id),
    prompts = usePrompts(),
    save = useAction(client.production.save),
    choice = useAction(client.production.choice),
    assess = useAction(client.production.assess);
  const [text, setText] = useState(""),
    [selected, setSelected] = useState(""),
    [purpose, setPurpose] = useState<
      "Production Alphaprompt" | "Exploration" | "Targeted revision"
    >("Production Alphaprompt"),
    [message, setMessage] = useState(""),
    [reuse, setReuse] = useState(false),
    [compare, setCompare] = useState(false),
    [conflictChoice, setConflictChoice] = useState<{ id: string; sourceId: string } | null>(null),
    [reason, setReason] = useState(""),
    [assessment, setAssessment] = useState(false),
    [versionId, setVersionId] = useState("");
  const own =
    prompts.data?.filter((p) => p.deliverableId === id).sort((a, b) => b.number - a.number) ?? [];
  const current = own.find((p) => p.id === selected);
  const initialized = useRef("");
  useEffect(() => {
    if (q.data && prompts.data && initialized.current !== id) {
      initialized.current = id;
      const latest = prompts.data
        .filter((p) => p.deliverableId === id)
        .sort((a, b) => b.number - a.number)[0];
      setText(latest?.text ?? q.data.text);
      setSelected(latest?.id ?? "");
      if (latest) setPurpose(latest.purpose as typeof purpose);
    }
  }, [q.data, prompts.data, id]);
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} />;
  if (!q.data) return <Empty title="Production brief not found" />;
  const p = q.data;
  const d = p.deliverable;
  const linked = current ? JSON.parse(current.lineage) : null;
  const changed = linked?.productSnapshots?.filter((x: any) =>
    p.products.some((pr) => pr.id === x.productId && pr.updatedAt !== x.updatedAt),
  );
  function select(id: string) {
    setSelected(id);
    const selected = own.find((p) => p.id === id);
    setText(selected?.text ?? p.text);
    if (selected) setPurpose(selected.purpose as typeof purpose);
    setMessage("");
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setMessage("Prompt text copied. Export the full packet to keep source lineage.");
    } catch {
      setMessage("Clipboard unavailable. Use Export text instead.");
    }
  }
  return (
    <div>
      <button className="text-link back" onClick={() => go("/review/" + id)}>
        ← Deliverable & review
      </button>
      <div className="page-heading compact">
        <div>
          <div className="eyebrow">CREATOR-ONLY / PRODUCTION PACKET</div>
          <h1>The idea, ready to develop.</h1>
          <p>
            {d.title} ·{" "}
            {d.campaignId ? w.campaigns.find((c) => c.id === d.campaignId)?.name : "Evergreen"} ·{" "}
            {d.placement}
          </p>
        </div>
        <button className="btn secondary" onClick={() => setReuse(true)}>
          <GitBranch size={16} />
          Reuse for a new deliverable
        </button>
      </div>
      <div className="production-grid">
        <div>
          <section className="packet-editor">
            <header>
              <div>
                <h2>Draft prompt</h2>
                <small>
                  Reference Lock → Scene & Action → Composition → Aesthetic Engine → Constraints
                </small>
              </div>
              <Status value="Draft" />
            </header>
            <div className="prompt-controls">
              <select
                aria-label="Prompt version"
                value={selected}
                onChange={(e) => select(e.target.value)}
              >
                <option value="">Assembled draft · not saved</option>
                {own.map((p) => (
                  <option key={p.id} value={p.id}>
                    v{p.number} · {p.purpose}
                  </option>
                ))}
              </select>
              <select
                aria-label="Prompt purpose"
                value={purpose}
                onChange={(e) => setPurpose(e.target.value as typeof purpose)}
              >
                <option>Production Alphaprompt</option>
                <option>Exploration</option>
                <option>Targeted revision</option>
              </select>
              {own.length > 1 && (
                <button className="btn secondary" onClick={() => setCompare(true)}>
                  <ArrowLeftRight size={15} />
                  Compare
                </button>
              )}
            </div>
            <textarea
              className="prompt-textarea"
              aria-label="Editable draft prompt"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <div className="packet-actions">
              <button
                className="btn"
                disabled={save.isPending || !text.trim()}
                onClick={async () => {
                  try {
                    const r = await save.mutateAsync({
                      deliverableId: id,
                      text,
                      purpose,
                      parentId: selected || null,
                      settings: d.requirements,
                    });
                    setSelected(r.id);
                    setMessage(
                      "Saved a new prompt version with frozen product, board and execution source snapshots.",
                    );
                  } catch {}
                }}
              >
                <Save size={15} />
                {save.isPending ? "Saving…" : "Save new prompt version"}
              </button>
              <button className="btn secondary" onClick={copy}>
                <Copy size={15} />
                Copy
              </button>
              <button
                className="btn secondary"
                onClick={() =>
                  saveBlob(new Blob([text], { type: "text/plain" }), "draft-prompt.txt")
                }
              >
                <Download size={15} />
                Text
              </button>
              <button
                className="btn secondary"
                onClick={() =>
                  saveBlob(
                    new Blob(
                      [
                        JSON.stringify(
                          {
                            prompt: text,
                            purpose,
                            sourcePromptId: selected || null,
                            lineage: current ? JSON.parse(current.lineage) : p.lineage,
                            settings: current ? JSON.parse(current.settings) : d.requirements,
                            warnings: p.warnings,
                          },
                          null,
                          2,
                        ),
                      ],
                      { type: "application/json" },
                    ),
                    "production-packet.json",
                  )
                }
              >
                Export packet
              </button>
            </div>
            <ErrorBox error={save.error} />
            {message && <div className="success">{message}</div>}
          </section>
          {current && (
            <section className="saved-lineage">
              <div className="section-title">
                <h2>Retained prompt lineage</h2>
                <span>VERSION {current.number}</span>
              </div>
              {changed?.length > 0 && (
                <div className="warning">
                  Product information changed after this prompt was saved. The source snapshot below
                  is unchanged; inspect dependencies before reuse.
                </div>
              )}
              <details>
                <summary>Frozen source snapshots & references</summary>
                <pre>{JSON.stringify(JSON.parse(current.lineage), null, 2)}</pre>
              </details>
              <details>
                <summary>Recorded tool / settings</summary>
                <pre>{JSON.stringify(JSON.parse(current.settings), null, 2)}</pre>
              </details>
              {current.assessment ? (
                <div className="success">
                  <b>Successful for this execution</b>
                  <p>{JSON.parse(current.assessment).reason}</p>
                  <small>Creator assessment, not client approval or a universal guarantee.</small>
                </div>
              ) : (
                <p className="small muted">No contextual success assessment recorded.</p>
              )}
              <button
                className="text-link"
                onClick={() => {
                  setAssessment(true);
                  setReason("");
                }}
              >
                Record execution-specific success assessment <Check size={15} />
              </button>
            </section>
          )}
          <section className="execution-sources">
            <div className="section-title">
              <h2>Execution source choices</h2>
              <span>SEPARATE FROM CONFLICT RESOLUTION</span>
            </div>
            {p.conflicts
              .filter((c) => c.status !== "Resolved")
              .map((c) => (
                <article className="source-choice" key={c.id}>
                  <h3>{c.field}</h3>
                  <p>{c.explanation}</p>
                  <div className="claim-pair">
                    {[c.leftSourceId, c.rightSourceId].map((sid) => (
                      <button
                        key={sid}
                        onClick={() => {
                          setConflictChoice({ id: c.id, sourceId: sid });
                          setReason("");
                        }}
                      >
                        <small>RECORDED SOURCE</small>
                        <p>{p.sources.find((s) => s.id === sid)?.text}</p>
                        <span>
                          Choose for this execution <ArrowUpRight size={13} />
                        </span>
                      </button>
                    ))}
                  </div>
                </article>
              ))}
            {!p.conflicts.some((c) => c.status !== "Resolved") && (
              <p className="muted">
                No consequential open source conflict is recorded for the linked products.
              </p>
            )}
          </section>
        </div>
        <aside className="packet-sources">
          <section>
            <h3>Readiness, honestly</h3>
            {p.warnings.length ? (
              <div className="warning">
                {p.warnings.map((x) => (
                  <p key={x}>{x}</p>
                ))}
              </div>
            ) : (
              <p className="muted">Inspect references and source choices before production.</p>
            )}
            <p className="small muted">
              Prompt readiness is not approval of the resulting image or copy.
            </p>
          </section>
          <section>
            <h3>This deliverable</h3>
            <dl>
              {Object.entries(d.requirements).map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{String(v)}</dd>
                </div>
              ))}
            </dl>
          </section>
          <section>
            <h3>Product references</h3>
            {p.products.map((pr) => (
              <div key={pr.id}>
                <button className="text-link" onClick={() => go("/products/" + pr.id)}>
                  {pr.name}
                  <ArrowUpRight size={14} />
                </button>
                {pr.referenceId ? (
                  <PrivateImage id={pr.referenceId} alt={pr.name} />
                ) : (
                  <Empty
                    title="Actual reference missing"
                    detail="Do not use an invented bottle or treat a generated execution as the identity reference."
                  />
                )}
              </div>
            ))}
          </section>
          {p.territory && (
            <section>
              <h3>{p.territory.title}</h3>
              {p.board?.fileId ? (
                <PrivateImage id={p.board.fileId} alt={p.territory.title} />
              ) : (
                <Empty title="Board not uploaded" />
              )}
              <p>{p.territory.idea}</p>
              <small>
                {p.selection
                  ? "Scoped board selection recorded"
                  : "Proposal — no scoped client selection"}{" "}
                · board v{p.board?.number ?? "—"}
              </small>
            </section>
          )}
        </aside>
      </div>
      {reuse && (
        <CreateBrief
          w={w}
          productId={p.products[0]?.id}
          campaignId={d.campaignId ?? undefined}
          onClose={() => setReuse(false)}
          onCreated={async (newId) => {
            try {
              await client.production.save({
                deliverableId: newId,
                text,
                purpose,
                parentId: selected || null,
                settings: { adaptationRequired: true, sourceDeliverableId: id },
              });
              go("/production/" + newId);
            } catch (e) {
              setMessage(e instanceof Error ? e.message : "Reuse failed");
            }
          }}
        />
      )}
      {compare && (
        <Modal title="Compare saved prompt versions" wide onClose={() => setCompare(false)}>
          <div className="text-comparison">
            {own.slice(0, 2).map((p) => (
              <section key={p.id}>
                <h3>
                  {p.purpose} v{p.number}
                </h3>
                <pre>{p.text}</pre>
              </section>
            ))}
          </div>
        </Modal>
      )}
      {conflictChoice && (
        <Modal
          title="Choose a source for this execution only"
          onClose={() => setConflictChoice(null)}
        >
          <p className="muted">
            This records an exploratory source choice. The underlying product conflict stays open
            and disputed customer-facing claims still require confirmation or removal.
          </p>
          <label>
            Reason
            <textarea
              aria-label="Reason and confirmation scope"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <ErrorBox error={choice.error} />
          <div className="modal-footer">
            <button
              className="btn"
              disabled={!reason.trim() || choice.isPending}
              onClick={async () => {
                try {
                  await choice.mutateAsync({
                    deliverableId: id,
                    conflictId: conflictChoice.id,
                    sourceId: conflictChoice.sourceId,
                    reason,
                  });
                  setConflictChoice(null);
                  setMessage(
                    "Execution source choice retained. The underlying conflict is unchanged.",
                  );
                } catch {}
              }}
            >
              Save execution source choice
            </button>
          </div>
        </Modal>
      )}
      {assessment && current && (
        <Modal title="Successful for this execution" onClose={() => setAssessment(false)}>
          <p className="muted">
            The output must be linked to this exact prompt version. This is a creator judgment, not
            a client approval.
          </p>
          <label>
            Exact output version ID
            <input
              aria-label="Exact output version ID"
              value={versionId}
              onChange={(e) => setVersionId(e.target.value)}
              placeholder="Version ID from the linked output"
            />
          </label>
          <label>
            Why it worked
            <textarea
              aria-label="Reason and confirmation scope"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <ErrorBox error={assess.error} />
          <div className="modal-footer">
            <button
              className="btn"
              disabled={!reason.trim() || !versionId || assess.isPending}
              onClick={async () => {
                try {
                  await assess.mutateAsync({ id: current.id, versionId, reason });
                  setAssessment(false);
                } catch {}
              }}
            >
              Record contextual assessment
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
