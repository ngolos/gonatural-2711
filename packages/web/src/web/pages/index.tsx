import { useState } from "react";
import { useLocation } from "wouter";
import {
  LayoutDashboard,
  Layers,
  Package,
  Grid2X2,
  BadgeCheck,
  ArrowUpRight,
  ChevronDown,
  LogOut,
  FileInput,
  Leaf,
  ArrowRight,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useWorkspace, usePreview } from "../queries/workspace";
import { authClient, token } from "../lib/auth";
import { client } from "../lib/api";
import { Modal, Loading, ErrorBox, Workspace } from "../components/workspace-ui";
import { Overview, Libraries, Approved } from "./libraries";
import ProductDetail from "./product";
import ReviewPage from "./review";
import ProductionPage from "./production";
import ImportPage from "./imports";

const nav = [
  ["/", "Overview", LayoutDashboard],
  ["/campaigns", "Campaigns", Layers],
  ["/products", "Products", Package],
  ["/creative", "Creative Library", Grid2X2],
  ["/approved", "Approved Assets", BadgeCheck],
] as const;
export default function Index() {
  const [location, navigate] = useLocation();
  const q = useQueryClient();
  const [login, setLogin] = useState(false),
    [authBusy, setAuthBusy] = useState(false),
    [authError, setAuthError] = useState(""),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState("");
  const [sessionReady, setSessionReady] = useState(!!token());
  const { data: session } = authClient.useSession();
  const authenticated = sessionReady || !!session;
  const query = useWorkspace(authenticated);
  const preview = usePreview();
  const w = query.data;
  function go(path: string) {
    if (!w) {
      setLogin(true);
      return;
    }
    navigate(path);
  }
  async function demo(role: "creator" | "client" | "contributor") {
    setAuthBusy(true);
    setAuthError("");
    try {
      const r = await client.workspace.demoLogin({ role });
      sessionStorage.setItem("gn-demo-session", r.token);
      setSessionReady(true);
      setLogin(false);
      await q.resetQueries();
    } catch (e) {
      setAuthError(e instanceof Error ? e.message : "Sign-in failed");
    } finally {
      setAuthBusy(false);
    }
  }
  const name =
    w?.member.role === "creator"
      ? "Demo creator"
      : w?.member.role === "client"
        ? "Demo reviewer"
        : w
          ? "Demo contributor"
          : "Workspace preview";
  const section = location.startsWith("/review")
    ? "Asset review"
    : location.startsWith("/production")
      ? "Production brief"
      : location.startsWith("/products/")
        ? "Product library"
        : nav.find((n) => n[0] !== "/" && location.startsWith(n[0]))?.[1] || "Overview";
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          className="brand"
          href="/"
          onClick={(e) => {
            e.preventDefault();
            navigate("/");
          }}
        >
          <span>
            go natural<span className="brand-dot">.</span>
          </span>
          <small>CREATIVE WORKSPACE</small>
        </a>
        <button className="workspace-switch" onClick={() => setLogin(true)}>
          <span className="workspace-icon">gn</span>
          <span>
            Go Natural<small>Sample workspace</small>
          </span>
          <ChevronDown size={14} />
        </button>
        <div className="nav-label">WORKSPACE</div>
        <nav>
          {nav.map(([path, label, Icon]) => (
            <button
              key={path}
              className={
                (path === "/" ? location === "/" : location.startsWith(path)) ? "active" : ""
              }
              onClick={() => go(path)}
            >
              <Icon size={18} strokeWidth={1.6} />
              {label}
              {label === "Products" && (
                <span className="nav-count">
                  {w?.products.filter((p) => !p.sample).length ?? preview.data?.productCount ?? "—"}
                </span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="studio-note">
            <Leaf size={20} strokeWidth={1.3} />
            <p>
              Ideas evolve.
              <br />
              Keep their story.
            </p>
            <small>
              Independent proposal
              <br />
              Not a client-approved platform.
            </small>
          </div>
          {(!w || w.member.role === "creator") && (
            <button className="sidebar-tool" onClick={() => go("/imports")}>
              <FileInput size={17} />
              Import & export
            </button>
          )}
          <button className="profile" onClick={() => setLogin(true)}>
            <span className="avatar">{w?.member.role === "client" ? "DR" : "DC"}</span>
            <span>
              {name}
              <small>{w ? "Authenticated sample identity" : "Choose a demo identity"}</small>
            </span>
            <ChevronDown size={14} />
          </button>
        </div>
      </aside>
      <div className="workspace-body">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <span>/</span> <strong>{section}</strong>
          </div>
          <div className="top-actions">
            <span className="demo-label">
              <i />
              SAMPLE WORKSPACE
            </span>
            {w ? (
              <button
                className="icon-btn"
                title="Sign out"
                onClick={async () => {
                  await authClient.signOut();
                  sessionStorage.removeItem("gn-demo-session");
                  setSessionReady(false);
                  q.clear();
                  navigate("/");
                }}
              >
                <LogOut size={17} />
              </button>
            ) : (
              <button className="btn secondary" onClick={() => setLogin(true)}>
                Sign in <ArrowRight size={14} />
              </button>
            )}
          </div>
        </header>
        <main key={w?.member.id || "preview"}>
          {query.isLoading && authenticated ? (
            <Loading />
          ) : w ? (
            <WorkspacePages w={w} path={location} go={go} />
          ) : (
            <div className="overview">
              <div className="page-heading">
                <div>
                  <div className="eyebrow">GO NATURAL / CREATIVE STUDIO</div>
                  <h1>
                    Good ideas deserve
                    <br />a place to grow.
                  </h1>
                  <p>
                    From product understanding to the approved original.
                    <br />
                    One connected space for every creative decision.
                  </p>
                </div>
                <button className="btn" onClick={() => setLogin(true)}>
                  Enter sample workspace <ArrowUpRight size={16} />
                </button>
              </div>
              <div className="preview-hero">
                <div>
                  <div className="eyebrow">THOUGHTFULLY CONNECTED</div>
                  <h2>
                    The idea. The work.
                    <br />
                    The whole story.
                  </h2>
                  <p>
                    Explore products, develop creative directions and review
                    <br />
                    the version that matters—without losing what came before.
                  </p>
                  <button onClick={() => demo("creator")} disabled={authBusy} className="btn light">
                    {authBusy ? "Signing in…" : "Explore as creator"}
                    <ArrowUpRight size={16} />
                  </button>
                </div>
                <div className="hero-reference">
                  <span>01 / THE FOUNDATION</span>
                  <div className="hero-serif">
                    Product
                    <br />
                    understanding.
                  </div>
                  <p>
                    {preview.data?.realCount ?? 8} collected fragrance briefs
                    <br />
                    Actual product images still to be uploaded
                  </p>
                </div>
              </div>
              <div className="section-title">
                <h2>A workspace, not another folder.</h2>
                <span>THE DEMONSTRATION</span>
              </div>
              <div className="intro-grid">
                <button onClick={() => demo("creator")} disabled={authBusy}>
                  <span>01</span>
                  <h3>Develop & produce</h3>
                  <p>
                    Retrieve the product evidence. Keep the direction. Build a grounded production
                    packet.
                  </p>
                  <b>
                    Creator access <ArrowUpRight size={17} />
                  </b>
                </button>
                <button onClick={() => demo("client")} disabled={authBusy}>
                  <span>02</span>
                  <h3>Review & decide</h3>
                  <p>
                    Compare versions, leave precise feedback and approve an exact deliverable scope.
                  </p>
                  <b>
                    Reviewer access <ArrowUpRight size={17} />
                  </b>
                </button>
                <button onClick={() => demo("contributor")} disabled={authBusy}>
                  <span>03</span>
                  <h3>Share product inputs</h3>
                  <p>
                    Submit information and references. Retain corrections without rewriting history.
                  </p>
                  <b>
                    Contributor access <ArrowUpRight size={17} />
                  </b>
                </button>
              </div>
              <div className="source-footer">
                {preview.data?.realCount ?? "—"} sourced catalog entries · Fictional navigation
                records excluded from the portfolio · No staged approvals represent a real client
                decision.
              </div>
              <ErrorBox error={query.error || authError} />
            </div>
          )}
        </main>
      </div>
      {login && (
        <Modal title="Enter the sample workspace" onClose={() => setLogin(false)}>
          <p className="muted">
            Separate authenticated identities. All actions in this workspace are demonstration data,
            not real Go Natural decisions.
          </p>
          <div className="identity-options">
            {(["creator", "client", "contributor"] as const).map((role) => (
              <button
                className="identity"
                key={role}
                disabled={authBusy}
                onClick={() => demo(role)}
              >
                <span className="avatar">
                  {role === "client" ? "DR" : role === "creator" ? "DC" : "DP"}
                </span>
                <span>
                  <strong>Demo {role === "client" ? "reviewer & product owner" : role}</strong>
                  <small>
                    {role === "creator"
                      ? "Manage source records, drafts and production"
                      : role === "client"
                        ? "Review submitted work; confirm scoped product input"
                        : "Submit inputs and comment; no approval authority"}
                  </small>
                </span>
                <ArrowRight size={18} />
              </button>
            ))}
          </div>
          <div className="divider">OR SIGN IN TO YOUR ASSIGNED ACCOUNT</div>
          <button
            className="btn secondary full"
            disabled={authBusy}
            onClick={async () => {
              setAuthBusy(true);
              const r = await authClient.managedAuth.signIn({ provider: "google" });
              if (r?.error) setAuthError(r.error.message || "Sign-in failed");
              else {
                setLogin(false);
                q.invalidateQueries();
              }
              setAuthBusy(false);
            }}
          >
            Continue with Google
          </button>
          <form
            className="auth-form"
            onSubmit={async (e) => {
              e.preventDefault();
              setAuthBusy(true);
              setAuthError("");
              const r = await authClient.signIn.email({ email, password });
              if (r.error) setAuthError(r.error.message || "Sign-in failed");
              else {
                if (r.data?.token) sessionStorage.setItem("gn-demo-session", r.data.token);
                setSessionReady(true);
                setLogin(false);
                await q.resetQueries();
              }
              setAuthBusy(false);
            }}
          >
            <label>
              Email
              <input
                aria-label="Email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label>
              Password
              <input
                aria-label="Password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <button className="btn full" disabled={authBusy}>
              {authBusy ? "Signing in…" : "Sign in"}
            </button>
          </form>
          <ErrorBox error={authError} />
          <p className="small muted">
            Signing in does not grant membership. Workspace invitations and administration are
            deferred.
          </p>
        </Modal>
      )}
    </div>
  );
}
function WorkspacePages({
  w,
  path,
  go,
}: {
  w: Workspace;
  path: string;
  go: (path: string) => void;
}) {
  if (path.startsWith("/review/")) return <ReviewPage w={w} id={path.split("/")[2]} go={go} />;
  if (path.startsWith("/production/"))
    return w.member.role === "creator" ? (
      <ProductionPage w={w} id={path.split("/")[2]} go={go} />
    ) : (
      <ErrorBox error="Creator access required." />
    );
  if (path.startsWith("/products/")) return <ProductDetail w={w} id={path.split("/")[2]} go={go} />;
  if (path === "/imports")
    return w.member.role === "creator" ? (
      <ImportPage w={w} />
    ) : (
      <ErrorBox error="Creator access required." />
    );
  if (path === "/approved") return <Approved w={w} go={go} />;
  if (path.startsWith("/campaigns") || path.startsWith("/products") || path.startsWith("/creative"))
    return <Libraries w={w} path={path} go={go} />;
  return <Overview w={w} go={go} />;
}
