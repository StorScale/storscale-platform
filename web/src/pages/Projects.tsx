import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listProjects, ProjectView } from "../api";

export function useProjects() {
  const [data, setData] = useState<{ projects: ProjectView[]; admin: boolean }>();
  const [error, setError] = useState<string>();
  const load = useCallback(() => {
    listProjects().then(setData).catch((e) => setError(String(e.message ?? e)));
  }, []);
  useEffect(() => {
    load();
    const t = setInterval(load, 5000); // the operator's progress
    return () => clearInterval(t);
  }, [load]);
  return { data, error };
}

export function Phase({ v }: { v: ProjectView }) {
  const phase = v.status?.phase ?? (v.spec ? "Waiting" : "Deleting");
  const cls = phase === "Ready" ? "pill ok" : phase === "Error" ? "pill bad" : "pill";
  return <span className={cls} data-testid={`phase-${v.name}`}>{phase === "Waiting" ? "Waiting for the operator" : phase}</span>;
}

export default function Projects() {
  const { data, error } = useProjects();
  if (error) return <p className="bad">{error}</p>;
  if (!data) return <div className="spinner" />;
  return (
    <div className="page">
      <div className="page-head">
        <h1>Projects</h1>
        {data.admin && <Link className="button primary" to="/projects/new" data-testid="new-project">New project</Link>}
      </div>
      <p className="muted lead">
        A project is a team's tables, files and pipelines, and who may use them. The platform applies it to
        Keycloak, Ranger, Buckets and Nessie, and keeps them that way.
      </p>
      {data.projects.length === 0 ? (
        <div className="card">
          <p>{data.admin ? "No projects yet." : "You're not a member of any project yet. Ask an administrator to add you."}</p>
        </div>
      ) : (
        <table>
          <thead>
            <tr><th>Project</th><th>Your role</th><th>Members</th><th>Status</th></tr>
          </thead>
          <tbody>
            {data.projects.map((v) => (
              <tr key={v.name} data-testid={`project-${v.name}`}>
                <td>
                  <Link to={`/projects/${v.name}`}><strong>{v.name}</strong></Link>
                  <div className="muted">{v.spec?.spec.description}</div>
                </td>
                <td>{v.role ?? <span className="muted">none</span>}</td>
                <td>{v.status?.members.filter((m) => m.role !== "pipelines").length ?? "…"}</td>
                <td><Phase v={v} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
