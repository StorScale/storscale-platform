import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AccessPerson, getAccess } from "../api";

// Access is who has which role in which project, for administrators.
export default function Access() {
  const [data, setData] = useState<{ projects: string[]; people: AccessPerson[] }>();
  const [error, setError] = useState<string>();
  const [filter, setFilter] = useState("");
  useEffect(() => {
    getAccess().then(setData).catch((e) => setError(e.message));
  }, []);
  if (error) return <p className="bad">{error}</p>;
  if (!data) return <div className="spinner" />;
  const people = data.people.filter((p) => p.username.includes(filter.toLowerCase()));
  return (
    <div className="page">
      <div className="page-head">
        <h1>Access</h1>
        <input placeholder="Find a person" value={filter} onChange={(e) => setFilter(e.target.value)} />
      </div>
      <p className="muted lead">
        Who's in which project, and how. Projects grant access in Keycloak, Ranger and Buckets together. To change
        someone's access, change the project, or their groups in Keycloak.
      </p>
      <table data-testid="access">
        <thead>
          <tr>
            <th>Person</th>
            {data.projects.map((p) => <th key={p}><Link to={`/projects/${p}`}>{p}</Link></th>)}
          </tr>
        </thead>
        <tbody>
          {people.map((p) => (
            <tr key={p.username}>
              <td>{p.username}</td>
              {data.projects.map((name) => (
                <td key={name}>
                  {p.roles[name] ? (
                    <span title={p.via[name] ? `through group ${p.via[name]}` : "named in the project"}>
                      <span className={`pill ${p.roles[name]}`}>{p.roles[name]}</span>
                      {p.via[name] && <span className="muted"> via {p.via[name]}</span>}
                    </span>
                  ) : <span className="muted">–</span>}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <h2>What the roles mean</h2>
      <div className="card">
        <p><span className="pill editor">editor</span> creates and changes the project's tables, and writes its files.</p>
        <p><span className="pill reader">reader</span> reads the tables the project shows readers (with its row filters and masks) and its files.</p>
        <p><span className="pill pipelines">pipelines</span> a service account: reads and writes the tables, and the files under landing/.</p>
      </div>
    </div>
  );
}
