import * as path from 'path';
import { FileSystem, ITerminal, JsonFile, JsonSchema } from '@rushstack/node-core-library';

import schemaJson from '../schemas/custom-tips.schema.json';

/**
 * @beta
 */
export interface ICustomTipsJson {
  defaultMessagePrefix?: string;
  customTips?: ICustomTipItemJson[];
}
/**
 * @beta
 */
export interface ICustomTipItemJson {
  tipId: CustomTipId;
  message: string;
  messagePrefix?: string;
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

  public static readonly supportedTipIds: ReadonlySet<string> = new Set<string>(['PNPM_MISMATCH_DEPENDENCY']);

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
          if (!CustomTipsConfiguration.supportedTipIds.has(tipItem.tipId)) {
            throw new Error(
              `The ${path.basename(this._jsonFileName)} configuration` +
                ` references an unknown ID "${tipItem.tipId}"`
            );
          }
          if (this._tipMap.has(tipItem.tipId)) {
            throw new Error(
              `The ${path.basename(this._jsonFileName)} configuration` +
                ` specifies a duplicate definition for "${tipItem.tipId}"`
            );
          }
          this._tipMap.set(tipItem.tipId, tipItem);
        }
      }
    }
  }

  private _formatTipMessage(tipId: CustomTipId): string | undefined {
    const customTipItem: ICustomTipItemJson | undefined = this._tipMap.get(tipId);
    if (!customTipItem) {
      return undefined;
    }

    const prefix: string | undefined = customTipItem.messagePrefix ?? this.configuration.defaultMessagePrefix;
    return `${prefix ?? ''}${customTipItem.message}`;
  }

  /**
   * If custom-tips.json defines a tip for the specified tipId,
   * display the tip on the terminal.
   */
  public showInfoTip(terminal: ITerminal, tipId: CustomTipId): void {
    const message: string | undefined = this._formatTipMessage(tipId);
    if (message !== undefined) {
      terminal.writeLine(message);
    }
  }

  /**
   * If custom-tips.json defines a tip for the specified tipId,
   * display the tip on the terminal.
   */
  public showWarningTip(terminal: ITerminal, tipId: CustomTipId): void {
    const message: string | undefined = this._formatTipMessage(tipId);
    if (message !== undefined) {
      terminal.writeWarningLine(message);
    }
  }

  /**
   * If custom-tips.json defines a tip for the specified tipId,
   * display the tip on the terminal.
   */
  public showErrorTip(terminal: ITerminal, tipId: CustomTipId): void {
    const message: string | undefined = this._formatTipMessage(tipId);
    if (message !== undefined) {
      terminal.writeErrorLine(message);
    }
  }
}
