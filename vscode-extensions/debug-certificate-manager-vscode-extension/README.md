# Debug Certificate Manager VS Code Extension

VS Code extension to manage debug TLS certificates and sync them to the VS Code workspace. Works with VS Code remote development (Codespaces, SSH, Dev Containers, WSL, VS Code Tunnels).

## Sync Process

The Debug Certificate Manager extension uses `@rushstack/debug-certificate-manager` to manage TLS certificates. It can also be used to sync certificates when connected to a VS Code remote workspace (WSL, Codespaces, Devcontainers, VS Code Tunnels).

The extension reads `.vscode/debug-certificate-manager.json` for the destination certificate store path. If the file is missing, it syncs to `~/.rushstack` using the default certificate filenames. The destination directory is created if necessary. Other read errors and invalid JSON abort synchronization and display an error notification.

The extension activates automatically. When `debugCertificateManager.autoSync` is enabled (the default), it attempts to sync on activation, even without a workspace configuration file.

For remote workspaces, `~` refers to the remote user's home directory, not the local machine's. The extension resolves it by running Node.js in a workspace terminal unless `debugCertificateManager.homeDirectory` is configured.

## Configuration

### VS Code Settings

```json
{
  "debugCertificateManager.autoSync": true,
  "debugCertificateManager.keyFilename": "private-key.pem",
  "debugCertificateManager.certificateFilename": "certificate.pem",
  "debugCertificateManager.caCertificateFilename": "ca-certificate.pem",
  "debugCertificateManager.storePath.windows": "C:\\path\\to\\store",
  "debugCertificateManager.storePath.linux": "/path/to/store",
  "debugCertificateManager.storePath.osx": "/path/to/store"
}
```

### Workspace configuration

Optionally create `.vscode/debug-certificate-manager.json` to override the destination. `storePath` can be workspace-relative, absolute, or start with `~`:

```json
{
  "storePath": "workspace/relative/path",
  "keyFilename": "private-key.pem",
  "certificateFilename": "certificate.pem",
  "caCertificateFilename": "ca-certificate.pem"
}
```

To work around older extension versions failing when this file is missing, create it with:

```json
{
  "storePath": "~/.rushstack"
}
```

Then run **Debug Certificate Manager: Ensure and Sync TLS Certificates** again. If the remote terminal cannot find Node.js, use an absolute `storePath` or configure `debugCertificateManager.homeDirectory` in your user settings.
