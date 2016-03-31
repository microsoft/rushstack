/**
 * @file RushConfigLoader.ts
 * @Copyright (c) Microsoft Corporation.  All rights reserved.
 *
 * Provides helper functions to load, validate, and read the rush config file
 */

import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import stripJsonComments = require('strip-json-comments');
import Validator = require('z-schema');

export interface IRushProjectConfig {
  packageName: string;
  projectFolder: string;
  dependencies?: string[];
};

/**
 * This interface represents the definitions in the rush.json config file.
 */
interface IRushConfigRawFile {
  commonFolder: string;
  projects: IRushProjectConfig[];
};

export interface IRushConfig {
  commonFolder: string;
  projects: Map<string, IRushProjectConfig>;
};

/**
 * This class loads the rush.json config file, verifies that it conforms to
 * rush-schema.json, and then returns an IRushConfig object.
 */
export default class RushConfigLoader {
  private static _cachedConfig: IRushConfig = undefined;

  public static load(): IRushConfig {
    if (this._cachedConfig) {
      return this._cachedConfig;
    }
    let configFile : string = path.resolve('rush.json');

    if (!fs.existsSync(configFile)) {
      throw new Error(`Project folder not found: ${configFile}`);
    }

    let buffer = fs.readFileSync(configFile);
    let stripped = stripJsonComments(buffer.toString());
    let rawConfig = JSON.parse(stripped) as IRushConfigRawFile;

    // Remove the $schema reference that appears in the config object (used for IntelliSense),
    // since we are replacing it with the precompiled version.  The validator.setRemoteReference()
    // API is a better way to handle this, but we'd first need to publish the schema file
    // to a public web server where Visual Studio can find it.
    delete rawConfig['$schema'];

    let schema = require('./rush-schema.json');
    let validator = new Validator({
      breakOnFirstError: true,
      noTypeless: true
    });

    if (!validator.validate(rawConfig, schema)) {
      let error: ZSchema.Error = validator.getLastError();

      let detail: ZSchema.ErrorDetail = error.details[0];
      let errorMessage: string = `Error parsing file '${path.basename(configFile)}', section [${detail.path}]:`
        + os.EOL + `(${detail.code}) ${detail.message} `;

      console.log(os.EOL + 'ERROR: ' + errorMessage + os.EOL + os.EOL);
      throw new Error(errorMessage);
    }

    const projectMap = new Map<string, IRushProjectConfig>();
    rawConfig.projects.forEach((project: IRushProjectConfig) => {
      if (!project.dependencies) {
        project.dependencies = [];
      }
      projectMap.set(project.packageName, project);
    });

    return this._cachedConfig = {
      commonFolder: rawConfig.commonFolder,
      projects: projectMap
    };
  }

  /**
   * Returns the folder path for the specified project, e.g. "./lib1"
   * for "lib1".  Reports an error if the folder does not exist.
   */
  public static getProjectFolder(project: string): string {
    const projectFolder = path.join(path.resolve('.'), project);
    if (!fs.existsSync(projectFolder)) {
      throw new Error(`Project folder not found: ${project}`);
    }
    return projectFolder;
  }

  /**
   * Returns the "commonFolder" specified in rush.config.  The common folder
   * contains the "node_modules" folder that is shared by all projects.
   * Reports an error if the folder does not exist.
   */
  public static getCommonFolder(): string {
    const config = this.load();
    const commonFolder = path.resolve(config.commonFolder);
    if (!fs.existsSync(commonFolder)) {
      throw new Error(`Common folder not found: ${config.commonFolder}`);
    }
    return commonFolder;
  }
}
