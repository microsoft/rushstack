// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { render, Result, SassError } from 'node-sass';
import * as postcss from 'postcss';
import cssModules from 'postcss-modules';
import { FileSystem, LegacyAdapters } from '@rushstack/node-core-library';
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
  buildFolderPath: string;
  sassConfiguration: ISassConfiguration;
}

interface IClassMap {
  [className: string]: string;
}

const EXPORT_DEFAULT_INTERFACE_NAME: 'IExportStyles' = 'IExportStyles';

/**
 * Generates type files (.d.ts) for Sass/SCSS/CSS files and optionally produces CSS files.
 *
 * @public
 */
export class SassProcessor extends StringValuesTypingsGenerator {
  /**
   * @param buildFolder - The project folder to search for Sass files and
   *     generate typings.
   */
  public constructor(options: ISassTypingsGeneratorOptions) {
    const { buildFolderPath: buildFolder, sassConfiguration } = options;
    const srcFolder: string = sassConfiguration.srcFolder || `${buildFolder}/src`;
    const generatedTsFolder: string = sassConfiguration.generatedTsFolder || `${buildFolder}/temp/sass-ts`;
    const exportAsDefault: boolean =
      sassConfiguration.exportAsDefault === undefined ? true : sassConfiguration.exportAsDefault;
    const fileExtensions: string[] = sassConfiguration.fileExtensions || ['.sass', '.scss', '.css'];
    const { cssOutputFolders } = sassConfiguration;

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
      fileExtensions,
      exportAsDefaultInterfaceName: EXPORT_DEFAULT_INTERFACE_NAME,
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
          buildFolder,
          sassConfiguration.importIncludePaths
        );

        let classMap: IClassMap = {};
        const cssModulesClassMapPlugin: postcss.Plugin = cssModules({
          getJSON: (cssFileName: string, json: IClassMap) => {
            // This callback will be invoked during the promise evaluation of the postcss process() function.
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
    const lastSlashIndex: number = filePath.lastIndexOf('/');
    return filePath.charAt(lastSlashIndex + 1) === '_';
  }

  private async _transpileSassAsync(
    fileContents: string,
    filePath: string,
    buildFolder: string,
    importIncludePaths: string[] | undefined
  ): Promise<string> {
    let result: Result;
    try {
      result = await LegacyAdapters.convertCallbackToPromise(render, {
        data: fileContents,
        file: filePath,
        importer: (url: string) => ({ file: this._patchSassUrl(url) }),
        includePaths: importIncludePaths
          ? importIncludePaths
          : [`${buildFolder}/node_modules`, `${buildFolder}/src`],
        indentedSyntax: filePath.toLowerCase().endsWith('.sass')
      });
    } catch (err) {
      const typedError: SassError = err;

      // Extract location information and format into the error message until we have a concept
      // of location-aware diagnostics in Heft.
      throw new Error(`${typedError.file}(${typedError.column},${typedError.line}): ${typedError.message}`);
    }

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
