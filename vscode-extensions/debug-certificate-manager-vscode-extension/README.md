# Debug Certificate Manager VS Code Extension

## Sync Process

The Debug Certificate Manager extension uses `@rushstack/debug-certificate-manager` to manage TLS certificates. It can also be used to sync certificates when connected to a VS Code remote workspace (WSL, Codespaces, Devcontainers, VS Code Tunnels).

The extension reads `.vscode/debug-certificate-manager.json` for the certificate store path. When present, the extension will auto-activate and attempt to sync the certificates to the remote workspace.
