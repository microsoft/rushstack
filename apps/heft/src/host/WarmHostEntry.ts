import '../bootstrap/enableStartupCaches';

import * as fs from 'node:fs';
import * as net from 'node:net';
import * as path from 'node:path';

import { CapturedOutputWorker } from './CapturedOutputWorker';
import { handleWarmHostConnection, type IWarmHostContext } from './warmHostRun';
import {
  getCapturePipePaths,
  isFolderPrivateToCurrentUser,
  openCapturePipesForReading,
  parseWarmHostArguments,
  removeCapturePipes,
  startWarmHostProcess,
  type ICapturePipesOfThisHost,
  type IWarmHostArguments
} from './warmHostProcess';

const DEFAULT_IDLE_TIMEOUT_MILLISECONDS: number = 900000;
const PRELOADED_MODULES_AND_THEIR_LAZY_EXPORTS: ReadonlyArray<readonly [string, ReadonlyArray<string>]> = [
  ['./HostCommandLine', []],
  ['../cli/HeftActionRunner', []],
  ['../cli/actions/PhaseScoping', []],
  ['../cli/CliConstants', []],
  ['../operations/generateOperations', []],
  ['../operations/OperationExecutionManager', []],
  ['../pluginFramework/HeftPhaseSession', []],
  ['../pluginFramework/HeftTaskSession', []],
  ['../pluginFramework/logging/ScopedLogger', []],
  ['@rushstack/heft-config-file/lib/ConfigurationFileAnnotation', []],
  ['@rushstack/node-core-library', ['AlreadyReportedError', 'Async', 'InternalError', 'Text']],
  ['@rushstack/terminal', ['Colorize', 'ConsoleTerminalProvider', 'PrefixProxyTerminalProvider', 'Terminal']],
  ['tapable/lib/AsyncParallelHook', []],
  ['tapable/lib/AsyncSeriesWaterfallHook', []],
  ['tapable/lib/SyncHook', []]
];

function preloadHostModules(): void {
  for (const [moduleRequest, lazyExportNames] of PRELOADED_MODULES_AND_THEIR_LAZY_EXPORTS) {
    const moduleExports: Record<string, unknown> = require(moduleRequest);
    for (const lazyExportName of lazyExportNames) {
      void moduleExports[lazyExportName];
    }
  }
  void process.stdout;
  void process.stderr;
}

function getFileIdentity(filePath: string): string | undefined {
  try {
    const fileStats: fs.BigIntStats = fs.statSync(filePath, { bigint: true });
    return `${fileStats.dev}:${fileStats.ino}:${fileStats.size}:${fileStats.mtimeNs}:${fileStats.ctimeNs}`;
  } catch {
    return undefined;
  }
}

function snapshotLoadedFileIdentities(): ReadonlyMap<string, string | undefined> {
  const fileIdentities: Map<string, string | undefined> = new Map();
  for (const filePath of [...Object.keys(require.cache), process.execPath]) {
    fileIdentities.set(filePath, getFileIdentity(filePath));
  }
  return fileIdentities;
}

function getIdleTimeoutMilliseconds(): number {
  const configuredIdleTimeout: number = Number(process.env.HEFT_WARM_HOST_IDLE_MS);
  return Number.isFinite(configuredIdleTimeout) && configuredIdleTimeout > 0
    ? configuredIdleTimeout
    : DEFAULT_IDLE_TIMEOUT_MILLISECONDS;
}

function listenForOneRun(
  socketPath: string,
  context: IWarmHostContext,
  mayReplaceStaleSocket: boolean
): void {
  const server: net.Server = net.createServer();
  let idleTimer: NodeJS.Timeout | undefined;
  const stopListening: () => void = () => {
    clearTimeout(idleTimer);
    fs.rmSync(socketPath, { force: true });
    server.close();
  };
  server.on('connection', (socket: net.Socket) =>
    handleWarmHostConnection(socket, { context, stopListening })
  );
  server.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code !== 'EADDRINUSE' || !mayReplaceStaleSocket) {
      process.exit(0);
    }
    const probe: net.Socket = net.connect(socketPath);
    probe.on('connect', () => process.exit(0));
    probe.on('error', () => {
      fs.rmSync(socketPath, { force: true });
      listenForOneRun(socketPath, context, false);
    });
  });
  server.listen(socketPath, () => {
    idleTimer = setTimeout(() => {
      fs.rmSync(socketPath, { force: true });
      removeCapturePipes(context.capturePipePaths);
      process.exit(0);
    }, getIdleTimeoutMilliseconds());
  });
}

function startPrewarmedHost(socketPath: string, capturePipesBasePath: string): void {
  const capturePipesOfThisHost: ICapturePipesOfThisHost = openCapturePipesForReading(
    getCapturePipePaths(capturePipesBasePath)
  );
  const [standardOutputReadEnd, standardErrorReadEnd] = capturePipesOfThisHost.readEnds;
  const outputWorker: CapturedOutputWorker = new CapturedOutputWorker(
    standardOutputReadEnd,
    standardErrorReadEnd
  );
  const preloadEnvironment: NodeJS.ProcessEnv = { ...process.env };
  preloadHostModules();
  const loadedFileIdentities: ReadonlyMap<string, string | undefined> = snapshotLoadedFileIdentities();
  const context: IWarmHostContext = {
    warmHostEntryPath: __filename,
    socketPath,
    heftVersion: (require('../../package.json') as { version: string }).version,
    preloadEnvironment,
    outputWorker,
    capturePipePaths: capturePipesOfThisHost.capturePipePaths,
    hasStaleModuleFiles: () => {
      for (const [filePath, fileIdentity] of loadedFileIdentities) {
        if (getFileIdentity(filePath) !== fileIdentity) {
          return true;
        }
      }
      return false;
    }
  };
  listenForOneRun(socketPath, context, true);
}

const parsedWarmHostArguments: IWarmHostArguments | undefined = parseWarmHostArguments(process.argv);
if (
  !parsedWarmHostArguments ||
  !isFolderPrivateToCurrentUser(path.dirname(parsedWarmHostArguments.socketPath))
) {
  process.exit(1);
} else if (parsedWarmHostArguments.capturePipesBasePath === undefined) {
  startWarmHostProcess(__filename, parsedWarmHostArguments.socketPath, process.env);
} else {
  startPrewarmedHost(parsedWarmHostArguments.socketPath, parsedWarmHostArguments.capturePipesBasePath);
}
