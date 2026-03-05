// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as child_process from 'node:child_process';
import * as net from 'node:net';
import * as readline from 'node:readline';

import type { ITerminal } from '@rushstack/terminal';
import type { TunnelStatus } from '@rushstack/playwright-browser-tunnel';

const POLL_INTERVAL_MS: number = 2000;

export interface IMcpTunnelOptions {
  port: number;
  mcpCommand: string;
  terminal: ITerminal;
  onStatusChange: (status: TunnelStatus) => void;
}

/**
 * MCP Tunnel mode: starts a local MCP server (e.g. @playwright/mcp) and bridges
 * it to a TCP proxy running on the codespace side via VS Code port forwarding.
 *
 * Architecture:
 *   [MCP Client on codespace] → stdio → [mcp-codespace-proxy.mjs] → TCP port
 *       ↕ (VS Code port forwarding)
 *   [McpTunnel in extension] → TCP → [spawned @playwright/mcp process] → stdio
 */
export class McpTunnel {
  private _options: IMcpTunnelOptions;
  private _mcpProcess: child_process.ChildProcess | undefined;
  private _socket: net.Socket | undefined;
  private _stopped: boolean = false;
  private _pollTimer: ReturnType<typeof setTimeout> | undefined;

  public constructor(options: IMcpTunnelOptions) {
    this._options = options;
  }

  public async startAsync(): Promise<void> {
    this._stopped = false;
    this._options.onStatusChange('waiting-for-connection');
    this._options.terminal.writeLine(
      `MCP Tunnel: Polling for codespace proxy connection on 127.0.0.1:${this._options.port}...`
    );

    this._pollForConnection();
  }

  private _pollForConnection(): void {
    if (this._stopped) {
      return;
    }

    const socket: net.Socket = net.createConnection({ host: '127.0.0.1', port: this._options.port }, () => {
      this._socket = socket;
      this._options.terminal.writeLine('MCP Tunnel: Connected to codespace proxy');
      this._options.onStatusChange('setting-up-browser-server');
      this._bridge(socket);
    });

    socket.on('error', () => {
      // Connection failed, retry after delay
      socket.destroy();
      if (!this._stopped) {
        this._pollTimer = setTimeout(() => this._pollForConnection(), POLL_INTERVAL_MS);
      }
    });
  }

  private _bridge(socket: net.Socket): void {
    const { mcpCommand, terminal, onStatusChange } = this._options;

    terminal.writeLine(`MCP Tunnel: Spawning MCP server: ${mcpCommand}`);

    // On Windows, pass the entire command as a single string with shell: true
    // so that cmd.exe handles parsing. Splitting on whitespace would mangle
    // file paths containing spaces or backslashes.
    const mcpProcess: child_process.ChildProcess = child_process.spawn(mcpCommand, {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      shell: true
    });

    this._mcpProcess = mcpProcess;

    let cleanedUp: boolean = false;
    const cleanup: () => void = () => {
      if (cleanedUp) {
        return;
      }
      cleanedUp = true;

      if (!socket.destroyed) {
        socket.destroy();
      }
      if (mcpProcess.exitCode === null && mcpProcess.signalCode === null) {
        mcpProcess.kill();
      }

      this._mcpProcess = undefined;
      this._socket = undefined;

      if (!this._stopped) {
        terminal.writeLine('MCP Tunnel: Connection lost, will reconnect...');
        onStatusChange('waiting-for-connection');
        this._pollTimer = setTimeout(() => this._pollForConnection(), POLL_INTERVAL_MS);
      }
    };

    mcpProcess.on('error', (err: Error) => {
      terminal.writeErrorLine(`MCP Tunnel: MCP process error: ${err.message}`);
      onStatusChange('error');
      cleanup();
    });

    mcpProcess.on('exit', (code: number | null) => {
      terminal.writeLine(`MCP Tunnel: MCP process exited with code ${code}`);
      cleanup();
    });

    socket.on('close', () => {
      terminal.writeLine('MCP Tunnel: Proxy socket closed');
      cleanup();
    });

    socket.on('error', (err: Error) => {
      terminal.writeErrorLine(`MCP Tunnel: Socket error: ${err.message}`);
      cleanup();
    });

    // Bridge: proxy socket → MCP process stdin
    const socketReader: readline.Interface = readline.createInterface({ input: socket });
    socketReader.on('line', (line: string) => {
      if (mcpProcess.stdin && !mcpProcess.stdin.destroyed) {
        mcpProcess.stdin.write(line + '\n');
      }
    });

    // Bridge: MCP process stdout → proxy socket
    if (mcpProcess.stdout) {
      const stdoutReader: readline.Interface = readline.createInterface({ input: mcpProcess.stdout });
      stdoutReader.on('line', (line: string) => {
        if (!socket.destroyed) {
          socket.write(line + '\n');
        }
      });
    }

    // Log MCP process stderr
    if (mcpProcess.stderr) {
      const stderrReader: readline.Interface = readline.createInterface({ input: mcpProcess.stderr });
      stderrReader.on('line', (line: string) => {
        terminal.writeLine(`MCP server: ${line}`);
      });
    }

    onStatusChange('browser-server-running');
    terminal.writeLine('MCP Tunnel: Bridge established, MCP server is running');
  }

  public async stopAsync(): Promise<void> {
    this._stopped = true;

    if (this._pollTimer) {
      clearTimeout(this._pollTimer);
      this._pollTimer = undefined;
    }

    if (this._mcpProcess && this._mcpProcess.exitCode === null && this._mcpProcess.signalCode === null) {
      this._mcpProcess.kill();
      this._mcpProcess = undefined;
    }

    if (this._socket && !this._socket.destroyed) {
      this._socket.destroy();
      this._socket = undefined;
    }

    this._options.terminal.writeLine('MCP Tunnel: Stopped');
    this._options.onStatusChange('stopped');
  }
}
