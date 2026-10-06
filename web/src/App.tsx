import { useEffect, useState } from "react";
import { NavLink, Route, Routes, useLocation } from "react-router-dom";
import { session, Session, signIn, signOut, Tool, User } from "./api";
import Home from "./pages/Home";
import ToolFrames from "./pages/ToolFrames";

export default function App() {
  const [s, setS] = useState<Session | null | undefined>(undefined);
  const [error, setError] = useState<string>();
  useEffect(() => {
    session()
      .then((s) => (s ? setS(s) : signIn()))
      .catch((e) => setError(String(e)));
  }, []);

  if (error) return <Centered><p className="bad">The platform isn't answering: {error}</p></Centered>;
  if (!s) return <Centered><div className="spinner" /></Centered>;
  if (s.state === "refused") return <Refused user={s.user} error={s.error} />;
  return <Shell user={s.user} tools={s.tools} />;
}

function Shell({ user, tools }: { user: User; tools: Tool[] }) {
  const location = useLocation();
  const work = tools.filter((t) => t.section === "work");
  const admin = tools.filter((t) => t.section === "admin");
  const toolId = location.pathname.match(/^\/tools\/([^/]+)/)?.[1];
  return (
    <div className="shell">
      <nav className="sidebar" aria-label="Platform">
        <div className="brand">
          <img src="/favicon.svg" alt="" /> StorScale <span className="brand-sub">Platform</span>
        </div>
        <NavLink to="/" end>Home</NavLink>
        <div className="nav-group">Work</div>
        {work.map((t) => (
          <NavLink key={t.id} to={`/tools/${t.id}`} data-testid={`nav-${t.id}`}>{t.name}</NavLink>
        ))}
        {admin.length > 0 && <div className="nav-group">Administration</div>}
        {admin.map((t) => (
          <a key={t.id} href={t.url} target="_blank" rel="noreferrer" data-testid={`nav-${t.id}`}>
            {t.name} <span aria-hidden>↗</span>
          </a>
        ))}
        <div className="sidebar-foot">
          <div className="whoami" data-testid="whoami">{user.name || user.username}</div>
          <div className="groups">{user.groups.join(", ")}</div>
          <button className="link" onClick={signOut} data-testid="sign-out">Sign out</button>
        </div>
      </nav>
      <main className={toolId ? "content framed" : "content"}>
        <Routes>
          <Route path="/" element={<Home user={user} tools={work} />} />
          <Route path="/tools/:id" element={null} />
          <Route path="*" element={<p>Page not found.</p>} />
        </Routes>
        <ToolFrames tools={work} active={toolId} />
      </main>
    </div>
  );
}

function Refused({ user, error }: { user: User; error: string }) {
  return (
    <Centered>
      <div className="card refused" data-testid="refused">
        <h1>No access</h1>
        <p>Signed in as <strong>{user.username}</strong>. {error}</p>
        <p className="muted">Ask an administrator to add you to a group in Keycloak, then sign in again.</p>
        <button onClick={signOut}>Sign out</button>
      </div>
    </Centered>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="center">{children}</div>;
}
