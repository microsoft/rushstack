import * as path from 'path';

import * as postcss from 'postcss';
import * as cssModules from 'postcss-modules';
import * as crypto from 'crypto';

export interface IClassMap {
  [className: string]: string;
}

export interface ICSSModules {
  /**
   * Return a configured postcss plugin that will map class names to a
   * consistently generated scoped name.
   */
  getPlugin(): postcss.AcceptedPlugin;

  /**
   * Return the CSS class map that is stored after postcss-modules runs.
   */
  getClassMap(): IClassMap;
}

export default class CSSModules implements ICSSModules {
  private _classMap: IClassMap;
  private _rootPath: string;

  /**
   * CSSModules includes the source file's path relative to the project root
   * as part of the class name hashing algorithm.
   * This should be configured with the setting:
   * {@link @microsoft/gulp-core-build#IBuildConfig.rootPath}
   * That is used in {@link ./SassTask#SassTask}
   * But will default the process' current working dir.
   */
  public constructor(rootPath?: string) {
    this._classMap = {};
    if (rootPath) {
      this._rootPath = rootPath;
    } else {
      this._rootPath = process.cwd();
    }
  }

  public getPlugin(): postcss.AcceptedPlugin {
    return cssModules({
      getJSON: this.saveJson.bind(this),
      generateScopedName: this.generateScopedName.bind(this)
    });
  }

  public getClassMap(): IClassMap {
    return this._classMap;
  }

  protected saveJson(cssFileName: string, json: IClassMap): void {
    this._classMap = json;
  }

  protected generateScopedName(name: string, fileName: string, css: string)
      : string {
    const fileBaseName: string = path.relative(this._rootPath, fileName);
    const safeFileBaseName: string = fileBaseName.replace(/\\/g, '/');
    const hash: string = crypto.createHmac('sha1', safeFileBaseName)
                               .update(css)
                               .digest('hex')
                               .substring(0, 8);
    return `${name}_${hash}`;
  }
}
