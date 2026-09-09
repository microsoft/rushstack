// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs/promises';
import type { Dirent, Stats } from 'node:fs';
import * as path from 'node:path';
import { createHash, type Hash } from 'node:crypto';

import { Path } from '@rushstack/node-core-library';

import type { IDaemonIpcConfiguration, RushProjectConfiguration } from '../../api/RushProjectConfiguration';
import type { RushConfigurationProject } from '../../api/RushConfigurationProject';

const MAX_IMPLEMENTATION_ENTRIES: number = 256;
const MAX_IMPLEMENTATION_BYTES: number = 8 * 1024 * 1024;
const MAX_IMPLEMENTATION_DEPTH: number = 16;

export interface IResolvedDaemonIpcConfiguration {
  readonly entryPoint: string;
  readonly args: ReadonlyArray<string>;
  readonly implementationHash: string;
}

/** The dedicated entrypoint directory is the explicit implementation boundary, not a module-closure guess. */
export async function resolveDaemonIpcConfigurationAsync(
  projectFolder: string,
  descriptor: IDaemonIpcConfiguration
): Promise<IResolvedDaemonIpcConfiguration> {
  const entry: string = descriptor.entryPoint;
  if (
    typeof entry !== 'string' || !entry || entry.includes('\0') ||
    path.isAbsolute(entry) || path.win32.isAbsolute(entry) || !/\.(?:cjs|mjs|js)$/.test(entry) ||
    (descriptor.args !== undefined &&
      (!Array.isArray(descriptor.args) || descriptor.args.some((arg) => typeof arg !== 'string' || arg.includes('\0'))))
  ) {
    throw new Error('daemonIpc requires a project-relative Node entryPoint and literal string args without NUL.');
  }
  const project: string = await fs.realpath(projectFolder);
  const lexicalEntry: string = path.resolve(project, entry);
  const lexicalRoot: string = path.dirname(lexicalEntry);
  if (!Path.isUnder(lexicalRoot, project)) {
    throw new Error('daemonIpc.entryPoint must be inside a dedicated implementation subdirectory of the project.');
  }
  const root: string = await fs.realpath(lexicalRoot);
  const entryPoint: string = await fs.realpath(lexicalEntry);
  if (!Path.isUnder(root, project) || !Path.isUnder(entryPoint, root)) {
    throw new Error('daemonIpc implementation must remain physically inside its project and dedicated directory.');
  }
  const hash: Hash = createHash('sha256');
  hash.update(JSON.stringify([root, entryPoint]));
  let entryCount: number = 0;
  let byteCount: number = 0;
  const visitAsync = async (folder: string, depth: number): Promise<void> => {
    if (depth > MAX_IMPLEMENTATION_DEPTH) throw new Error('daemonIpc implementation exceeds 16 directory levels.');
    const entries: Dirent[] = await fs.readdir(folder, { withFileTypes: true });
    entries.sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0);
    for (const item of entries) {
      if (++entryCount > MAX_IMPLEMENTATION_ENTRIES) throw new Error('daemonIpc implementation exceeds 256 entries.');
      const filename: string = path.join(folder, item.name);
      if (item.isDirectory()) {
        hash.update(JSON.stringify(['directory', path.relative(root, filename)]));
        await visitAsync(filename, depth + 1);
      } else if (item.isFile()) {
        const stat: Stats = await fs.stat(filename);
        if (byteCount + stat.size > MAX_IMPLEMENTATION_BYTES) throw new Error('daemonIpc implementation exceeds 8 MiB.');
        const contents: Buffer = await fs.readFile(filename);
        byteCount += contents.byteLength;
        if (byteCount > MAX_IMPLEMENTATION_BYTES) throw new Error('daemonIpc implementation exceeds 8 MiB.');
        hash.update(JSON.stringify(['file', path.relative(root, filename), contents.byteLength]));
        hash.update(contents);
      } else {
        throw new Error(`daemonIpc implementation contains an unsupported link or special file: ${filename}`);
      }
    }
  };
  await visitAsync(root, 0);
  if (!(await fs.stat(entryPoint)).isFile()) throw new Error('daemonIpc.entryPoint must be a regular file.');
  return { entryPoint, args: Object.freeze([...(descriptor.args ?? [])]), implementationHash: hash.digest('hex') };
}

export async function getDaemonIpcImplementationIdentityAsync(
  configurations: ReadonlyMap<RushConfigurationProject, RushProjectConfiguration>,
  enabled: boolean
): Promise<string> {
  if (!enabled) return '';
  const identities: string[][] = [];
  for (const [project, configuration] of configurations) {
    for (const [name, settings] of configuration.operationSettingsByOperationName) {
      if (!settings.daemonIpc) continue;
      const resolved: IResolvedDaemonIpcConfiguration = await resolveDaemonIpcConfigurationAsync(project.projectFolder, settings.daemonIpc);
      identities.push([project.packageName, name, resolved.implementationHash]);
    }
  }
  identities.sort(([leftProject, leftName], [rightProject, rightName]) =>
    leftProject < rightProject ? -1 : leftProject > rightProject ? 1 : leftName < rightName ? -1 : leftName > rightName ? 1 : 0
  );
  return JSON.stringify(identities);
}
