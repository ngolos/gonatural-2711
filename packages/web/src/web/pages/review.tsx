import { useState, useEffect } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Maximize2,
  MessageSquare,
  Check,
  Plus,
  ArrowUpRight,
  Send,
  GitCompare,
} from "lucide-react";
import { useReview, useAction, usePrompts } from "../queries/workspace";
import {
  Workspace,
  Loading,
  ErrorBox,
  Empty,
  Status,
  Modal,
  PrivateImage,
  UploadButton,
  DownloadButton,
} from "../components/workspace-ui";
import { client } from "../lib/api";
import { saveBlob } from "../lib/files";
export default function ReviewPage({
  w,
  id,
  go,
}: {
  w: Workspace;
  id: string;
  go: (p: string) => void;
}) {
  const q = useReview(id),
    [versionId, setVersionId] = useState(""),
    [slideIndex, setSlideIndex] = useState(0),
    [compare, setCompare] = useState(false),
    [otherId, setOtherId] = useState(""),
    [zoom, setZoom] = useState(1),
    [body, setBody] = useState(""),
    [pin, setPin] = useState<{ x: number; y: number } | null>(null),
    [visibility, setVisibility] = useState<"client" | "creator">("client"),
    [reply, setReply] = useState<string | null>(null),
    [replyBody, setReplyBody] = useState(""),
    [newOpen, setNewOpen] = useState(false),
    [newText, setNewText] = useState(""),
    [summary, setSummary] = useState(""),
    [promptId, setPromptId] = useState(""),
    [decision, setDecision] = useState<{
      action: "Approve" | "Request changes" | "Revoke";
      versionId: string;
      expectedCurrentVersionId: string;
    } | null>(null),
    [reason, setReason] = useState("");
  const comment = useAction(client.review.comment),
    resolve = useAction(client.review.resolve),
    newVersion = useAction(client.review.newVersion),
    submit = useAction(client.review.submit),
    decide = useAction(client.review.decide);
  const prompts = usePrompts(w.member.role === "creator");
  useEffect(() => {
    if (q.data && !versionId) {
      setVersionId(q.data.versions[0]?.id || "");
      setOtherId(q.data.versions[1]?.id || "");
    }
  }, [q.data, versionId]);
  useEffect(() => {
    setPin(null);
    setBody("");
    setSlideIndex(0);
    setReply(null);
  }, [versionId]);
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} />;
  if (!q.data) return <Empty title="Work not found" />;
  const { deliverable: d, versions, products } = q.data;
  const v = versions.find((v) => v.id === versionId) || versions[0];
  const other = versions.find((v) => v.id === otherId) || versions.find((x) => x.id !== v?.id);
  const slide = v?.slides[slideIndex];
  const creator = w.member.role === "creator";
  if (!v)
    return <Empty title="No submitted version" detail="Drafts are only visible to creators." />;
  const closed =
    v.id !== d.currentVersionId || ["Approved", "Superseded", "Revoked"].includes(v.status);
  const roots = v.comments.filter((c) => !c.parentId);
  const author = (id: string) => w.people.find((p) => p.id === id)?.name ?? "Workspace member";
  function openDecision(action: "Approve" | "Request changes" | "Revoke") {
    setDecision({ action, versionId: v.id, expectedCurrentVersionId: d.currentVersionId! });
    setReason("");
  }
  return (
    <div className="review-page">
      <div className="scope-breadcrumb">
        <button
          onClick={() =>
            go(d.campaignId ? "/campaigns/" + d.campaignId : "/products/" + products[0]?.id)
          }
        >
          {d.campaignId ? w.campaigns.find((c) => c.id === d.campaignId)?.name : "Evergreen"}
        </button>
        <span>/</span>
        {products.map((p) => (
          <button key={p.id} onClick={() => go("/products/" + p.id)}>
            {p.name}
          </button>
        ))}
        <span>/</span>
        <strong>{d.format}</strong>
      </div>
      <div className="review-heading">
        <div>
          <div className="eyebrow">
            {d.placement} / {d.format} {d.sample ? " / DEMONSTRATION WORK" : ""}
          </div>
          <h1>{d.title}</h1>
          <p>
            Designated approver: {author(d.approverId ?? "")} · Approval belongs to this placement
            and exact version.
          </p>
        </div>
        <Status value={v.status} />
      </div>
      <div className="review-toolbar">
        <div>
          <select
            aria-label="Asset version"
            value={v.id}
            onChange={(e) => setVersionId(e.target.value)}
          >
            {versions.map((x) => (
              <option key={x.id} value={x.id}>
                v{x.number} · {x.status}
              </option>
            ))}
          </select>
          <button
            className={`btn secondary ${compare ? "toggled" : ""}`}
            disabled={versions.length < 2}
            onClick={() => {
              setCompare((c) => !c);
              if (!otherId) setOtherId(versions.find((x) => x.id !== v.id)?.id ?? "");
            }}
          >
            <GitCompare size={16} />
            Compare versions
          </button>
          {compare && (
            <select
              aria-label="Compare with version"
              value={other?.id ?? ""}
              onChange={(e) => setOtherId(e.target.value)}
            >
              {versions
                .filter((x) => x.id !== v.id)
                .map((x) => (
                  <option key={x.id} value={x.id}>
                    Compare v{x.number} · {x.status}
                  </option>
                ))}
            </select>
          )}
        </div>
        <div>
          {creator && (
            <>
              <button
                className="btn secondary"
                onClick={() => {
                  setNewText(v.text);
                  setSummary("");
                  setPromptId("");
                  setNewOpen(true);
                }}
              >
                <Plus size={15} />
                New version
              </button>
              {v.status === "Draft" && v.id === d.currentVersionId && (
                <button
                  className="btn"
                  disabled={submit.isPending}
                  onClick={() => submit.mutate({ versionId: v.id })}
                >
                  <Send size={14} />
                  {submit.isPending ? "Submitting…" : "Submit v" + v.number}
                </button>
              )}
              <button className="text-link" onClick={() => go("/production/" + d.id)}>
                Production packet <ArrowUpRight size={15} />
              </button>
            </>
          )}
          {w.member.id === d.approverId &&
            v.status === "In review" &&
            v.id === d.currentVersionId && (
              <>
                <button className="btn secondary" onClick={() => openDecision("Request changes")}>
                  Request changes
                </button>
                <button className="btn approve-btn" onClick={() => openDecision("Approve")}>
                  <Check size={16} />
                  Approve this version
                </button>
              </>
            )}
          {creator && d.approvedVersionId === v.id && (
            <button className="btn danger-secondary" onClick={() => openDecision("Revoke")}>
              Revoke release
            </button>
          )}
        </div>
      </div>
      <ErrorBox error={submit.error || newVersion.error} />
      {v.claims.length > 0 && (
        <div className="warning">
          <b>Disputed factual wording in this copy</b>
          <p>
            {v.claims.map((c) => c.field).join(", ")}. Product-owner confirmation or removal is
            required before approval. Image review and unrelated work can continue.
          </p>
        </div>
      )}
      <div className={`review-layout ${compare ? "comparing" : ""}`}>
        <section className="viewer-panel">
          <div className="viewer-meta">
            <span>
              VERSION {v.number} <b>·</b> {v.summary}
            </span>
            <div className="zoom-controls">
              <button aria-label="Zoom out" onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}>
                <ZoomOut size={15} />
              </button>
              <span>{Math.round(zoom * 100)}%</span>
              <button aria-label="Zoom in" onClick={() => setZoom((z) => Math.min(3, z + 0.25))}>
                <ZoomIn size={15} />
              </button>
              <button aria-label="Fit image" onClick={() => setZoom(1)}>
                <Maximize2 size={15} />
              </button>
            </div>
          </div>
          <div className="asset-viewer">
            <div
              className="image-zoom"
              style={{ transform: `scale(${zoom})`, transformOrigin: "center center" }}
            >
              {d.targetType === "copy" ? (
                <pre className="copy-viewer">{v.text || "Copy not supplied."}</pre>
              ) : slide ? (
                <div className="pin-image">
                  <PrivateImage
                    id={slide.fileId}
                    alt={d.title + " v" + v.number + " slide " + (slideIndex + 1)}
                    onClick={
                      closed
                        ? undefined
                        : (e) => {
                            const rect = e.currentTarget.getBoundingClientRect();
                            setPin({
                              x:
                                e.detail === 0
                                  ? 0.5
                                  : Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
                              y:
                                e.detail === 0
                                  ? 0.5
                                  : Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)),
                            });
                          }
                    }
                  />
                  {roots
                    .filter((c) => c.slideId === slide.id && c.x !== null && c.y !== null)
                    .map((c) => (
                      <button
                        key={c.id}
                        className={`comment-pin ${c.resolved ? "resolved" : ""}`}
                        style={{ left: `${c.x! * 100}%`, top: `${c.y! * 100}%` }}
                        title={c.body}
                        onClick={() =>
                          document
                            .getElementById("thread-" + c.id)
                            ?.scrollIntoView({ behavior: "smooth", block: "center" })
                        }
                      >
                        {roots.indexOf(c) + 1}
                      </button>
                    ))}
                  {pin && (
                    <span
                      className="comment-pin new-pin"
                      style={{ left: `${pin.x * 100}%`, top: `${pin.y * 100}%` }}
                    >
                      +
                    </span>
                  )}
                </div>
              ) : (
                <Empty
                  title="File not uploaded"
                  detail="This version needs its original image before submission."
                />
              )}
            </div>
          </div>
          <div className="viewer-footer">
            <div>
              {v.slides.length > 1 && (
                <>
                  <button
                    className="icon-btn"
                    disabled={slideIndex === 0}
                    aria-label="Previous slide"
                    onClick={() => {
                      setSlideIndex((s) => s - 1);
                      setPin(null);
                    }}
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <span>
                    Slide {slideIndex + 1} / {v.slides.length}
                  </span>
                  <button
                    className="icon-btn"
                    disabled={slideIndex >= v.slides.length - 1}
                    aria-label="Next slide"
                    onClick={() => {
                      setSlideIndex((s) => s + 1);
                      setPin(null);
                    }}
                  >
                    <ChevronRight size={18} />
                  </button>
                </>
              )}
              {d.targetType === "image" && (
                <small>
                  {closed
                    ? "Closed version: pins stay with this version and slide."
                    : "Click the image to place a feedback pin."}
                </small>
              )}
            </div>
            <div>
              {slide && <DownloadButton id={slide.fileId} name={slide.file?.name ?? "original"} />}{" "}
              {v.text && (
                <button
                  className="btn secondary"
                  onClick={() =>
                    saveBlob(
                      new Blob([v.text], { type: "text/plain" }),
                      "copy-v" + v.number + ".txt",
                    )
                  }
                >
                  Export text
                </button>
              )}
              {creator && v.status === "Draft" && (
                <UploadButton
                  scopeType="version"
                  scopeId={v.id}
                  label="Upload image / next slide"
                />
              )}
            </div>
          </div>
          {v.slides.length > 1 && (
            <div className="slide-strip">
              {v.slides.map((s, index) => (
                <button
                  key={s.id}
                  className={slideIndex === index ? "active" : ""}
                  onClick={() => {
                    setSlideIndex(index);
                    setPin(null);
                  }}
                >
                  <PrivateImage id={s.fileId} alt={"Slide " + (index + 1)} />
                  <span>{index + 1}</span>
                </button>
              ))}
            </div>
          )}
          {compare && other && (
            <div className="compare-version">
              <header>
                <h3>Version {other.number}</h3>
                <Status value={other.status} />
              </header>
              {d.targetType === "copy" ? (
                <pre className="copy-viewer">{other.text}</pre>
              ) : other.slides[Math.min(slideIndex, other.slides.length - 1)] ? (
                <div className="compare-image">
                  <PrivateImage
                    id={other.slides[Math.min(slideIndex, other.slides.length - 1)].fileId}
                    alt={"Previous version " + other.number}
                  />
                  {other.comments
                    .filter(
                      (c) =>
                        !c.parentId &&
                        c.slideId ===
                          other.slides[Math.min(slideIndex, other.slides.length - 1)].id &&
                        c.x !== null,
                    )
                    .map((c, index) => (
                      <span
                        className="comment-pin"
                        key={c.id}
                        style={{ left: `${c.x! * 100}%`, top: `${c.y! * 100}%` }}
                      >
                        {index + 1}
                      </span>
                    ))}
                </div>
              ) : (
                <Empty title="Earlier version has no file" />
              )}
              <h4>Version {other.number} discussion</h4>
              {other.comments
                .filter((c) => !c.parentId)
                .map((c) => (
                  <div className="old-comment" key={c.id}>
                    <b>{author(c.authorId)}</b>
                    <p>{c.body}</p>
                    <small>
                      v{other.number} · {c.slideId ? "Slide-specific" : "General"} ·{" "}
                      {c.resolved ? "Resolved" : "Open"}
                    </small>
                    {other.comments
                      .filter((r) => r.parentId === c.id)
                      .map((r) => (
                        <p key={r.id}>
                          {author(r.authorId)}: {r.body}
                        </p>
                      ))}
                  </div>
                ))}
            </div>
          )}
          <div className="lineage-bar">
            <span>
              <b>Production lineage</b>
              <small>
                {v.promptId
                  ? "Exact recorded prompt version is attached."
                  : "Prompt not recorded. No lineage has been invented."}
              </small>
            </span>
            {creator && v.promptId && (
              <button className="text-link" onClick={() => go("/production/" + d.id)}>
                Retrieve prompt <ArrowUpRight size={15} />
              </button>
            )}
          </div>
          {v.decisions.length > 0 && (
            <div className="decision-history">
              <h3>Version decisions</h3>
              {v.decisions.map((x) => (
                <div key={x.id}>
                  <b>{x.action}</b>
                  <span>
                    {author(x.actorId)} · {new Date(x.createdAt).toLocaleString()}
                  </span>
                  <p>
                    {x.reason || "Exact-version approval"} · {x.scope}
                  </p>
                  <small>
                    {x.sample ? "Demonstration decision · Not a real client approval" : ""}
                  </small>
                </div>
              ))}
            </div>
          )}
        </section>
        <aside className="comments-panel">
          <header>
            <h3>
              Feedback <span>{roots.length}</span>
            </h3>
            <span>v{v.number}</span>
          </header>
          {roots.length ? (
            roots.map((c, index) => (
              <article
                className={`comment-thread ${c.resolved ? "is-resolved" : ""}`}
                id={"thread-" + c.id}
                key={c.id}
              >
                <div className="comment-author">
                  <span className="thread-number">{index + 1}</span>
                  <b>{author(c.authorId)}</b>
                  <small>{c.visibility === "creator" ? "Internal" : "Client-facing"}</small>
                </div>
                <p>{c.body}</p>
                <div className="comment-detail">
                  {new Date(c.createdAt).toLocaleDateString()} · v{v.number}
                  {c.slideId
                    ? " · Slide " + (v.slides.findIndex((s) => s.id === c.slideId) + 1)
                    : " · General"}
                  {c.sample ? " · Demo data" : ""}
                </div>
                <div className="thread-actions">
                  {!closed && (
                    <button
                      onClick={() => {
                        setReply(c.id);
                        setReplyBody("");
                      }}
                    >
                      Reply
                    </button>
                  )}
                  {(creator || c.authorId === w.member.id) && (
                    <button
                      disabled={resolve.isPending}
                      onClick={() => resolve.mutate({ id: c.id, resolved: !c.resolved })}
                    >
                      {c.resolved ? "Reopen thread" : "Resolve thread"}
                    </button>
                  )}
                  {!!c.resolved && (
                    <span>
                      <Check size={12} />
                      Resolved
                    </span>
                  )}
                </div>
                {v.comments
                  .filter((r) => r.parentId === c.id)
                  .map((r) => (
                    <div className="reply" key={r.id}>
                      <b>{author(r.authorId)}</b>
                      <p>{r.body}</p>
                      <small>
                        {new Date(r.createdAt).toLocaleString()} · v{v.number}
                      </small>
                    </div>
                  ))}
                {reply === c.id && (
                  <form
                    className="reply-form"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      try {
                        await comment.mutateAsync({
                          versionId: v.id,
                          slideId: c.slideId,
                          parentId: c.id,
                          body: replyBody,
                          x: null,
                          y: null,
                          visibility: c.visibility as "client" | "creator",
                        });
                        setReply(null);
                      } catch {}
                    }}
                  >
                    <textarea
                      aria-label="Reply text"
                      value={replyBody}
                      onChange={(e) => setReplyBody(e.target.value)}
                    />
                    <button className="btn" disabled={!replyBody.trim() || comment.isPending}>
                      Reply
                    </button>
                  </form>
                )}
              </article>
            ))
          ) : (
            <div className="quiet-empty">
              <MessageSquare size={25} strokeWidth={1} />
              <p>No feedback on this version yet.</p>
              <small>A comment is not an approval.</small>
            </div>
          )}
          {closed ? (
            <div className="closed-note">
              This version is closed or historical. Start new feedback on the active version; old
              pins are never moved onto new files.
            </div>
          ) : (
            <form
              className="comment-composer"
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  await comment.mutateAsync({
                    versionId: v.id,
                    slideId: pin ? (slide?.id ?? null) : null,
                    parentId: null,
                    body,
                    x: pin?.x ?? null,
                    y: pin?.y ?? null,
                    visibility,
                  });
                  setBody("");
                  setPin(null);
                } catch {}
              }}
            >
              {pin && (
                <div className="pin-location">
                  Pin on slide {slideIndex + 1} · {(pin.x * 100).toFixed(0)}%,{" "}
                  {(pin.y * 100).toFixed(0)}%{" "}
                  <button type="button" onClick={() => setPin(null)}>
                    Remove
                  </button>
                </div>
              )}
              <textarea
                aria-label="Add feedback"
                placeholder={pin ? "Comment on this location…" : "Add general feedback…"}
                value={body}
                onChange={(e) => setBody(e.target.value)}
              />
              <footer>
                {creator ? (
                  <select
                    aria-label="Comment visibility"
                    value={visibility}
                    onChange={(e) => setVisibility(e.target.value as "client" | "creator")}
                  >
                    <option value="client">Client-facing</option>
                    <option value="creator">Creator-only</option>
                  </select>
                ) : (
                  <small>Client-facing feedback</small>
                )}
                <button className="btn" disabled={!body.trim() || comment.isPending}>
                  {comment.isPending ? "Saving…" : "Post"}
                  <Send size={13} />
                </button>
              </footer>
            </form>
          )}
          <ErrorBox error={comment.error || resolve.error} />
          <div className="feedback-note">
            Resolved threads remain in history.
            <br />
            Resolution does not imply approval.
          </div>
        </aside>
      </div>
      {newOpen && (
        <Modal title="Create a new immutable version" wide onClose={() => setNewOpen(false)}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                const r = await newVersion.mutateAsync({
                  id: d.id,
                  expectedCurrentVersionId: d.currentVersionId!,
                  summary,
                  text: d.targetType === "copy" ? newText : "",
                  promptId: promptId || null,
                });
                setVersionId(r.id);
                setNewOpen(false);
              } catch {}
            }}
          >
            <p className="muted">
              The current approved release and earlier discussion are retained. New versions always
              start as unapproved drafts.
            </p>
            <label>
              What changed?
              <textarea
                aria-label="Revision summary"
                required
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                placeholder="A short revision summary"
              />
            </label>
            {d.targetType === "copy" && (
              <label>
                Revised copy
                <textarea
                  aria-label="Revised copy"
                  className="large-textarea"
                  required
                  value={newText}
                  onChange={(e) => setNewText(e.target.value)}
                />
              </label>
            )}
            <label>
              Exact prompt used (only when recorded)
              <select value={promptId} onChange={(e) => setPromptId(e.target.value)}>
                <option value="">Prompt not recorded / not yet used</option>
                {prompts.data
                  ?.filter((p) => p.deliverableId === d.id)
                  .map((p) => (
                    <option value={p.id} key={p.id}>
                      {p.purpose} v{p.number}
                    </option>
                  ))}
              </select>
            </label>
            {d.targetType === "image" && (
              <p className="small muted">
                Create the draft, then upload its actual image(s) in order. Previous files are not
                silently copied into this version.
              </p>
            )}
            <ErrorBox error={newVersion.error} />
            <div className="modal-footer">
              <button className="btn" disabled={newVersion.isPending}>
                {newVersion.isPending ? "Creating…" : "Create draft version"}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {decision && (
        <Modal
          title={
            decision.action === "Approve"
              ? "Approve this exact version"
              : decision.action === "Revoke"
                ? "Revoke this approved release"
                : "Request a revision"
          }
          onClose={() => setDecision(null)}
        >
          <div className="decision-scope">
            <b>{d.title}</b>
            <span>
              Version {v.number} · {d.placement} · {d.format}
            </span>
            <small>
              Target: {d.targetType} · {decision.versionId}
            </small>
          </div>
          <p className="muted">
            {decision.action === "Approve"
              ? "Approval applies only to the identified version and placement. Image approval does not approve captions, a package or future uses."
              : decision.action === "Revoke"
                ? "The release is removed from Approved Assets. Files, previous decisions and discussion remain in history."
                : "A short reason is required. This version and its feedback remain available when a revision is uploaded."}
          </p>
          <label>
            {decision.action === "Approve" ? "Optional decision note" : "Reason"}
            <textarea
              aria-label="Reason and confirmation scope"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <ErrorBox error={decide.error} />
          <div className="modal-footer">
            <span className="small muted">Demonstration decision</span>
            <button
              className={`btn ${decision.action === "Approve" ? "approve-btn" : ""}`}
              disabled={decide.isPending || (decision.action !== "Approve" && !reason.trim())}
              onClick={async () => {
                try {
                  await decide.mutateAsync({ ...decision, reason });
                  setDecision(null);
                } catch {}
              }}
            >
              {decide.isPending
                ? "Recording…"
                : decision.action === "Approve"
                  ? "Approve version " + v.number
                  : decision.action}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
