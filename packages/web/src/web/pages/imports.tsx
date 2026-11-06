import { useState } from "react";
import Papa from "papaparse";
import { Upload, Download, ArrowRight, FileText } from "lucide-react";
import {
  Workspace,
  Loading,
  ErrorBox,
  Empty,
  Modal,
  UploadButton,
  DownloadButton,
} from "../components/workspace-ui";
import { useSources, useAction } from "../queries/workspace";
import { client } from "../lib/api";
import { downloadBackup, saveBlob } from "../lib/files";
export default function ImportPage({ w }: { w: Workspace }) {
  const sources = useSources();
  const m = useAction(client.transfers.import);
  const [tab, setTab] = useState("Product CSV"),
    [rows, setRows] = useState<Record<string, string>[]>([]),
    [headers, setHeaders] = useState<string[]>([]),
    [mapping, setMapping] = useState<Record<string, string>>({}),
    [filename, setFilename] = useState(""),
    [parseError, setParseError] = useState(""),
    [opened, setOpened] = useState<string | null>(null),
    [scopeType, setScopeType] = useState<"product" | "board" | "version">("product"),
    [scopeId, setScopeId] = useState(""),
    [exportBusy, setExportBusy] = useState(false),
    [exportError, setExportError] = useState("");
  const mapped = rows.map((r) => ({
    id: r[mapping.id] || "",
    name: r[mapping.name] || "",
    family: r[mapping.family] || "",
    format: r[mapping.format] || "",
    brief: r[mapping.brief] || "",
  }));
  const source = sources.data?.find((s) => s.id === opened);
  return (
    <div>
      <div className="page-heading compact">
        <div>
          <div className="eyebrow">CREATOR-ONLY / WORKING COPY</div>
          <h1>Bring the context with you.</h1>
          <p>
            Import product records, map references and retrieve a complete backup.
            <br />
            Nothing synchronizes automatically with a Windows folder or workbook.
          </p>
        </div>
      </div>
      <div className="tabs">
        {["Product CSV", "Asset mapping", "Source documents", "Export & handover"].map((t) => (
          <button key={t} className={tab === t ? "active" : ""} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </div>
      {tab === "Product CSV" ? (
        <section className="import-panel">
          <h2>Stable IDs, not packaging numbers.</h2>
          <p className="muted">
            Export a workbook sheet to CSV first. Map columns, preview changes, then explicitly
            apply. Duplicate IDs within the file are skipped with a row error; existing IDs update
            without duplication.
          </p>
          <label className="dropzone">
            <Upload size={28} strokeWidth={1.3} />
            <b>Choose a product CSV</b>
            <span>UTF-8 · maximum 1,000 rows · local preview before applying</span>
            <input
              aria-label="Upload CSV"
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setFilename(file.name);
                setParseError("");
                m.reset();
                Papa.parse<Record<string, string>>(file, {
                  header: true,
                  skipEmptyLines: true,
                  complete: (r) => {
                    if (r.errors.length)
                      setParseError(
                        r.errors.map((e) => `Row ${e.row ?? "?"}: ${e.message}`).join("\n"),
                      );
                    const hs = r.meta.fields ?? [];
                    setHeaders(hs);
                    setRows(r.data.slice(0, 1000));
                    const map: Record<string, string> = {};
                    for (const f of ["id", "name", "family", "format", "brief"])
                      map[f] =
                        hs.find((h) => h.toLowerCase() === f) ||
                        hs.find((h) => h.toLowerCase().includes(f)) ||
                        "";
                    setMapping(map);
                  },
                });
              }}
            />
          </label>
          <ErrorBox error={parseError} />
          {headers.length > 0 && (
            <>
              <div className="field-mapping">
                {["id", "name", "family", "format", "brief"].map((f) => (
                  <label key={f}>
                    {f}
                    {["id", "name"].includes(f) ? " (required)" : ""}
                    <select
                      value={mapping[f] || ""}
                      onChange={(e) => {
                        setMapping((m) => ({ ...m, [f]: e.target.value }));
                        m.reset();
                      }}
                    >
                      <option value="">Not mapped</option>
                      {headers.map((h) => (
                        <option key={h}>{h}</option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
              <div className="matrix">
                <table>
                  <thead>
                    <tr>
                      {["id", "name", "family", "format", "brief"].map((f) => (
                        <th key={f}>{f}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {mapped.slice(0, 8).map((r, index) => (
                      <tr key={index}>
                        {Object.values(r).map((v, i) => (
                          <td key={i}>{v.slice(0, 100) || "—"}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="small muted">
                Showing {Math.min(8, rows.length)} of {rows.length} rows · {filename}
              </p>
              <div className="card-actions">
                <button
                  className="btn secondary"
                  disabled={m.isPending || !mapping.id || !mapping.name}
                  onClick={() => m.mutate({ filename, rows: mapped, apply: false })}
                >
                  {m.isPending ? "Checking…" : "Preview import counts"}
                </button>
                {m.data && !m.data.applied && (
                  <button
                    className="btn"
                    disabled={m.isPending}
                    onClick={() => m.mutate({ filename, rows: mapped, apply: true })}
                  >
                    Apply {m.data.added} new / {m.data.updated} updates <ArrowRight size={16} />
                  </button>
                )}
              </div>
              {m.data && (
                <div className={m.data.applied ? "success" : "warning"}>
                  <b>
                    {m.data.applied ? "Import applied" : "Preview only"}: {m.data.added} new,{" "}
                    {m.data.updated} updates, {m.data.errors.length} skipped
                  </b>
                  {m.data.errors.map((e) => (
                    <p key={e}>{e}</p>
                  ))}
                </div>
              )}
              <ErrorBox error={m.error} />
            </>
          )}
          <button
            className="text-link"
            onClick={() =>
              saveBlob(
                new Blob(
                  [
                    Papa.unparse(
                      w.products
                        .filter((p) => !p.sample)
                        .map((p) => ({
                          id: p.id,
                          name: p.name,
                          family: p.family,
                          format: p.format,
                          brief: "",
                        })),
                    ),
                  ],
                  { type: "text/csv" },
                ),
                "product-mapping-template.csv",
              )
            }
          >
            Download stable-ID mapping template <Download size={15} />
          </button>
        </section>
      ) : tab === "Asset mapping" ? (
        <section className="import-panel">
          <h2>Map an original to its record.</h2>
          <p className="muted">
            Product identity photos, moodboard references and execution versions serve different
            purposes. Upload PNG, JPEG or WebP images up to 25 MB; PDF/text originals are stored but
            image review requires an image.
          </p>
          <div className="form-grid">
            <label>
              Asset purpose
              <select
                value={scopeType}
                onChange={(e) => {
                  setScopeType(e.target.value as typeof scopeType);
                  setScopeId("");
                }}
              >
                <option value="product">Actual SKU product reference</option>
                <option value="board">New territory board version</option>
                <option value="version">Draft execution / carousel slide</option>
              </select>
            </label>
            <label>
              Map to stable record
              <select value={scopeId} onChange={(e) => setScopeId(e.target.value)}>
                <option value="">Choose destination…</option>
                {scopeType === "product"
                  ? w.products
                      .filter((p) => !p.sample)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} · {p.id}
                        </option>
                      ))
                  : scopeType === "board"
                    ? w.territories.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.title}
                        </option>
                      ))
                    : w.works
                        .filter((d) => d.current?.status === "Draft")
                        .map((d) => (
                          <option key={d.id} value={d.current!.id}>
                            {d.title} · v{d.current?.number}
                          </option>
                        ))}
              </select>
            </label>
          </div>
          {scopeId ? (
            <UploadButton scopeType={scopeType} scopeId={scopeId} label="Upload mapped original" />
          ) : (
            <Empty
              title="Choose a destination"
              detail="An upload will not be silently guessed into a product record."
            />
          )}
          <div className="warning">
            For a revised execution, create a new draft version first. Published files and earlier
            pins are never overwritten.
          </div>
        </section>
      ) : tab === "Source documents" ? (
        <section>
          {sources.isLoading ? (
            <Loading />
          ) : sources.error ? (
            <ErrorBox error={sources.error} />
          ) : (
            <div className="source-document-list">
              {sources.data
                ?.filter((s) => s.fileId || !s.productId)
                .map((s) => (
                  <article key={s.id}>
                    <FileText size={21} strokeWidth={1.4} />
                    <div>
                      <h3>{s.title}</h3>
                      <small>
                        {s.type} · {new Date(s.capturedAt).toLocaleDateString()} · Creator-only
                        source
                      </small>
                    </div>
                    <button className="btn secondary" onClick={() => setOpened(s.id)}>
                      Inspect text
                    </button>
                    {s.fileId && <DownloadButton id={s.fileId} name={s.title} />}
                  </article>
                ))}
            </div>
          )}
        </section>
      ) : (
        <section className="import-panel">
          <h2>A backup should keep the originals.</h2>
          <p className="muted">
            The ZIP includes records.json, file-manifest.json and every stored original. Stable IDs,
            associations, prompts, copies, sources, intake revisions, decisions and package
            component versions are retained. Authentication passwords and sessions are excluded.
          </p>
          <div className="card-actions">
            <button
              className="btn"
              disabled={exportBusy}
              onClick={async () => {
                setExportBusy(true);
                setExportError("");
                try {
                  await downloadBackup();
                } catch (e) {
                  setExportError(e instanceof Error ? e.message : "Export failed");
                } finally {
                  setExportBusy(false);
                }
              }}
            >
              <Download size={16} />
              {exportBusy ? "Building backup…" : "Download full backup ZIP"}
            </button>
            <button
              className="btn secondary"
              onClick={async () => {
                try {
                  const r = await client.transfers.export();
                  saveBlob(
                    new Blob([JSON.stringify(r, null, 2)], { type: "application/json" }),
                    "workspace-records.json",
                  );
                } catch (e) {
                  setExportError(e instanceof Error ? e.message : "Export failed");
                }
              }}
            >
              Records JSON only
            </button>
          </div>
          <ErrorBox error={exportError} />
          <div className="handover-notes">
            <h3>Storage & access</h3>
            <p>
              Turso SQLite relational records. Private Tigris object storage. Better Auth
              email/password and managed Google sign-in. Originals are streamed after current
              server-side membership checks; direct object URLs are not exposed.
            </p>
            <h3>Sample identities</h3>
            <p>
              Use the profile menu for Demo creator, Demo reviewer/product owner, or Demo
              contributor. These are separate authenticated accounts, not a cosmetic “view as”
              control.
            </p>
            <h3>Scope boundaries</h3>
            <p>
              No direct Shopify/ad publishing, image-generation API, video review, invitation email,
              automated folder sync, or self-service backup restoration. Review source/version
              relationships before reusing exported work.
            </p>
            <h3>Current content</h3>
            <p>
              Eight real product briefs + 94 fictional navigation samples. Four historical
              moodboards, two supplied board prompts, five Art Deco and three Talya imported draft
              executions. Product identity source photos are still missing.
            </p>
          </div>
        </section>
      )}
      {source && (
        <Modal title={source.title} wide onClose={() => setOpened(null)}>
          <p className="small muted">
            {source.type} · Imported source, not automatically approved truth
          </p>
          <pre className="source-text">{source.text}</pre>
        </Modal>
      )}
    </div>
  );
}
