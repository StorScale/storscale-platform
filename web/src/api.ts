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
  | { state: "signed-in"; user: User; tools: Tool[] }
  | { state: "refused"; user: User; error: string };

// session is null when nobody is signed in.
export async function session(): Promise<Session | null> {
  const res = await fetch("/api/session", { headers: { "X-Platform-Request": "1" } });
  if (res.status === 401) return null;
  const body = await res.json();
  if (res.status === 403) return { state: "refused", user: body.user, error: body.error };
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
  return { state: "signed-in", user: body.user, tools: body.tools };
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
