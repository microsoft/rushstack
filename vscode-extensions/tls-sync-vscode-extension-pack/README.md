# TLS Sync VS Code Extension Pack

## Sync Process

The workspace and UI extensions work together to use `@rushstack/debug-certificate-manager` to manage TLS certificates. The UI extension manages the machine where the VS Code client is running, while the Workspace extension manages the remote workspace (WSL, Codespaces, Devcontainers, VS Code Tunnels).

Both the UI and Workspace extensions must be installed for the sync process to work.

1. VS Code activates the workspace extension if `.tlssync` file is present in the workspace or if the user runs the Sync command.
2. The Workspace extension checks if the UI extension is available.
3. If the UI extension is available, it requests the debug certificate from the UI extension.
4. The UI extension checks if there are any existing valid certificates. If not, it generates a new certificate.
5. The UI extension returns the certificate to the Workspace extension.
6. The Workspace extension compares the certificate with the existing one in the remote workspace and updates it if necessary.

The certificate store paths and the file names can be configured in the VS Code settings. Run the `TLS Sync: Show Settings` command to view and modify the configuration.

## Extensions

- [TLS Sync VS Code (UI Extension)](../tls-sync-vscode-ui-extension)
- [TLS Sync VS Code (Workspace Extension)](../tls-sync-vscode-extension-pack)
