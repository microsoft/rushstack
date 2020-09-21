import * as path from 'path';
import { render, Result } from 'node-sass';
import * as postcss from 'postcss';
import * as cssModules from 'postcss-modules';
import { StringValuesTypingsGenerator, IStringValueTypings } from '@rushstack/typings-generator';
import { LegacyAdapters } from '@rushstack/node-core-library';

export interface ISassConfiguration {
  /**
   * Source code root directory.
   * Defaults to "src/".
   */
  srcFolder?: string;

  /**
   * Output directory for generated Sass typings.
   * Defaults to "temp/sass-ts/".
   */
  generatedTsFolder?: string;

  /**
   * Determines if export values are wrapped in a default property, or not.
   * Defaults to true.
   */
  exportAsDefault?: boolean;

  /**
   * The name of the export interface.
   * Defaults to "IExportStyles".
   */
  exportAsInterfaceName?: string;

  /**
   * Files with these extensions will pass through the Sass transpiler.
   * Defaults to ["sass", "scss", "css"]
   */
  fileExtensions?: string[];

  /**
   * A list of paths used when resolving Sass imports.
   * The paths should be relative to the project root.
   * Defaults to ["node_modules", "src"]
   */
  includePaths?: string[];
}

/**
 * @public
 */
export interface ISassTypingsGeneratorOptions {
  buildFolder: string;
  sassConfiguration: ISassConfiguration;
}

/**
 * @internal
 */
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
   * @param buildFolder - The project folder to search for Sass files and generate typings.
   */
  public constructor(options: ISassTypingsGeneratorOptions) {
    const { buildFolder, sassConfiguration } = options;
    const srcFolder: string = path.join(buildFolder, 'src');
    const generatedTsFolder: string = path.join(buildFolder, 'temp', 'sass-ts');
    super({
      // Default configuration values
      srcFolder,
      generatedTsFolder,
      exportAsDefault: true,
      exportAsInterfaceName: 'IExportStyles',
      fileExtensions: ['scss', 'sass', 'css'],

      // User configured overrides
      ...sassConfiguration,

      // Generate typings
      parseAndGenerateTypings: async (fileContents: string, filePath: string) => {
        const css: string = await this._transpileSassAsync(
          fileContents,
          filePath,
          buildFolder,
          sassConfiguration.includePaths
        );
        const classNames: string[] = await this._getClassNamesFromCSSAsync(css, filePath);
        const sortedClassNames: string[] = classNames.sort((a, b) => a.localeCompare(b));
        const sassTypings: IStringValueTypings = {
          typings: []
        };
        for (const exportName of sortedClassNames) {
          sassTypings.typings.push({ exportName });
        }

        return sassTypings;
      }
    });
  }

  private async _transpileSassAsync(
    fileContents: string,
    filePath: string,
    buildFolder: string,
    includePaths: string[] | undefined
  ): Promise<string> {
    const result: Result = await LegacyAdapters.convertCallbackToPromise(render, {
      data: fileContents,
      importer: (url: string) => ({ file: this._patchSassUrl(url) }),
      includePaths: includePaths
        ? includePaths
        : [path.join(buildFolder, 'node_modules'), path.join(buildFolder, 'src')],
      indentedSyntax: path.extname(filePath).toLowerCase() === '.sass'
    });

    return result.css.toString();
  }

  private _patchSassUrl(url: string): string {
    if (url[0] === '~') {
      url = 'node_modules/' + url.substr(1);
    } else if (url === 'stdin') {
      url = '';
    }

    return url;
  }

  private async _getClassNamesFromCSSAsync(css: string, filePath: string): Promise<string[]> {
    let classMap: IClassMap = {};
    const cssModulesClassMapPlugin: cssModules = cssModules({
      getJSON: (cssFileName: string, json: IClassMap) => {
        classMap = json;
      },
      // Avoid unnecessary name hashing.
      generateScopedName: (name: string) => name
    });
    await postcss([cssModulesClassMapPlugin]).process(css, { from: filePath });
    const classNames: string[] = Object.keys(classMap);

    return classNames;
  }
}
