import * as path from 'path';

import * as postcss from 'postcss';
import * as cssModules from 'postcss-modules';
import * as crypto from 'crypto';

export interface ICSSModules {
  /**
   * Return a configured postcss plugin that will map class names to a
   * consistently generated scoped name.
   */
  getPlugin: () => postcss.AcceptedPlugin;

  /**
   * Return the CSS class map that is stored after postcss-modules runs.
   */
  getCssJSON: () => Object;
}

export default class CSSModules implements ICSSModules {
  private _classMap: Object = {};

  public getPlugin = () => {
    return cssModules({
      getJSON: this.saveJSON,
      generateScopedName: this.generateScopedName
    });
  }

  public getCssJSON = (): Object => {
    return this._classMap;
  }

  protected saveJSON = (cssFileName: string, json: Object): void => {
    this._classMap = json;
  }

  protected generateScopedName = (name: string, fileName: string, css: string)
      : string => {
    const fileBaseName: string = path.basename(fileName);
    const hash: string = crypto.createHmac('sha1', fileBaseName)
                               .update(css)
                               .digest('hex')
                               .substring(0, 8);
    return `${name}_${hash}`;
  }
}
