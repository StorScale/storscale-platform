package main

import (
	"net/url"
	"slices"
)

// A tool is one of the platform's applications, as the web app shows it.
type tool struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	Section     string `json:"section"` // "work" or "admin"
	// URL opens the tool in a tab of its own; EmbedURL loads it in the
	// platform's frame, signing in with Keycloak on the way (no form: the
	// person already has a Keycloak session). Empty: the tool isn't embedded.
	URL      string `json:"url"`
	EmbedURL string `json:"embedUrl,omitempty"`
}

// toolsFor lists the tools a person in these groups may open. Each tool also
// checks for itself: this is what to show, not what's allowed.
func toolsFor(platformURL string, groups []string, adminGroups []string) []tool {
	u, err := url.Parse(platformURL)
	if err != nil {
		return nil
	}
	at := func(sub, path string) string {
		v := *u
		v.Host = sub + "." + u.Host
		v.Path = path
		return v.String()
	}
	tools := []tool{
		{ID: "notebooks", Name: "Notebooks", Section: "work",
			Description: "JupyterLab, in a notebook server of your own, with your own Buckets credentials.",
			URL:         at("notebooks", "/hub/"), EmbedURL: at("notebooks", "/hub/oauth_login") + "?next=%2Fhub%2Fspawn"},
		{ID: "sql", Name: "SQL", Section: "work",
			Description: "SQL Lab: query the lakehouse in Trino, as yourself.",
			URL:         at("dashboards", "/sqllab/"), EmbedURL: at("dashboards", "/login/keycloak") + "?next=%2Fsqllab%2F"},
		{ID: "dashboards", Name: "Dashboards", Section: "work",
			Description: "Superset's dashboards and charts.",
			URL:         at("dashboards", "/dashboard/list/"), EmbedURL: at("dashboards", "/login/keycloak") + "?next=%2Fdashboard%2Flist%2F"},
		{ID: "pipelines", Name: "Pipelines", Section: "work",
			Description: "Airflow: pipelines, their runs and their logs.",
			URL:         at("pipelines", "/"), EmbedURL: at("pipelines", "/auth/login/keycloak") + "?next=%2F"},
		{ID: "catalog", Name: "Catalog", Section: "work",
			Description: "OpenMetadata: every table and column, their lineage, and their checks.",
			// In a tab of its own, through the gateway's launcher, which starts
			// OpenMetadata's service worker (where its app keeps its token) and
			// then its Keycloak sign-in (stack/gateway/catalog/launch.html).
			// The project's Flow view shows its lineage and checks in the platform.
			URL: at("catalog", "/_storscale/launch.html")},
		{ID: "monitoring", Name: "Monitoring", Section: "work",
			Description: "Grafana: the storage's dashboards and alerts.",
			URL:         at("monitoring", "/"), EmbedURL: at("monitoring", "/login/generic_oauth")},
	}
	if slices.ContainsFunc(groups, func(g string) bool { return slices.Contains(adminGroups, g) }) {
		tools = append(tools, tool{ID: "access", Name: "Access policies", Section: "admin",
			Description: "Apache Ranger: who may query what. Sign in with Ranger's admin account.",
			URL:         at("access", "/")})
	}
	return tools
}
