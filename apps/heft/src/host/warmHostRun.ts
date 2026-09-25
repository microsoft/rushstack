import type * as net from 'node:net';
import * as path from 'node:path';

import type { HostCommandLine } from './HostCommandLine';
import type { IHostPlan } from './HostPlan';
import { getRefusalReason, tryParseRunRequest, type IWarmRunRequest } from './warmRunRequest';
import {
  makeRequireStacksMatchTheHeftCommandLine,
  presentTheMainModuleAsTheHeftBin
} from './makeRequireStacksMatchTheHeftCommandLine';
import type { CapturedOutputWorker } from './CapturedOutputWorker';
import {
  ACCEPT_FRAME_TYPE,
  EXIT_FRAME_TYPE,
  REFUSE_FRAME_TYPE,
  RUN_FRAME_TYPE,
  SIGNAL_FRAME_TYPE,
  WarmHostFrameReader,
  createExitFramePayload,
  writeFrameSynchronously,
  type IWarmHostFrame
} from './warmHostFrames';
import { removeCapturePipes, startWarmHostProcess, type ICapturePipePaths } from './warmHostProcess';

const SIGNAL_NUMBER_FOR_HANG_UP: number = 1;

export interface IWarmHostContext {
  readonly warmHostEntryPath: string;
  readonly socketPath: string;
  readonly heftVersion: string;
  readonly preloadEnvironment: Readonly<NodeJS.ProcessEnv>;
  readonly outputWorker: CapturedOutputWorker;
  readonly capturePipePaths: ICapturePipePaths;
  hasStaleModuleFiles(): boolean;
}

function adoptClientEnvironment(clientEnvironment: Readonly<Record<string, string>>): void {
  for (const variableName of Object.keys(process.env)) {
    if (!Object.prototype.hasOwnProperty.call(clientEnvironment, variableName)) {
      delete process.env[variableName];
    }
  }
  Object.assign(process.env, clientEnvironment);
}

function tryWriteExitFrame(socketFileDescriptor: number, exitCode: number): void {
  try {
    writeFrameSynchronously(socketFileDescriptor, EXIT_FRAME_TYPE, createExitFramePayload(exitCode));
  } catch {
    return;
  }
}

function writeExitFrameAndStartSuccessorWhenTheProcessExits(
  socketFileDescriptor: number,
  context: IWarmHostContext,
  successorEnvironment: Readonly<Record<string, string>>
): void {
  let exitFrameWasWritten: boolean = false;
  const writeExitFrame: (exitCode: number) => void = (exitCode: number) => {
    if (!exitFrameWasWritten) {
      exitFrameWasWritten = true;
      context.outputWorker.finishForwarding();
      tryWriteExitFrame(socketFileDescriptor, exitCode);
      removeCapturePipes(context.capturePipePaths);
      startWarmHostProcess(context.warmHostEntryPath, context.socketPath, successorEnvironment);
    }
  };
  process.on('exit', writeExitFrame);
  const originalExit: typeof process.exit = process.exit;
  process.exit = function exitAfterOtherExitListeners(exitCode?: string | number | null): never {
    process.removeListener('exit', writeExitFrame);
    process.on('exit', writeExitFrame);
    return originalExit.call(process, exitCode);
  } as typeof process.exit;
}

function forwardSignalToProcessGroup(signalNumber: number): void {
  try {
    process.kill(-process.pid, signalNumber);
  } catch {
    process.kill(process.pid, signalNumber);
  }
}

function runPlan(plan: IHostPlan, context: IWarmHostContext): void {
  const heftBinPath: string =
    plan.heftBinPath ?? path.resolve(context.warmHostEntryPath, '../../../bin/heft');
  process.argv = [process.argv[0], heftBinPath, ...plan.argv];
  makeRequireStacksMatchTheHeftCommandLine();
  presentTheMainModuleAsTheHeftBin(heftBinPath);
  const { HostCommandLine: HostCommandLineClass } = require('./HostCommandLine') as {
    HostCommandLine: typeof HostCommandLine;
  };
  const hostCommandLine: HostCommandLine = new HostCommandLineClass(plan);
  hostCommandLine
    .executeAsync()
    .then(() => {
      process.exit(process.exitCode === undefined ? 0 : process.exitCode);
    })
    .catch((error) => {
      hostCommandLine.globalTerminal.writeErrorLine(error.toString());
      process.exit(1);
    });
}

let warmRunIsInProgress: boolean = false;

function writeRefusal(socketFileDescriptor: number, refusalReason: string): void {
  try {
    writeFrameSynchronously(
      socketFileDescriptor,
      REFUSE_FRAME_TYPE,
      Buffer.from(JSON.stringify({ reason: refusalReason }))
    );
  } catch {
    return;
  }
}

function startRun(
  runRequest: IWarmRunRequest,
  socketFileDescriptor: number,
  context: IWarmHostContext
): void {
  const refusalReason: string | undefined = getRefusalReason(runRequest, context);
  if (refusalReason !== undefined) {
    writeRefusal(socketFileDescriptor, refusalReason);
    removeCapturePipes(context.capturePipePaths);
    process.exit(0);
  }
  const acceptance: string = JSON.stringify({
    hostPid: process.pid,
    nodeVersion: process.version,
    heftVersion: context.heftVersion
  });
  try {
    writeFrameSynchronously(socketFileDescriptor, ACCEPT_FRAME_TYPE, Buffer.from(acceptance));
  } catch {
    removeCapturePipes(context.capturePipePaths);
    process.exit(0);
  }
  adoptClientEnvironment(runRequest.env!);
  process.chdir(runRequest.cwd!);
  context.outputWorker.startForwardingTo(socketFileDescriptor);
  writeExitFrameAndStartSuccessorWhenTheProcessExits(socketFileDescriptor, context, { ...runRequest.env! });
  runPlan(runRequest.plan!, context);
}

export interface IWarmRunListener {
  readonly context: IWarmHostContext;
  stopListening(): void;
}

export function handleWarmHostConnection(socket: net.Socket, listener: IWarmRunListener): void {
  const socketFileDescriptor: number = (socket as unknown as { _handle: { fd: number } })._handle.fd;
  const frameReader: WarmHostFrameReader = new WarmHostFrameReader();
  let runWasStarted: boolean = false;
  socket.on('error', () => undefined);
  socket.on('data', (incomingBytes: Buffer) => {
    let frames: IWarmHostFrame[];
    try {
      frames = frameReader.pushBytes(incomingBytes);
    } catch {
      socket.destroy();
      return;
    }
    for (const frame of frames) {
      if (runWasStarted) {
        if (frame.frameType === SIGNAL_FRAME_TYPE && frame.payload.length === 1) {
          forwardSignalToProcessGroup(frame.payload[0]);
        }
      } else if (frame.frameType !== RUN_FRAME_TYPE || warmRunIsInProgress) {
        writeRefusal(socketFileDescriptor, frame.frameType === RUN_FRAME_TYPE ? 'busy' : 'frame');
        socket.destroy();
        return;
      } else {
        runWasStarted = true;
        warmRunIsInProgress = true;
        listener.stopListening();
        socket.on('close', () => forwardSignalToProcessGroup(SIGNAL_NUMBER_FOR_HANG_UP));
        startRun(tryParseRunRequest(frame.payload), socketFileDescriptor, listener.context);
      }
    }
  });
}
