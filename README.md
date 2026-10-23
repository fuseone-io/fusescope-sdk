# FuseScope SDK

FuseScope's client SDK distributions: thin, tested packages over [OpenTelemetry](https://opentelemetry.io/)
that send Real User Monitoring data to [FuseScope](https://github.com/fuseone-io/fusescope). They are
homologated, not mandatory: FuseScope accepts any OTLP client.

| Package | Status |
|---|---|
| [`@fusescope/browser`](packages/browser) | 0.1, npm |
| [`@fusescope/cli`](packages/cli) | 0.1 beta: `fusescope sourcemaps upload` |
| `@fusescope/browser-react` | planned: router integration, error boundary |

Design: [ADR 0003 · Real User Monitoring](https://github.com/fuseone-io/fusescope/blob/main/docs/adr/0003-real-user-monitoring.md).

## Development

pnpm workspace; Node 22 and `npx -y pnpm@10`. See [packages/browser](packages/browser#contributing).
Releases are cut per package from the `release` workflow (`package` input).

Licensed under [Apache-2.0](LICENSE); see [NOTICE](NOTICE).
