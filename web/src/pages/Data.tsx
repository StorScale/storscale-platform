import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { getFlow, runSQL, SQLAnswer } from "../api";
import { CheckPill, checkName, ErrorBanner, failing, limits, maskLabel, Spinner, usePoll, useProject } from "../lib";
import { FlowStrip } from "./Overview";

const TABS = ["columns", "preview", "lineage", "quality"] as const;
type Tab = (typeof TABS)[number];

// Data is a project's tables: their columns, a look at their rows (as you,
// so your filters and masks apply), where they come from, and their checks.
export default function Data() {
  const { name, view } = useProject();
  const spec = view?.spec?.spec;
  const [params, setParams] = useSearchParams();
  const flow = usePoll(() => getFlow(name), [name], 30_000);
  const tables = flow.data?.tables.filter((t) => !t.external) ?? [];
  const table = tables.find((t) => t.name === params.get("table")) ?? tables[0];
  const tab: Tab = (TABS as readonly string[]).includes(params.get("tab") ?? "") ? (params.get("tab") as Tab) : "columns";
  const go = (t: string, tb: Tab = "columns") => setParams(tb === "columns" ? { table: t } : { table: t, tab: tb });

  if (flow.error && !flow.data) return <div className="page"><ErrorBanner error={flow.error} /></div>;
  if (!flow.data) return <div className="page"><Spinner /></div>;
  if (tables.length === 0) return <div className="page"><div className="empty">The catalog hasn't seen this project's tables yet. It looks every minute.</div></div>;

  const reader = view?.role === "reader";
  const lim = limits(spec, table.name);
  const narrowed = lim.filters.length > 0 || Object.keys(lim.masks).length > 0 || lim.hidden;
  const into = flow.data.edges.filter((e) => e.to === table.fqn);
  const outOf = flow.data.edges.filter((e) => e.from === table.fqn);
  const short = (fqn: string) => flow.data!.tables.find((t) => t.fqn === fqn)?.name ?? fqn;
  const madeFrom = (col: string) => into.flatMap((e) => e.columns.filter((c) => c.to === col).flatMap((c) => c.from.map((f) => `${short(e.from)}.${f}`)));

  return (
    <div className="page">
      <div className="split">
        <nav className="side side-list" aria-label="Tables" data-testid="tables">
          <p className="eyebrow">Tables</p>
          {tables.map((t) => (
            <button key={t.fqn} className={t === table ? "active" : ""} onClick={() => go(t.name)} data-testid={`table-${t.name}`}>
              <span className="mono">{t.name}</span>
              {failing(t.checks).length > 0 ? <span className="dot red" title="a check is failing" /> : limits(spec, t.name).hidden ? <span className="small muted" style={{ whiteSpace: "nowrap" }} title="The project's readers can't read this table">editors</span> : null}
            </button>
          ))}
        </nav>

        <section className="main stack">
          <div className="card flush">
            <div style={{ padding: "18px 20px 0" }}>
              <div className="card-head" style={{ marginBottom: 4 }}>
                <h2 className="mono" style={{ fontSize: 18 }} data-testid="table-title">{table.name}</h2>
                <Link className="btn small" to={`../sql?table=${table.name}`} relative="path">Query in SQL</Link>
              </div>
              <p className="muted small" style={{ margin: "0 0 10px" }}>
                {table.description || `${table.fqn.split(".").slice(1).join(".")}`} · {table.columns.length} columns
                {into[0]?.pipeline && <> · made by <Link to={`../pipelines?pipeline=${into[0].pipeline}`} relative="path" className="mono">{into[0].pipeline}</Link></>}
              </p>
              {narrowed && (
                <div className={`banner ${reader ? "warn" : "info"}`} style={{ marginBottom: 12 }} data-testid="limits">
                  <div>
                    <strong>{reader ? "You see this table as a reader." : "Readers see less of this table."}</strong>{" "}
                    {lim.hidden && (reader ? "Only editors can read it. " : "Only editors can read it. ")}
                    {lim.filters.map((f) => <span key={f}>{reader ? "You see" : "They see"} only rows where <code>{f}</code>. </span>)}
                    {Object.entries(lim.masks).map(([c, t]) => <span key={c}><code>{c}</code> shows {maskLabel(t)}. </span>)}
                  </div>
                </div>
              )}
            </div>
            <div className="subtabs" role="tablist" style={{ padding: "0 8px" }}>
              {TABS.map((t) => (
                <button key={t} role="tab" aria-selected={t === tab} className={t === tab ? "active" : ""} onClick={() => go(table.name, t)} data-testid={`data-tab-${t}`}>
                  {t[0].toUpperCase() + t.slice(1)}
                  {t === "quality" && failing(table.checks).length > 0 && <span className="pill red" style={{ marginLeft: 6 }}>{failing(table.checks).length}</span>}
                </button>
              ))}
            </div>

            {tab === "columns" && (
              <div className="scroll-x">
                <table className="t" data-testid="columns">
                  <thead><tr><th>Column</th><th>Type</th><th>Readers see</th><th>Comes from</th></tr></thead>
                  <tbody>
                    {table.columns.map((c) => (
                      <tr key={c.name}>
                        <td className="mono">{c.name}</td>
                        <td className="mono muted">{c.type || "–"}</td>
                        <td>{lim.hidden ? <span className="pill amber">nothing</span> : lim.masks[c.name] ? <span className="pill amber">{maskLabel(lim.masks[c.name])}</span> : <span className="muted small">all of it</span>}</td>
                        <td className="mono small muted">{madeFrom(c.name).join(", ") || ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {tab === "preview" && <Preview project={name} table={table.name} key={table.name} />}
            {tab === "lineage" && (
              <div style={{ padding: 20 }} className="stack">
                <FlowStrip flow={flow.data} project={name} here={table.name} />
                {[...into, ...outOf].length === 0 ? <p className="muted">No pipeline has reported reading or writing this table yet.</p> : (
                  <table className="t" data-testid="edges">
                    <thead><tr><th>From</th><th>To</th><th>Pipeline</th><th>Columns</th></tr></thead>
                    <tbody>
                      {[...into, ...outOf].map((e, i) => (
                        <tr key={i}>
                          <td className="mono">{short(e.from)}</td>
                          <td className="mono">{short(e.to)}</td>
                          <td className="mono">{e.pipeline ?? <span className="muted">unknown</span>}</td>
                          <td className="small">{e.columns.map((c) => <div key={c.to}><code>{c.to}</code> ← {c.from.map((f) => <code key={f}>{f} </code>)}</div>)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
            {tab === "quality" && (
              table.checks.length === 0 ? <p className="muted" style={{ padding: 20 }}>No checks on this table.</p> : (
                <table className="t" data-testid="checks">
                  <thead><tr><th>Check</th><th>Status</th><th>Last result</th></tr></thead>
                  <tbody>
                    {table.checks.map((c) => (
                      <tr key={c.name}>
                        <td className="mono">{checkName(name, table.name, c.name)}</td>
                        <td><CheckPill status={c.status} /></td>
                        <td className="small">{c.result || <span className="muted">–</span>}{c.when ? <div className="muted">{new Date(c.when).toLocaleString()}</div> : null}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function Preview({ project, table }: { project: string; table: string }) {
  const [answer, setAnswer] = useState<SQLAnswer>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    runSQL(project, `SELECT * FROM "${table}" LIMIT 20`, 20).then(setAnswer).catch((e) => setError(e.message));
  }, [project, table]);
  if (error) return <div style={{ padding: 20 }}><ErrorBanner error={error} /></div>;
  if (!answer) return <div style={{ padding: 20 }}><Spinner /></div>;
  return <Results answer={answer} testid="preview" note="The first 20 rows, as you see them." />;
}

export function Results({ answer, testid, note }: { answer: SQLAnswer; testid: string; note?: string }) {
  return (
    <div>
      <div className="scroll-x">
        <table className="t data" data-testid={testid}>
          <thead><tr>{answer.columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
          <tbody>
            {answer.rows.map((r, i) => <tr key={i}>{r.map((v, j) => <td key={j}>{v === null ? <span className="muted">null</span> : String(v)}</td>)}</tr>)}
          </tbody>
        </table>
      </div>
      <p className="small muted" style={{ padding: "8px 16px", margin: 0, borderTop: "1px solid var(--line-soft)" }}>
        {answer.rows.length} {answer.rows.length === 1 ? "row" : "rows"}{answer.seconds !== undefined ? ` in ${answer.seconds}s` : ""}. {note}
      </p>
    </div>
  );
}
