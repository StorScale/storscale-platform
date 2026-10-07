import { useEffect, useState } from "react";
import { NavLink, Route, Routes, useLocation } from "react-router-dom";
import { session, Session, signIn, signOut, Tool, User } from "./api";
import Access from "./pages/Access";
import Flow from "./pages/Flow";
import Semantic from "./pages/Semantic";
import Home from "./pages/Home";
import ProjectDetail from "./pages/ProjectDetail";
import ProjectEditor from "./pages/ProjectEditor";
import Projects from "./pages/Projects";
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
  return <Shell user={s.user} tools={s.tools} admin={s.admin} projects={s.projects} />;
}

function Shell({ user, tools, admin, projects }: { user: User; tools: Tool[]; admin: boolean; projects: boolean }) {
  const location = useLocation();
  const work = tools.filter((t) => t.section === "work");
  const adminTools = tools.filter((t) => t.section === "admin");
  const toolId = location.pathname.match(/^\/tools\/([^/]+)/)?.[1];
  return (
    <div className="shell">
      <nav className="sidebar" aria-label="Platform">
        <div className="brand">
          <img src="/favicon.svg" alt="" /> StorScale <span className="brand-sub">Platform</span>
        </div>
        <NavLink to="/" end>Home</NavLink>
        {projects && <NavLink to="/projects" data-testid="nav-projects">Projects</NavLink>}
        <div className="nav-group">Work</div>
        {work.map((t) =>
          t.embedUrl ? (
            <NavLink key={t.id} to={`/tools/${t.id}`} data-testid={`nav-${t.id}`}>{t.name}</NavLink>
          ) : (
            <a key={t.id} href={t.url} target="_blank" rel="noreferrer" data-testid={`nav-${t.id}`}>{t.name} <span aria-hidden>↗</span></a>
          ),
        )}
        {(adminTools.length > 0 || (admin && projects)) && <div className="nav-group">Administration</div>}
        {admin && projects && <NavLink to="/access" data-testid="nav-access">Access</NavLink>}
        {adminTools.map((t) => (
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
          <Route path="/" element={<Home user={user} tools={work} projects={projects} />} />
          <Route path="/tools/:id" element={null} />
          <Route path="/projects" element={<Projects />} />
          <Route path="/projects/new" element={<ProjectEditor />} />
          <Route path="/projects/:name" element={<ProjectDetail admin={admin} />} />
          <Route path="/projects/:name/edit" element={<ProjectEditor />} />
          <Route path="/projects/:name/flow" element={<Flow />} />
          <Route path="/projects/:name/semantic" element={<Semantic />} />
          <Route path="/access" element={<Access />} />
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
