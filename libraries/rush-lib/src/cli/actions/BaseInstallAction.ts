// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type {
  CommandLineFlagParameter,
  CommandLineIntegerParameter,
  CommandLineStringParameter,
  IRequiredCommandLineIntegerParameter
} from '@rushstack/ts-command-line';
import { AlreadyReportedError } from '@rushstack/node-core-library';
import { Colorize } from '@rushstack/terminal';

import { BaseRushAction, type IBaseRushActionOptions } from './BaseRushAction.ts';
import { Event } from '../../api/EventHooks.ts';
import type { BaseInstallManager } from '../../logic/base/BaseInstallManager.ts';
import type { IInstallManagerOptions } from '../../logic/base/BaseInstallManagerTypes.ts';
import { PurgeManager } from '../../logic/PurgeManager.ts';
import { SetupChecks } from '../../logic/SetupChecks.ts';
import { StandardScriptUpdater } from '../../logic/StandardScriptUpdater.ts';
import { Stopwatch } from '../../utilities/Stopwatch.ts';
import { VersionMismatchFinder } from '../../logic/versionMismatch/VersionMismatchFinder.ts';
import { RushConstants } from '../../logic/RushConstants.ts';
import { SUBSPACE_LONG_ARG_NAME, type SelectionParameterSet } from '../parsing/SelectionParameterSet.ts';
import type { RushConfigurationProject } from '../../api/RushConfigurationProject.ts';
import type { Subspace } from '../../api/Subspace.ts';
import { getVariantAsync, VARIANT_PARAMETER } from '../../api/Variants.ts';
import { measureAsyncFn } from '../../utilities/performance.ts';

/**
 * Temporary data structure used by `BaseInstallAction.runAsync()`
 */
interface ISubspaceInstallationData {
  selectedProjects: Set<RushConfigurationProject>;
  pnpmFilterArgumentValues: string[];
}

/**
 * This is the common base class for InstallAction and UpdateAction.
 */
export abstract class BaseInstallAction extends BaseRushAction {
  protected readonly _variantParameter: CommandLineStringParameter;
  protected readonly _purgeParameter: CommandLineFlagParameter;
  protected readonly _bypassPolicyParameter: CommandLineFlagParameter;
  protected readonly _noLinkParameter: CommandLineFlagParameter;
  protected readonly _networkConcurrencyParameter: CommandLineIntegerParameter;
  protected readonly _debugPackageManagerParameter: CommandLineFlagParameter;
  protected readonly _maxInstallAttempts: IRequiredCommandLineIntegerParameter;
  protected readonly _ignoreHooksParameter: CommandLineFlagParameter;
  protected readonly _offlineParameter: CommandLineFlagParameter;
  /*
   * Subclasses can initialize the _selectionParameters property in order for
   * the parameters to be written to the telemetry file
   */
  protected _selectionParameters?: SelectionParameterSet;

  public constructor(options: IBaseRushActionOptions) {
    super(options);

    this._purgeParameter = this.defineFlagParameter({
      parameterLongName: '--purge',
      parameterShortName: '-p',
      description: 'Perform "rush purge" before starting the installation'
    });
    this._bypassPolicyParameter = this.defineFlagParameter({
      parameterLongName: RushConstants.bypassPolicyFlagLongName,
      description: `Overrides enforcement of the "gitPolicy" rules from ${RushConstants.rushJsonFilename} (use honorably!)`
    });
    this._noLinkParameter = this.defineFlagParameter({
      parameterLongName: '--no-link',
      description:
        'If "--no-link" is specified, then project symlinks will NOT be created' +
        ' after the installation completes.  You will need to run "rush link" manually.' +
        ' This flag is useful for automated builds that want to report stages individually' +
        ' or perform extra operations in between the two stages. This flag is not supported' +
        ' when using workspaces.'
    });
    this._networkConcurrencyParameter = this.defineIntegerParameter({
      parameterLongName: '--network-concurrency',
      argumentName: 'COUNT',
      description:
        'If specified, limits the maximum number of concurrent network requests.' +
        '  This is useful when troubleshooting network failures.'
    });
    this._debugPackageManagerParameter = this.defineFlagParameter({
      parameterLongName: '--debug-package-manager',
      description:
        'Activates verbose logging for the package manager. You will probably want to pipe' +
        ' the output of Rush to a file when using this command.'
    });
    this._maxInstallAttempts = this.defineIntegerParameter({
      parameterLongName: '--max-install-attempts',
      argumentName: 'NUMBER',
      description: `Overrides the default maximum number of install attempts.`,
      defaultValue: RushConstants.defaultMaxInstallAttempts
    });
    this._ignoreHooksParameter = this.defineFlagParameter({
      parameterLongName: '--ignore-hooks',
      description:
        `Skips execution of the "eventHooks" scripts defined in ${RushConstants.rushJsonFilename}. ` +
        'Make sure you know what you are skipping.'
    });
    this._offlineParameter = this.defineFlagParameter({
      parameterLongName: '--offline',
      description:
        `Enables installation to be performed without internet access. PNPM will instead report an error` +
        ` if the necessary NPM packages cannot be obtained from the local cache.` +
        ` For details, see the documentation for PNPM's "--offline" parameter.`
    });
    this._variantParameter = this.defineStringParameter(VARIANT_PARAMETER);
  }

  protected abstract buildInstallOptionsAsync(): Promise<Omit<IInstallManagerOptions, 'subspace'>>;

  protected async runAsync(): Promise<void> {
    const installManagerOptions: Omit<IInstallManagerOptions, 'subspace'> =
      await this.buildInstallOptionsAsync();

    // If we are doing a filtered install and subspaces is enabled, we need to find the affected subspaces and install for all of them.
    let selectedSubspaces: ReadonlySet<Subspace> | undefined;
    const subspaceInstallationDataBySubspace: Map<Subspace, ISubspaceInstallationData> = new Map();
    if (this.rushConfiguration.subspacesFeatureEnabled) {
      // Selecting all subspaces if preventSelectingAllSubspaces is not enabled in subspaces.json
      if (
        this.rushConfiguration.subspacesConfiguration?.preventSelectingAllSubspaces &&
        !this._selectionParameters?.didUserSelectAnything()
      ) {
        this.terminal.writeLine();
        this.terminal.writeLine(
          Colorize.red(
            `The subspaces preventSelectingAllSubspaces configuration is enabled, which enforces installation for a specified set of subspace,` +
              ` passed by the "${SUBSPACE_LONG_ARG_NAME}" parameter or selected from targeted projects using any project selector.`
          )
        );
        throw new AlreadyReportedError();
      }

      const { selectedProjects } = installManagerOptions;

      if (selectedProjects.size === this.rushConfiguration.projects.length) {
        // Optimization for the common case, equivalent to the logic below
        selectedSubspaces = new Set<Subspace>(this.rushConfiguration.subspaces);
      } else {
        selectedSubspaces = this.rushConfiguration.getSubspacesForProjects(selectedProjects);
        for (const selectedSubspace of selectedSubspaces) {
          let subspaceSelectedProjects: Set<RushConfigurationProject>;
          let pnpmFilterArgumentValues: string[];
          if (selectedSubspace.getPnpmOptions()?.alwaysFullInstall) {
            subspaceSelectedProjects = new Set(selectedSubspace.getProjects());
            pnpmFilterArgumentValues = [];
          } else {
            // This may involve filtered installs. Go through each project, add its subspace's pnpm filter arguments
            subspaceSelectedProjects = new Set();
            pnpmFilterArgumentValues = [];
            for (const project of selectedSubspace.getProjects()) {
              if (selectedProjects.has(project)) {
                subspaceSelectedProjects.add(project);
                pnpmFilterArgumentValues.push(project.packageName);
              }
            }
          }

          subspaceInstallationDataBySubspace.set(selectedSubspace, {
            selectedProjects: subspaceSelectedProjects,
            pnpmFilterArgumentValues
          });
        }
      }
    }

    const variant: string | undefined = await getVariantAsync(
      this._variantParameter,
      this.rushConfiguration,
      false
    );
    if (selectedSubspaces) {
      // Check each subspace for version inconsistencies
      for (const subspace of selectedSubspaces) {
        VersionMismatchFinder.ensureConsistentVersions(this.rushConfiguration, this.terminal, {
          subspace,
          variant
        });
      }
    } else {
      VersionMismatchFinder.ensureConsistentVersions(this.rushConfiguration, this.terminal, {
        subspace: undefined,
        variant
      });
    }

    const stopwatch: Stopwatch = Stopwatch.start();

    SetupChecks.validate(this.rushConfiguration);
    let warnAboutScriptUpdate: boolean = false;
    if (this.actionName === 'update') {
      warnAboutScriptUpdate = await StandardScriptUpdater.updateAsync(this.rushConfiguration);
    } else {
      await StandardScriptUpdater.validateAsync(this.rushConfiguration);
    }

    this.eventHooksManager.handle(
      Event.preRushInstall,
      this.parser.isDebug,
      this._ignoreHooksParameter.value
    );

    const purgeManager: PurgeManager = new PurgeManager(this.rushConfiguration, this.rushGlobalFolder);

    if (this._purgeParameter.value!) {
      // eslint-disable-next-line no-console
      console.log('The --purge flag was specified, so performing "rush purge"');
      purgeManager.purgeNormal();
      // eslint-disable-next-line no-console
      console.log('');
    }

    if (this._networkConcurrencyParameter.value) {
      if (this.rushConfiguration.packageManager !== 'pnpm') {
        throw new Error(
          `The "${this._networkConcurrencyParameter.longName}" parameter is` +
            ` only supported when using the PNPM package manager.`
        );
      }
    }

    if (this._maxInstallAttempts.value < 1) {
      throw new Error(`The value of "${this._maxInstallAttempts.longName}" must be positive and nonzero.`);
    }

    const installManagerFactoryModule: typeof import('../../logic/InstallManagerFactory.ts') = await import(
      /* webpackChunkName: 'InstallManagerFactory' */
      '../../logic/InstallManagerFactory.ts'
    );
    let installSuccessful: boolean = true;

    try {
      if (selectedSubspaces) {
        // Run the install for each affected subspace
        for (const subspace of selectedSubspaces) {
          const subspaceInstallationData: ISubspaceInstallationData | undefined =
            subspaceInstallationDataBySubspace.get(subspace);
          // eslint-disable-next-line no-console
          console.log(Colorize.green(`Installing for subspace: ${subspace.subspaceName}`));
          let installManagerOptionsForInstall: IInstallManagerOptions;
          if (subspaceInstallationData) {
            // This will install the selected of projects in the subspace
            const { selectedProjects, pnpmFilterArgumentValues } = subspaceInstallationData;
            installManagerOptionsForInstall = {
              ...installManagerOptions,
              selectedProjects,
              // IMPORTANT: SelectionParameterSet.getPnpmFilterArgumentValuesAsync() already calculated
              // installManagerOptions.pnpmFilterArgumentValues using PNPM CLI operators such as "...my-app".
              // But with subspaces, "pnpm install" can only see the subset of projects in subspace's temp workspace,
              // therefore an operator like "--filter ...my-app" will malfunction.  As a workaround, here we are
              // overwriting installManagerOptions.pnpmFilterArgumentValues with a flat last of project names that
              // were calculated by Rush.
              //
              // TODO: If the flat list produces too many "--filter" arguments, invoking "pnpm install" will exceed
              // the maximum command length and fail on Windows OS.  Once this is solved, we can eliminate the
              // redundant logic from SelectionParameterSet.getPnpmFilterArgumentValuesAsync().
              pnpmFilterArgumentValues,
              subspace
            };
          } else {
            // This will install all projects in the subspace
            installManagerOptionsForInstall = {
              ...installManagerOptions,
              pnpmFilterArgumentValues: [],
              subspace
            };
          }

          await this._doInstallAsync(
            installManagerFactoryModule,
            purgeManager,
            installManagerOptionsForInstall
          );
        }
      } else {
        // Simple case when subspacesFeatureEnabled=false
        await this._doInstallAsync(installManagerFactoryModule, purgeManager, {
          ...installManagerOptions,
          subspace: this.rushConfiguration.defaultSubspace
        });
      }
    } catch (error) {
      installSuccessful = false;
      throw error;
    } finally {
      await measureAsyncFn('rush:installManager:startDeleteAllAsync', () =>
        purgeManager.startDeleteAllAsync()
      );
      stopwatch.stop();

      this._collectTelemetry(stopwatch, installManagerOptions, installSuccessful);
      this.parser.flushTelemetry();
      this.eventHooksManager.handle(
        Event.postRushInstall,
        this.parser.isDebug,
        this._ignoreHooksParameter.value
      );
    }

    if (warnAboutScriptUpdate) {
      // eslint-disable-next-line no-console
      console.log(
        '\n' +
          Colorize.yellow(
            'Rush refreshed some files in the "common/scripts" folder.' +
              '  Please commit this change to Git.'
          )
      );
    }

    // eslint-disable-next-line no-console
    console.log(
      '\n' + Colorize.green(`Rush ${this.actionName} finished successfully. (${stopwatch.toString()})`)
    );
  }

  private async _doInstallAsync(
    installManagerFactoryModule: typeof import('../../logic/InstallManagerFactory.ts'),
    purgeManager: PurgeManager,
    installManagerOptions: IInstallManagerOptions
  ): Promise<void> {
    const installManager: BaseInstallManager =
      await installManagerFactoryModule.InstallManagerFactory.getInstallManagerAsync(
        this.rushConfiguration,
        this.rushGlobalFolder,
        purgeManager,
        installManagerOptions
      );

    await measureAsyncFn('rush:installManager:doInstallAsync', () => installManager.doInstallAsync());
  }

  private _collectTelemetry(
    stopwatch: Stopwatch,
    installManagerOptions: Omit<IInstallManagerOptions, 'subspace'>,
    success: boolean
  ): void {
    if (this.parser.telemetry) {
      const extraData: Record<string, string> = {
        mode: this.actionName,
        clean: (!!this._purgeParameter.value).toString(),
        debug: installManagerOptions.debug.toString(),
        full: installManagerOptions.fullUpgrade.toString(),
        ...this.getParameterStringMap(),
        ...this._selectionParameters?.getTelemetry()
      };
      this.parser.telemetry.log({
        name: 'install',
        durationInSeconds: stopwatch.duration,
        result: success ? 'Succeeded' : 'Failed',
        extraData
      });
    }
  }
}
