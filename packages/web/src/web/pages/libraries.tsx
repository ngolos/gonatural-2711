import { useState, useEffect } from "react";
import {
  Plus,
  ArrowUpRight,
  ArrowRight,
  Search,
  Grid2X2,
  List,
  Download,
  Maximize2,
  Layers,
} from "lucide-react";
import {
  Workspace,
  Work,
  WorkRow,
  Status,
  Empty,
  Loading,
  ErrorBox,
  Modal,
  PrivateImage,
  ProductTile,
  UploadButton,
  DownloadButton,
} from "../components/workspace-ui";
import { useAction, useApproved, usePrompts, useReview } from "../queries/workspace";
import { client } from "../lib/api";
import { saveBlob } from "../lib/files";
import { useFlags, useTerritoryStatuses } from "../queries/intelligence";

export function Overview({ w, go }: { w: Workspace; go: (path: string) => void }) {
  const creator = w.member.role === "creator";
  const [creating, setCreating] = useState(false),
    [queue, setQueue] = useState("All active work"),
    [allFlags, setAllFlags] = useState(false);
  const flags = useFlags();
  const auditAll = useAction(client.intelligence.auditAll);
  const flagged = (flags.data?.items ?? [])
    .filter((f) => f.flagged)
    .sort((a, b) => Number(b.sourceConflict) - Number(a.sourceConflict) || b.hardConflicts - a.hardConflicts);
  const active = w.works.filter(
    (x) => x.current && !["Approved", "Superseded", "Revoked"].includes(x.current.status),
  );
  const pending = w.works.filter((x) => x.current?.status === "In review").length,
    changes = w.works.filter((x) => x.current?.status === "Changes requested").length,
    drafts = w.works.filter((x) => x.current?.status === "Draft").length;
  const focus = w.territories.find((t) => t.id === "territory-spoon");
  const board = focus?.boards.filter((b) => b.fileId).sort((a, b) => b.number - a.number)[0];
  const shown = active
    .filter((x) => queue === "All active work" || x.current?.status === queue)
    .slice(0, 5);
  return (
    <div className="overview">
      <div className="page-heading">
        <div>
          <div className="eyebrow">YOUR CREATIVE WORKSPACE</div>
          <h1>
            {creator ? "Keep the idea." : "See the idea."}
            <br />
            {creator ? "Move the work forward." : "Shape what comes next."}
          </h1>
          <p>
            {creator
              ? "A clear view of what needs you, and everything worth keeping."
              : "Submitted work, precise feedback and decisions made in context."}
          </p>
        </div>
        {creator && (
          <button className="btn" onClick={() => setCreating(true)}>
            <Plus size={16} />
            New production brief
          </button>
        )}
      </div>
      <div className="attention-strip">
        <button onClick={() => setQueue("In review")}>
          <span>{pending.toString().padStart(2, "0")}</span>
          <div>
            Awaiting a decision<small>Submitted versions</small>
          </div>
          <ArrowUpRight size={19} />
        </button>
        <button onClick={() => setQueue("Changes requested")}>
          <span>{changes.toString().padStart(2, "0")}</span>
          <div>
            Changes requested<small>Ready for a new version</small>
          </div>
          <ArrowUpRight size={19} />
        </button>
        <button onClick={() => (creator ? setQueue("Draft") : go("/approved"))}>
          <span>
            {(creator ? drafts : w.works.filter((x) => x.approvedVersionId).length)
              .toString()
              .padStart(2, "0")}
          </span>
          <div>
            {creator ? "In development" : "Approved releases"}
            <small>{creator ? "Unpublished drafts" : "Exact approved versions"}</small>
          </div>
          <ArrowUpRight size={19} />
        </button>
      </div>
      <section className="focus-panel">
        <div className="focus-copy">
          <div className="eyebrow">IN FOCUS / CARAMEL LATTE</div>
          <h2>
            A moment worth
            <br />
            lingering over.
          </h2>
          <p>
            Three creative worlds. One collected product story.
            <br />
            Explore the board before shaping the next execution.
          </p>
          <button
            className="text-link light-link"
            onClick={() => go("/products/product-6?tab=creative")}
          >
            Open the creative directions <ArrowUpRight size={16} />
          </button>
          <small>Imported moodboard · Proposal, not approval</small>
        </div>
        <button className="focus-board" onClick={() => go("/creative?territory=territory-spoon")}>
          {board?.fileId ? (
            <PrivateImage id={board.fileId} alt="Caramel Latte three-territory moodboard" />
          ) : (
            <Empty title="Moodboard not uploaded" />
          )}
        </button>
      </section>
      <div className="overview-columns">
        <section>
          <div className="section-title">
            <h2>Next on the table</h2>
            <select value={queue} onChange={(e) => setQueue(e.target.value)}>
              <option>All active work</option>
              <option>In review</option>
              <option>Changes requested</option>
              {creator && <option>Draft</option>}
            </select>
          </div>
          <div className="work-list">
            {shown.map((work) => (
              <WorkRow key={work.id} w={w} work={work} onOpen={(id) => go("/review/" + id)} />
            ))}
            {!shown.length && (
              <Empty
                title="Nothing waiting here"
                detail="Choose another status or create new work."
              />
            )}
          </div>
          <button className="text-link" onClick={() => go("/campaigns")}>
            See all campaign work <ArrowRight size={16} />
          </button>
        </section>
        <section className="activity-panel">
          <div className="section-title">
            <h2>The latest</h2>
            <span>WORKSPACE ACTIVITY</span>
          </div>
          {w.activity.slice(0, 4).map((e) => (
            <div className="activity" key={e.id}>
              <div className="activity-dot" />
              <div>
                <b>{e.type}</b>
                <p>{e.text}</p>
                <small>
                  {new Date(e.createdAt).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short",
                  })}{" "}
                  · Demonstration workspace
                </small>
              </div>
            </div>
          ))}
          {!w.activity.length && (
            <p className="muted">New activity appears here when accessible work changes.</p>
          )}
        </section>
      </div>
      <div className="section-title">
        <h2>The foundation for every idea</h2>
        <div className="top-actions">
          {creator && (
            <button
              className="text-link"
              disabled={auditAll.isPending || flags.data?.run.running}
              onClick={() => auditAll.mutate(undefined)}
            >
              {flags.data?.run.running
                ? `Auditing ${flags.data.run.done}/${flags.data.run.total}…`
                : `Audit all ${flags.data?.total ?? ""}`}
            </button>
          )}
          <button className="text-link" onClick={() => go("/products")}>
            Browse {w.products.filter((p) => !p.sample).length} products <ArrowUpRight size={16} />
          </button>
        </div>
      </div>
      <p className="muted small">
        Live audit flags: {flagged.length} of {flags.data?.total ?? "—"} fragrances flagged ·{" "}
        {flags.data?.audited ?? 0} audited against the live Shopify pages. Unresolved source
        conflicts stay flagged until a person confirms the current version.
      </p>
      <ErrorBox error={auditAll.error || flags.error} />
      <div className="product-grid overview-products">
        {(allFlags ? flagged : flagged.slice(0, 6)).map((f) => {
          const index = w.products.findIndex((p) => p.id === f.productId);
          const p = w.products[index];
          if (!p) return null;
          return (
            <ProductTile
              key={f.productId}
              p={p}
              index={index}
              onOpen={() => go("/products/" + p.id + (f.reportId ? "?report=" + f.reportId : ""))}
              note={
                [
                  f.sourceConflict && "Known source conflict · unresolved",
                  f.hardConflicts > 0 &&
                    `${f.hardConflicts} hard conflict${f.hardConflicts > 1 ? "s" : ""} with the live page`,
                ]
                  .filter(Boolean)
                  .join(" · ") +
                (f.auditedAt
                  ? ` · audited ${new Date(f.auditedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`
                  : " · not audited yet")
              }
            />
          );
        })}
      </div>
      {!flagged.length && !flags.isLoading && (
        <Empty
          title="No live flags"
          detail="Run the audit to compare each fragrance's live Shopify page with its records."
        />
      )}
      {flagged.length > 6 && (
        <button className="text-link" onClick={() => setAllFlags((v) => !v)}>
          {allFlags ? "Show fewer" : `Show all ${flagged.length} flagged`} <ArrowRight size={16} />
        </button>
      )}
      <div className="source-footer">
        Independent proposal · Historical feedback and sample decisions are labeled · No asset has
        been published to Shopify or an ad platform.
      </div>
      {creating && (
        <CreateBrief
          w={w}
          onClose={() => setCreating(false)}
          onCreated={(id) => go("/production/" + id)}
        />
      )}
    </div>
  );
}
const remembered = {
  search: "",
  family: "All families",
  format: "All formats",
  campaign: "All contexts",
  status: "All statuses",
  sort: "Name A–Z",
  view: "grid",
  page: 1,
  pageSize: 0,
  scroll: 0,
};
const catalogSearch = (value: string) => value.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();
export function Libraries({
  w,
  path,
  go,
}: {
  w: Workspace;
  path: string;
  go: (path: string) => void;
}) {
  if (path.startsWith("/products")) return <Products w={w} go={go} />;
  if (path.startsWith("/campaigns")) return <Campaigns w={w} path={path} go={go} />;
  return <Creative w={w} go={go} />;
}
function Products({ w, go }: { w: Workspace; go: (path: string) => void }) {
  const catalog = w.products.filter((p) => !p.sample);
  const familyOptions = [...new Set(catalog.map((p) => p.family))].sort();
  const typeOptions = [
    ...new Set(
      catalog.flatMap((p) => (p.formats.length ? p.formats.map((f) => f.type) : [p.format])),
    ),
  ].sort();
  const [filters, setFilters] = useState(() => {
    try {
      const saved = {
        ...remembered,
        ...(JSON.parse(
          sessionStorage.getItem("gn-catalog-filters-v2-" + w.member.id) || "{}",
        ) as Partial<typeof remembered>),
      };
      if (!familyOptions.includes(saved.family)) saved.family = "All families";
      if (!typeOptions.includes(saved.format)) saved.format = "All formats";
      return saved;
    } catch {
      return { ...remembered };
    }
  });
  function set(key: keyof typeof filters, value: any) {
    setFilters((f) => ({ ...f, [key]: value, page: key === "page" ? value : 1 }));
  }
  useEffect(() => {
    window.scrollTo(0, filters.scroll);
  }, [filters.scroll]);
  useEffect(() => {
    Object.assign(remembered, filters);
    sessionStorage.setItem("gn-catalog-filters-v2-" + w.member.id, JSON.stringify(filters));
  }, [filters, w.member.id]);
  let products = catalog.filter(
    (p) =>
      catalogSearch(p.name).includes(catalogSearch(filters.search)) &&
      (filters.family === "All families" || p.family === filters.family) &&
      (filters.format === "All formats" ||
        p.formats.some((f) => f.type === filters.format) ||
        (!p.formats.length && p.format === filters.format)) &&
      (filters.campaign === "All contexts" ||
        w.campaignProducts.some(
          (c) => c.productId === p.id && c.campaignId === filters.campaign,
        )) &&
      (filters.status === "All statuses" ||
        w.works.some((d) => d.productIds.includes(p.id) && d.current?.status === filters.status)),
  );
  products = products.sort((a, b) =>
    filters.sort === "Recently updated"
      ? b.updatedAt.localeCompare(a.updatedAt)
      : filters.sort === "Name Z–A"
        ? b.name.localeCompare(a.name)
        : filters.sort === "Scent family"
          ? a.family.localeCompare(b.family) || a.name.localeCompare(b.name)
          : filters.sort === "Product type"
            ? a.formats
                .map((f) => f.type)
                .sort()
                .join("|")
                .localeCompare(
                  b.formats
                    .map((f) => f.type)
                    .sort()
                    .join("|"),
                ) || a.name.localeCompare(b.name)
            : a.name.localeCompare(b.name),
  );
  const pageSize = filters.pageSize || Math.max(1, products.length);
  const pages = Math.max(1, Math.ceil(products.length / pageSize));
  const currentPage = Math.min(filters.page, pages);
  const visible = products.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  function open(id: string) {
    remembered.scroll = window.scrollY;
    sessionStorage.setItem(
      "gn-catalog-filters-v2-" + w.member.id,
      JSON.stringify({ ...filters, scroll: window.scrollY }),
    );
    go("/products/" + id);
  }
  return (
    <div>
      <div className="page-heading compact">
        <div>
          <div className="eyebrow">THE PERMANENT LIBRARY</div>
          <h1>The complete scent portfolio.</h1>
          <p>
            {catalog.length} named catalog entries. Open a fragrance to see its available product
            types. Bundles are excluded for now.
          </p>
        </div>
        {w.member.role === "creator" && (
          <button className="btn secondary" onClick={() => go("/imports")}>
            <Plus size={16} />
            Import products
          </button>
        )}
      </div>
      <div className="filterbar">
        <div className="search-field">
          <Search size={17} />
          <input
            aria-label="Search products"
            placeholder="Find a product…"
            value={filters.search}
            onChange={(e) => set("search", e.target.value)}
          />
        </div>
        <select
          aria-label="Family"
          value={filters.family}
          onChange={(e) => set("family", e.target.value)}
        >
          <option>All families</option>
          {familyOptions.map((f) => (
            <option key={f}>{f}</option>
          ))}
        </select>
        <select
          aria-label="Product type"
          value={filters.format}
          onChange={(e) => set("format", e.target.value)}
        >
          <option value="All formats">All product types</option>
          {typeOptions.map((f) => (
            <option key={f}>{f}</option>
          ))}
        </select>
        <select
          aria-label="Campaign"
          value={filters.campaign}
          onChange={(e) => set("campaign", e.target.value)}
        >
          <option>All contexts</option>
          {w.campaigns.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Work status"
          value={filters.status}
          onChange={(e) => set("status", e.target.value)}
        >
          <option>All statuses</option>
          {["Draft", "In review", "Changes requested", "Approved"].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <button
          className="text-link"
          onClick={() =>
            setFilters({
              ...remembered,
              search: "",
              family: "All families",
              format: "All formats",
              campaign: "All contexts",
              status: "All statuses",
              page: 1,
              scroll: 0,
            })
          }
        >
          Clear filters
        </button>
        <div className="view-toggle">
          <button
            className={filters.view === "grid" ? "selected" : ""}
            aria-label="Grid view"
            onClick={() => set("view", "grid")}
          >
            <Grid2X2 size={17} />
          </button>
          <button
            className={filters.view === "list" ? "selected" : ""}
            aria-label="List view"
            onClick={() => set("view", "list")}
          >
            <List size={17} />
          </button>
        </div>
      </div>
      <div className="results-line">
        <span>
          {products.length} products <b>·</b> One identity, multiple formats
        </span>
        <select
          aria-label="Sort products"
          value={filters.sort}
          onChange={(e) => set("sort", e.target.value)}
        >
          <option>Name A–Z</option>
          <option>Name Z–A</option>
          <option>Recently updated</option>
          <option>Scent family</option>
          <option>Product type</option>
        </select>
      </div>
      {visible.length ? (
        <div className={filters.view === "grid" ? "product-grid" : "product-list"}>
          {visible.map((p, index) =>
            filters.view === "grid" ? (
              <ProductTile key={p.id} p={p} index={index} onOpen={() => open(p.id)} />
            ) : (
              <button key={p.id} className="work-row" onClick={() => open(p.id)}>
                <span className="format-mark">{String(index + 1).padStart(2, "0")}</span>
                <span className="row-main">
                  <strong>{p.name}</strong>
                  <small>
                    {p.family} ·{" "}
                    {p.formats.length ? p.formats.map((f) => f.type).join(" · ") : p.format}
                  </small>
                </span>
                <span className="muted small">
                  {p.catalog?.reviewNotes.length ? "Source review noted" : "Collected product"}
                </span>
                <ArrowUpRight size={18} />
              </button>
            ),
          )}
        </div>
      ) : (
        <Empty title="No matching products" detail="Try a different name or clear the filters." />
      )}
      <div className="pagination">
        <label>
          Display
          <select
            aria-label="Products per page"
            value={filters.pageSize}
            onChange={(e) => set("pageSize", Number(e.target.value))}
          >
            <option value={0}>All products</option>
            <option value={12}>12 per page</option>
            <option value={24}>24 per page</option>
          </select>
        </label>
        <span>
          Page {currentPage} of {pages}
        </span>
        <button
          className="btn secondary"
          disabled={currentPage <= 1}
          onClick={() => set("page", currentPage - 1)}
        >
          Previous
        </button>
        <button
          className="btn secondary"
          disabled={currentPage >= pages}
          onClick={() => set("page", currentPage + 1)}
        >
          Next <ArrowRight size={15} />
        </button>
      </div>
    </div>
  );
}
function Campaigns({ w, path, go }: { w: Workspace; path: string; go: (path: string) => void }) {
  const [creating, setCreating] = useState(false);
  const id = path.split("/")[2];
  const c = w.campaigns.find((c) => c.id === id);
  if (c) {
    const works = w.works.filter((d) => d.campaignId === c.id),
      ps = w.campaignProducts
        .filter((l) => l.campaignId === c.id)
        .map((l) => w.products.find((p) => p.id === l.productId)!);
    return (
      <div>
        <button className="text-link back" onClick={() => go("/campaigns")}>
          ← Campaigns
        </button>
        <div className="page-heading compact">
          <div>
            <div className="eyebrow">SAMPLE CAMPAIGN / {c.dates}</div>
            <h1>{c.name}</h1>
            <p>{c.brief}</p>
          </div>
          {w.member.role === "creator" && (
            <button className="btn" onClick={() => setCreating(true)}>
              <Plus size={16} />
              Add deliverable
            </button>
          )}
        </div>
        <div className="section-title">
          <h2>Across the products</h2>
          <span>SHARED RECORDS, NOT COPIES</span>
        </div>
        <div className="matrix">
          <table>
            <thead>
              <tr>
                <th>Product</th>
                {works.map((d) => (
                  <th key={d.id}>{d.format}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ps.map((p) => (
                <tr key={p.id}>
                  <td>
                    <button onClick={() => go("/products/" + p.id)}>{p.name}</button>
                  </td>
                  {works.map((d) => (
                    <td key={d.id}>
                      {d.productIds.includes(p.id) ? (
                        <button onClick={() => go("/review/" + d.id)}>
                          <Status value={d.current?.status ?? "Missing"} />
                        </button>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="section-title">
          <h2>Work to review & develop</h2>
          <span>{works.length} DELIVERABLES</span>
        </div>
        <div className="work-list">
          {works.map((d) => (
            <WorkRow key={d.id} work={d} w={w} onOpen={(id) => go("/review/" + id)} />
          ))}
          {!works.length && (
            <Empty title="No deliverables yet" detail="Create a brief to begin this campaign." />
          )}
        </div>
        <PackagePanel w={w} campaignId={c.id} go={go} />
        {creating && (
          <CreateBrief
            w={w}
            campaignId={c.id}
            onClose={() => setCreating(false)}
            onCreated={(id) => go("/production/" + id)}
          />
        )}
      </div>
    );
  }
  return (
    <div>
      <div className="page-heading compact">
        <div>
          <div className="eyebrow">CONNECTED CAMPAIGN WORK</div>
          <h1>
            Different moments.
            <br />
            One working library.
          </h1>
          <p>Organize current assignments without losing the product story.</p>
        </div>
      </div>
      <div className="campaign-grid">
        {w.campaigns.map((c, index) => {
          const works = w.works.filter((d) => d.campaignId === c.id),
            pids = w.campaignProducts.filter((l) => l.campaignId === c.id);
          const t = w.territories.find(
            (t) => t.id === (index === 0 ? "territory-spoon" : "territory-original-escape"),
          );
          const b = t?.boards.find((b) => b.fileId);
          return (
            <button className="campaign-card" key={c.id} onClick={() => go("/campaigns/" + c.id)}>
              <div className="campaign-image">
                {b?.fileId ? (
                  <PrivateImage id={b.fileId} alt={c.name} />
                ) : (
                  <Layers size={48} strokeWidth={1} />
                )}
                <span>Sample campaign</span>
              </div>
              <div>
                <small>{c.dates}</small>
                <h2>
                  {c.name}
                  <ArrowUpRight size={20} />
                </h2>
                <p>{c.brief}</p>
                <footer>
                  {pids.length} products <b>·</b> {works.length} deliverables <b>·</b>{" "}
                  {works.filter((d) => d.current?.status === "In review").length} in review
                </footer>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
function Creative({ w, go }: { w: Workspace; go: (path: string) => void }) {
  const [tab, setTab] = useState("Directions"),
    [search, setSearch] = useState(""),
    [selected, setSelected] = useState<string[]>([]),
    [opened, setOpened] = useState<string | null>(
      new URLSearchParams(window.location.search).get("territory"),
    ),
    [compare, setCompare] = useState(false),
    [present, setPresent] = useState(false);
  const prompts = usePrompts(w.member.role === "creator");
  const statuses = useTerritoryStatuses();
  const selection = useAction(client.workspace.selectDirection);
  const [context, setContext] = useState<string>(""),
    [message, setMessage] = useState("");
  const territories = w.territories.filter((t) =>
    (t.title + " " + t.idea).toLowerCase().includes(search.toLowerCase()),
  );
  const open = w.territories.find((t) => t.id === opened);
  const board = open?.boards.filter((b) => b.fileId).sort((a, b) => b.number - a.number)[0];
  return (
    <div>
      <div className="page-heading compact">
        <div>
          <div className="eyebrow">THE RETAINED CREATIVE STORY</div>
          <h1>Keep the possibilities open.</h1>
          <p>Ideas, boards, prompts and the work they inspired—connected, not overwritten.</p>
        </div>
        {selected.length > 1 && (
          <button className="btn" onClick={() => setCompare(true)}>
            Compare {selected.length} directions
          </button>
        )}
      </div>
      <div className="tabs">
        {[
          "Directions",
          ...(w.member.role === "creator" ? ["Prompt library", "Executions"] : []),
        ].map((t) => (
          <button className={tab === t ? "active" : ""} key={t} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </div>
      <div className="search-field library-search">
        <Search size={17} />
        <input
          aria-label="Search library"
          placeholder={`Search ${tab.toLowerCase()}…`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      {tab === "Directions" ? (
        <div className="territory-grid">
          {territories.map((t) => {
            const b = t.boards.filter((b) => b.fileId).sort((a, b) => b.number - a.number)[0];
            return (
              <article className="territory-card" key={t.id}>
                <button className="territory-image" onClick={() => setOpened(t.id)}>
                  {b?.fileId ? (
                    <PrivateImage id={b.fileId} alt={t.title} />
                  ) : (
                    <div className={`missing-board ${t.tone}`}>
                      <span>{t.title}</span>
                      <small>Board not uploaded</small>
                    </div>
                  )}
                </button>
                <div className="territory-content">
                  <div className="territory-meta">
                    {t.productIds
                      .map((id) => w.products.find((p) => p.id === id)?.name)
                      .join(" + ")}{" "}
                    <span>{b ? `Board v${b.number}` : "No file"}</span>
                  </div>
                  <button className="territory-title" onClick={() => setOpened(t.id)}>
                    {t.title}
                    <ArrowUpRight size={18} />
                  </button>
                  <p>{t.idea}</p>
                  <footer>
                    <span>
                      {(() => {
                        const st = statuses.data?.find((x) => x.territoryId === t.id)?.status;
                        return st
                          ? `Generated · ${st.charAt(0).toUpperCase() + st.slice(1)}`
                          : "Proposal · No scoped selection";
                      })()}
                    </span>
                    <label>
                      <input
                        aria-label={`Compare ${t.title}`}
                        type="checkbox"
                        checked={selected.includes(t.id)}
                        onChange={(e) =>
                          setSelected((s) =>
                            e.target.checked
                              ? s.length < 4
                                ? [...s, t.id]
                                : s
                              : s.filter((id) => id !== t.id),
                          )
                        }
                      />{" "}
                      Compare
                    </label>
                  </footer>
                </div>
              </article>
            );
          })}
        </div>
      ) : tab === "Prompt library" ? (
        <div className="prompt-list">
          {prompts.isLoading ? (
            <Loading />
          ) : (
            prompts.data
              ?.filter((p) => (p.text + p.purpose).toLowerCase().includes(search.toLowerCase()))
              .map((p) => (
                <article className="prompt-card" key={p.id}>
                  <div>
                    <span className="eyebrow">
                      {p.purpose} / v{p.number}
                    </span>
                    <h3>
                      {w.works.find((d) => d.id === p.deliverableId)?.title ?? "Saved prompt"}
                    </h3>
                    <p>{p.text.slice(0, 230)}…</p>
                    <small>
                      {p.assessment
                        ? "Contextual creator success assessment recorded"
                        : "No success assessment recorded"}{" "}
                      · Creator-only
                    </small>
                  </div>
                  <div className="stack-actions">
                    <button
                      className="btn secondary"
                      onClick={() => go("/production/" + p.deliverableId)}
                    >
                      Open & adapt <ArrowUpRight size={15} />
                    </button>
                    <button
                      className="text-link"
                      onClick={() =>
                        saveBlob(
                          new Blob([p.text], { type: "text/plain" }),
                          "prompt-" + p.id + ".txt",
                        )
                      }
                    >
                      Export exact text <Download size={14} />
                    </button>
                  </div>
                </article>
              ))
          )}
          {!prompts.data?.length && (
            <Empty
              title="No saved prompts"
              detail="Assemble a packet from a production brief, then save its version."
            />
          )}
        </div>
      ) : (
        <div className="execution-grid">
          {w.works
            .filter(
              (d) =>
                d.id.startsWith("execution-") &&
                d.title.toLowerCase().includes(search.toLowerCase()),
            )
            .map((d) => (
              <ExecutionCard key={d.id} work={d} go={go} />
            ))}
        </div>
      )}
      {open && (
        <Modal
          title={open.title}
          wide
          onClose={() => {
            setOpened(null);
            setMessage("");
            setPresent(false);
          }}
        >
          <div className={present ? "presentation" : "board-detail"}>
            {board?.fileId ? (
              <PrivateImage id={board.fileId} alt={open.title} className="board-full" />
            ) : (
              <Empty
                title="Actual board not uploaded"
                detail="The idea is retained; upload the original visual reference."
              />
            )}
            {!present && (
              <>
                <div className="board-detail-footer">
                  <div>
                    <h3>{open.idea}</h3>
                    <p className="muted">
                      {open.notes ||
                        "Creative interpretation. Direction selection is separate from asset approval."}
                    </p>
                    <p className="small">{board?.notes}</p>
                  </div>
                  <button className="btn secondary" onClick={() => setPresent(true)}>
                    <Maximize2 size={16} />
                    Present
                  </button>
                </div>
                <div className="board-actions">
                  {w.member.role === "creator" ? (
                    <>
                      <UploadButton
                        scopeType="board"
                        scopeId={open.id}
                        label="Upload new board version"
                      />
                      <button
                        className="btn"
                        onClick={() => {
                          const p = open.productIds[0];
                          go("/products/" + p);
                        }}
                      >
                        Use in a production brief <ArrowUpRight size={15} />
                      </button>
                    </>
                  ) : w.member.role === "client" ? (
                    <>
                      <select value={context} onChange={(e) => setContext(e.target.value)}>
                        <option value="">Select decision context…</option>
                        <option value="evergreen">Evergreen / product assignment</option>
                        {w.campaigns.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                      <button
                        className="btn"
                        disabled={!board?.fileId || !context || selection.isPending}
                        onClick={async () => {
                          try {
                            await selection.mutateAsync({
                              territoryId: open.id,
                              boardId: board!.id,
                              productId: open.productIds[0],
                              campaignId: context === "evergreen" ? null : context,
                            });
                            setMessage(
                              "Board version selected for this context only. Subsequent assets are not approved.",
                            );
                          } catch {}
                        }}
                      >
                        Select this board version
                      </button>
                    </>
                  ) : null}
                  {board?.fileId && <DownloadButton id={board.fileId} name={open.title + ".png"} />}
                </div>
                <ErrorBox error={selection.error} />
                {message && <div className="success">{message}</div>}
              </>
            )}
            {present && (
              <button className="btn secondary" onClick={() => setPresent(false)}>
                Exit presentation
              </button>
            )}
          </div>
        </Modal>
      )}
      {compare && (
        <Modal title="Compare creative directions" wide onClose={() => setCompare(false)}>
          <div className="comparison-boards">
            {selected.map((id) => {
              const t = w.territories.find((t) => t.id === id)!;
              const b = t.boards.find((b) => b.fileId);
              return (
                <div key={id}>
                  <h3>{t.title}</h3>
                  {b?.fileId ? (
                    <PrivateImage id={b.fileId} alt={t.title} />
                  ) : (
                    <Empty title="Board not uploaded" />
                  )}
                  <p>{t.idea}</p>
                </div>
              );
            })}
          </div>
          <p className="muted small">
            Compare conceptual strength and photographic execution separately. This view does not
            create an approval.
          </p>
        </Modal>
      )}
    </div>
  );
}
function ExecutionCard({ work, go }: { work: Work; go: (p: string) => void }) {
  const r = useReview(work.id);
  const v = r.data?.versions[0];
  return (
    <button className="execution-card" onClick={() => go("/review/" + work.id)}>
      {v?.slides[0] ? <PrivateImage id={v.slides[0].fileId} alt={work.title} /> : <Loading />}
      <div>
        <Status value={v?.status ?? "Loading"} />
        <h3>{work.title}</h3>
        <small>{v?.promptId ? "Exact prompt recorded" : "Prompt not recorded"}</small>
      </div>
    </button>
  );
}
export function PackagePanel({
  w,
  campaignId,
  go,
}: {
  w: Workspace;
  campaignId: string;
  go: (path: string) => void;
}) {
  const ps = w.packages.filter((p) => p.campaignId === campaignId);
  return (
    <section>
      <div className="section-title">
        <h2>Release packages</h2>
        <span>EXACT COMPONENT VERSIONS</span>
      </div>
      {ps.map((p) => (
        <div className="package-panel" key={p.id}>
          <div>
            <h3>
              {p.title} <small>revision {p.number}</small>
            </h3>
            <Status value={p.ready ? "Approved" : "Incomplete"} />
          </div>
          <div>
            {p.components.map((c) => (
              <button key={c.id} onClick={() => go("/review/" + c.deliverableId)}>
                {c.title}
                <span>{c.approved ? "Approved" : c.status || "Missing approval"}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
      {!ps.length && (
        <Empty
          title="No release package recorded"
          detail="Components must identify exact image and copy versions in the same context."
        />
      )}
    </section>
  );
}
export function Approved({ w, go }: { w: Workspace; go: (path: string) => void }) {
  const q = useApproved(),
    [search, setSearch] = useState(""),
    [product, setProduct] = useState(""),
    [campaign, setCampaign] = useState("");
  const items = q.data?.filter(
    (a) =>
      a.deliverable.title.toLowerCase().includes(search.toLowerCase()) &&
      (!product || a.productIds.includes(product)) &&
      (!campaign || a.deliverable.campaignId === campaign),
  );
  return (
    <div>
      <div className="page-heading compact">
        <div>
          <div className="eyebrow">READY TO RETRIEVE</div>
          <h1>Approved, precisely.</h1>
          <p>
            The current approved release—not simply the newest upload.
            <br />
            Original files, decision metadata and retained history.
          </p>
        </div>
      </div>
      <div className="filterbar">
        <div className="search-field">
          <Search size={17} />
          <input
            aria-label="Search library"
            placeholder="Find an approved deliverable…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select value={product} onChange={(e) => setProduct(e.target.value)}>
          <option value="">All products</option>
          {w.products
            .filter((p) => !p.sample)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
        </select>
        <select value={campaign} onChange={(e) => setCampaign(e.target.value)}>
          <option value="">All contexts</option>
          {w.campaigns.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      {q.isLoading ? (
        <Loading />
      ) : q.error ? (
        <ErrorBox error={q.error} />
      ) : items?.length ? (
        <div className="approved-grid">
          {items.map((a) => (
            <article className="approved-card" key={a.version.id}>
              <button
                className="approved-preview"
                onClick={() => go("/review/" + a.deliverable.id)}
              >
                {a.slides[0] ? (
                  <PrivateImage id={a.slides[0].fileId} alt={a.deliverable.title} />
                ) : (
                  <div className="approved-copy">{a.version.text}</div>
                )}
              </button>
              <div>
                <Status value="Approved" />
                <h3>{a.deliverable.title}</h3>
                <p>
                  v{a.version.number} ·{" "}
                  {w.people.find((p) => p.id === a.decision?.actorId)?.name ?? "Recorded approver"}
                  <br />
                  {a.decision?.createdAt
                    ? new Date(a.decision.createdAt).toLocaleString()
                    : "Decision date unavailable"}
                </p>
                <small>
                  {a.deliverable.placement} · {a.deliverable.format} ·{" "}
                  {a.slides[0]?.file?.width ?? "—"} × {a.slides[0]?.file?.height ?? "—"}
                </small>
                <div className="card-actions">
                  {a.slides.map((sl) => (
                    <DownloadButton key={sl.id} id={sl.fileId} name={sl.file?.name ?? "original"} />
                  ))}
                  {a.version.text && (
                    <button
                      className="btn secondary"
                      onClick={() =>
                        saveBlob(
                          new Blob([a.version.text], { type: "text/plain" }),
                          "approved-copy-v" + a.version.number + ".txt",
                        )
                      }
                    >
                      <Download size={15} />
                      Text original
                    </button>
                  )}
                  <button className="text-link" onClick={() => go("/review/" + a.deliverable.id)}>
                    History <ArrowUpRight size={14} />
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <Empty
          title={
            search || product || campaign
              ? "No matching approved releases"
              : "No approved releases yet"
          }
          detail="Submitted work must receive an explicit exact-version decision. Imported images and praise are not approvals."
        />
      )}
      {(() => {
        const generated = w.works.filter(
          (d) => d.current?.status === "In review" && !!d.requirements?.generatedBy,
        );
        return generated.length ? (
          <section>
            <div className="section-title">
              <h2>Pending review · generated, not approved</h2>
              <span>{generated.length} IN REVIEW</span>
            </div>
            <p className="muted small">
              Generated assets wait here until someone makes an explicit decision on the exact
              version. They are not part of the approved library above.
            </p>
            <div className="work-list">
              {generated.map((d) => (
                <WorkRow key={d.id} work={d} w={w} onOpen={(id) => go("/review/" + id)} />
              ))}
            </div>
          </section>
        ) : null;
      })()}
      <div className="source-footer">
        Revoked releases do not appear here. A newer draft never inherits approval. All sample
        decisions remain labeled demonstration data.
      </div>
    </div>
  );
}
export function CreateBrief({
  w,
  onClose,
  onCreated,
  productId,
  campaignId,
}: {
  w: Workspace;
  onClose: () => void;
  onCreated: (id: string) => void;
  productId?: string;
  campaignId?: string;
}) {
  const [title, setTitle] = useState(""),
    [ps, setPs] = useState<string[]>(productId ? [productId] : []),
    [context, setContext] = useState(campaignId || ""),
    [territory, setTerritory] = useState(""),
    [placement, setPlacement] = useState("Shopify"),
    [format, setFormat] = useState("Lifestyle image"),
    [ratio, setRatio] = useState("4:3"),
    [outputs, setOutputs] = useState(1),
    [packaging, setPackaging] = useState("Bottle only; no box"),
    [copy, setCopy] = useState("No on-image copy"),
    [exclusions, setExclusions] = useState(
      "Preserve actual product identity. No unverified claims.",
    );
  const m = useAction(client.workspace.createWork);
  return (
    <Modal title="New production brief" wide onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            const r = await m.mutateAsync({
              title,
              productIds: ps,
              campaignId: context || null,
              territoryId: territory || null,
              placement,
              format,
              targetType: ["Primary text", "Alt text", "Product description"].includes(format)
                ? "copy"
                : "image",
              requirements: { ratio, outputs, packaging, copy, exclusions },
            });
            onCreated(r.id);
          } catch {}
        }}
      >
        <div className="form-grid">
          <label className="span-2">
            Deliverable title
            <input
              aria-label="Deliverable title"
              required
              placeholder="e.g. Caramel Latte · Bottle-only website hero"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label>
            Work context
            <select value={context} onChange={(e) => setContext(e.target.value)}>
              <option value="">Evergreen / product work</option>
              {w.campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Placement
            <select value={placement} onChange={(e) => setPlacement(e.target.value)}>
              {["Shopify", "Instagram", "Meta ad", "Website hero", "Creative exploration"].map(
                (p) => (
                  <option key={p}>{p}</option>
                ),
              )}
            </select>
          </label>
          <fieldset className="span-2">
            <legend>Product(s) depicted</legend>
            <div className="product-checks">
              {w.products
                .filter((p) => !p.sample)
                .map((p) => (
                  <label key={p.id}>
                    <input
                      aria-label={`Include ${p.name}`}
                      type="checkbox"
                      checked={ps.includes(p.id)}
                      onChange={(e) =>
                        setPs((s) =>
                          e.target.checked ? [...s, p.id] : s.filter((id) => id !== p.id),
                        )
                      }
                    />
                    {p.name}
                  </label>
                ))}
            </div>
          </fieldset>
          <label className="span-2">
            Creative direction (optional)
            <select value={territory} onChange={(e) => setTerritory(e.target.value)}>
              <option value="">No territory needed / straightforward product imagery</option>
              {w.territories
                .filter((t) => t.productIds.some((id) => ps.includes(id)))
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title} · proposal unless selected
                  </option>
                ))}
            </select>
          </label>
          <label>
            Format
            <select value={format} onChange={(e) => setFormat(e.target.value)}>
              {[
                "Lifestyle image",
                "Packshot",
                "Carousel",
                "Ad image",
                "Banner",
                "Ingredient image",
                "Primary text",
                "Alt text",
                "Product description",
              ].map((f) => (
                <option key={f}>{f}</option>
              ))}
            </select>
          </label>
          <label>
            Ratio / dimensions
            <input
              aria-label="Ratio and dimensions"
              value={ratio}
              onChange={(e) => setRatio(e.target.value)}
              placeholder="Specific to this placement"
            />
          </label>
          <label>
            Output / slide count
            <input
              aria-label="Output or slide count"
              type="number"
              min={1}
              max={20}
              value={outputs}
              onChange={(e) => setOutputs(Number(e.target.value))}
            />
          </label>
          <label>
            Packaging inclusion
            <input
              aria-label="Packaging inclusion"
              value={packaging}
              onChange={(e) => setPackaging(e.target.value)}
            />
          </label>
          <label>
            Copy requirements
            <textarea
              aria-label="Copy requirements"
              value={copy}
              onChange={(e) => setCopy(e.target.value)}
            />
          </label>
          <label>
            Exclusions
            <textarea
              aria-label="Exclusions"
              value={exclusions}
              onChange={(e) => setExclusions(e.target.value)}
            />
          </label>
        </div>
        <ErrorBox error={m.error} />
        <div className="modal-footer">
          <span className="small muted">
            Missing references stay visible. No image-generation API is called.
          </span>
          <button className="btn" disabled={m.isPending || !ps.length}>
            {m.isPending ? "Creating…" : "Create production packet"}
            <ArrowRight size={15} />
          </button>
        </div>
      </form>
    </Modal>
  );
}
