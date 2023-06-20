import {
  FileSystem,
  ITerminal,
  JsonFile,
  JsonSchema,
} from '@rushstack/node-core-library';

import schemaJson from '../schemas/rush-custom-tips.schema.json';

/**
 * @beta
 */
export interface IRushCustomTipsJson {
  prefix?: string;
  customTips?: ICustomTipItemJson[];
}

/**
 * @beta
 */
export enum CustomTipSeverity {
  log = 0,
  warning = 1,
  error = 2
}

export interface ICustomTipItemJson {
  id: CustomTipId;
  tip: string;
  prefix?: string;
  severity?: CustomTipSeverity;
}

/**
 * @beta
 * TODO: consider making this work with the plugin (e.g., the plugins are able to define their own customizable tips)
 */
export type CustomTipId = 'PNPM_MISMATCH_DEPENDENCY' | 'ANOTHER_ERROR_ID';

/**
 * @beta
 */
export class CustomTipsConfiguration {
  private static _jsonSchema: JsonSchema = JsonSchema.fromLoadedObject(schemaJson);

  private _tipMap: Map<CustomTipId, ICustomTipItemJson>;
  private _jsonFileName: string;

  public readonly configuration: Readonly<IRushCustomTipsJson>;

  public constructor(configFilename: string) {
    this._jsonFileName = configFilename;
    this._tipMap = new Map();

    if (!FileSystem.exists(this._jsonFileName)) {
      this.configuration = {};
    } else {
      this.configuration = JsonFile.loadAndValidate(this._jsonFileName, CustomTipsConfiguration._jsonSchema);

      if (!this.configuration?.customTips) return;
      for (const tipItem of this.configuration.customTips) {
        this._tipMap.set(tipItem.id, tipItem);
      }
    }
  }

  /**
   *
   * @param tipId - All the `tipId` options are in this doc: TODO: add link to doc
   */
  public log(tipId: CustomTipId, terminal: ITerminal): void {
    const customTipItem: ICustomTipItemJson | undefined = this._tipMap.get(tipId);

    if (!customTipItem) {
      return;
    }

    const prefix: string | undefined = customTipItem?.prefix ?? this.configuration.prefix;
    const tipString: string = `${prefix !== undefined ? prefix : ''}${customTipItem?.tip}`;
    switch (customTipItem.severity) {
      case CustomTipSeverity.log:
        terminal.writeLine(tipString);
        break;
      case CustomTipSeverity.warning:
        terminal.writeWarningLine(tipString);
        break;
      default:
        terminal.writeErrorLine(tipString);
        break;
    }
  }
}
