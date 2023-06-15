import {
  ConsoleTerminalProvider,
  ITerminal,
  JsonFile,
  PrefixProxyTerminalProvider,
  Terminal
} from '@rushstack/node-core-library';

export interface IRushCustomTipsJson {
  prefix?: string;
  customTips?: ICustomTipItemJson[];
}

/** Similar to {@link TerminalProviderSeverity} but without "debug" and "verbose" */
export enum TipSeverity {
  log = 0,
  warning = 1,
  error = 2
}

export interface ICustomTipItemJson {
  id: CustomTipId;
  tip: string;
  prefix?: string;
  severity?: TipSeverity;
}

// TODO: consider making this work with the plugin (e.g., the plugins are able to define their own customizable tips)
export type CustomTipId = 'PNPM_MISMATCH_DEPENDENCY' | 'ANOTHER_ERROR_ID';

export class CustomTipsConfiguration {
  private _config: IRushCustomTipsJson;
  private _tipMap: Map<CustomTipId, ICustomTipItemJson>;
  private _terminal: ITerminal;

  public constructor(configFilename: string) {
    this._tipMap = new Map();
    this._config = {};
    this._terminal = new Terminal(new ConsoleTerminalProvider());
    this._loadConfig(configFilename);
  }

  private _loadConfig(configFilename: string): void {
    this._config = JsonFile.load(configFilename);

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
   * todo: will change the signature of this function (should we even pass in the `originalMessage`?)
   */
  public log(tipId: CustomTipId, severity: TipSeverity, originalMessage: string): void {
    this._log(originalMessage, severity);

    if (this._tipMap.has(tipId)) {
      const customTipItem: ICustomTipItemJson | undefined = this._tipMap.get(tipId);
      const prefix: string | undefined = customTipItem?.prefix ?? this._config.prefix;
      const tip: string = `${prefix !== undefined ? prefix : ''}${customTipItem?.tip}`;
      this._log(tip, customTipItem?.severity);
    }
  }

  private _log(message: string, severity: TipSeverity = TipSeverity.error): void {
    switch (severity) {
      case TipSeverity.log:
        this._terminal.writeLine(message);
        break;
      case TipSeverity.warning:
        this._terminal.writeWarningLine(message);
        break;
      default:
        this._terminal.writeErrorLine(message);
        break;
    }
  }
}
