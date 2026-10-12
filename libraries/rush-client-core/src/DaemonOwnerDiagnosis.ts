// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';

import type { IDaemonPaths } from '@rushstack/rush-daemon-transport';

import { DaemonClientError } from './DaemonClientError';
import { tryGetProcessStartTimeMs, tryGetProcessState, type IProcessState } from './ProcessStartTime';

/**
 * What a hint about a live daemon owner is for: a command that uses the daemon (`use`), or one that stops it
 * (`stop`).
 * @beta
 */
export type DaemonOwnerHintPurpose = 'use' | 'stop';

/** Reads what a diagnosis reports about a process. Only Linux `/proc` shows its state and command line. */
export interface IOwnerProcessReaders {
  readonly platform: NodeJS.Platform;
  readonly now: () => number;
  readonly readState: (pid: number) => IProcessState | undefined;
  readonly readStartTimeMs: (pid: number) => number | undefined;
  readonly readCommandLine: (pid: number) => ReadonlyArray<string> | undefined;
  readonly isPresent: (filePath: string) => boolean;
  /** Whether the process has the file at the path open; `undefined` when that cannot be read. */
  readonly hasFileOpen: (pid: number, filePath: string) => boolean | undefined;
}

/** What a live process that a daemon ownership record names is doing. It never signals that process. */
export interface IDaemonOwnerDiagnosis {
  readonly pid: number;
  readonly socketPath: string;
  /** For example `rushd (PID 123)`, or `PID 123 ("sleep 600")` for a process that is not a Rush daemon. */
  readonly subject: string;
  /** Undefined when its command line cannot be read, for example outside Linux or after it exited. */
  readonly isRushDaemon: boolean | undefined;
  /**
   * Whether it is a Rush daemon that has this workspace's ownership record open. A daemon opens the record that
   * it wrote and keeps it open for as long as it owns it, also after its socket file is deleted. Only such a
   * process is named in a signal hint: the recorded PID could otherwise belong to another process, for example
   * after a PID reuse that the start-time check could not detect.
   */
  readonly isWorkspaceDaemon: boolean;
  readonly state: IProcessState | undefined;
  readonly isSocketMissing: boolean;
  /** For example `: it is stopped (state T), for example by SIGSTOP, and it started 5 min ago`, or empty. */
  readonly facts: string;
}

/** A process that a signal (state T) or a tracer (state t) keeps stopped. */
export interface IStoppedProcess {
  readonly pid: number;
  /** When it started, which tells it from a later process with the same PID. */
  readonly startTicks: number;
}

/**
 * A live process owns this workspace's daemon files, but no daemon answered. The message says what that process
 * is doing on its first line, and what to do about it on the next.
 */
export class LiveDaemonOwnerError extends DaemonClientError {
  /** The first line of the message: what the process is doing. */
  public readonly description: string;
  /** The last line of the message: what to do about it. */
  public readonly hint: string;
  /** Set when that process has the ownership record open and stayed stopped while a client sampled it. */
  public readonly stoppedProcess: IStoppedProcess | undefined;

  public constructor(description: string, hint: string, stoppedProcess?: IStoppedProcess) {
    super('startupFailed', `${description}\n${hint}`);
    this.description = description;
    this.hint = hint;
    this.stoppedProcess = stoppedProcess;
  }
}

const RUSH_DAEMON_PACKAGE_FOLDER: string = 'rush-daemon';
const RUSH_DAEMON_BIN: string = 'rushd';
const PATH_SEPARATOR_REGEXP: RegExp = /[\\/]+/;
const MAX_COMMAND_LINE_LENGTH: number = 60;
const SECONDS_PER_MINUTE: number = 60;
const MINUTES_PER_HOUR: number = 60;
/**
 * Beside an owner that is not proven to be this workspace's daemon, including one that exited but is not reaped
 * yet, each command that uses the daemon waits for one to answer until its startup deadline, 15 s unless the
 * client sets another.
 */
const WAIT_UNTIL_THEN: string =
  'Until then, each command that uses the daemon first waits 15 s for a daemon to answer.';

export function getDefaultOwnerProcessReaders(): IOwnerProcessReaders {
  return {
    platform: process.platform,
    now: Date.now,
    readState: tryGetProcessState,
    readStartTimeMs: tryGetProcessStartTimeMs,
    readCommandLine: tryReadCommandLine,
    isPresent,
    hasFileOpen: tryHasFileOpen
  };
}

/**
 * What `pid`, which the ownership record at `paths.lockfilePath` names, is doing. Throws nothing: whatever cannot
 * be read is left out.
 */
export function diagnoseDaemonOwner(
  pid: number,
  paths: IDaemonPaths,
  readers: IOwnerProcessReaders = getDefaultOwnerProcessReaders()
): IDaemonOwnerDiagnosis {
  const { socketPath, lockfilePath } = paths;
  const commandLine: ReadonlyArray<string> | undefined = readers.readCommandLine(pid);
  const isRushDaemon: boolean | undefined = commandLine && isRushDaemonCommandLine(commandLine);
  const state: IProcessState | undefined = readers.readState(pid);
  const startTimeMs: number | undefined = readers.readStartTimeMs(pid);
  // Windows names a pipe, which leaves no file to check.
  const isSocketMissing: boolean = readers.platform !== 'win32' && !readers.isPresent(socketPath);
  const clauses: string[] = [];
  if (isSocketMissing) clauses.push('its socket is missing, so no client can reach it');
  const activity: string[] = [];
  if (state) activity.push(describeState(state));
  if (startTimeMs !== undefined) activity.push(`it started ${formatAge(readers.now() - startTimeMs)} ago`);
  if (activity.length > 0) clauses.push(activity.join(', and '));
  return {
    pid,
    socketPath,
    subject: describeSubject(pid, isRushDaemon, commandLine),
    isRushDaemon,
    isWorkspaceDaemon: isRushDaemon === true && readers.hasFileOpen(pid, lockfilePath) === true,
    state,
    isSocketMissing,
    facts: clauses.length > 0 ? `: ${clauses.join('; ')}` : ''
  };
}

/** Describes an owner after the daemon did not answer at its endpoint. */
export function describeUnresponsiveOwner(diagnosis: IDaemonOwnerDiagnosis): string {
  const { socketPath, subject, facts } = diagnosis;
  return diagnosis.isWorkspaceDaemon
    ? `The daemon, ${subject}, did not answer at ${socketPath}${facts}.`
    : `The daemon did not answer at ${socketPath}, and its ownership record names ${subject}${facts}.`;
}

/** Describes the owner that the ownership record at `lockfilePath` names. */
export function describeRecordOwner(diagnosis: IDaemonOwnerDiagnosis, lockfilePath: string): string {
  return `${diagnosis.subject} still owns ${lockfilePath}${diagnosis.facts}.`;
}

/**
 * Says what makes the daemon answer again, or lets the next command start a new one. It names a signal to send
 * only to a process that is proven to be this workspace's daemon.
 */
export function getDaemonOwnerHint(
  diagnosis: IDaemonOwnerDiagnosis,
  lockfilePath: string,
  purpose: DaemonOwnerHintPurpose
): string {
  const { state } = diagnosis;
  if (state?.code === 'Z' || state?.code === 'X') {
    const parent: string = state.parentPid === undefined ? 'its parent process' : `PID ${state.parentPid}`;
    return `The next command reclaims its files once ${parent} reaps it. ${WAIT_UNTIL_THEN}`;
  }
  if (diagnosis.isRushDaemon === false) {
    return `It does not look like a Rush daemon. If no daemon runs for this workspace, delete ${lockfilePath}; the next command then starts a new daemon. ${WAIT_UNTIL_THEN}`;
  }
  if (!diagnosis.isWorkspaceDaemon) {
    return `It may be busy, stopped or shutting down, or not this workspace's daemon; "rush-client daemon logs" shows the daemon's last lines. If it is this workspace's daemon, end that process; if it is not, delete ${lockfilePath}. Either way, the next command then starts a new daemon. ${WAIT_UNTIL_THEN}`;
  }
  return getRushDaemonHint(diagnosis, purpose);
}

/** The error for live owner `pid` after no daemon answered at `paths.socketPath`. */
export function createUnresponsiveOwnerError(
  pid: number,
  paths: IDaemonPaths,
  readers: IOwnerProcessReaders = getDefaultOwnerProcessReaders(),
  stoppedProcess?: IStoppedProcess
): LiveDaemonOwnerError {
  const diagnosis: IDaemonOwnerDiagnosis = diagnoseDaemonOwner(pid, paths, readers);
  return new LiveDaemonOwnerError(
    describeUnresponsiveOwner(diagnosis),
    getDaemonOwnerHint(diagnosis, paths.lockfilePath, 'use'),
    stoppedProcess
  );
}

function getRushDaemonHint(diagnosis: IDaemonOwnerDiagnosis, purpose: DaemonOwnerHintPurpose): string {
  const { pid } = diagnosis;
  switch (diagnosis.state?.code) {
    case 'T':
      if (diagnosis.isSocketMissing) {
        return `Run "kill ${pid}", then "kill -CONT ${pid}": it then cancels its running requests and exits, and the next command starts a new daemon.`;
      }
      return purpose === 'stop'
        ? `Resume it with "kill -CONT ${pid}", then run "rush-client daemon stop" again.`
        : `Resume it with "kill -CONT ${pid}"; it then serves the next command.`;
    case 't':
      return 'It answers once the debugger or tracer lets it run.';
    case 'D':
      return 'It handles no signal until that wait ends; retry then.';
    default:
      return diagnosis.isSocketMissing
        ? `It may exit on its own once its running requests finish; "kill ${pid}" asks it to cancel them and exit. The next command then starts a new daemon.`
        : `It may be busy or shutting down; "rush-client daemon logs" shows its last lines. "kill ${pid}" asks it to cancel its running requests and exit; the next command then starts a new daemon.`;
  }
}

function describeSubject(
  pid: number,
  isRushDaemon: boolean | undefined,
  commandLine: ReadonlyArray<string> | undefined
): string {
  if (isRushDaemon) return `rushd (PID ${pid})`;
  if (!commandLine) return `PID ${pid}`;
  const joined: string = commandLine.join(' ');
  const shown: string =
    joined.length > MAX_COMMAND_LINE_LENGTH ? `${joined.slice(0, MAX_COMMAND_LINE_LENGTH - 3)}...` : joined;
  return `PID ${pid} ("${shown}")`;
}

/**
 * Says that a process is stopped, by a signal (state T) or by a debugger or tracer (state t), for example
 * `it is stopped (state T), for example by SIGSTOP`. Returns `undefined` for any other state: a stopped process does
 * nothing, such as answer or release a lock, until something resumes it.
 */
export function describeStoppedState(state: IProcessState | undefined): string | undefined {
  switch (state?.code) {
    case 'T':
      return 'it is stopped (state T), for example by SIGSTOP';
    case 't':
      return 'it is stopped by a debugger or tracer (state t)';
    default:
      return undefined;
  }
}

function describeState(state: IProcessState): string {
  const stopped: string | undefined = describeStoppedState(state);
  if (stopped !== undefined) return stopped;
  switch (state.code) {
    case 'D':
      return 'it is waiting in the kernel (state D), for example on a slow disk or network file system';
    case 'Z': {
      const parent: string =
        state.parentPid === undefined ? 'its parent process' : `its parent process (PID ${state.parentPid})`;
      return `it has exited, but ${parent} has not reaped it (state Z)`;
    }
    case 'R':
      return 'it is running (state R)';
    case 'S':
      return 'it is waiting (state S)';
    default:
      return `it is in state ${state.code}`;
  }
}

function formatAge(ageMs: number): string {
  const seconds: number = Math.floor(Math.max(0, ageMs) / 1000);
  if (seconds < SECONDS_PER_MINUTE) return `${seconds} s`;
  const minutes: number = Math.floor(seconds / SECONDS_PER_MINUTE);
  if (minutes < MINUTES_PER_HOUR) return `${minutes} min`;
  return `${Math.floor(minutes / MINUTES_PER_HOUR)} h ${minutes % MINUTES_PER_HOUR} min`;
}

/**
 * rushd runs as a `rushd` bin, or as node with its script in the `rush-daemon` package, for example
 * `node …/rush-daemon/lib-commonjs/SelectedDaemonBootstrap.js --launch …`. Another argument that names that folder,
 * or a script in a package that `rush-daemon` depends on (such as a tool that builds it), does not count.
 */
function isRushDaemonCommandLine(commandLine: ReadonlyArray<string>): boolean {
  const [executable = '', ...args] = commandLine;
  if (getFileName(executable) === RUSH_DAEMON_BIN) return true;
  const script: string | undefined = args.find((arg) => !arg.startsWith('-'));
  if (script === undefined) return false;
  const segments: string[] = script.split(PATH_SEPARATOR_REGEXP);
  const packageIndex: number = segments.lastIndexOf(RUSH_DAEMON_PACKAGE_FOLDER);
  return (
    segments[segments.length - 1] === RUSH_DAEMON_BIN ||
    (packageIndex >= 0 &&
      packageIndex < segments.length - 1 &&
      !segments.slice(packageIndex + 1).includes('node_modules'))
  );
}

function getFileName(filePath: string): string {
  const segments: string[] = filePath.split(PATH_SEPARATOR_REGEXP);
  return segments[segments.length - 1];
}

/** The arguments of `pid` on Linux; `undefined` elsewhere, or when they are unreadable or empty (a zombie). */
function tryReadCommandLine(pid: number): ReadonlyArray<string> | undefined {
  if (process.platform !== 'linux') return undefined;
  let raw: string;
  try {
    raw = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8');
  } catch {
    return undefined;
  }
  const args: string[] = raw.split('\0').filter((arg) => arg.length > 0);
  return args.length > 0 ? args : undefined;
}

/**
 * Whether `pid` has the file at `filePath` open, on Linux: whether a link in `/proc/<pid>/fd` reads the file's real
 * path. Such a link reads the current path of the file that the process opened, with " (deleted)" appended once
 * that file is removed, so a file that took the path later does not count. Only the links are read, never the
 * files that they lead to, which could block, for example on a network file system that does not answer.
 */
function tryHasFileOpen(pid: number, filePath: string): boolean | undefined {
  if (process.platform !== 'linux') return undefined;
  let realPath: string;
  let descriptors: string[];
  try {
    realPath = fs.realpathSync.native(filePath);
    descriptors = fs.readdirSync(`/proc/${pid}/fd`);
  } catch {
    return undefined;
  }
  return descriptors.some((descriptor) => tryReadLink(`/proc/${pid}/fd/${descriptor}`) === realPath);
}

function tryReadLink(linkPath: string): string | undefined {
  try {
    return fs.readlinkSync(linkPath);
  } catch {
    // For example a descriptor that was closed after it was listed.
    return undefined;
  }
}

/**
 * The stat uses `{ bigint: true }`, which fills a stat array of its own. A plain stat of the socket would leave its
 * type in the array that Node 22's cached `fs.realpathSync` reads (nodejs/node#65113), and the next `require()` in
 * this process, for example of the daemon launcher after a failed command, could then load a package through its
 * symbolic link and not find the package's dependencies.
 */
function isPresent(filePath: string): boolean {
  try {
    return fs.lstatSync(filePath, { bigint: true, throwIfNoEntry: false }) !== undefined;
  } catch {
    // Unknown is not missing.
    return true;
  }
}
