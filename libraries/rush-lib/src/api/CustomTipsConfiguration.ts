import * as path from 'path';
import { FileSystem, ITerminal, JsonFile, JsonSchema } from '@rushstack/node-core-library';

import schemaJson from '../schemas/custom-tips.schema.json';

/**
 * This interface represents the raw custom-tips.json file which allows repo maintainers
 * to configure extra details to be printed alongside certain Rush messages.
 * @beta
 */
export interface ICustomTipsJson {
  /**
   * If specified, this prefix will be prepended to any the tip messages when they are displayed.
   * The default value is an empty string.
   */
  defaultMessagePrefix?: string;
  /**
   *  Specifies the custom tips to be displayed by Rush.
   */
  customTips?: ICustomTipItemJson[];
}

/**
 * An item from the {@link ICustomTipsJson.customTips} list.
 * @beta
 */
export interface ICustomTipItemJson {
  /**
   * (REQUIRED) An identifier indicating a message that may be printed by Rush.
   * If that message is printed, then this custom tip will be shown.
   * Consult the Rush documentation for the current list of possible identifiers.
   */
  tipId: CustomTipIdEnum;

  /**
   * (REQUIRED) The message text to be displayed for this tip.
   */
  message: string;

  /**
   *  Overrides the "defaultMessagePrefix" for this tip.
   * Specify an empty string to omit the "defaultMessagePrefix" entirely.
   */
  messagePrefix?: string;
}

/**
 * An identifier representing a Rush message that can be customized by
 * defining a custom tip in `common/config/rush/custom-tips.json`.
 * @remarks
 * Custom tip ids always start with the `TIP_` prefix.
 *
 * @privateRemarks
 * Events from the Rush process should with "TIP_RUSH_".
 * Events from a PNPM subprocess should start with "TIP_PNPM_".
 *
 * @beta
 */
export enum CustomTipIdEnum {
  'TIP_RUSH_INCONSISTENT_VERSIONS' = 'TIP_RUSH_INCONSISTENT_VERSIONS',
  'TIP_PNPM_NO_MATCHING_VERSION' = 'TIP_PNPM_NO_MATCHING_VERSION'
}

enum CustomTipSeverity {
  'Warning',
  'Error',
  'Info'
}

export enum CustomTipType {
  'rush',
  'pnpm'
}

export interface ITipMetadata {
  tipId: CustomTipIdEnum;
  severity: CustomTipSeverity;
  type: CustomTipType;
  isMatch?: (str: string) => boolean;
}

export const SupportedCustomTipsMetadata: ITipMetadata[] = [
  {
    tipId: CustomTipIdEnum.TIP_RUSH_INCONSISTENT_VERSIONS,
    severity: CustomTipSeverity.Error,
    type: CustomTipType.rush
  },
  {
    tipId: CustomTipIdEnum.TIP_PNPM_NO_MATCHING_VERSION,
    severity: CustomTipSeverity.Error,
    type: CustomTipType.pnpm,
    isMatch: (str: string) => {
      return str.includes('No matching version found for') || str.includes('ERR_PNPM_NO_MATCHING_VERSION');
    }
  }
];
/**
 * Used to access the `common/config/rush/custom-tips.json` config file,
 * which allows repo maintainers to configure extra details to be printed alongside
 * certain Rush messages.
 * @beta
 */
export class CustomTipsConfiguration {
  private static _jsonSchema: JsonSchema = JsonSchema.fromLoadedObject(schemaJson);

  private readonly _tipMap: Map<CustomTipIdEnum, ICustomTipItemJson>;
  private readonly _jsonFileName: string;

  /**
   * The JSON settings loaded from `custom-tips.json`.
   */
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
          if (!(tipItem.tipId in CustomTipIdEnum)) {
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

  private _formatTipMessage(tipId: CustomTipIdEnum): string | undefined {
    const customTipJsonItem: ICustomTipItemJson | undefined = this._tipMap.get(tipId);
    if (!customTipJsonItem) {
      return undefined;
    }

    const prefix: string | undefined =
      customTipJsonItem.messagePrefix ?? this.configuration.defaultMessagePrefix;
    return `${prefix ?? ''}${customTipJsonItem.message}`;
  }

  /**
   * If custom-tips.json defines a tip for the specified tipId,
   * display the tip on the terminal.
   *
   * The display will show different colors depending on the pre-defined severity.
   */
  public showTip(terminal: ITerminal, tipId: CustomTipIdEnum): void {
    const message: string | undefined = this._formatTipMessage(tipId);

    const severity: CustomTipSeverity =
      SupportedCustomTipsMetadata.find((tip) => tip.tipId === tipId)?.severity ?? CustomTipSeverity.Info;
    if (message !== undefined && severity !== undefined) {
      switch (severity) {
        case CustomTipSeverity.Error:
          terminal.writeErrorLine(message);
          break;
        case CustomTipSeverity.Warning:
          terminal.writeWarningLine(message);
          break;
        case CustomTipSeverity.Info:
          terminal.writeLine(message);
          break;
        default:
          break;
      }
    }
  }

  /**
   * If custom-tips.json defines a tip for the specified tipId,
   * display the tip on the terminal.
   */
  public showInfoTip(terminal: ITerminal, tipId: CustomTipIdEnum): void {
    const message: string | undefined = this._formatTipMessage(tipId);
    if (message !== undefined) {
      terminal.writeLine(message);
    }
  }

  /**
   * If custom-tips.json defines a tip for the specified tipId,
   * display the tip on the terminal.
   */
  public showWarningTip(terminal: ITerminal, tipId: CustomTipIdEnum): void {
    const message: string | undefined = this._formatTipMessage(tipId);
    if (message !== undefined) {
      terminal.writeWarningLine(message);
    }
  }

  /**
   * If custom-tips.json defines a tip for the specified tipId,
   * display the tip on the terminal.
   */
  public showErrorTip(terminal: ITerminal, tipId: CustomTipIdEnum): void {
    const message: string | undefined = this._formatTipMessage(tipId);
    if (message !== undefined) {
      terminal.writeErrorLine(message);
    }
  }
}
