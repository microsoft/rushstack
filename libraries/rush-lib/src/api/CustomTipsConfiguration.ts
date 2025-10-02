// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';
import { FileSystem, JsonFile, JsonSchema } from '@rushstack/node-core-library';
import { type ITerminal, PrintUtilities, Colorize } from '@rushstack/terminal';

import schemaJson from '../schemas/custom-tips.schema.json';

/**
 * This interface represents the raw custom-tips.json file which allows repo maintainers
 * to configure extra details to be printed alongside certain Rush messages.
 * @beta
 */
export interface ICustomTipsJson {
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
  tipId: CustomTipId;

  /**
   * (REQUIRED) The message text to be displayed for this tip.
   */
  message: string;
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
export enum CustomTipId {
  // Events from the Rush process should with "TIP_RUSH_".
  TIP_RUSH_INCONSISTENT_VERSIONS = 'TIP_RUSH_INCONSISTENT_VERSIONS',
  TIP_RUSH_DISALLOW_INSECURE_SHA1 = 'TIP_RUSH_DISALLOW_INSECURE_SHA1',

  // Events from a PNPM subprocess should start with "TIP_PNPM_".
  TIP_PNPM_UNEXPECTED_STORE = 'TIP_PNPM_UNEXPECTED_STORE',
  TIP_PNPM_NO_MATCHING_VERSION = 'TIP_PNPM_NO_MATCHING_VERSION',
  TIP_PNPM_NO_MATCHING_VERSION_INSIDE_WORKSPACE = 'TIP_PNPM_NO_MATCHING_VERSION_INSIDE_WORKSPACE',
  TIP_PNPM_PEER_DEP_ISSUES = 'TIP_PNPM_PEER_DEP_ISSUES',
  TIP_PNPM_OUTDATED_LOCKFILE = 'TIP_PNPM_OUTDATED_LOCKFILE',
  TIP_PNPM_TARBALL_INTEGRITY = 'TIP_PNPM_TARBALL_INTEGRITY',
  TIP_PNPM_MISMATCHED_RELEASE_CHANNEL = 'TIP_PNPM_MISMATCHED_RELEASE_CHANNEL',
  TIP_PNPM_INVALID_NODE_VERSION = 'TIP_PNPM_INVALID_NODE_VERSION'
}

/**
 * The severity of a custom tip.
 * It determines the printing severity ("Error" = red, "Warning" = yellow, "Info" = normal).
 *
 * @beta
 */
export enum CustomTipSeverity {
  Warning = 'Warning',
  Error = 'Error',
  Info = 'Info'
}

/**
 * The type of the custom tip.
 *
 * @remarks
 * There might be types like `git` in the future.
 *
 * @beta
 */
export enum CustomTipType {
  rush = 'rush',
  pnpm = 'pnpm'
}

/**
 * Metadata for a custom tip.
 *
 * @remarks
 * This differs from the  {@link ICustomTipItemJson} interface in that these are not configurable by the user;
 * it's the inherent state of a custom tip. For example, the custom tip for `ERR_PNPM_NO_MATCHING_VERSION`
 * has a inherent severity of `Error`, and a inherent match function that rush maintainer defines.
 *
 * @beta
 */
export interface ICustomTipInfo {
  tipId: CustomTipId;
  /**
   * The severity of the custom tip. It will determine the printing severity ("Error" = red, "Warning" = yellow, "Info" = normal).
   *
   * @remarks
   *  The severity should be consistent with the original message, unless there are strong reasons not to.
   */
  severity: CustomTipSeverity;

  /**
   * The type of the custom tip.
   */
  type: CustomTipType;

  /**
   * The function to determine how to match this tipId.
   *
   * @remarks
   * This function might need to be updated if the depending package is updated.
   * For example, if `pnpm` change the error logs for "ERR_PNPM_NO_MATCHING_VERSION", we will need to update the match function accordingly.
   */
  isMatch?: (str: string) => boolean;
}

export const RUSH_CUSTOM_TIPS: Readonly<Record<`TIP_RUSH_${string}` & CustomTipId, ICustomTipInfo>> = {
  [CustomTipId.TIP_RUSH_DISALLOW_INSECURE_SHA1]: {
    tipId: CustomTipId.TIP_RUSH_DISALLOW_INSECURE_SHA1,
    severity: CustomTipSeverity.Error,
    type: CustomTipType.pnpm,
    isMatch: (str: string) => {
      return str.includes('ERR_PNPM_DISALLOW_INSECURE_SHA1');
    }
  },
  [CustomTipId.TIP_RUSH_INCONSISTENT_VERSIONS]: {
    tipId: CustomTipId.TIP_RUSH_INCONSISTENT_VERSIONS,
    severity: CustomTipSeverity.Error,
    type: CustomTipType.rush
  }
};

export const PNPM_CUSTOM_TIPS: Readonly<Record<`TIP_PNPM_${string}` & CustomTipId, ICustomTipInfo>> = {
  [CustomTipId.TIP_PNPM_UNEXPECTED_STORE]: {
    tipId: CustomTipId.TIP_PNPM_UNEXPECTED_STORE,
    severity: CustomTipSeverity.Error,
    type: CustomTipType.pnpm,
    isMatch: (str: string) => {
      return str.includes('ERR_PNPM_UNEXPECTED_STORE');
    }
  },
  [CustomTipId.TIP_PNPM_NO_MATCHING_VERSION]: {
    tipId: CustomTipId.TIP_PNPM_NO_MATCHING_VERSION,
    severity: CustomTipSeverity.Error,
    type: CustomTipType.pnpm,
    isMatch: (str: string) => {
      // Example message: (do notice the difference between this one and the TIP_PNPM_NO_MATCHING_VERSION_INSIDE_WORKSPACE)

      // Error Message: ERR_PNPM_NO_MATCHING_VERSION  No matching version found for @babel/types@^7.22.5
      // The latest release of @babel/types is "7.22.4".
      // Other releases are:
      // * esm: 7.21.4-esm.4

      return str.includes('No matching version found for') && str.includes('The latest release of');
    }
  },
  [CustomTipId.TIP_PNPM_NO_MATCHING_VERSION_INSIDE_WORKSPACE]: {
    tipId: CustomTipId.TIP_PNPM_NO_MATCHING_VERSION_INSIDE_WORKSPACE,
    severity: CustomTipSeverity.Error,
    type: CustomTipType.pnpm,
    isMatch: (str: string) => {
      return str.includes('ERR_PNPM_NO_MATCHING_VERSION_INSIDE_WORKSPACE');
    }
  },
  [CustomTipId.TIP_PNPM_PEER_DEP_ISSUES]: {
    tipId: CustomTipId.TIP_PNPM_PEER_DEP_ISSUES,
    severity: CustomTipSeverity.Error,
    type: CustomTipType.pnpm,
    isMatch: (str: string) => {
      return str.includes('ERR_PNPM_PEER_DEP_ISSUES');
    }
  },
  [CustomTipId.TIP_PNPM_OUTDATED_LOCKFILE]: {
    tipId: CustomTipId.TIP_PNPM_OUTDATED_LOCKFILE,
    severity: CustomTipSeverity.Error,
    type: CustomTipType.pnpm,
    isMatch: (str: string) => {
      // Todo: verify this
      return str.includes('ERR_PNPM_OUTDATED_LOCKFILE');
    }
  },

  [CustomTipId.TIP_PNPM_TARBALL_INTEGRITY]: {
    tipId: CustomTipId.TIP_PNPM_TARBALL_INTEGRITY,
    severity: CustomTipSeverity.Error,
    type: CustomTipType.pnpm,
    isMatch: (str: string) => {
      // Todo: verify this
      return str.includes('ERR_PNPM_TARBALL_INTEGRITY');
    }
  },

  [CustomTipId.TIP_PNPM_MISMATCHED_RELEASE_CHANNEL]: {
    tipId: CustomTipId.TIP_PNPM_MISMATCHED_RELEASE_CHANNEL,
    severity: CustomTipSeverity.Error,
    type: CustomTipType.pnpm,
    isMatch: (str: string) => {
      // Todo: verify this
      return str.includes('ERR_PNPM_MISMATCHED_RELEASE_CHANNEL');
    }
  },

  [CustomTipId.TIP_PNPM_INVALID_NODE_VERSION]: {
    tipId: CustomTipId.TIP_PNPM_INVALID_NODE_VERSION,
    severity: CustomTipSeverity.Error,
    type: CustomTipType.pnpm,
    isMatch: (str: string) => {
      // Todo: verify this
      return str.includes('ERR_PNPM_INVALID_NODE_VERSION');
    }
  }
};

/**
 * Used to access the `common/config/rush/custom-tips.json` config file,
 * which allows repo maintainers to configure extra details to be printed alongside
 * certain Rush messages.
 * @beta
 */
export class CustomTipsConfiguration {
  private static _jsonSchema: JsonSchema = JsonSchema.fromLoadedObject(schemaJson);

  public readonly providedCustomTipsByTipId: ReadonlyMap<CustomTipId, ICustomTipItemJson>;

  /**
   * A registry mapping custom tip IDs to their corresponding metadata.
   *
   * @remarks
   * This registry is used to look up metadata for custom tips based on their IDs. The metadata includes
   * information such as the severity level, the type of tip, and an optional matching function.
   *
   * Each key in the registry corresponds to a `CustomTipIdEnum` value, and each value is an object
   * implementing the `ICustomTipInfo` interface.
   *
   * @example
   * ```typescript
   * const tipInfo = CustomTipsConfiguration.customTipRegistry[CustomTipIdEnum.TIP_RUSH_INCONSISTENT_VERSIONS];
   * console.log(tipInfo.severity);  // Output: CustomTipSeverity.Error
   * ```
   *
   * See {@link CustomTipId} for the list of custom tip IDs.
   * See {@link ICustomTipInfo} for the structure of the metadata.
   */
  public static customTipRegistry: Readonly<Record<CustomTipId, ICustomTipInfo>> = {
    ...RUSH_CUSTOM_TIPS,
    ...PNPM_CUSTOM_TIPS
  };

  public constructor(configFilePath: string) {
    const providedCustomTips: Map<CustomTipId, ICustomTipItemJson> = new Map();

    let configuration: ICustomTipsJson | undefined;
    try {
      configuration = JsonFile.loadAndValidate(configFilePath, CustomTipsConfiguration._jsonSchema);
    } catch (e) {
      if (!FileSystem.isNotExistError(e)) {
        throw e;
      }
    }

    const customTips: ICustomTipItemJson[] | undefined = configuration?.customTips;
    if (customTips) {
      for (const tipItem of customTips) {
        if (!(tipItem.tipId in CustomTipId)) {
          throw new Error(
            `The ${path.basename(configFilePath)} configuration` +
              ` references an unknown ID "${tipItem.tipId}"`
          );
        }

        if (providedCustomTips.has(tipItem.tipId)) {
          throw new Error(
            `The ${path.basename(configFilePath)} configuration` +
              ` specifies a duplicate definition for "${tipItem.tipId}"`
          );
        } else {
          providedCustomTips.set(tipItem.tipId, tipItem);
        }
      }
    }

    this.providedCustomTipsByTipId = providedCustomTips;
  }

  /**
   * If custom-tips.json defines a tip for the specified tipId,  display the tip on the terminal.
   *
   * @remarks
   * The severity of the tip is defined in ${@link CustomTipsConfiguration.customTipRegistry}.
   * If you want to change the severity specifically for this call,
   * use other APIs such as {@link CustomTipsConfiguration._showErrorTip}.
   *
   * Custom tips by design do not replace Rush's standard messaging; instead, they annotate Rush's
   * output with additional team-specific advice.
   *
   * @internal
   */
  public _showTip(terminal: ITerminal, tipId: CustomTipId): void {
    const severityOfOriginalMessage: CustomTipSeverity =
      CustomTipsConfiguration.customTipRegistry[tipId].severity;

    this._writeMessageWithPipes(terminal, severityOfOriginalMessage, tipId);
  }

  /**
   * If custom-tips.json defines a tip for the specified tipId, display the tip on the terminal.
   * @remarks
   * Custom tips by design do not replace Rush's standard messaging; instead, they annotate Rush's
   * output with additional team-specific advice.
   * @internal
   */
  public _showInfoTip(terminal: ITerminal, tipId: CustomTipId): void {
    this._writeMessageWithPipes(terminal, CustomTipSeverity.Info, tipId);
  }

  /**
   * If custom-tips.json defines a tip for the specified tipId, display the tip on the terminal.
   * @remarks
   * Custom tips by design do not replace Rush's standard messaging; instead, they annotate Rush's
   * output with additional team-specific advice.
   * @internal
   */
  public _showWarningTip(terminal: ITerminal, tipId: CustomTipId): void {
    this._writeMessageWithPipes(terminal, CustomTipSeverity.Warning, tipId);
  }

  /**
   * If custom-tips.json defines a tip for the specified tipId, display the tip on the terminal.
   * @remarks
   * Custom tips by design do not replace Rush's standard messaging; instead, they annotate Rush's
   * output with additional team-specific advice.
   * @internal
   */
  public _showErrorTip(terminal: ITerminal, tipId: CustomTipId): void {
    this._writeMessageWithPipes(terminal, CustomTipSeverity.Error, tipId);
  }

  private _writeMessageWithPipes(terminal: ITerminal, severity: CustomTipSeverity, tipId: CustomTipId): void {
    const customTipJsonItem: ICustomTipItemJson | undefined = this.providedCustomTipsByTipId.get(tipId);
    if (customTipJsonItem) {
      let writeFunction:
        | typeof terminal.writeErrorLine
        | typeof terminal.writeWarningLine
        | typeof terminal.writeLine;
      let prefix: string;
      switch (severity) {
        case CustomTipSeverity.Error:
          writeFunction = terminal.writeErrorLine.bind(terminal);
          prefix = Colorize.red('| ');
          break;
        case CustomTipSeverity.Warning:
          writeFunction = terminal.writeWarningLine.bind(terminal);
          prefix = Colorize.yellow('| ');
          break;
        default:
          writeFunction = terminal.writeLine.bind(terminal);
          prefix = '| ';
          break;
      }

      writeFunction(`| Custom Tip (${tipId})`);
      writeFunction('|');

      const message: string = customTipJsonItem.message;
      const wrappedAndIndentedMessage: string = PrintUtilities.wrapWords(message, undefined, prefix);
      writeFunction(...wrappedAndIndentedMessage, { doNotOverrideSgrCodes: true });
      terminal.writeLine();
    }
  }
}
