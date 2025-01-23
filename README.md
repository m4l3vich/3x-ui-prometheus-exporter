# 3X-UI Prometheus Exporter

[![Typescript](https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white)](https://www.typescriptlang.org/) [![Docker Hub](https://img.shields.io/badge/Docker-0db7ed?logo=docker&logoColor=white)](https://hub.docker.com/r/m4l3vich/3x-ui-prometheus-exporter) [![JavaScript Style Guide](https://img.shields.io/badge/code_style-standard-brightgreen.svg)](https://standardjs.com) [![Docker Image Size](https://img.shields.io/docker/image-size/m4l3vich/3x-ui-prometheus-exporter)](https://hub.docker.com/r/m4l3vich/3x-ui-prometheus-exporter)

[На русском](README_RU.md)

This software exports traffic usage stats from 3X-UI to Prometheus, so you can monitor every client's usage of VPN traffic and online times.

## Available metrics (example response)

```
# HELP down_bytes_total Bytes sent to the peer
# TYPE down_bytes_total counter
down_bytes_total{email="somebody"} 123456789
down_bytes_total{email="somebody_else"} 987654321

# HELP up_bytes_total Bytes received from the peer
# TYPE up_bytes_total counter
up_bytes_total{email="somebody"} 123456789
up_bytes_total{email="somebody_else"} 987654321

# HELP is_online Is the peer online
# TYPE is_online gauge
is_online{email="somebody"} 1
is_online{email="somebody_else"} 0
```

## Running using Docker (recommended)

`linux/amd64` and `linux/arm64` builds are available.

```
docker run --name exporter -p 3000:3000 m4l3vich/3x-ui-prometheus-exporter
```

Metrics will be available at **http://localhost:3000/metrics**

Required environment variables:

| Variable         | Description                          | Example                    |
| ---------------- | ------------------------------------ | -------------------------- |
| **XUI_ORIGIN**   | 3X-UI panel URL                      | https://example.org/3x-ui/ |
| **XUI_USERNAME** | Username for logging in to the panel | somebody                   |
| **XUI_PASSWORD** | Password for logging in to the panel | somepassword               |

Optional environment variables:

| Variable             | Description                                          | When to use                                                  |
| -------------------- | ---------------------------------------------------- | ------------------------------------------------------------ |
| **XUI_LOGIN_SECRET** | Additional secret string for logging in to the panel | If such secret was set in the panel's settings               |
| **XUI_BASIC_AUTH**   | username:password pair for the web server            | If the web server (e.g. reverse proxy) requires HTTP Basic Auth to access the panel |

## Running locally

You will need latest [Node.js LTS](https://nodejs.org/en/download) and [PNPM](https://pnpm.io/installation).

1. Clone this repo: `git clone https://github.com/m4l3vich/3x-ui-prometheus-exporter; cd 3x-ui-prometheus-exporter`
2. Install dependencies: `pnpm install`
3. Build the app: `pnpm build`
4. Create a `.env` file with all the environment variables
5. Run the app: `pnpm start` or `node build/index.js`
