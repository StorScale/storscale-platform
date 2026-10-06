# platformd and the platform's web app, in one image.
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
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/platformd ./cmd/platformd

FROM gcr.io/distroless/static-debian13:nonroot
COPY --from=build /out/platformd /usr/bin/platformd
COPY --from=web /src/web/dist /usr/share/storscale/web
EXPOSE 8080
ENTRYPOINT ["/usr/bin/platformd"]
