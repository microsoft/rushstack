import { FileSystem, ITerminal, JsonFile, JsonSchema } from '@rushstack/node-core-library';

import schemaJson from '../schemas/custom-tips.schema.json';

/**
 * @beta
 */
export interface ICustomTipsJson {
  prefix?: string;
  customTips?: ICustomTipItemJson[];
}
/**
 * @beta
 */
export interface ICustomTipItemJson {
  id: CustomTipId;
  tip: string;
  prefix?: string;
  severity?: CustomTipSeverity;
}

/**
 * @beta
 */
export enum CustomTipSeverity {
  log = 0,
  warning = 1,
  error = 2
}

/**
 * @beta
 * @privateRemarks
 * TODO: consider making this work with the plugin (i.e., the plugins are able to define their own customizable tips)
 */
export type CustomTipId = 'PNPM_MISMATCH_DEPENDENCY';

/**
 * @beta
 */
export class CustomTipsConfiguration {
  private static _jsonSchema: JsonSchema = JsonSchema.fromLoadedObject(schemaJson);

  private readonly _tipMap: Map<CustomTipId, ICustomTipItemJson>;
  private readonly _jsonFileName: string;

  public readonly configuration: Readonly<ICustomTipsJson>;

  public constructor(configFilename: string) {
    this._jsonFileName = configFilename;
    this._tipMap = new Map();

    if (!FileSystem.exists(this._jsonFileName)) {
      this.configuration = {};
    } else {
      this.configuration = JsonFile.loadAndValidate(this._jsonFileName, CustomTipsConfiguration._jsonSchema);

      const customTips: ICustomTipItemJson[] | undefined = this.configuration?.customTips;
      if (customTips) {
        for (const tipItem of customTips) {
          this._tipMap.set(tipItem.id, tipItem);
        }
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

    const prefix: string | undefined = customTipItem.prefix ?? this.configuration.prefix;
    const tipString: string = `${prefix ?? ''}${customTipItem.tip}`;
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
