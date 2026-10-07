import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getProject, getSemantic, MetricAnswer, putSemantic, queryMetrics, SemanticModel } from "../api";

// Semantic is a project's semantic layer: its metrics, a way to try them, and
// (for editors) its definitions, MetricFlow's YAML.
export default function Semantic() {
  const { name = "" } = useParams();
  const [model, setModel] = useState<SemanticModel>();
  const [role, setRole] = useState<string>();
  const [error, setError] = useState<string>();
  const [draft, setDraft] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string>();
  const [metrics, setMetrics] = useState<string[]>([]);
  const [groupBy, setGroupBy] = useState<string[]>([]);
  const [answer, setAnswer] = useState<MetricAnswer>();
  const [asking, setAsking] = useState(false);
  const [askError, setAskError] = useState<string>();

  useEffect(() => {
    getSemantic(name).then(setModel).catch((e) => setError(e.message));
    getProject(name).then((v) => setRole(v.role)).catch(() => undefined);
  }, [name]);
  if (error) return <p className="bad">{error}</p>;
  if (!model) return <div className="spinner" />;

  const dimensions = [...new Set(model.metrics.filter((m) => metrics.includes(m.name)).flatMap((m) => m.dimensions))].sort();
  const toggle = (list: string[], set: (v: string[]) => void, v: string) => set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const ask = async () => {
    setAsking(true);
    setAskError(undefined);
    try {
      setAnswer(await queryMetrics(name, { metrics, group_by: groupBy.filter((g) => dimensions.includes(g)), limit: 100 }));
    } catch (e) {
      setAskError((e as Error).message);
    } finally {
      setAsking(false);
    }
  };
  const save = async () => {
    setSaving(true);
    setSaveError(undefined);
    try {
      setModel(await putSemantic(name, draft ?? model.yaml));
      setDraft(undefined);
    } catch (e) {
      setSaveError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };
  const mcpUrl = `${location.origin}/mcp`;

  return (
    <div className="page">
      <div className="page-head">
        <h1><Link to={`/projects/${name}`}>{name}</Link> / Semantic layer</h1>
      </div>
      <p className="muted lead">
        The project's metrics, defined once. People, dashboards and agents ask for them by name; each question
        runs in Trino as whoever asked, so their row filters and masks apply.
      </p>
      {model.error && <div className="banner error">The model doesn't compile: {model.error}</div>}

      <h2>Metrics</h2>
      {model.metrics.length === 0 ? (
        <p className="muted">No metrics yet.{role === "editor" ? " Define some below." : ""}</p>
      ) : (
        <table data-testid="metrics">
          <thead><tr><th></th><th>Metric</th><th>What it is</th><th>Group by</th></tr></thead>
          <tbody>
            {model.metrics.map((m) => (
              <tr key={m.name}>
                <td><input type="checkbox" checked={metrics.includes(m.name)} onChange={() => toggle(metrics, setMetrics, m.name)} aria-label={`Ask for ${m.name}`} /></td>
                <td><code>{m.name}</code> <span className="pill">{m.type}</span></td>
                <td>{m.description}</td>
                <td className="muted">{m.dimensions.join(", ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {metrics.length > 0 && (
        <div className="card ask">
          <div className="row">
            <strong>Group by</strong>
            {dimensions.map((d) => (
              <label key={d} className="check"><input type="checkbox" checked={groupBy.includes(d)} onChange={() => toggle(groupBy, setGroupBy, d)} /> {d}</label>
            ))}
            <span className="grow" />
            <button className="primary" onClick={ask} disabled={asking} data-testid="ask">{asking ? "Asking…" : "Ask"}</button>
          </div>
          {askError && <div className="banner error">{askError}</div>}
          {answer?.rows && (
            <>
              <table data-testid="answer">
                <thead><tr>{answer.columns!.map((c) => <th key={c}>{c}</th>)}</tr></thead>
                <tbody>{answer.rows.map((r, i) => <tr key={i}>{r.map((v, j) => <td key={j}>{String(v ?? "")}</td>)}</tr>)}</tbody>
              </table>
              <details className="advanced"><summary>The SQL it ran, as you</summary><pre className="sql">{answer.sql}</pre></details>
            </>
          )}
        </div>
      )}

      <h2>Agents</h2>
      <div className="card">
        <p>
          Agents use these metrics over MCP at <code>{mcpUrl}</code>, signed in through Keycloak as the person using
          them (client <code>storscale-agent</code>). Their tools: <code>list_projects</code>, <code>list_metrics</code>,{" "}
          <code>query_metrics</code> and <code>explain_query</code>. Each query runs as that person, and Ranger's audit
          log names the agent too.
        </p>
        <pre className="sql">claude mcp add --transport http storscale {mcpUrl}</pre>
      </div>

      <h2>Definitions</h2>
      <p className="muted">
        MetricFlow's YAML: semantic models over the project's tables ({model.tables.join(", ") || "none yet"}), and the
        metrics made from them. {role === "editor" ? "Changes apply to the next question anyone asks." : "Only the project's editors change them."}
      </p>
      <textarea rows={22} spellCheck={false} value={draft ?? model.yaml} readOnly={role !== "editor"}
        onChange={(e) => setDraft(e.target.value)} data-testid="semantic-yaml" />
      {saveError && <div className="banner error" data-testid="semantic-error">{saveError}</div>}
      {role === "editor" && (
        <div className="form-actions">
          {draft !== undefined && <button onClick={() => setDraft(undefined)}>Discard</button>}
          <button className="primary" onClick={save} disabled={saving || draft === undefined} data-testid="save-semantic">{saving ? "Checking…" : "Save"}</button>
        </div>
      )}
    </div>
  );
}
