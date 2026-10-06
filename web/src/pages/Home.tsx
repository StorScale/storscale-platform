import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listProjects, ProjectView, Tool, User } from "../api";

export default function Home({ user, tools, projects }: { user: User; tools: Tool[]; projects: boolean }) {
  const first = (user.name || user.username).split(" ")[0];
  const [mine, setMine] = useState<ProjectView[]>();
  useEffect(() => {
    if (projects) listProjects().then((r) => setMine(r.projects.filter((p) => p.role))).catch(() => setMine([]));
  }, [projects]);
  return (
    <div className="home">
      <h1 data-testid="greeting">Welcome, {first}</h1>
      <p className="muted lead">Everything below uses your one sign-in. What you can see and change follows your projects.</p>
      <div className="tool-grid">
        {tools.map((t) =>
          t.embedUrl ? (
            <Link key={t.id} to={`/tools/${t.id}`} className="tool-card" data-testid={`card-${t.id}`}>
              <h2>{t.name}</h2>
              <p>{t.description}</p>
            </Link>
          ) : (
            <a key={t.id} href={t.url} target="_blank" rel="noreferrer" className="tool-card" data-testid={`card-${t.id}`}>
              <h2>{t.name} <span aria-hidden>↗</span></h2>
              <p>{t.description}</p>
            </a>
          ),
        )}
      </div>
      {projects && (
        <>
          <h2>Your projects</h2>
          <div className="card" data-testid="my-projects">
            {mine === undefined ? <div className="spinner" /> : mine.length === 0 ? (
              <p className="muted">You're not in any project yet. Ask an administrator to add you.</p>
            ) : mine.map((p) => (
              <p key={p.name}>
                <Link to={`/projects/${p.name}`}><strong>{p.name}</strong></Link> <span className={`pill ${p.role}`}>{p.role}</span>{" "}
                <span className="muted">{p.spec?.spec.description}</span>
              </p>
            ))}
            <p className="muted">Trino, for JDBC and CLI clients, is at <code>https://localhost:8443</code>: sign in with a Keycloak token.</p>
          </div>
        </>
      )}
    </div>
  );
}
