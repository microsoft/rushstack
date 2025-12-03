# Debug Certificate Manager VS Code Extension

VS Code extension to manage debug TLS certificates and sync them to the VS Code workspace. Works with VS Code remote development (Codespaces, SSH, Dev Containers, WSL, VS Code Tunnels).

## Sync Process

The Debug Certificate Manager extension uses `@rushstack/debug-certificate-manager` to manage TLS certificates. It can also be used to sync certificates when connected to a VS Code remote workspace (WSL, Codespaces, Devcontainers, VS Code Tunnels).

The extension reads `.vscode/debug-certificate-manager.json` for the certificate store path. When present, the extension will auto-activate and attempt to sync the certificates to the remote workspace.

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


```json
{
  "storePath": "workspace/relative/path",
  "keyFilename": "private-key.pem",
  "certificateFilename": "certificate.pem",
  "caCertificateFilename": "ca-certificate.pem"
}
```
