import { useEffect, useState, useRef } from "react";
import { ImageOff, ArrowUpRight, Loader2, X, Upload, Download } from "lucide-react";
import { client } from "../lib/api";
import { token } from "../lib/auth";
import { readPrivate, uploadFile, downloadPrivate } from "../lib/files";
import { useQueryClient } from "@tanstack/react-query";
export type Workspace = Awaited<ReturnType<typeof client.workspace.overview>>;
export type Work = Workspace["works"][number];
export function Status({ value }: { value: string }) {
  return (
    <span className={`status ${value.toLowerCase().replaceAll(" ", "-")}`}>
      <i />
      {value}
    </span>
  );
}
export function Empty({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="empty">
      <ImageOff size={26} strokeWidth={1} />
      <h3>{title}</h3>
      <p>{detail}</p>
    </div>
  );
}
export function Loading() {
  return (
    <div className="loading">
      <Loader2 className="spin" size={20} /> Loading workspace…
    </div>
  );
}
export function ErrorBox({ error }: { error: unknown }) {
  return error ? (
    <div className="error" role="alert">
      {error instanceof Error ? error.message : String(error)}
    </div>
  ) : null;
}
export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <div className="modal-backdrop">
      <dialog
        ref={ref}
        className={`modal ${wide ? "wide" : ""}`}
        aria-label={title}
        onCancel={(e) => {
          e.preventDefault();
          onClose();
        }}
      >
        <header>
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={22} />
          </button>
        </header>
        {children}
      </dialog>
    </div>
  );
}
export function PrivateImage({
  id,
  alt,
  className = "",
  onClick,
}: {
  id: string;
  alt: string;
  className?: string;
  onClick?: React.MouseEventHandler<HTMLImageElement>;
}) {
  const [url, setUrl] = useState(""),
    [error, setError] = useState("");
  const session = token();
  useEffect(() => {
    let active = true;
    let object = "";
    setUrl("");
    setError("");
    readPrivate(id)
      .then((blob) => {
        if (active) {
          object = URL.createObjectURL(blob);
          setUrl(object);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
      if (object) URL.revokeObjectURL(object);
    };
  }, [id, session]);
  if (error) return <div className="image-error">Image unavailable: {error}</div>;
  if (!url)
    return (
      <div className="image-loading">
        <Loader2 size={18} className="spin" />
      </div>
    );
  return onClick ? (
    <button
      className="image-interaction"
      aria-label={`Place feedback pin on ${alt}`}
      onClick={(e) => {
        const image = e.currentTarget.querySelector("img")!;
        onClick({ ...e, currentTarget: image } as unknown as React.MouseEvent<HTMLImageElement>);
      }}
    >
      <img src={url} alt={alt} className={className} />
    </button>
  ) : (
    <img src={url} alt={alt} className={className} />
  );
}
export function UploadButton({
  scopeType,
  scopeId,
  label = "Upload reference",
  onDone,
}: {
  scopeType: "version" | "product" | "board" | "intake";
  scopeId: string;
  label?: string;
  onDone?: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const q = useQueryClient();
  return (
    <div>
      <label className={`btn secondary upload ${busy ? "disabled" : ""}`}>
        <Upload size={15} />
        {busy ? "Uploading…" : label}
        <input
          aria-label={label}
          type="file"
          accept="image/png,image/jpeg,image/webp,application/pdf,text/plain,text/markdown"
          disabled={busy}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setBusy(true);
            setError("");
            try {
              await uploadFile(file, scopeType, scopeId);
              await q.invalidateQueries();
              onDone?.();
            } catch (e) {
              setError(e instanceof Error ? e.message : "Upload failed");
            } finally {
              setBusy(false);
            }
          }}
        />
      </label>
      {error && <div className="error">{error}</div>}
    </div>
  );
}
export function DownloadButton({ id, name }: { id: string; name: string }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <>
      <button
        className="btn secondary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await downloadPrivate(id, name);
          } catch (e) {
            setError(e instanceof Error ? e.message : "Download failed");
          } finally {
            setBusy(false);
          }
        }}
      >
        <Download size={15} />
        {busy ? "Downloading…" : "Original"}
      </button>
      <ErrorBox error={error} />
    </>
  );
}
export function WorkRow({
  work,
  w,
  onOpen,
}: {
  work: Work;
  w: Workspace;
  onOpen: (id: string) => void;
}) {
  const names = work.productIds.map((id) => w.products.find((p) => p.id === id)?.name).join(" + ");
  return (
    <button className="work-row" onClick={() => onOpen(work.id)}>
      <span className={`format-mark ${work.targetType === "copy" ? "copy" : ""}`}>
        {work.targetType === "copy" ? "Aa" : work.format === "Carousel" ? "▤" : "▧"}
      </span>
      <span className="row-main">
        <strong>{work.title}</strong>
        <small>
          {names} <b>·</b> {work.placement} <b>·</b> {work.format}
        </small>
      </span>
      <span className="row-version">v{work.current?.number ?? "—"}</span>
      <Status value={work.current?.status ?? "Missing"} />
      <ArrowUpRight size={18} />
    </button>
  );
}
export function ProductTile({
  p,
  index,
  onOpen,
  note,
}: {
  p: Workspace["products"][number];
  index: number;
  onOpen: () => void;
  note?: string;
}) {
  return (
    <button className="product-tile" onClick={onOpen}>
      <div className={`product-art tone-${index % 6}`}>
        {p.referenceId || p.coverId ? (
          <>
            <PrivateImage id={p.referenceId || p.coverId!} alt={p.name} />
            {!p.referenceId && (
              <span className="art-overlay">Imported execution · Not approved</span>
            )}
          </>
        ) : (
          <>
            <span className="art-index">{String(index + 1).padStart(2, "0")}</span>
            <div>
              <span className="art-serif">
                {p.name.split(" ").slice(0, -1).join(" ") || "Go Natural"}
              </span>
              <span className="art-last">{p.name.split(" ").at(-1)}</span>
            </div>
            <small>
              <ImageOff size={12} /> Reference not uploaded
            </small>
          </>
        )}
      </div>
      <div className="product-caption">
        <span>{p.name}</span>
        <ArrowUpRight size={16} />
      </div>
      <p>
        <i className="family-dot" style={{ background: p.catalog?.familyColor || "#B0B0B0" }} />
        {p.sample ? "Fictional sample" : p.family}
      </p>
      <div className="format-badges">
        {p.formats.length ? (
          p.formats.map((f) => (
            <span key={f.id} title={f.reviewNote || f.provenance.join("; ")}>
              {f.type}
            </span>
          ))
        ) : (
          <span>{p.format}</span>
        )}
      </div>
      {!!p.catalog?.reviewNotes.length && (
        <small className="catalog-review-tag">Source review noted</small>
      )}
      {note && <p className="small muted">{note}</p>}
    </button>
  );
}
