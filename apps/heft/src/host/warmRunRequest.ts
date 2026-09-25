import * as fs from 'node:fs';
import * as path from 'node:path';

import type { IHostPlan } from './HostPlan';

export interface IWarmRunValidationContext {
  readonly heftVersion: string;
  readonly preloadEnvironment: Readonly<NodeJS.ProcessEnv>;
  hasStaleModuleFiles(): boolean;
}

const WARM_PROTOCOL_VERSION: number = 1;
const ENVIRONMENT_VARIABLES_THAT_NAME_CLIENT_FILE_DESCRIPTORS: ReadonlyArray<string> = [
  '_RUSH_REPORTER_CHILD_FD',
  '_RUSH_REPORTER_CHILD_ACK_FD',
  'NODE_CHANNEL_FD'
];
const ENVIRONMENT_VARIABLES_IGNORED_FOR_WARM_REUSE: ReadonlySet<string> = new Set(['_', 'OLDPWD']);

export interface IWarmRunRequest {
  readonly protocolVersion?: number;
  readonly plan?: IHostPlan;
  readonly env?: Record<string, string>;
  readonly cwd?: string;
  readonly nodeExecPath?: string;
  readonly stdoutIsTTY?: boolean;
  readonly stderrIsTTY?: boolean;
  readonly umask?: string;
}

function areEnvironmentsEquivalent(
  clientEnvironment: Readonly<NodeJS.ProcessEnv>,
  hostEnvironment: Readonly<NodeJS.ProcessEnv>
): boolean {
  const variableNames: Set<string> = new Set([
    ...Object.keys(clientEnvironment),
    ...Object.keys(hostEnvironment)
  ]);
  for (const variableName of variableNames) {
    if (
      !ENVIRONMENT_VARIABLES_IGNORED_FOR_WARM_REUSE.has(variableName) &&
      clientEnvironment[variableName] !== hostEnvironment[variableName]
    ) {
      return false;
    }
  }
  return true;
}

function tryReadOwnFileModeCreationMask(): number | undefined {
  try {
    const fileModeCreationMaskMatch: RegExpExecArray | null = /^Umask:\s*([0-7]+)$/m.exec(
      fs.readFileSync('/proc/self/status', 'utf8')
    );
    return fileModeCreationMaskMatch ? Number.parseInt(fileModeCreationMaskMatch[1], 8) : undefined;
  } catch {
    return undefined;
  }
}

function isFileModeCreationMaskDifferent(clientFileModeCreationMask: string | undefined): boolean {
  return (
    clientFileModeCreationMask !== undefined &&
    Number.parseInt(clientFileModeCreationMask, 8) !== tryReadOwnFileModeCreationMask()
  );
}

function tryGetRealPath(filePath: string | undefined): string | undefined {
  try {
    return filePath === undefined ? undefined : fs.realpathSync(filePath);
  } catch {
    return undefined;
  }
}

export function getRefusalReason(
  runRequest: IWarmRunRequest,
  context: IWarmRunValidationContext
): string | undefined {
  const { plan, env, cwd } = runRequest;
  if (runRequest.protocolVersion !== WARM_PROTOCOL_VERSION) {
    return 'protocol version';
  } else if (
    plan?.kind !== 'heft-plan' ||
    plan.protocolVersion !== 1 ||
    plan.heftVersion !== context.heftVersion
  ) {
    return 'plan version';
  } else if (!plan.command || plan.command.watch || plan.argv.includes('--debug')) {
    return 'command';
  } else if (runRequest.stdoutIsTTY !== false || runRequest.stderrIsTTY !== false) {
    return 'terminal';
  } else if (!env || !cwd || !path.isAbsolute(cwd)) {
    return 'request';
  } else if (
    ENVIRONMENT_VARIABLES_THAT_NAME_CLIENT_FILE_DESCRIPTORS.some(
      (variableName: string) => env[variableName] !== undefined
    )
  ) {
    return 'client file descriptors';
  } else if (tryGetRealPath(runRequest.nodeExecPath) !== tryGetRealPath(process.execPath)) {
    return 'node executable';
  } else if (!areEnvironmentsEquivalent(env, context.preloadEnvironment)) {
    return 'environment';
  } else if (isFileModeCreationMaskDifferent(runRequest.umask)) {
    return 'umask';
  } else if (context.hasStaleModuleFiles()) {
    return 'stale modules';
  }
  return undefined;
}

export function tryParseRunRequest(payload: Buffer): IWarmRunRequest {
  try {
    return JSON.parse(payload.toString('utf8'));
  } catch {
    return {};
  }
}
