// Package platform holds what the storscale command ships: the platform's
// stack (stack/, run with Docker Compose) and its version.
package platform

import (
	"embed"
	"strings"
)

// Stack is the stack/ directory: compose.yaml, its .env, and the files its
// services mount and build.
//
//go:embed stack stack/.env
var Stack embed.FS

//go:embed VERSION
var version string

// Version is the platform's version, from VERSION.
func Version() string { return strings.TrimSpace(version) }
