// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';
import { StringDecoder } from 'node:string_decoder';

import {
  LegacyFallbackSink,
  OldEngineOutputAdapter,
  REPORTER_PROTOCOL_VERSION,
  resolveReporterCompatibility,
  type IReporterCompatibilityDecision
} from '@rushstack/rush-reporter';

import type { IRushFrontendLaunchOptions } from './IRushFrontendLaunchOptions';

type CommandName = 'rush' | 'rush-pnpm' | 'rushx' | undefined;

/**
 * Both "rush" and "rushx" share the same src/start.ts entry point.  This makes it
 * a little easier for them to share all the same startup checks and version selector
 * logic.  RushCommandSelector looks at argv to determine whether we're doing "rush"
 * or "rushx" behavior, and then invokes the appropriate entry point in the selected
 * @microsoft/rush-lib.
 */
export class RushCommandSelector {
  public static failIfNotInvokedAsRush(version: string): void {
    const commandName: CommandName = _getCommandName();
    if (commandName !== 'rush' && commandName !== undefined) {
      _failWithError(
        `This repository is using Rush version ${version} which does not support the ${commandName} command`
      );
    }
  }

  public static execute(
    launcherVersion: string,
    selectedRushLib: typeof import('@microsoft/rush-lib'),
    options: IRushFrontendLaunchOptions
  ): void {
    const { Rush } = selectedRushLib;

    if (!Rush) {
      // This should be impossible unless we somehow loaded an unexpected version
      _failWithError(`Unable to find the "Rush" entry point in @microsoft/rush-lib`);
    }

    const commandName: CommandName = _getCommandName();
    const engineProtocolMajor: number | undefined = (
      Rush as typeof Rush & { readonly _reporterProtocolMajor?: number }
    )._reporterProtocolMajor;
    const compatibility: IReporterCompatibilityDecision = resolveReporterCompatibility(
      { protocolMajor: REPORTER_PROTOCOL_VERSION.major, hasManager: true },
      {
        supportsStructuredSink: engineProtocolMajor !== undefined,
        protocolMajor: engineProtocolMajor
      }
    );
    let effectiveOptions: IRushFrontendLaunchOptions = options;
    let restoreOldEngineOutput: (() => void) | undefined;
    if (compatibility.mode !== 'structured' && engineProtocolMajor !== undefined && options.reporterEnabled) {
      if (options.reporterSelectionReason === 'explicit --reporter') {
        throw new Error(
          `The selected Rush engine uses reporter protocol major ${engineProtocolMajor}, but this ` +
            `frontend supports major ${REPORTER_PROTOCOL_VERSION.major}. Update global Rush or use ` +
            '--reporter=legacy.'
        );
      }
      effectiveOptions = {
        ...options,
        reporter: {
          ...options.reporter,
          eventSink: new LegacyFallbackSink()
        },
        reporterEnabled: false,
        reporterSelectionReason: 'bootstrap compatibility fallback'
      };
    } else if (compatibility.mode === 'new-frontend-old-engine' && options.reporterEnabled) {
      restoreOldEngineOutput = _observeOldEngineOutput(options, Rush.version);
    }

    try {
      if (commandName === 'rush-pnpm') {
        if (!Rush.launchRushPnpm) {
          _failWithError(
            `This repository is using Rush version ${Rush.version}` +
              ` which does not support the "rush-pnpm" command`
          );
        }
        Rush.launchRushPnpm(launcherVersion, {
          isManaged: options.isManaged,
          alreadyReportedNodeTooNewError: options.alreadyReportedNodeTooNewError
        });
      } else if (commandName === 'rushx') {
        if (!Rush.launchRushX) {
          _failWithError(
            `This repository is using Rush version ${Rush.version}` +
              ` which does not support the "rushx" command`
          );
        }
        Rush.launchRushX(launcherVersion, effectiveOptions);
      } else {
        Rush.launch(launcherVersion, effectiveOptions);
      }
    } catch (error) {
      restoreOldEngineOutput?.();
      throw error;
    }
  }
}

function _observeOldEngineOutput(options: IRushFrontendLaunchOptions, engineVersion: string): () => void {
  const adapter: OldEngineOutputAdapter = new OldEngineOutputAdapter({
    sink: options.reporter.eventSink,
    sessionId: options.reporter.sessionId,
    source: { packageName: '@microsoft/rush-lib', packageVersion: engineVersion }
  });
  const restoreStdout: () => void = _observeStream(
    process.stdout,
    'stdout',
    adapter,
    process.stdout.write.bind(process.stdout),
    options.reporterStdoutIsMachineReadable !== true
  );
  const restoreStderr: () => void = _observeStream(
    process.stderr,
    'stderr',
    adapter,
    process.stderr.write.bind(process.stderr),
    true
  );
  let restored: boolean = false;
  const restore: () => void = () => {
    if (restored) {
      return;
    }
    restored = true;
    process.removeListener('beforeExit', restore);
    process.removeListener('exit', restore);
    restoreStdout();
    restoreStderr();
  };
  process.once('beforeExit', restore);
  process.once('exit', restore);
  return restore;
}

function _observeStream(
  stream: NodeJS.WriteStream,
  streamName: 'stdout' | 'stderr',
  adapter: OldEngineOutputAdapter,
  legacyWrite: typeof process.stdout.write,
  renderLive: boolean
): () => void {
  const marker: symbol = Symbol.for(`rush.reporter.old-engine-output.${streamName}`);
  const markedStream: NodeJS.WriteStream & { [key: symbol]: boolean | undefined } =
    stream as NodeJS.WriteStream & { [key: symbol]: boolean | undefined };
  if (markedStream[marker]) {
    return () => {};
  }
  markedStream[marker] = true;

  let captureInProgress: boolean = false;
  const decoder: StringDecoder = new StringDecoder('utf8');
  const originalWrite: typeof stream.write = stream.write;
  stream.write = ((
    chunk: string | Uint8Array,
    encodingOrCallback?: BufferEncoding | ((error?: Error | null) => void),
    callback?: (error?: Error | null) => void
  ): boolean => {
    const text: string =
      typeof chunk === 'string'
        ? chunk
        : decoder.write(Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength));
    if (text && !captureInProgress) {
      captureInProgress = true;
      try {
        adapter.capture(streamName, text, renderLive);
      } finally {
        captureInProgress = false;
      }
    }
    if (!renderLive) {
      const writeCallback: ((error?: Error | null) => void) | undefined =
        typeof encodingOrCallback === 'function' ? encodingOrCallback : callback;
      if (writeCallback) {
        process.nextTick(writeCallback);
      }
      return true;
    }
    if (typeof encodingOrCallback === 'function') {
      return legacyWrite(chunk, encodingOrCallback);
    }
    return legacyWrite(chunk, encodingOrCallback, callback);
  }) as typeof stream.write;
  return () => {
    const remaining: string = decoder.end();
    if (remaining) {
      adapter.capture(streamName, remaining, renderLive);
    }
    stream.write = originalWrite;
    delete markedStream[marker];
  };
}

function _failWithError(message: string): never {
  throw new Error(message);
}

function _getCommandName(): CommandName {
  if (process.argv.length >= 2) {
    // Example:
    // argv[0]: "C:\\Program Files\\nodejs\\node.exe"
    // argv[1]: "C:\\Program Files\\nodejs\\node_modules\\@microsoft\\rush\\bin\\rushx"
    const basename: string = path.basename(process.argv[1]).toUpperCase();
    if (basename === 'RUSH') {
      return 'rush';
    }
    if (basename === 'RUSH-PNPM') {
      return 'rush-pnpm';
    }
    if (basename === 'RUSHX') {
      return 'rushx';
    }
  }
  return undefined;
}
