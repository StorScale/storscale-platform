# platformd and the platform's web app, and platform-operator, in one image.
#
#   docker build -f docker/platformd.Dockerfile -t storscale/platformd .

FROM node:24-bookworm-slim AS web
WORKDIR /src/web
COPY web/package.json web/package-lock.json ./
RUN npm ci --no-fund --no-audit
COPY web/ ./
RUN npm run build

FROM golang:1.26-bookworm AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/ ./cmd/platformd ./cmd/platform-operator

FROM gcr.io/distroless/static-debian13:nonroot
COPY --from=build /out/platformd /out/platform-operator /usr/bin/
COPY --from=web /src/web/dist /usr/share/storscale/web
EXPOSE 8080
ENTRYPOINT ["/usr/bin/platformd"]
