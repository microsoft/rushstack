// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { createRequire } from 'node:module';
import * as path from 'node:path';

import { JsonFile } from '@rushstack/node-core-library';
import type { IDaemonConfigurationJson } from '@microsoft/rush-lib';
import { DAEMON_PROTOCOL_VERSION, type IDaemonProtocolVersion } from '@rushstack/rush-daemon-protocol';

import {
  readDaemonInstallationMetadata,
  type IDaemonInstallationMetadata,
  type IInstalledDaemonLauncher
} from './DaemonInstallation';

async function mainAsync(): Promise<void> {
  const [mode, packageJsonPath, expectedVersion, repoRoot] = process.argv.slice(2);
  if ((mode !== '--probe' && mode !== '--launch') || !packageJsonPath) {
    throw new Error(
      'Expected --probe <daemon-package.json> or --launch <daemon-package.json> <Rush version> <repo root>.'
    );
  }
  const metadata: IDaemonInstallationMetadata = readDaemonInstallationMetadata(packageJsonPath);
  const selectedRequire: NodeRequire = createRequire(metadata.launcherPath);
  const rushLibEntryPoint: string = selectedRequire.resolve('@microsoft/rush-lib');
  const rushLib: Partial<typeof import('@microsoft/rush-lib')> = selectedRequire('@microsoft/rush-lib');
  if (typeof rushLib?.Rush?.version !== 'string' || rushLib.Rush.version !== metadata.rushVersion) {
    throw new Error(`Rush runtime and installed metadata disagree for ${metadata.launcherPath}.`);
  }
  // This is the native Rush SDK handoff, pointing at the actual selected engine, not the caller's engine.
  process.env._RUSH_LIB_PATH = rushLibEntryPoint;
  const protocol: { DAEMON_PROTOCOL_VERSION?: IDaemonProtocolVersion } = selectedRequire(
    '@rushstack/rush-daemon-protocol'
  );
  const protocolVersion: IDaemonProtocolVersion | undefined = protocol?.DAEMON_PROTOCOL_VERSION;
  if (
    !protocolVersion ||
    !Number.isSafeInteger(protocolVersion.major) ||
    protocolVersion.major < 0 ||
    !Number.isSafeInteger(protocolVersion.minor) ||
    protocolVersion.minor < 0
  ) {
    throw new Error(`Daemon installation does not attest a valid protocol: ${metadata.launcherPath}`);
  }
  const daemon: Partial<typeof import('./index')> = selectedRequire('@rushstack/rush-daemon');
  const { serveRushDaemonAsync, ProductionDaemonRequestResolver, RushDaemonRequestResolver } = daemon;
  const { resolveDaemonConfiguration } = rushLib;
  const canLaunchRequests: boolean =
    typeof serveRushDaemonAsync === 'function' &&
    typeof ProductionDaemonRequestResolver === 'function' &&
    typeof RushDaemonRequestResolver === 'function' &&
    typeof resolveDaemonConfiguration === 'function';
  const installation: IInstalledDaemonLauncher = {
    ...metadata,
    rushVersion: rushLib.Rush.version,
    rushLibEntryPoint,
    protocolVersion,
    canLaunchRequests
  };
  if (mode === '--probe') {
    process.stdout.write(JSON.stringify(installation));
    return;
  }
  if (!expectedVersion || !repoRoot || expectedVersion !== installation.rushVersion) {
    throw new Error(
      `Cannot launch selected Rush ${expectedVersion}: actual engine is ${installation.rushVersion}.`
    );
  }
  if (
    protocolVersion.major !== DAEMON_PROTOCOL_VERSION.major ||
    protocolVersion.minor < DAEMON_PROTOCOL_VERSION.minor
  ) {
    throw new Error(
      `Selected daemon protocol ${protocolVersion.major}.${protocolVersion.minor} cannot support this launcher.`
    );
  }
  const configured: { rushVersion?: unknown; daemon?: IDaemonConfigurationJson } = JsonFile.load(
    path.join(repoRoot, 'rush.json')
  );
  if ((process.env.RUSH_PREVIEW_VERSION || configured.rushVersion) !== expectedVersion) {
    throw new Error(
      `Selected Rush ${expectedVersion} does not match rush.json or its RUSH_PREVIEW_VERSION override; select again before starting.`
    );
  }
  if (
    !serveRushDaemonAsync ||
    !ProductionDaemonRequestResolver ||
    !RushDaemonRequestResolver ||
    !resolveDaemonConfiguration
  ) {
    throw new Error(`Selected daemon ${installation.daemonVersion} lacks the default request-launch APIs.`);
  }
  const configuration: Readonly<Required<IDaemonConfigurationJson>> = resolveDaemonConfiguration(
    configured.daemon,
    process.env
  );
  await serveRushDaemonAsync({
    repoRoot,
    rushVersion: installation.rushVersion,
    daemonVersion: installation.daemonVersion,
    requestResolver: new RushDaemonRequestResolver(new ProductionDaemonRequestResolver()),
    idleTimeoutSeconds: configuration.idleTimeoutSeconds,
    onError: (error) => {
      process.stderr.write(`${error.stack ?? error.message}\n`);
    },
    onReady: (host) => {
      process.stdout.write(`rushd ready at ${host.paths.socketPath} (Rush ${installation.rushVersion})\n`);
    }
  });
}

if (require.main === module) {
  mainAsync().catch((error: Error) => {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  });
}
