// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { getWorkspaceFingerprintEnvironmentEntries } from '@microsoft/rush-lib';
import type { IDaemonRequestEnvelope } from '@rushstack/rush-daemon-protocol';

import type { IWorkspaceSession } from './WorkspaceSession';

/** A background preparation is due once the watched workspace inputs have not changed for this long. */
export const BACKGROUND_PREPARE_QUIET_MS: number = 2000;
/**
 * While another Rush process holds the repository's lock, a background preparation is due again after this long, and
 * then after twice as long each time, up to `BACKGROUND_PREPARE_MAX_RETRY_MS`.
 */
const BACKGROUND_PREPARE_FIRST_RETRY_MS: number = 2000;
const BACKGROUND_PREPARE_MAX_RETRY_MS: number = 60_000;

/** The command line that a background preparation binds, and the session that served it. */
export interface IPreparationHint {
  readonly session: IWorkspaceSession;
  readonly envelope: IDaemonRequestEnvelope;
}

/** A state of the workspace and its generation, in which a background preparation found nothing to do. */
export interface IPreparationCheck {
  readonly session: IWorkspaceSession;
  /** The invalidation sequence of `session`. */
  readonly sequence: number;
  readonly boundSession: IWorkspaceSession | undefined;
  readonly forceReload: boolean;
}

export interface IBackgroundPreparationSchedulerOptions {
  /** The environment of every background preparation. */
  readonly environment: Readonly<Record<string, string>>;
  /** Checks whether to start a background preparation now. */
  readonly checkAsync: () => Promise<void>;
  readonly onLog?: (message: string) => void;
}

export class BackgroundPreparationBusyError extends Error {
  public constructor() {
    super("Another Rush process holds this repository's lock.");
  }
}

/**
 * Keeps the command line of the last phased command that a daemon served, if its workspace turns
 * `daemon.backgroundPrepare` on, and calls `checkAsync` when a background preparation may be due: once the watched
 * workspace inputs have been quiet for `BACKGROUND_PREPARE_QUIET_MS`, once the daemon is idle again after it was busy
 * when a check was due, and again later while another Rush process holds the repository's lock.
 */
export class BackgroundPreparationScheduler {
  readonly #environment: Readonly<Record<string, string>>;
  readonly #checkAsync: () => Promise<void>;
  readonly #onLog: ((message: string) => void) | undefined;
  #hint: IPreparationHint | undefined;
  #unsubscribe: (() => void) | undefined;
  #timer: NodeJS.Timeout | undefined;
  /** Set when a check was due while the daemon was busy; it is due again once the daemon is idle. */
  #deferred: boolean = false;
  #checked: IPreparationCheck | undefined;
  /** The last wait before a check that is due for a busy lock, or 0 after any other outcome. */
  #retryMs: number = 0;
  #closed: boolean = false;

  public constructor(options: IBackgroundPreparationSchedulerOptions) {
    this.#environment = options.environment;
    this.#checkAsync = options.checkAsync;
    this.#onLog = options.onLog;
  }

  public get hint(): IPreparationHint | undefined {
    return this.#hint;
  }

  /**
   * Keeps the command line of a phased command that was served on `session`, if the workspace turns
   * `daemon.backgroundPrepare` on, and otherwise forgets any. A preparation runs with the daemon's own environment and
   * no terminal, so nothing else of the client's request is kept. For a new session, `capturedSequence` is its
   * invalidation sequence when its inputs were last captured: a change that the watcher reported after that, before
   * this call, is due for a check too.
   */
  public remember(
    session: IWorkspaceSession,
    envelope: IDaemonRequestEnvelope,
    capturedSequence?: number
  ): void {
    if (this.#closed || !session.rushConfiguration.daemon.backgroundPrepare) {
      this.forget();
      return;
    }
    const isNewSession: boolean = this.#hint?.session !== session;
    if (isNewSession) {
      this.#unsubscribe?.();
      this.#unsubscribe = session.invalidations.subscribe(() => this.#arm(BACKGROUND_PREPARE_QUIET_MS));
      this.#checked = undefined;
    }
    const { argv, commandName, commandOrigin, cwd, invocationKind } = envelope;
    this.#hint = {
      session,
      envelope: {
        requestId: '',
        argv: [...argv],
        commandName,
        commandOrigin,
        cwd,
        ...(invocationKind !== undefined && { invocationKind }),
        environment: this.#environment,
        terminal: { isTTY: false, supportsColor: false }
      }
    };
    if (
      isNewSession &&
      capturedSequence !== undefined &&
      session.invalidations.getSnapshot().sequence > capturedSequence
    ) {
      this.#arm(BACKGROUND_PREPARE_QUIET_MS);
    }
  }

  /** Until a phased command is served again, nothing is prepared in the background. */
  public forget(): void {
    this.#unsubscribe?.();
    this.#unsubscribe = undefined;
    this.#hint = undefined;
    this.#checked = undefined;
    this.#deferred = false;
    this.#retryMs = 0;
    clearTimeout(this.#timer);
    this.#timer = undefined;
  }

  public close(): void {
    this.#closed = true;
    this.forget();
  }

  /** Whether `check` is the state in which a check last found nothing to do. */
  public isChecked(check: IPreparationCheck): boolean {
    const checked: IPreparationCheck | undefined = this.#checked;
    return (
      checked !== undefined &&
      checked.session === check.session &&
      checked.sequence === check.sequence &&
      checked.boundSession === check.boundSession &&
      checked.forceReload === check.forceReload
    );
  }

  /** Records that nothing is to be done in the state `check`, until the workspace or its generation changes. */
  public markChecked(check: IPreparationCheck): void {
    this.#checked = check;
    this.#retryMs = 0;
  }

  /** Ends a wait for another Rush process. */
  public markPrepared(): void {
    this.#retryMs = 0;
  }

  /** Checks again once the daemon is idle; see `resume`. */
  public defer(): void {
    this.#deferred = true;
  }

  /** Arms a check that was due while the daemon was busy, if the daemon is idle now. */
  public resume(isIdle: boolean): void {
    if (!this.#deferred || !isIdle) return;
    this.#deferred = false;
    this.#arm(BACKGROUND_PREPARE_QUIET_MS);
  }

  /** Checks again later while another Rush process holds the repository's lock, waiting twice as long each time. */
  public retry(): void {
    if (this.#retryMs === 0) {
      this.#onLog?.(
        "rushd: another Rush process holds this repository's lock; the daemon prepares in the background " +
          'once that process releases it'
      );
    }
    this.#retryMs =
      this.#retryMs === 0
        ? BACKGROUND_PREPARE_FIRST_RETRY_MS
        : Math.min(this.#retryMs * 2, BACKGROUND_PREPARE_MAX_RETRY_MS);
    this.#arm(this.#retryMs);
  }

  #arm(delayMs: number): void {
    clearTimeout(this.#timer);
    this.#timer = undefined;
    if (this.#closed || !this.#hint) return;
    this.#timer = setTimeout(() => {
      this.#timer = undefined;
      void this.#checkAsync().catch((error: unknown) => {
        this.#onLog?.(
          `rushd: could not check whether to prepare in the background: ${getErrorMessage(error)}`
        );
      });
    }, delayMs);
    this.#timer.unref();
  }
}

/** Whether two requests have the same command line and working directory. */
export function isSameCommandLine(envelope: IDaemonRequestEnvelope, other: IDaemonRequestEnvelope): boolean {
  return (
    envelope.commandName === other.commandName &&
    envelope.commandOrigin === other.commandOrigin &&
    envelope.invocationKind === other.invocationKind &&
    envelope.cwd === other.cwd &&
    envelope.argv.length === other.argv.length &&
    envelope.argv.every((arg: string, index: number) => arg === other.argv[index])
  );
}

/** The parts of an environment that a workspace input capture reads, normalized as every fingerprint comparison is. */
export function getCaptureEnvironmentKey(environment: Readonly<Record<string, string | undefined>>): string {
  return JSON.stringify([
    environment.RUSH_PREVIEW_VERSION ?? null,
    getWorkspaceFingerprintEnvironmentEntries(environment)
  ]);
}

export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
