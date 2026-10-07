{{/* An image built from this repository. */}}
{{- define "storscale.image" -}}
{{- $root := index . 0 -}}{{- $name := index . 1 -}}
{{ $root.Values.images.registry }}/{{ index $root.Values.images $name }}:{{ $root.Values.images.tag | default $root.Chart.AppVersion }}
{{- end }}

{{/* The platform's address, and its tools' addresses. */}}
{{- define "storscale.url" -}}
{{ .Values.global.scheme }}://{{ .Values.global.domain }}:{{ .Values.global.port }}
{{- end }}
{{- define "storscale.subURL" -}}
{{- $root := index . 0 -}}{{ $root.Values.global.scheme }}://{{ index . 1 }}.{{ $root.Values.global.domain }}:{{ $root.Values.global.port }}
{{- end }}

{{- define "storscale.labels" -}}
app.kubernetes.io/part-of: storscale-platform
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version }}
{{- end }}

{{- define "storscale.selector" -}}
app.kubernetes.io/instance: {{ index . 0 }}
app.kubernetes.io/name: {{ index . 1 }}
{{- end }}

{{/* What Compose's env_file (.env) and x-urls give a service. */}}
{{- define "storscale.envFrom" -}}
envFrom:
  - secretRef: {name: storscale-env}
  - configMapRef: {name: storscale-config}
{{- end }}

{{/* A directory of the stack's files, as a ConfigMap: ConfigMaps hold no
     directories, so a file's path is its key with "/" as "__", and the
     volume (storscale.filesVolume) puts each file back at its path. */}}
{{- define "storscale.filesConfigMap" -}}
{{- $root := index . 0 -}}{{- $name := index . 1 -}}{{- $dir := index . 2 -}}
apiVersion: v1
kind: ConfigMap
metadata:
  name: files-{{ $name }}
  labels: {{- include "storscale.labels" $root | nindent 4 }}
data:
{{- range $path, $_ := $root.Files.Glob (printf "files/%s/**" $dir) }}
{{- $rel := trimPrefix (printf "files/%s/" $dir) $path }}
{{- if not (or (contains "__pycache__" $rel) (hasSuffix ".pyc" $rel)) }}
  {{ $rel | replace "/" "__" }}: {{ $root.Files.Get $path | quote }}
{{- end }}
{{- end }}
{{- end }}

{{- define "storscale.filesVolume" -}}
{{- $root := index . 0 -}}{{- $name := index . 1 -}}{{- $dir := index . 2 -}}
- name: files-{{ $name }}
  configMap:
    name: files-{{ $name }}
    items:
{{- range $path, $_ := $root.Files.Glob (printf "files/%s/**" $dir) }}
{{- $rel := trimPrefix (printf "files/%s/" $dir) $path }}
{{- if not (or (contains "__pycache__" $rel) (hasSuffix ".pyc" $rel)) }}
      - {key: {{ $rel | replace "/" "__" | quote }}, path: {{ $rel | quote }}}
{{- end }}
{{- end }}
{{- end }}

{{/* Wait, before a service starts, as Compose's depends_on does:
       url <url>             until it answers 2xx
       job <name>            until the setup step <name> of this release has finished
       secret <name> <key>   until a Secret has the key
     (stack/tools/wait.py) */}}
{{- define "storscale.wait" -}}
{{- $root := index . 0 -}}{{- $name := index . 1 -}}{{- $args := index . 2 -}}
- name: wait-{{ $name }}
  image: {{ include "storscale.image" (list $root "tools") }}
  imagePullPolicy: {{ $root.Values.images.pullPolicy }}
  command: ["python", "-u", "/tools/wait.py"]
  args: {{ toJson $args }}
  env:
    - {name: STORSCALE_REVISION, value: {{ $root.Release.Revision | quote }}}
  volumeMounts:
    - {name: files-tools, mountPath: /tools}
  resources:
    requests: {cpu: 10m, memory: 32Mi}
{{- end }}

{{/* Resources: what a service asks for, and the most memory it may use. */}}
{{- define "storscale.resources" -}}
resources:
  requests: {cpu: {{ index . 0 }}, memory: {{ index . 1 }}}
  limits: {memory: {{ index . 2 }}}
{{- end }}
