import { JsonFile } from '@rushstack/node-core-library';

export interface IRushCustomTipsJson {
  prefix?: string;
  customTips?: CustomTipItem[];
}

export type TipLevel = 'error' | 'warn' | 'info';
export interface CustomTipItem {
  id: CustomTipId;
  prefix?: string;
  level: TipLevel;
  tip: '';
}

// TODO: consider making this work with the plugin (e.g., the plugins are able to define their own customizable tips)
export type CustomTipId = 'PNPM_MISMATCH_DEPENDENCY' | 'ANOTHER_ERROR_ID';

export class CustomTipsConfiguration {
  private configLoaded: boolean = false;
  private _config: IRushCustomTipsJson;
  private _tipMap: Map<CustomTipId, CustomTipItem>;

  public constructor(configFilename: string) {
    this._tipMap = new Map();
    this._config = {};
    this._loadConfig(configFilename);
  }

  private _loadConfig(configFilename: string): void {
    this._config = JsonFile.load(configFilename);

    // Do nothing if no custom tips
    if (!this._config || !this._config.customTips || this._config.customTips?.length === 0) {
      return;
    }

    for (const tipItem of this._config.customTips) {
      this._tipMap.set(tipItem.id, tipItem);
    }
  }

  /**
   *
   * Log the `originalMessage` first. Then based on the `messageID`, find the user-defined tips from the file `rush-custom-tips.json`
   * @param tipId All the `tipId` options are in this doc: TODO: add link to doc
   */
  public log(tipId: CustomTipId, originalMessage: string): void {
    console.log(originalMessage);

    if (this._tipMap.has(tipId)) {
      const customTipItem: CustomTipItem | undefined = this._tipMap.get(tipId);
      const prefix: string | undefined = customTipItem?.prefix ? customTipItem?.prefix : this._config.prefix;
      const tip = `${prefix !== undefined ? prefix : ''}${customTipItem?.tip}`;
      this._log(tip, customTipItem?.level);
    }
  }

  private _log(tip: string, level?: TipLevel): void {
    switch (level) {
      case 'info':
        console.info(tip);
        break;
      case 'warn':
        console.warn(tip);
        break;
      default:
        console.error(tip);
    }
  }
}
