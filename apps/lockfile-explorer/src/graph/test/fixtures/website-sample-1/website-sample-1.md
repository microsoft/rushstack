# fixtures/website-sample-1

This test fixture uses the `demos/sample-1` branch from the Lockfile Explorer website demos repistory:

https://github.com/microsoft/lockfile-explorer-demos/tree/demo/sample-1

There are three versions of the lockfile:


- `pnpm-lock-rush-5.4.yaml`: The old 5.4 YAML format generated using PNPM 7.16.1 and Rush 5.83.3 from [`ee8a06e`](https://github.com/microsoft/lockfile-explorer-demos/commit/ee8a06e71b63feb806f240de01e57d42854d02af).
- `pnpm-lock-rush-6.0.yaml`: The 6.0 YAML format generated using PNPM 8.15.9 and Rush 5.158.1 from [`8c3ad3c`](https://github.com/microsoft/lockfile-explorer-demos/commit/8c3ad3cad68a921baa4eb6d264d293e928a962f5)
- `pnpm-lock-pnpm-9.0.yaml`: For comparison, a lockfile generated using a PNPM 9.15.9 with a plain PNPM workspace (without Rush).  Rush doesn't support this format yet.
