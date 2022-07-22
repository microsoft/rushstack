// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { render, Result, SassError } from 'node-sass';
import * as postcss from 'postcss';
import cssModules from 'postcss-modules';
import { FileSystem } from '@rushstack/node-core-library';
import { IStringValueTypings, StringValuesTypingsGenerator } from '@rushstack/typings-generator';

/**
 * @public
 */
export interface ISassConfiguration {
  /**
   * Source code root directory.
   * Defaults to "src/".
   */
  srcFolder: string;

  /**
   * Output directory for generated Sass typings.
   * Defaults to "temp/sass-ts/".
   */
  generatedTsFolder: string;

  /**
   * Optional additional folders to which Sass typings should be output.
   */
  secondaryGeneratedTsFolders?: string[];

  /**
   * Output directories for compiled CSS
   */
  cssOutputFolders?: string[];

  /**
   * Determines whether export values are wrapped in a default property, or not.
   * Defaults to true.
   */
  exportAsDefault: boolean;

  /**
   * Files with these extensions will pass through the Sass transpiler for typings generation.
   * Defaults to [".sass", ".scss", ".css"]
   */
  fileExtensions: string[];

  /**
   * A list of paths used when resolving Sass imports.
   * The paths should be relative to the project root.
   * Defaults to ["node_modules", "src"]
   */
  importIncludePaths: string[];

  /**
   * A list of file paths relative to the "src" folder that should be excluded from typings generation.
   */
  excludeFiles?: string[];
}

/**
 * @public
 */
export interface ISassTypingsGeneratorOptions {
  sassConfiguration: ISassConfiguration;
}

interface IClassMap {
  [className: string]: string;
}

/**
 * Generates type files (.d.ts) for Sass/SCSS/CSS files.
 *
 * @public
 */
export class SassTypingsGenerator extends StringValuesTypingsGenerator {
  /**
   * @param buildFolder - The project folder to search for Sass files and
   *     generate typings.
   */
  public constructor(options: ISassTypingsGeneratorOptions) {
    const { sassConfiguration } = options;
    const {
      srcFolder,
      generatedTsFolder,
      exportAsDefault,
      fileExtensions,
      cssOutputFolders
    } = sassConfiguration;
    const exportAsDefaultInterfaceName: string = 'IExportStyles'

    const getCssPaths: ((relativePath: string) => string[]) | undefined = cssOutputFolders
      ? (relativePath: string): string[] => {
          return cssOutputFolders.map(
            (folder: string) =>
              `${folder}/${relativePath.endsWith('.css') ? relativePath : `${relativePath}.css`}`
          );
        }
      : undefined;

    super({
      srcFolder,
      generatedTsFolder,
      exportAsDefault,
      exportAsDefaultInterfaceName,
      fileExtensions,
      filesToIgnore: sassConfiguration.excludeFiles,
      secondaryGeneratedTsFolders: sassConfiguration.secondaryGeneratedTsFolders,

      getAdditionalOutputFiles: getCssPaths,

      // Generate typings function
      parseAndGenerateTypings: async (fileContents: string, filePath: string, relativePath: string) => {
        if (this._isSassPartial(filePath)) {
          // Do not generate typings for Sass partials.
          return;
        }

        const css: string = await this._transpileSassAsync(
          fileContents,
          filePath,
          sassConfiguration.importIncludePaths
        );

        let classMap: IClassMap = {};
        const cssModulesClassMapPlugin: postcss.Plugin = cssModules({
          getJSON: (cssFileName: string, json: IClassMap) => {
            // This callback will be invoked durint the promise evaluation of the postcss process() function.
            classMap = json;
          },
          // Avoid unnecessary name hashing.
          generateScopedName: (name: string) => name
        });

        await postcss.default([cssModulesClassMapPlugin]).process(css, { from: filePath });

        if (getCssPaths) {
          await Promise.all(
            getCssPaths(relativePath).map(async (cssFile: string) => {
              // The typings generator processes files serially and the number of output folders is expected to be small,
              // thus throttling here is not currently a concern.
              await FileSystem.writeFileAsync(cssFile, css, {
                ensureFolderExists: true
              });
            })
          );
        }

        const sortedClassNames: string[] = Object.keys(classMap).sort();

        const sassTypings: IStringValueTypings = {
          typings: sortedClassNames.map((exportName: string) => {
            return {
              exportName
            };
          })
        };

        return sassTypings;
      }
    });
  }

  /**
   * Sass partial files are snippets of CSS meant to be included in other Sass files.
   * Partial filenames always begin with a leading underscore and do not produce a CSS output file.
   */
  private _isSassPartial(filePath: string): boolean {
    return path.basename(filePath)[0] === '_';
  }

  private async _transpileSassAsync(
    fileContents: string,
    filePath: string,
    importIncludePaths: string[]
  ): Promise<string> {
    const result: Result = await new Promise(
      (resolve: (result: Result) => void, reject: (err: Error) => void) => {
        render(
          {
            data: fileContents,
            file: filePath,
            importer: (url: string) => ({ file: this._patchSassUrl(url) }),
            includePaths: importIncludePaths,
            indentedSyntax: path.extname(filePath).toLowerCase() === '.sass'
          },
          (err: SassError, result: Result) => {
            if (err) {
              // Extract location information and format into the error message until we have a concept
              // of location-aware diagnostics in Heft.
              return reject(new Error(`${err.file}(${err.column},${err.line}): ${err.message}`));
            }
            resolve(result);
          }
        );
      }
    );

    // Register any @import files as dependencies.
    for (const dependency of result.stats.includedFiles) {
      this.registerDependency(filePath, dependency);
    }

    return result.css.toString();
  }

  private _patchSassUrl(url: string): string {
    if (url[0] === '~') {
      return 'node_modules/' + url.slice(1);
    }

    return url;
  }
}
