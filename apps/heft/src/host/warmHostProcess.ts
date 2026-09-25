import { execFileSync, spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

const SOCKET_ARGUMENT_PREFIX: string = '--heft-warm-host-socket=';
const CAPTURE_PIPES_ARGUMENT_PREFIX: string = '--heft-warm-host-capture=';
const MODE_MODULUS_THAT_ISOLATES_GROUP_AND_OTHER_PERMISSIONS: number = 0o100;
const READY_MARKER_WAIT_MILLISECONDS: number = 5000;
const READY_MARKER_POLL_MILLISECONDS: number = 5;
const READ_ONLY_NON_BLOCKING_OPEN_FLAGS: number = fs.constants.O_RDONLY + fs.constants.O_NONBLOCK;
const CAPTURE_FILE_NAME_PATTERN: RegExp = /\.sock\.(\d+)\.\d+\.(out|err|ready)$/;

export interface IWarmHostArguments {
  readonly socketPath: string;
  readonly capturePipesBasePath: string | undefined;
}

export interface ICapturePipePaths {
  readonly standardOutputPipePath: string;
  readonly standardErrorPipePath: string;
  readonly readyMarkerPath: string;
}

function findArgumentValue(processArguments: ReadonlyArray<string>, prefix: string): string | undefined {
  for (const processArgument of processArguments) {
    if (processArgument.startsWith(prefix)) {
      return processArgument.slice(prefix.length);
    }
  }
  return undefined;
}

export function parseWarmHostArguments(
  processArguments: ReadonlyArray<string>
): IWarmHostArguments | undefined {
  const socketPath: string | undefined = findArgumentValue(processArguments, SOCKET_ARGUMENT_PREFIX);
  if (!socketPath || !path.isAbsolute(socketPath)) {
    return undefined;
  }
  return {
    socketPath,
    capturePipesBasePath: findArgumentValue(processArguments, CAPTURE_PIPES_ARGUMENT_PREFIX)
  };
}

export function getCapturePipePaths(capturePipesBasePath: string): ICapturePipePaths {
  return {
    standardOutputPipePath: `${capturePipesBasePath}.out`,
    standardErrorPipePath: `${capturePipesBasePath}.err`,
    readyMarkerPath: `${capturePipesBasePath}.ready`
  };
}

export function isFolderPrivateToCurrentUser(folderPath: string): boolean {
  try {
    const folderStats: fs.Stats = fs.lstatSync(folderPath);
    return (
      folderStats.isDirectory() &&
      folderStats.uid === process.getuid?.() &&
      folderStats.mode % MODE_MODULUS_THAT_ISOLATES_GROUP_AND_OTHER_PERMISSIONS === 0
    );
  } catch {
    return false;
  }
}

function isProcessAlive(processId: number): boolean {
  try {
    process.kill(processId, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

function removeCaptureFilesOfDeadHosts(socketFolder: string): void {
  for (const fileName of fs.readdirSync(socketFolder)) {
    const captureFileNameMatch: RegExpExecArray | null = CAPTURE_FILE_NAME_PATTERN.exec(fileName);
    if (captureFileNameMatch && !isProcessAlive(Number(captureFileNameMatch[1]))) {
      fs.rmSync(path.join(socketFolder, fileName), { force: true });
    }
  }
}

export function removeCapturePipes(capturePipePaths: ICapturePipePaths): void {
  for (const capturePath of Object.values(capturePipePaths)) {
    fs.rmSync(capturePath, { force: true });
  }
}

function waitForReadyMarker(readyMarkerPath: string): void {
  const waitStartTime: number = Date.now();
  while (!fs.existsSync(readyMarkerPath) && Date.now() - waitStartTime < READY_MARKER_WAIT_MILLISECONDS) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, READY_MARKER_POLL_MILLISECONDS);
  }
  fs.rmSync(readyMarkerPath, { force: true });
}

function openPipeEnds(pipePath: string): { readonly keepAliveReadEnd: number; readonly writeEnd: number } {
  const keepAliveReadEnd: number = fs.openSync(pipePath, READ_ONLY_NON_BLOCKING_OPEN_FLAGS);
  return { keepAliveReadEnd, writeEnd: fs.openSync(pipePath, fs.constants.O_WRONLY) };
}

export function startWarmHostProcess(
  warmHostEntryPath: string,
  socketPath: string,
  environment: NodeJS.ProcessEnv
): void {
  const socketFolder: string = path.dirname(socketPath);
  if (!isFolderPrivateToCurrentUser(socketFolder)) {
    return;
  }
  removeCaptureFilesOfDeadHosts(socketFolder);
  const capturePipesBasePath: string = `${socketPath}.${process.pid}.${Date.now()}`;
  const capturePipePaths: ICapturePipePaths = getCapturePipePaths(capturePipesBasePath);
  const { standardOutputPipePath, standardErrorPipePath } = capturePipePaths;
  try {
    execFileSync('mkfifo', ['-m', '600', standardOutputPipePath, standardErrorPipePath], {
      env: { PATH: environment.PATH ?? process.env.PATH },
      stdio: 'ignore'
    });
    const standardOutputEnds: ReturnType<typeof openPipeEnds> = openPipeEnds(standardOutputPipePath);
    const standardErrorEnds: ReturnType<typeof openPipeEnds> = openPipeEnds(standardErrorPipePath);
    spawn(
      process.execPath,
      [
        warmHostEntryPath,
        `${SOCKET_ARGUMENT_PREFIX}${socketPath}`,
        `${CAPTURE_PIPES_ARGUMENT_PREFIX}${capturePipesBasePath}`
      ],
      {
        argv0: 'node',
        cwd: '/',
        detached: true,
        env: environment,
        stdio: ['ignore', standardOutputEnds.writeEnd, standardErrorEnds.writeEnd]
      }
    ).unref();
    for (const fileDescriptor of [standardOutputEnds.writeEnd, standardErrorEnds.writeEnd]) {
      fs.closeSync(fileDescriptor);
    }
    waitForReadyMarker(capturePipePaths.readyMarkerPath);
    for (const fileDescriptor of [standardOutputEnds.keepAliveReadEnd, standardErrorEnds.keepAliveReadEnd]) {
      fs.closeSync(fileDescriptor);
    }
  } catch {
    removeCapturePipes(capturePipePaths);
  }
}

export interface ICapturePipesOfThisHost {
  readonly readEnds: readonly [number, number];
  readonly capturePipePaths: ICapturePipePaths;
}

export function openCapturePipesForReading(
  spawnerCapturePipePaths: ICapturePipePaths
): ICapturePipesOfThisHost {
  const { standardOutputPipePath, standardErrorPipePath, readyMarkerPath } = spawnerCapturePipePaths;
  const readEnds: readonly [number, number] = [
    fs.openSync(standardOutputPipePath, READ_ONLY_NON_BLOCKING_OPEN_FLAGS),
    fs.openSync(standardErrorPipePath, READ_ONLY_NON_BLOCKING_OPEN_FLAGS)
  ];
  const socketPath: string = standardOutputPipePath.replace(/\.sock\.\d+\.\d+\.out$/, '.sock');
  const capturePipePaths: ICapturePipePaths = getCapturePipePaths(`${socketPath}.${process.pid}.0`);
  fs.renameSync(standardOutputPipePath, capturePipePaths.standardOutputPipePath);
  fs.renameSync(standardErrorPipePath, capturePipePaths.standardErrorPipePath);
  fs.closeSync(fs.openSync(readyMarkerPath, 'wx', 0o600));
  return { readEnds, capturePipePaths };
}
