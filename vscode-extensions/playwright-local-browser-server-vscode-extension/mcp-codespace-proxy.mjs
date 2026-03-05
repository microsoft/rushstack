#!/usr/bin/env node

// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// MCP Codespace Proxy
//
// This script runs on the codespace side. It is configured as an MCP server
// in the MCP client's config (e.g., Claude Code, Cursor, etc.) using stdio transport.
//
// It opens a TCP port that the local VS Code extension connects to via port forwarding.
// Once the extension connects, it bridges the MCP client's stdin/stdout to the TCP
// connection, which the extension bridges to a locally-running @playwright/mcp server.
//
// Architecture:
//   [MCP Client] → stdio → [this proxy] → TCP port ↕ (VS Code port forwarding) ↕ [Extension] → [local MCP server]
//
// Usage:
//   node mcp-codespace-proxy.mjs [port]
//   Default port: 56768
//
// MCP client configuration example (e.g., in .claude/settings.json or similar):
//   {
//     "mcpServers": {
//       "playwright": {
//         "command": "node",
//         "args": ["/path/to/mcp-codespace-proxy.mjs", "56768"]
//       }
//     }
//   }

import * as net from 'node:net';
import * as readline from 'node:readline';

const port = parseInt(process.argv[2] || '56768', 10);

if (isNaN(port) || port < 1 || port > 65535) {
  process.stderr.write('Error: Invalid port number. Must be between 1 and 65535.\n');
  process.exit(1);
}

/** @type {net.Socket | null} */
let extensionSocket = null;

/** @type {string[]} */
const bufferedMessages = [];

const server = net.createServer((socket) => {
  if (extensionSocket) {
    process.stderr.write('MCP proxy: Replacing existing extension connection\n');
    extensionSocket.destroy();
    extensionSocket = null;
  }

  extensionSocket = socket;
  process.stderr.write('MCP proxy: Extension connected\n');

  // Flush any buffered messages from the MCP client
  for (const msg of bufferedMessages) {
    socket.write(msg + '\n');
  }
  bufferedMessages.length = 0;

  // Extension → stdout (MCP responses back to the MCP client)
  const socketReader = readline.createInterface({ input: socket });
  socketReader.on('line', (line) => {
    process.stdout.write(line + '\n');
  });

  socket.on('close', () => {
    process.stderr.write('MCP proxy: Extension disconnected\n');
    extensionSocket = null;
  });

  socket.on('error', (err) => {
    process.stderr.write(`MCP proxy: Socket error: ${err.message}\n`);
    extensionSocket = null;
  });
});

server.listen(port, '0.0.0.0', () => {
  process.stderr.write(`MCP proxy: Listening on port ${port}\n`);
});

// stdin → extension socket (MCP requests from the MCP client)
const stdinReader = readline.createInterface({ input: process.stdin });
stdinReader.on('line', (line) => {
  if (extensionSocket && !extensionSocket.destroyed) {
    extensionSocket.write(line + '\n');
  } else {
    // Buffer messages until the extension connects
    bufferedMessages.push(line);
  }
});

stdinReader.on('close', () => {
  // MCP client closed stdin, shut down
  process.stderr.write('MCP proxy: stdin closed, shutting down\n');
  if (extensionSocket) {
    extensionSocket.destroy();
  }
  server.close();
});

server.on('error', (err) => {
  process.stderr.write(`MCP proxy: Server error: ${err.message}\n`);
  process.exit(1);
});
