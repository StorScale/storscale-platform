// The app's calls to platformd: who's signed in, and signing out.

export type User = { username: string; name: string; email: string; groups: string[] };

export type Tool = {
  id: string;
  name: string;
  description: string;
  section: "work" | "admin";
  url: string;
  embedUrl?: string;
};

export type Session =
  | { state: "signed-in"; user: User; tools: Tool[]; admin: boolean; projects: boolean; flow: boolean; semantic: boolean }
  | { state: "refused"; user: User; error: string };

// session is null when nobody is signed in.
export async function session(): Promise<Session | null> {
  const res = await fetch("/api/session", { headers: { "X-Platform-Request": "1" } });
  if (res.status === 401) return null;
  const body = await res.json();
  if (res.status === 403) return { state: "refused", user: body.user, error: body.error };
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
  return { state: "signed-in", user: body.user, tools: body.tools, admin: !!body.admin, projects: !!body.projects, flow: !!body.flow, semantic: !!body.semantic };
}

export function signIn() {
  const next = window.location.pathname + window.location.search;
  window.location.assign(`/auth/login?next=${encodeURIComponent(next)}`);
}

// signOut ends the platform's session, then Keycloak's.
export async function signOut() {
  const res = await fetch("/auth/logout", { method: "POST", headers: { "X-Platform-Request": "1" } });
  const body = await res.json().catch(() => ({}));
  window.location.assign(body.redirect ?? "/");
}

// --- Projects -----------------------------------------------------------------------

export type Member = { group?: string; user?: string; role: "reader" | "editor" };
export type Spec = {
  description?: string;
  members: Member[];
  tables?: {
    catalog?: string;
    namespace?: string;
    readers?: {
      tables?: string[];
      rowFilters?: { table: string; filter: string }[];
      masks?: { table: string; column: string; type: string }[];
    };
  };
  files?: { bucket?: string };
  pipelines?: { serviceAccount: string };
};
export type Project = { apiVersion: string; kind: string; metadata: { name: string }; spec: Spec };
export type Part = { system: string; ok: boolean; message: string };
export type Person = { username: string; role: string; via: string };
export type Status = { name: string; phase: string; parts: Part[]; members: Person[]; updated: string };
export type ProjectView = { name: string; spec?: Project; status?: Status; role?: string };

export const MASK_TYPES = ["MASK", "MASK_SHOW_LAST_4", "MASK_SHOW_FIRST_4", "MASK_HASH", "MASK_NULL", "MASK_NONE", "MASK_DATE_SHOW_YEAR"];

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: { "X-Platform-Request": "1", ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) {
    signIn();
    throw new ApiError(401, "signed out");
  }
  if (res.status === 204) return undefined as T;
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, json.error ?? `HTTP ${res.status}`);
  return json as T;
}

export const listProjects = () => api<{ projects: ProjectView[]; admin: boolean }>("GET", "/api/projects");
export const getProject = (name: string) => api<ProjectView>("GET", `/api/projects/${encodeURIComponent(name)}`);
export const putProject = (p: Project) => api<ProjectView>("PUT", `/api/projects/${encodeURIComponent(p.metadata.name)}`, p);
export const deleteProject = (name: string) => api<void>("DELETE", `/api/projects/${encodeURIComponent(name)}`);
export type AccessPerson = { username: string; roles: Record<string, string>; via: Record<string, string> };
export const getAccess = () => api<{ projects: string[]; people: AccessPerson[] }>("GET", "/api/access");

// --- A project's flow (from the catalog) --------------------------------------------

export type FlowCheck = { name: string; status: string; result: string; when?: number };
export type FlowTable = { name: string; fqn: string; columns: string[]; checks: FlowCheck[]; external?: boolean };
export type FlowEdge = { from: string; to: string; pipeline?: string; columns: { from: string[]; to: string }[] };
export type Flow = { tables: FlowTable[]; edges: FlowEdge[] };
export const getFlow = (name: string) => api<Flow>("GET", `/api/projects/${encodeURIComponent(name)}/flow`);

// --- A project's semantic layer (semanticd, through platformd) ----------------------

export type SemanticMetric = { name: string; description: string; type: string; dimensions: string[] };
export type SemanticModel = { project: string; yaml: string; metrics: SemanticMetric[]; tables: string[]; error?: string };
export type MetricQuery = { metrics: string[]; group_by?: string[]; where?: string[]; order_by?: string[]; limit?: number; explain?: boolean };
export type MetricAnswer = { project: string; sql: string; columns?: string[]; rows?: unknown[][] };
export const getSemantic = (name: string) => api<SemanticModel>("GET", `/api/projects/${encodeURIComponent(name)}/semantic`);
export const putSemantic = (name: string, yaml: string) => api<SemanticModel>("PUT", `/api/projects/${encodeURIComponent(name)}/semantic`, { yaml });
export const queryMetrics = (name: string, q: MetricQuery) => api<MetricAnswer>("POST", `/api/projects/${encodeURIComponent(name)}/semantic/query`, q);
