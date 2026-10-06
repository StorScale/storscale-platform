import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { deleteProject, getProject, ProjectView, Spec } from "../api";
import { Phase } from "./Projects";

// What each role means in each system, for a project with this spec.
export function grants(name: string, spec: Spec) {
  const ns = spec.tables ? `${spec.tables.catalog ?? "iceberg"}.${spec.tables.namespace ?? name.replace(/-/g, "_")}` : null;
  const bucket = spec.files ? spec.files.bucket || name : null;
  const r = spec.tables?.readers;
  const readerTables = r?.tables?.length ? r.tables.join(", ") : "every table";
  const narrowing = [
    ...(r?.rowFilters ?? []).map((f) => `${f.table}: only rows where ${f.filter}`),
    ...(r?.masks ?? []).map((m) => `${m.table}.${m.column} masked (${m.type})`),
  ];
  return [
    {
      role: "Editors",
      group: `${name}-editors`,
      items: [ns && `Create, change and drop tables in ${ns} (Trino, through Ranger)`, bucket && `Read and write the ${bucket} bucket (Buckets)`].filter(Boolean) as string[],
    },
    {
      role: "Readers",
      group: `${name}-readers`,
      items: [
        ns && `Read ${readerTables} in ${ns}`,
        ...narrowing,
        bucket && `Read the ${bucket} bucket`,
      ].filter(Boolean) as string[],
    },
    ...(spec.pipelines
      ? [{
          role: "Pipelines",
          group: `${name}-pipelines`,
          items: [
            `Keycloak client ${spec.pipelines.serviceAccount}'s service account`,
            ns && `Read, insert and delete in ${ns}'s tables`,
            bucket && `Read and write ${bucket}/landing/`,
          ].filter(Boolean) as string[],
        }]
      : []),
  ];
}

export default function ProjectDetail({ admin }: { admin: boolean }) {
  const { name = "" } = useParams();
  const navigate = useNavigate();
  const [v, setV] = useState<ProjectView>();
  const [error, setError] = useState<string>();
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    const load = () => getProject(name).then(setV).catch((e) => setError(e.message));
    load();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [name]);
  if (error) return <p className="bad">{error}</p>;
  if (!v) return <div className="spinner" />;
  const spec = v.spec?.spec;
  const remove = async () => {
    try {
      await deleteProject(name);
      navigate("/projects");
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <div className="page">
      <div className="page-head">
        <h1>{name} <Phase v={v} /></h1>
        {spec?.tables && <Link className="button" to={`/projects/${name}/flow`} data-testid="flow-link">Flow</Link>}
        {admin && spec && (
          <div className="actions">
            <Link className="button" to={`/projects/${name}/edit`} data-testid="edit-project">Edit</Link>
            {confirm ? (
              <span className="confirm">
                <span>Delete {name}? Its access goes; its data stays.</span>
                <button className="danger" onClick={remove} data-testid="confirm-delete">Delete</button>
                <button onClick={() => setConfirm(false)}>Cancel</button>
              </span>
            ) : (
              <button className="danger" onClick={() => setConfirm(true)} data-testid="delete-project">Delete</button>
            )}
          </div>
        )}
      </div>
      {spec?.description && <p className="lead">{spec.description}</p>}
      {v.role && <p>You're {v.role === "editor" ? "an editor" : "a reader"} here.</p>}

      {spec && (
        <>
          <h2>What each role gets</h2>
          <div className="grant-grid">
            {grants(name, spec).map((g) => (
              <div key={g.role} className="card">
                <h3>{g.role} <span className="pill">{g.group}</span></h3>
                <ul>{g.items.map((i) => <li key={i}>{i}</li>)}</ul>
              </div>
            ))}
          </div>
        </>
      )}

      <h2>Members</h2>
      {v.status?.members?.length ? (
        <table data-testid="members">
          <thead><tr><th>Who</th><th>Role</th><th>Through</th></tr></thead>
          <tbody>
            {v.status.members.map((m) => (
              <tr key={m.username}>
                <td>{m.username}</td>
                <td>{m.role}</td>
                <td className="muted">{m.role === "pipelines" ? "the project's pipelines" : m.via ? `group ${m.via}` : "named in the project"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="muted">The operator hasn't applied the project yet.</p>
      )}
      {spec && (
        <p className="muted">
          Members come from {spec.members.map((m) => (m.group ? `group ${m.group}` : `user ${m.user}`) + ` (${m.role})`).join(", ")}.
          Someone who joins one of those groups in Keycloak joins the project within a minute.
        </p>
      )}

      <h2>Status</h2>
      <table>
        <thead><tr><th>System</th><th></th><th>Last result</th></tr></thead>
        <tbody>
          {(v.status?.parts ?? []).map((p) => (
            <tr key={p.system}>
              <td>{p.system}</td>
              <td>{p.ok ? <span className="pill ok">applied</span> : <span className="pill bad">failed</span>}</td>
              <td className="wrap">{p.ok ? "" : p.message}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {v.status && <p className="muted">Checked {new Date(v.status.updated).toLocaleString()}.</p>}
    </div>
  );
}
