<p align="center">
  <img alt="FuseScope" src=".github/brand/fusescope-logo-universal.svg" width="440">
</p>

<h1 align="center">FuseScope SDK</h1>

<p align="center">
  <b>OpenTelemetry-based SDKs that send Real User Monitoring data to FuseScope.</b>
</p>

<p align="center">
  <a href="https://docs.fusescope.fuseone.io/frontend/real-user-monitoring/">Docs</a> ·
  <a href="https://www.npmjs.com/package/@fusescope/browser">npm</a> ·
  <a href="LICENSE"><img alt="License: Apache-2.0" src="https://img.shields.io/badge/license-Apache--2.0-0f5fb8"></a>
  <a href="https://github.com/fuseone-io/fusescope-sdk/issues"><img alt="GitHub issues" src="https://img.shields.io/github/issues/fuseone-io/fusescope-sdk?color=950fb8"></a>
</p>

FuseScope's client SDK distributions: thin, tested packages over [OpenTelemetry](https://opentelemetry.io/)
that send Real User Monitoring data to [FuseScope](https://github.com/fuseone-io/fusescope). They are
homologated, not mandatory: FuseScope accepts any OTLP client.

| Package | Status |
|---|---|
| [`@fusescope/browser`](packages/browser) | 0.2 beta, npm and script tag (CDN) |
| [`@fusescope/cli`](packages/cli) | 0.1 beta: `fusescope sourcemaps upload` |
| [`@fusescope/browser-react`](packages/browser-react) | 0.1 beta: React Router view patterns, error boundary |

Design: [ADR 0003 · Real User Monitoring](https://github.com/fuseone-io/fusescope/blob/main/docs/adr/0003-real-user-monitoring.md).

## Development

pnpm workspace; Node 22 and `npx -y pnpm@10`. See [packages/browser](packages/browser#contributing).
Releases are cut per package from the `release` workflow (`package` input).

Licensed under [Apache-2.0](LICENSE); see [NOTICE](NOTICE).
