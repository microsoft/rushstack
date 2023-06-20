import {
  ConsoleTerminalProvider,
  FileSystem,
  ITerminal,
  JsonFile,
  JsonSchema,
  Terminal
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
  private _terminal: ITerminal;
  private _jsonFileName: string;

  public readonly configuration: Readonly<IRushCustomTipsJson>;

  public constructor(configFilename: string) {
    this._jsonFileName = configFilename;
    this._tipMap = new Map();
    this._terminal = new Terminal(new ConsoleTerminalProvider());

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
   * Log the `originalMessage` first. Then based on the `messageID`, find the user-defined tips from the file `rush-custom-tips.json`
   * @param tipId - All the `tipId` options are in this doc: TODO: add link to doc
   * todo: will change the signature of this function (should we even pass in the `originalMessage`?)
   */
  public log(tipId: CustomTipId, severity: CustomTipSeverity, originalMessage: string): void {
    this._log(originalMessage, severity);

    const customTipItem: ICustomTipItemJson | undefined = this._tipMap.get(tipId);
    if (customTipItem) {
      const prefix: string | undefined = customTipItem?.prefix ?? this.configuration.prefix;
      const tip: string = `${prefix !== undefined ? prefix : ''}${customTipItem?.tip}`;
      this._log(tip, customTipItem?.severity);
    }
  }

  private _log(message: string, severity: CustomTipSeverity = CustomTipSeverity.error): void {
    switch (severity) {
      case CustomTipSeverity.log:
        this._terminal.writeLine(message);
        break;
      case CustomTipSeverity.warning:
        this._terminal.writeWarningLine(message);
        break;
      default:
        this._terminal.writeErrorLine(message);
        break;
    }
  }
}
