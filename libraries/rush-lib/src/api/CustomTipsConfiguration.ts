import * as path from 'path';
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
 */
export type CustomTipId = 'PNPM_MISMATCH_DEPENDENCY' | string;

/**
 * @beta
 */
export class CustomTipsConfiguration {
  private static _jsonSchema: JsonSchema = JsonSchema.fromLoadedObject(schemaJson);

  private readonly _tipMap: Map<CustomTipId, ICustomTipItemJson>;
  private readonly _jsonFileName: string;

  public readonly configuration: Readonly<ICustomTipsJson>;

  public static readonly knownTipIds: ReadonlySet<string> = new Set<string>(['PNPM_MISMATCH_DEPENDENCY']);

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
          if (!CustomTipsConfiguration.knownTipIds.has(tipItem.id)) {
            throw new Error(
              `The ${path.basename(this._jsonFileName)} configuration` +
                ` references an unknown ID "${tipItem.id}"`
            );
          }
          if (this._tipMap.has(tipItem.id)) {
            throw new Error(
              `The ${path.basename(this._jsonFileName)} configuration` +
                ` specifies a duplicate definition for "${tipItem.id}"`
            );
          }
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
