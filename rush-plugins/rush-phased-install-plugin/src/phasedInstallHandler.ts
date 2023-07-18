// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import fs from 'node:fs';
import https from 'node:https';
import os from 'node:os';
import { relative, resolve as resolvePath } from 'node:path';

import type {
  ICreateOperationsContext,
  IExecutionResult,
  IOperationExecutionResult,
  IPhase,
  IPhasedCommand,
  LookupByPath,
  RushConfiguration,
  RushConfigurationProject,
  RushSession
} from '@rushstack/rush-sdk';

import { WorkerPool } from '@rushstack/worker-pool/lib/WorkerPool';

import type {
  IPnpmLockYaml,
  IDependencyMetadata,
  IRefCount,
  IPnpmConfigJson,
  ITarballEntry,
  IPackage,
  IImporter
} from './types';
import { JsonFile, PnpmShrinkwrapFile, Async, Operation } from './externals';

import { LinkOperationRunner } from './operationRunners/LinkOperationRunner';
import { AuthenticateOperationRunner } from './operationRunners/AuthenticateOperationRunner';
import { DownloadOperationRunner } from './operationRunners/DownloadOperationRunner';
import { ParseOperationRunner } from './operationRunners/ParseOperationRunner';
import { UnpackOperationRunner } from './operationRunners/UnpackOperationRunner';
import { InstallOperationRunner } from './operationRunners/InstallOperationRunner';

// eslint-disable-next-line @typescript-eslint/naming-convention
declare const __non_webpack_require__: typeof require;

/**
 * Creates a synthetic phase for tracking purposes.
 */
function createPhase(name: string): IPhase {
  return {
    name: `_phase:${name}`,
    isSynthetic: false,
    logFilenameIdentifier: name,
    associatedParameters: new Set(),
    dependencies: {
      self: new Set(),
      upstream: new Set()
    },
    allowWarningsOnSuccess: false,
    missingScriptBehavior: 'silent'
  };
}

/**
 * Implements the full logic of the plugin. Separated out for performance.
 */
export async function apply(
  plugin: { pluginName: string },
  session: RushSession,
  configuration: RushConfiguration,
  action: IPhasedCommand
): Promise<void> {
  const { pluginName } = plugin;

  // Don't report telemetry, just in case that is the expensive thing.
  (action as { telemetry?: unknown }).telemetry = undefined;

  const { terminal } = session.getLogger(pluginName);
  terminal.writeLine(`Creating phases`);

  const authenticatePhase: IPhase = createPhase('authenticate');
  const downloadPhase: IPhase = createPhase('download');
  const parsePhase: IPhase = createPhase('parse');
  const linkPhase: IPhase = createPhase('link');
  const unpackPhase: IPhase = createPhase('unpack');
  const installPhase: IPhase = createPhase('install');

  const workspaceRoot: string = configuration.commonTempFolder;
  const installRoot: string = `${workspaceRoot}/node_modules/.pnpm`;

  const parallelism: number = os.cpus().length - 1;

  const importerKeyByProject: Map<RushConfigurationProject, string> = new Map();
  function getImporterKeyForProject(project: RushConfigurationProject): string {
    let key: string | undefined = importerKeyByProject.get(project);
    if (!key) {
      importerKeyByProject.set(
        project,
        (key = relative(workspaceRoot, project.projectFolder).replace(/\\/g, '/'))
      );
    }
    return key;
  }

  const projectByKey: LookupByPath<RushConfigurationProject> =
    configuration.getProjectLookupForRoot(workspaceRoot);

  terminal.writeLine(`Loading lockfile and pnpm-config.json`);
  const lockfilePath: string = configuration.getCommittedShrinkwrapFilename();
  const pnpmConfigFilePath: string = `${configuration.commonRushConfigFolder}/pnpm-config.json`;
  const [rawLockfile, pnpmConfig] = await Promise.all([
    fs.promises.readFile(lockfilePath, 'utf8'),
    JsonFile.load(pnpmConfigFilePath),
    fs.promises.mkdir(installRoot, { recursive: true })
  ]);

  const lockfile: IPnpmLockYaml = PnpmShrinkwrapFile.loadFromString(rawLockfile);
  const { importers, packages } = lockfile;

  const pnpmConfigJson: IPnpmConfigJson = pnpmConfig;
  const { globalPatchedDependencies: patchedDependencies } = pnpmConfigJson;
  const patchesDirectory: string = `${configuration.commonFolder}/pnpm-patches/`;

  // This step is only necessary for Rush; normally it occurs after pnpm install.
  terminal.writeLine(`Generating per-project lockfiles`);
  await Async.forEachAsync(
    configuration.projects,
    async (project) => {
      await lockfile.getProjectShrinkwrap(project)?.updateProjectShrinkwrapAsync();
    },
    {
      concurrency: parallelism
    }
  );

  terminal.writeLine(`Initializing shared resources`);
  const tarballPool: IRefCount<WorkerPool> = {
    count: 0,
    ref: new WorkerPool({
      id: 'tarball',
      maxWorkers: parallelism,
      // If bundling, this resolution target should point at the bundled script for better performance
      workerScriptPath: __non_webpack_require__.resolve('./tarballWorker.js')
    })
  };

  const commonAgentOptions: https.AgentOptions = {
    keepAlive: true,
    // Interval between consecutive uses of the same socket should be small, so this should be enough
    // for socket reuse without wasting resources
    keepAliveMsecs: 2000,
    scheduling: 'fifo',
    // Allow twice as many sockets as tracked tasks by the orchestrator; the additional sockets are only used
    // if --pre-authenticate is passed
    maxSockets: parallelism * 2
  };

  /**
   * HTTPS agent that will be used for authentication requests
   */
  const authenticationAgent: IRefCount<https.Agent> = {
    count: 0,
    ref: new https.Agent(commonAgentOptions)
  };

  /**
   * HTTPS agent that will be used for Blob download requests
   */
  class BlobAgent extends https.Agent {
    public constructor() {
      super(commonAgentOptions);
    }

    public getName(): string {
      // Relying on internal knowledge of Azure Artifacts, all returned URLs point to the same Edge CDN load
      // balancer, so we can reuse the connection across the various sharded domains.
      // For other npm registries this may not be applicable. If there is no auth redirect, reuse authenticationAgent.
      return 'blob';
    }
  }

  const blobAgent: IRefCount<https.Agent> = {
    count: 0,
    ref: new BlobAgent()
  };
  terminal.writeLine(`Done initializing shared resources`);

  action.hooks.createOperations.tapPromise(pluginName, createInstallOperationsAsync);

  action.hooks.afterExecuteOperations.tap(pluginName, reportStatistics);

  async function createInstallOperationsAsync(
    originalOperations: Set<Operation>,
    context: ICreateOperationsContext
  ): Promise<Set<Operation>> {
    terminal.writeLine(`Generating install operations`);
    const operations: Set<Operation> = new Set(
      action.actionName === 'phased-install' ? [] : originalOperations
    );

    const dependencyMetadata: Map<string, IDependencyMetadata> = new Map();

    // Operation caches. Only used during creation.
    const authenticateOperations: Map<ITarballEntry, Operation> = new Map();
    const downloadOperations: Map<ITarballEntry, Operation> = new Map();
    const parseOperations: Map<ITarballEntry, Operation> = new Map();
    const linkOperations: Map<string, Operation> = new Map();
    const unpackOperations: Map<string, Operation> = new Map();
    const installOperations: Map<string, Operation> = new Map();

    const tarballByIntegrity: Map<string, ITarballEntry> = new Map();

    const { arch, platform } = process;

    // This is an optimization to kick all the authentication redirects ASAP.
    // Also ignores the Rush parallelism limits
    const preAuthenticate: boolean | undefined = (
      context.customParameters.get('--pre-authenticate') as unknown as { value: boolean }
    )?.value;

    // The name of the feed
    const AZURE_DEVOPS_FEED_NAME: string = 'INSERT FEED NAME HERE';

    /**
     * Gets information about the underlying tarball for a package record.
     * Used for deduplication across multiple installs with the same package but different peers.
     */
    function getOrCreateTarballEntry(
      key: string,
      pack: IPackage,
      packageName: string,
      version: string
    ): ITarballEntry | undefined {
      const integrity: string | undefined = pack.resolution?.integrity;
      if (!integrity) {
        throw new Error(`Missing integrity hash for ${key}`);
      }
      let result: ITarballEntry | undefined = tarballByIntegrity.get(integrity);
      if (!result) {
        tarballByIntegrity.set(
          integrity,
          (result = {
            integrity,
            // The pathname component of the tarball URL. Update to match your registry convention.
            initialPath: `/_apis/packaging/feeds/${AZURE_DEVOPS_FEED_NAME}/npm/packages/${packageName}/versions/${version}/content?api-version=6.0-preview.1`,
            storageUrl: undefined,
            raw: undefined,
            parsed: undefined
          })
        );
      }
      return result;
    }

    function getOrCreateDependencyMetadata(key: string): IDependencyMetadata | undefined {
      let metadata: IDependencyMetadata | undefined = dependencyMetadata.get(key);
      if (!metadata) {
        const deps: Map<string, IDependencyMetadata> = new Map();
        if (key.startsWith('/')) {
          // Package
          const pack: IPackage | undefined = packages.get(key);
          if (!pack) {
            throw new Error(`Broken lockfile! Missing package "${key}"`);
          }
          const firstSlash: number = key.indexOf('/', 1);
          const lastSlash: number = key.lastIndexOf('/');

          const packageName: string = key.slice(1, lastSlash);
          const version: string = key.slice(lastSlash + 1);

          const packageNameForOrigin: string =
            firstSlash !== lastSlash ? packageName.replace('/', '+') : packageName;
          const originFolder: string = `${installRoot}/${packageNameForOrigin}@${version}/node_modules`;
          const targetFolder: string = `${originFolder}/${packageName}`;
          const variantIndex: number = version.indexOf('_');
          const sourceVersion: string = variantIndex >= 0 ? version.slice(0, variantIndex) : version;

          if (pack.optional) {
            if (pack.os && !pack.os.some((value) => value.toLowerCase() === platform)) {
              return;
            }
            if (pack.cpu && !pack.cpu.some((value) => value.toLowerCase() === arch)) {
              return;
            }
          }

          const keyForPatch: string = `${packageName}@${sourceVersion}`;
          const patchPath: string | undefined = patchedDependencies?.[keyForPatch]?.replace(
            /^patches\//,
            patchesDirectory
          );
          if (pack.patched && !patchPath) {
            throw new Error(`Expected a patch definition for ${keyForPatch}`);
          }

          metadata = {
            key,
            hasBin: !!pack.hasBin,
            deps,
            project: undefined,
            requiresBuild: !!pack.requiresBuild,
            patchPath,
            packageName,
            originFolder,
            targetFolder,
            version: sourceVersion,

            tarball: getOrCreateTarballEntry(key, pack, packageName, sourceVersion)
          };
          dependencyMetadata.set(key, metadata);
          if (pack.dependencies) {
            resolveDependencies(pack.dependencies, metadata);
          }
          if (pack.optionalDependencies) {
            resolveDependencies(pack.optionalDependencies, metadata);
          }
        } else {
          const project: RushConfigurationProject | undefined = projectByKey.findChildPath(key);
          if (!project) {
            throw new Error(`Could not find project for ${key}`);
          }
          // Importer
          const importer: IImporter | undefined = importers.get(key);
          if (!importer) {
            throw new Error(`Broken lockfile! Missing importer "${key}"`);
          }

          const packageName: string = project.packageName;
          const targetFolder: string = project.projectFolder;
          const originFolder: string = `${targetFolder}/node_modules`;
          const version: string = project.packageJson.version;
          metadata = {
            key,
            hasBin: !!project.packageJson.bin,
            deps,
            project,
            requiresBuild: false,
            patchPath: undefined,
            packageName,
            originFolder,
            targetFolder,
            version,

            tarball: undefined
          };
          dependencyMetadata.set(key, metadata);
          if (importer.dependencies) {
            resolveDependencies(importer.dependencies, metadata);
          }
          if (importer.devDependencies) {
            resolveDependencies(importer.devDependencies, metadata);
          }
          if (importer.optionalDependencies) {
            resolveDependencies(importer.optionalDependencies, metadata);
          }
        }
      }
      return metadata;
    }

    function resolveDependencyKey(key: string, specifier: string, contextMeta: IDependencyMetadata): string {
      if (specifier.startsWith('/')) {
        return specifier;
      } else if (specifier.startsWith('link:')) {
        if (contextMeta.project) {
          return relative(workspaceRoot, resolvePath(contextMeta.targetFolder, specifier.slice(5))).replace(
            /\\/g,
            '/'
          );
        } else {
          return specifier.slice(5);
        }
      } else {
        return `/${key}/${specifier}`;
      }
    }

    function resolveDependencies(collection: Record<string, string>, meta: IDependencyMetadata): void {
      for (const [key, value] of Object.entries(collection)) {
        const resolved: string = resolveDependencyKey(key, value, meta);
        const metadata: IDependencyMetadata | undefined = getOrCreateDependencyMetadata(resolved);
        if (metadata) {
          meta.deps.set(key, metadata);
        }
      }
    }

    /**
     * Gets or creates an operation to authenticate to the NPM registry and get a download URL for an external
     * package.
     */
    function getOrCreateAuthenticateOperation(metadata: IDependencyMetadata): Operation {
      const { tarball, packageName, version } = metadata;
      let operation: Operation | undefined = authenticateOperations.get(tarball!);
      if (!operation) {
        const name: string = `${packageName}@${version} (authenticate)`;
        const runner: AuthenticateOperationRunner = new AuthenticateOperationRunner(
          name,
          metadata,
          authenticationAgent
        );
        if (preAuthenticate) {
          // Queue immediately to save time.
          runner.fetchTarballURLAsync().catch(() => {
            // Ignore. This will be handled when the operation occurs in sequence.
          });
        }
        operation = new Operation({
          phase: authenticatePhase,
          runner
        });
        authenticateOperations.set(tarball!, operation);
        operations.add(operation);
      }
      return operation;
    }

    /**
     * Gets or creates an operation to download the tarball for an external package to RAM.
     */
    function getOrCreateDownloadOperation(metadata: IDependencyMetadata): Operation {
      const { tarball, packageName, version } = metadata;
      let operation: Operation | undefined = downloadOperations.get(tarball!);
      if (!operation) {
        const name: string = `${packageName}@${version} (download)`;
        operation = new Operation({
          phase: downloadPhase,
          runner: new DownloadOperationRunner(name, metadata, blobAgent)
        });
        downloadOperations.set(tarball!, operation);
        operations.add(operation);

        const authenticateOperation: Operation = getOrCreateAuthenticateOperation(metadata);
        operation.addDependency(authenticateOperation);
      }
      return operation;
    }

    /**
     * Gets or creates an operation to unzip and parse out an index for a tarball via worker thread.
     */
    function getOrCreateParseOperation(metadata: IDependencyMetadata): Operation {
      const { tarball, packageName, version } = metadata;
      let operation: Operation | undefined = parseOperations.get(tarball!);
      if (!operation) {
        const name: string = `${packageName}@${version} (parse)`;
        operation = new Operation({
          phase: parsePhase,
          runner: new ParseOperationRunner(name, metadata, tarballPool)
        });
        parseOperations.set(tarball!, operation);
        operations.add(operation);

        const downloadOperation: Operation = getOrCreateDownloadOperation(metadata);
        operation.addDependency(downloadOperation);
      }
      return operation;
    }

    /**
     * Gets or creates an operation to extract a TAR archive from RAM to disk.
     */
    function getOrCreateUnpackOperation(metadata: IDependencyMetadata): Operation {
      const { key } = metadata;
      let operation: Operation | undefined = unpackOperations.get(key);
      if (!operation) {
        operation = new Operation({
          phase: unpackPhase,
          runner: new UnpackOperationRunner(`${key} (unpack)`, metadata, tarballPool)
        });
        unpackOperations.set(key, operation);
        operations.add(operation);

        const parseOperation: Operation = getOrCreateParseOperation(metadata);
        operation.addDependency(parseOperation);
      }
      return operation;
    }

    /**
     * Gets or creates an operation to create all the symlinks in the package's node_modules folder.
     */
    function getOrCreateLinkOperation(metadata: IDependencyMetadata): Operation {
      const { key } = metadata;
      let operation: Operation | undefined = linkOperations.get(key);
      if (!operation) {
        operation = new Operation({
          phase: linkPhase,
          runner: new LinkOperationRunner(`${key} (link)`, metadata)
        });
        linkOperations.set(key, operation);
        operations.add(operation);
      }
      return operation;
    }

    /**
     * Gets or creates an operation to create the `.bin` folder for a package, apply Git patches,
     * and/or run the npm `preinstall`, `install`, and `postinstall` scripts (as defined).
     */
    function getOrCreateInstallOperation(metadata: IDependencyMetadata): Operation {
      const { key } = metadata;
      let operation: Operation | undefined = installOperations.get(key);
      if (!operation) {
        const name: string = `${key} (install)`;
        operation = new Operation({
          phase: installPhase,
          project: metadata.project,
          runner: new InstallOperationRunner(name, metadata)
        });
        operations.add(operation);
        installOperations.set(key, operation);

        // Since external dependencies can have circular dependencies, simply include all external dependencies
        // at all levels as direct dependencies for sequencing purposes.
        const deepSearch: Set<IDependencyMetadata> = new Set(metadata.deps.values());
        for (const dep of deepSearch) {
          if (dep === metadata) {
            continue;
          }

          if (!dep.project) {
            for (const nestedDep of dep.deps.values()) {
              deepSearch.add(nestedDep);
            }
          }
        }

        if (metadata.project) {
          // If this is a workspace project, there are guaranteed to not be any circular dependencies.
          // Thus can simply depend on the install phase of local and external dependencies.
          for (const dep of deepSearch) {
            const depInstall: Operation = getOrCreateInstallOperation(dep);
            operation.addDependency(depInstall);
          }
        } else {
          // If this is not a workspace project, need to instead wait for the full set of flattened dependencies
          // to have been unpacked. Dependending on `install` is not safe due to circularity risk.
          for (const dep of deepSearch) {
            if (dep.tarball) {
              // Only external dependencies have an `unpack` phase.
              const depUnpack: Operation = getOrCreateUnpackOperation(dep);
              operation.addDependency(depUnpack);
            }

            const depLink: Operation = getOrCreateLinkOperation(metadata);
            operation.addDependency(depLink);
          }
        }

        const thisLink: Operation = getOrCreateLinkOperation(metadata);
        operation.addDependency(thisLink);

        if (metadata.tarball) {
          const thisUnpack: Operation = getOrCreateUnpackOperation(metadata);
          operation.addDependency(thisUnpack);
        }
      }
      return operation;
    }

    /**
     * Since this plugin supports being tacked on to the start of a normal build,
     * iterate over the list of existing operations to add depencies.
     */
    for (const operation of originalOperations) {
      const { associatedProject } = operation;
      if (associatedProject) {
        const importerKey: string = getImporterKeyForProject(associatedProject);
        const metadata: IDependencyMetadata | undefined = getOrCreateDependencyMetadata(importerKey);
        if (metadata) {
          const installOperation: Operation = getOrCreateInstallOperation(metadata);
          if (operations.has(operation)) {
            // If run standalone, the original `_phase:prepare` gets discarded, so don't
            // add a dependency.
            operation.addDependency(installOperation);
          }
        }
      }
    }
    terminal.writeLine(`Done generating operations`);

    terminal.writeLine(`Queueing all authentication requests.`);

    terminal.writeLine(
      {
        text: `Total Packages to Download: `,
        textAttributes: [/* Bold */ 0]
      },
      {
        text: `${downloadOperations.size}`
      }
    );
    terminal.writeLine(
      {
        text: `Total Packages to Unpack: `,
        textAttributes: [/* Bold */ 0]
      },
      {
        text: `${unpackOperations.size}`
      }
    );
    terminal.writeLine(
      {
        text: `Total Packages to install: `,
        textAttributes: [/* Bold */ 0]
      },
      {
        text: `${installOperations.size}`
      }
    );

    return operations;
  }

  /**
   * Reports statistics about the installation performance.
   *
   * @param result - The results of the run
   * @param context - Context used for operation creation
   */
  function reportStatistics(result: IExecutionResult, context: ICreateOperationsContext): void {
    interface ITopNRecord {
      name: string;
      duration: number;
    }
    interface ITimingInfo {
      duration: number;
      topN: ITopNRecord[];
      count: number;
    }

    const statsByPhase: Map<IPhase, ITimingInfo> = new Map();
    const numTop: number = 10;
    let lastOperation: [Operation, IOperationExecutionResult] | undefined;
    for (const item of result.operationResults) {
      const [operation, record] = item;
      const { associatedPhase } = operation;
      if (associatedPhase) {
        const statsForPhase: ITimingInfo | undefined = statsByPhase.get(associatedPhase);
        const { duration } = record.stopwatch;
        if (!statsForPhase) {
          statsByPhase.set(associatedPhase, {
            duration,
            topN: [
              {
                name: operation.name!,
                duration
              }
            ],
            count: 1
          });
        } else {
          statsForPhase.duration += duration;
          statsForPhase.count++;
          const { topN } = statsForPhase;
          const timingRecord: ITopNRecord = {
            name: operation.name!,
            duration
          };
          for (let i: number = topN.length - 1; i >= 0; i--) {
            const existing: ITopNRecord = topN[i];
            if (duration > existing.duration) {
              if (i < numTop - 1) {
                topN[i + 1] = existing;
              }
              topN[i] = timingRecord;
            } else {
              if (i < numTop - 1) {
                topN[i + 1] = timingRecord;
              }
              break;
            }
          }
        }
      }

      if (!lastOperation || record.stopwatch.endTime! > lastOperation[1].stopwatch.endTime!) {
        lastOperation = item;
      }
    }

    terminal.writeLine(`Analytics:`);

    terminal.writeLine(`Critical Path:`);
    while (lastOperation) {
      const [
        operation,
        {
          stopwatch: { startTime, endTime }
        }
      ] = lastOperation;
      terminal.writeLine(
        ` - ${(startTime! / 1000).toFixed(3)}s -> ${(endTime! / 1000).toFixed(3)}s: ${operation.name}`
      );
      lastOperation = undefined;
      for (const dep of operation.dependencies) {
        const depRecord: IOperationExecutionResult = result.operationResults.get(dep)!;
        if (!lastOperation || depRecord.stopwatch.endTime! > lastOperation[1].stopwatch.endTime!) {
          lastOperation = [dep, depRecord];
        }
      }
    }

    terminal.writeLine(`Cumulative duration by phase:`);
    for (const [phase, { duration, topN, count }] of statsByPhase) {
      terminal.writeLine(
        {
          text: `- ${phase.name}: `,
          foregroundColor: /* Cyan */ 6
        },
        {
          text: `${duration} s`,
          foregroundColor: /* White */ 7
        },
        {
          text: ` (${count})`,
          foregroundColor: /* Blue */ 4
        }
      );
      terminal.writeLine(`  Slowest ${topN.length} operations:`);
      for (const record of topN) {
        terminal.writeLine(`  - ${record.duration}s - ${record.name}`);
      }
    }
  }
}
