package main

import (
	"io"
	"net/http"
	"slices"
	"sort"

	"github.com/StorScale/storscale-platform/internal/project"
)

// A projectView is a project as the web app shows it: its spec, what the
// operator last did with it, and the viewer's own role in it.
type projectView struct {
	Name   string           `json:"name"`
	Spec   *project.Project `json:"spec,omitempty"` // nil while it's being deleted
	Status *project.Status  `json:"status,omitempty"`
	Role   string           `json:"role,omitempty"` // the viewer's: reader, editor, or ""
}

func (s *server) isAdmin(u user) bool {
	return slices.ContainsFunc(u.Groups, func(g string) bool { return slices.Contains(s.cfg.AdminGroups, g) })
}

// signedIn is the session of someone allowed in, or writes the refusal.
func (s *server) signedIn(w http.ResponseWriter, r *http.Request) *session {
	sess := s.session(r)
	switch {
	case sess == nil:
		writeJSON(w, http.StatusUnauthorized, map[string]string{"login": "/auth/login"})
	case !s.allowed(sess.User.Groups):
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "no access"})
	case s.store == nil:
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "projects aren't set up (no STORE_URL)"})
	default:
		return sess
	}
	return nil
}

// admin is signedIn, for administrators' changes (with the request header that
// a cross-site form can't send).
func (s *server) admin(w http.ResponseWriter, r *http.Request) *session {
	sess := s.signedIn(w, r)
	if sess == nil {
		return nil
	}
	if r.Header.Get("X-Platform-Request") != "1" {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "missing X-Platform-Request"})
		return nil
	}
	if !s.isAdmin(sess.User) {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "only administrators change projects"})
		return nil
	}
	return sess
}

// views are the projects the user may see: all of them for administrators,
// otherwise the ones they're a member of.
func (s *server) views(r *http.Request, u user) ([]projectView, error) {
	specs, err := s.store.Projects(r.Context())
	if err != nil {
		return nil, err
	}
	statuses, err := s.store.Statuses(r.Context())
	if err != nil {
		return nil, err
	}
	byName := map[string]*projectView{}
	for _, p := range specs {
		byName[p.Metadata.Name] = &projectView{Name: p.Metadata.Name, Spec: p}
	}
	for _, st := range statuses {
		v := byName[st.Name]
		if v == nil {
			v = &projectView{Name: st.Name}
			byName[st.Name] = v
		}
		v.Status = st
		for _, m := range st.Members {
			if m.Username == u.Username && m.Role != "pipelines" {
				v.Role = m.Role
			}
		}
	}
	admin := s.isAdmin(u)
	var out []projectView
	for _, v := range byName {
		if admin || v.Role != "" {
			out = append(out, *v)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	return out, nil
}

func (s *server) handleProjects(w http.ResponseWriter, r *http.Request) {
	sess := s.signedIn(w, r)
	if sess == nil {
		return
	}
	views, err := s.views(r, sess.User)
	if err != nil {
		s.log.Error("projects", "error", err)
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": "the project store isn't answering"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"projects": views, "admin": s.isAdmin(sess.User)})
}

func (s *server) handleProject(w http.ResponseWriter, r *http.Request) {
	sess := s.signedIn(w, r)
	if sess == nil {
		return
	}
	views, err := s.views(r, sess.User)
	if err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": "the project store isn't answering"})
		return
	}
	for _, v := range views {
		if v.Name == r.PathValue("name") {
			writeJSON(w, http.StatusOK, v)
			return
		}
	}
	writeJSON(w, http.StatusNotFound, map[string]string{"error": "no such project"})
}

// handlePutProject creates or changes a project. The operator applies it.
func (s *server) handlePutProject(w http.ResponseWriter, r *http.Request) {
	sess := s.admin(w, r)
	if sess == nil {
		return
	}
	body, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	p, err := project.Parse(body)
	if err == nil && p.Metadata.Name != r.PathValue("name") {
		err = errorString("the project's name must be " + r.PathValue("name"))
	}
	if err != nil {
		writeJSON(w, http.StatusUnprocessableEntity, map[string]string{"error": err.Error()})
		return
	}
	if err := s.store.PutProject(r.Context(), p); err != nil {
		s.log.Error("saving a project", "project", p.Metadata.Name, "error", err)
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": "the project store isn't answering"})
		return
	}
	s.log.Info("project saved", "project", p.Metadata.Name, "by", sess.User.Username)
	writeJSON(w, http.StatusOK, projectView{Name: p.Metadata.Name, Spec: p})
}

func (s *server) handleDeleteProject(w http.ResponseWriter, r *http.Request) {
	sess := s.admin(w, r)
	if sess == nil {
		return
	}
	name := r.PathValue("name")
	p, err := s.store.Project(r.Context(), name)
	if err == nil && p == nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "no such project"})
		return
	}
	if err == nil {
		err = s.store.DeleteProject(r.Context(), name)
	}
	if err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": "the project store isn't answering"})
		return
	}
	s.log.Info("project deleted", "project", name, "by", sess.User.Username)
	w.WriteHeader(http.StatusNoContent)
}

// handleAccess is who has which role in which project (administrators only).
func (s *server) handleAccess(w http.ResponseWriter, r *http.Request) {
	sess := s.signedIn(w, r)
	if sess == nil {
		return
	}
	if !s.isAdmin(sess.User) {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "only administrators review access"})
		return
	}
	views, err := s.views(r, sess.User)
	if err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": "the project store isn't answering"})
		return
	}
	type person struct {
		Username string            `json:"username"`
		Roles    map[string]string `json:"roles"` // project -> role
		Via      map[string]string `json:"via"`   // project -> group
	}
	byName := map[string]*person{}
	var projects []string
	for _, v := range views {
		projects = append(projects, v.Name)
		if v.Status == nil {
			continue
		}
		for _, m := range v.Status.Members {
			p := byName[m.Username]
			if p == nil {
				p = &person{Username: m.Username, Roles: map[string]string{}, Via: map[string]string{}}
				byName[m.Username] = p
			}
			p.Roles[v.Name], p.Via[v.Name] = m.Role, m.Via
		}
	}
	people := make([]*person, 0, len(byName))
	for _, p := range byName {
		people = append(people, p)
	}
	sort.Slice(people, func(i, j int) bool { return people[i].Username < people[j].Username })
	writeJSON(w, http.StatusOK, map[string]any{"projects": projects, "people": people})
}

type errorString string

func (e errorString) Error() string { return string(e) }
