// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import {
  JsonFile,
  FileSystem
} from '@microsoft/node-core-library';
import { ApiExtractorRunner as TApiExtractorRunner } from '@microsoft/rush-stack-compiler-2.7';
import { IExtractorConfig, IExtractorOptions } from '@microsoft/api-extractor';

import { RSCTask, IRSCTaskConfig } from './RSCTask';

/** @public */
export interface IApiExtractorTaskConfig extends IRSCTaskConfig {
  /**
   * Indicates whether the task should be run.
   */
  enabled: boolean;

  /**
   * The file path of the exported entry point, relative to the project folder.
   *
   * Example: "lib/index.d.ts"
   */
  entry?: string;

  /**
   * The file path of the folder containing API files to be reviewed, relative to
   * the project folder.  This is part of an API review workflow:  During a build,
   * the ApiExtractorTask will output an API file, e.g. "my-project/temp/my-project.api.ts".
   * It will then compare this file against the last reviewed file,
   * e.g. "../api-review/my-project.api.ts" (assuming that apiReviewFolder is "../api-review").
   * If the files are different, the build will fail with an error message that instructs
   * the developer to update the approved file, and then commit it to Git.  When they
   * create a Pull Request, a VSO branch policy will look for changes under "api-review/*"
   * and require signoff from the appropriate reviewers.
   *
   * Example: "config" (for a standalone project)
   * Example: "../../common/api-review"  (for a Git repository with Rush)
   */
  apiReviewFolder?: string;

  /**
   * The file path of the folder containing the *.api.json output file containing
   * API information. The default location is in the “dist” folder,
   * e.g. my-project/dist/my-project.api.json. This file should be published as part
   * of the NPM package. When building other projects that depend on this package,
   * api-extractor will look for this file in the node_modules folder and use it as an input.
   * The *.api.json file is also consumed by a tool at
   * https://github.com/SharePoint/ts-spec-gen that generates an online API documentation.
   */
  apiJsonFolder?: string;

  /**
   * If true, then API Extractor will generate *.d.ts rollup files for this project.
   * @beta
   */
  generateDtsRollup?: boolean;

  /**
   * Only used if generateDtsRollup=true.  If dtsRollupTrimming=true, then API Extractor will
   * generate separate *.d.ts rollup files for internal, beta, and public release types;
   * otherwise a single *.d.ts file will be generated with no trimming.
   * @beta
   */
  dtsRollupTrimming: boolean;

  /**
   * This setting is only used if dtsRollupTrimming is true.
   * It indicates the folder where "npm publish" will be run for an internal release.
   * The default value is "./dist/internal".
   *
   * @beta
   * An internal release will contain all definitions that are reachable from the entry point.
   */
  publishFolderForInternal?: string;

  /**
   * This setting is only used if dtsRollupTrimming is true.
   * It indicates the folder where "npm publish" will be run for a beta release.
   * The default value is "./dist/beta".
   *
   * @beta
   * A beta release will contain all definitions that are reachable from the entry point,
   * except definitions marked as \@alpha or \@internal.
   */
  publishFolderForBeta?: string;

  /**
   * This setting is only used if dtsRollupTrimming is true.
   * It indicates the folder where "npm publish" will be run for a public release.
   * The default value is "./dist/public".
   *
   * @beta
   * A public release will contain all definitions that are reachable from the entry point,
   * except definitions marked as \@beta, \@alpha, or \@internal.
   */
  publishFolderForPublic?: string;

  /**
   * This option causes the typechecker to be invoked with the --skipLibCheck option. This option is not
   * recommended and may cause API Extractor to produce incomplete or incorrect declarations, but it
   * may be required when dependencies contain declarations that are incompatible with the TypeScript engine
   * that API Extractor uses for its analysis. If this option is used, it is strongly recommended that broken
   * dependencies be fixed or upgraded.
   */
  skipLibCheck?: boolean;
}

/**
 * The ApiExtractorTask uses the api-extractor tool to analyze a project for public APIs. api-extractor will detect
 * common problems and generate a report of the exported public API. The task uses the entry point of a project to
 * find the aliased exports of the project. An api-extractor.ts file is generated for the project in the temp folder.
 * @beta
 */
export class ApiExtractorTask extends RSCTask<IApiExtractorTaskConfig>  {
  constructor() {
    super(
      'api-extractor',
      {
        enabled: false,
        entry: undefined,
        apiReviewFolder: undefined,
        apiJsonFolder: undefined
      }
    );
  }

  public loadSchema(): Object {
    return JsonFile.load(path.resolve(__dirname, 'schemas', 'api-extractor.schema.json'));
  }

  public isEnabled(): boolean {
    return !!this.taskConfig.enabled;
  }

  public executeTask(): Promise<void> {
    this.initializeRushStackCompiler();

    if (!this._validateConfiguration()) {
      return Promise.resolve();
    }

    if (!this.taskConfig.entry) {
      return Promise.reject(new Error('entry must be defined'));
    }

    if (!this.taskConfig.apiJsonFolder) {
      return Promise.reject(new Error('apiJsonFolder must be defined'));
    }

    if (!this.taskConfig.apiReviewFolder) {
      return Promise.reject(new Error('apiReviewFolder must be defined'));
    }

    let entryPointFile: string;
    if (this.taskConfig.entry === 'src/index.ts') {
      // backwards compatibility for legacy projects that used *.ts files as their entry point
      entryPointFile = path.join(this.buildConfig.rootPath, 'lib/index.d.ts');
    } else {
      entryPointFile = path.join(this.buildConfig.rootPath, this.taskConfig.entry);
    }

    const extractorConfig: IExtractorConfig = {
      compiler: {
        configType: 'tsconfig',
        rootFolder: this.buildConfig.rootPath
      },
      project: {
        entryPointSourceFile: entryPointFile
      },
      apiReviewFile: {
        enabled: true,
        apiReviewFolder: this.taskConfig.apiReviewFolder,
        tempFolder: path.join(this.buildConfig.rootPath, this.buildConfig.tempFolder)
      },
      apiJsonFile: {
        enabled: true,
        outputFolder: this.taskConfig.apiJsonFolder
      }
    };

    if (this.taskConfig.generateDtsRollup) {
      extractorConfig.dtsRollup = {
        enabled: true,
        trimming: !!this.taskConfig.dtsRollupTrimming,
        publishFolderForInternal: this.taskConfig.publishFolderForInternal,
        publishFolderForBeta: this.taskConfig.publishFolderForBeta,
        publishFolderForPublic: this.taskConfig.publishFolderForPublic
      };
    }

    const extractorOptions: IExtractorOptions = {
      localBuild: !this.buildConfig.production,
      skipLibCheck: this.taskConfig.skipLibCheck
    };

    const apiExtractorRunner: TApiExtractorRunner = new this._rushStackCompiler.ApiExtractorRunner(
      extractorConfig,
      extractorOptions,
      this.buildFolder,
      this._terminalProvider
    );

    return apiExtractorRunner.invoke();
  }

  private _validateConfiguration(): boolean {
    if (!this.taskConfig.entry) {
      this.logError('Missing or empty "entry" field in api-extractor.json');
      return false;
    }

    if (!this.taskConfig.apiReviewFolder) {
      this.logError('Missing or empty "apiReviewFolder" field in api-extractor.json');
      return false;
    }

    if (!FileSystem.exists(this.taskConfig.entry)) {
      this.logError(`Entry file ${this.taskConfig.entry} does not exist.`);
      return false;
    }

    return true;
  }
}
