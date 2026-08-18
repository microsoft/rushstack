# @rushstack/rush-daemon

The long-lived Rush workspace daemon host, including workspace-keyed listener bootstrap,
protocol handshake and liveness control, and explicit serve/shutdown lifecycle APIs.

The host is available from the opt-in `rushd` command. It does not change the default behavior of
`rush`, `rushx`, or `rush-pnpm`.
