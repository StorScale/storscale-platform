import { Link } from "react-router-dom";
import { Tool, User } from "../api";

const GROUPS: Record<string, string> = {
  analysts: "Analysts read the sales tables (EU orders, card numbers masked), their own files, and the shared datasets.",
  engineers: "Engineers build and change tables, write the shared datasets, run pipelines, and edit dashboards.",
};

export default function Home({ user, tools }: { user: User; tools: Tool[] }) {
  const first = (user.name || user.username).split(" ")[0];
  return (
    <div className="home">
      <h1 data-testid="greeting">Welcome, {first}</h1>
      <p className="muted lead">Everything below uses your one sign-in. What you can see and change follows your groups.</p>
      <div className="tool-grid">
        {tools.map((t) => (
          <Link key={t.id} to={`/tools/${t.id}`} className="tool-card" data-testid={`card-${t.id}`}>
            <h2>{t.name}</h2>
            <p>{t.description}</p>
          </Link>
        ))}
      </div>
      <h2>Your access</h2>
      <div className="card">
        {user.groups.filter((g) => GROUPS[g]).map((g) => (
          <p key={g}><span className="pill">{g}</span> {GROUPS[g]}</p>
        ))}
        <p className="muted">Trino, for JDBC and CLI clients, is at <code>https://localhost:8443</code>: sign in with a Keycloak token.</p>
      </div>
    </div>
  );
}
