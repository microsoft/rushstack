# TLS Sync VS Code Extension Pack

## Sync Process

The workspace and UI extensions work together to use `@rushstack/debug-certificate-manager` to manage TLS certificates. The UI extension manages the machine where the VS Code client is running, while the Workspace extension manages the remote workspace (WSL, Codespaces, Devcontainers, VS Code Tunnels).

Both the UI and Workspace extensions must be installed for the sync process to work.

1. VS Code activates the UI extension if `.tlssync` file is present in the workspace or if the user runs the Sync command.
2. The UI extension checks if the Workspace extension is available.
3. If the Workspace extension is available, it ensures that valid certificates are present in the local certificate store. If not, it generates a new certificate and stores it in the local certificate store.
4. The UI extension then sends the certificate to the Workspace extension.

The certificate store paths and the file names can be configured in the VS Code settings. Run the `TLS Sync: Show Settings` command to view and modify the configuration.

## Extensions

- [TLS Sync VS Code (UI Extension)](../tls-sync-vscode-ui-extension)
- [TLS Sync VS Code (Workspace Extension)](../tls-sync-vscode-extension-pack)
