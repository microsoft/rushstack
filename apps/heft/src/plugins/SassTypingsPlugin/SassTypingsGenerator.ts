import * as path from 'path';
import { renderSync, Result } from 'node-sass';
import * as postcss from 'postcss';
import * as cssModules from 'postcss-modules';
import { StringValuesTypingsGenerator, IStringValueTypings } from '@rushstack/typings-generator';

/**
 * @public
 */
export interface ISassTypingsGeneratorOptions {
  buildFolder: string;
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
  private _classMap: IClassMap;

  /**
   * @param buildFolder - The project folder to search for Sass files and generate typings.
   */
  public constructor(options: ISassTypingsGeneratorOptions) {
    const srcFolder: string = path.join(options.buildFolder, 'src');
    const generatedTsFolder: string = path.join(options.buildFolder, 'temp', 'sass-ts');
    super({
      srcFolder,
      generatedTsFolder,
      exportAsDefault: true,
      exportAsInterfaceName: 'IExportStyles',
      fileExtensions: ['scss', 'sass', 'css'],
      parseAndGenerateTypings: async (fileContents: string, filePath: string) => {
        const css: string = this._transpileSass(fileContents, filePath, options.buildFolder);
        const classNames: string[] = await this._getClassNamesFromCSS(css, filePath);
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

  private _transpileSass(fileContents: string, filePath: string, buildFolder: string): string {
    const result: Result = renderSync({
      data: fileContents,
      includePaths: [
        path.join(buildFolder, 'src'),
        path.join(buildFolder, 'node_modules'),
        path.join(buildFolder)
      ],
      outFile: undefined,
      sourceMap: false,
      indentedSyntax: path.extname(filePath).toLowerCase() === '.sass'
    });

    return result.css.toString();
  }

  private async _getClassNamesFromCSS(css: string, filePath: string): Promise<string[]> {
    const cssModulesClassMapPlugin: cssModules = cssModules({
      getJSON: (cssFileName: string, json: IClassMap) => {
        this._classMap = json;
      },
      // Avoid unnecessary name hashing.
      generateScopedName: (name: string) => name
    });
    await postcss([cssModulesClassMapPlugin]).process(css, { from: filePath });
    const classNames: string[] = Object.keys(this._classMap);

    return classNames;
  }
}
