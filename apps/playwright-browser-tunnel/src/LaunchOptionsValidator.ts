// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import os from 'node:os';
import path from 'node:path';

import type { LaunchOptions } from 'playwright-core';

import { FileSystem } from '@rushstack/node-core-library';
import type { ITerminal } from '@rushstack/terminal';

/**
 * The filename used to store the launch options allowlist.
 * Stored in the user's home directory/.playwright-browser-tunnel folder.
 * @beta
 */
export const LAUNCH_OPTIONS_ALLOWLIST_FILENAME: string = '.playwright-launch-options-allowlist.json';

/**
 * Launch option properties that are automatically denied by default for security reasons.
 * These options can potentially be abused for remote code execution from a compromised environment.
 *
 * Note: 'headless' is intentionally NOT in this list. The tunnel always enforces headless: false
 * to enable headed browser tests in remote environments, which is the primary purpose of this extension.
 *
 * @beta
 */
export const DENIED_LAUNCH_OPTIONS: ReadonlySet<keyof LaunchOptions> = new Set([
  'args',
  'executablePath',
  'downloadsPath',
  'firefoxUserPrefs',
  'ignoreDefaultArgs'
]);

/**
 * Interface for the allowlist configuration stored in the user's local file system.
 * @beta
 */
export interface ILaunchOptionsAllowlist {
  /**
   * Set of launch option keys that the user has explicitly allowed.
   * These bypass the default security restrictions.
   */
  allowedOptions: string[];

  /**
   * Version of the allowlist format, for future compatibility.
   */
  version: number;
}

/**
 * Result of validating launch options against the allowlist.
 * @beta
 */
export interface ILaunchOptionsValidationResult {
  /**
   * Whether the launch options are valid and allowed.
   */
  isValid: boolean;

  /**
   * Launch options that were denied due to security restrictions.
   */
  deniedOptions: Array<keyof LaunchOptions>;

  /**
   * Filtered launch options with denied properties removed.
   */
  filteredOptions: LaunchOptions;

  /**
   * Warning messages about denied options.
   */
  warnings: string[];
}

/**
 * Validates Playwright launch options against security allowlists.
 * Provides utilities for managing client-side allowlist configuration.
 * @beta
 */
export class LaunchOptionsValidator {
  private static readonly _allowlistVersion: number = 1;

  /**
   * Gets the path to the allowlist file in the user's local preferences folder.
   * This follows the pattern of playwright-browser-installed.txt but stores in user's home directory.
   */
  public static getAllowlistFilePath(): string {
    // Store in user's home directory under .playwright-browser-tunnel
    const homeDir: string = os.homedir();
    const configDir: string = path.join(homeDir, '.playwright-browser-tunnel');
    return path.join(configDir, LAUNCH_OPTIONS_ALLOWLIST_FILENAME);
  }

  /**
   * Reads the allowlist from the user's local file system.
   * Returns an empty allowlist if the file doesn't exist or is invalid.
   */
  public static async readAllowlistAsync(): Promise<ILaunchOptionsAllowlist> {
    const allowlistPath: string = this.getAllowlistFilePath();

    try {
      if (!FileSystem.exists(allowlistPath)) {
        return {
          allowedOptions: [],
          version: this._allowlistVersion
        };
      }

      const content: string = await FileSystem.readFileAsync(allowlistPath);
      const parsed: unknown = JSON.parse(content);

      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        'allowedOptions' in parsed &&
        Array.isArray(parsed.allowedOptions) &&
        'version' in parsed &&
        typeof parsed.version === 'number'
      ) {
        return parsed as ILaunchOptionsAllowlist;
      }

      // Invalid format, return empty allowlist
      return {
        allowedOptions: [],
        version: this._allowlistVersion
      };
    } catch (error) {
      // If we can't read the file, return empty allowlist
      return {
        allowedOptions: [],
        version: this._allowlistVersion
      };
    }
  }

  /**
   * Writes the allowlist to the user's local file system.
   */
  public static async writeAllowlistAsync(allowlist: ILaunchOptionsAllowlist): Promise<void> {
    const allowlistPath: string = this.getAllowlistFilePath();
    const configDir: string = path.dirname(allowlistPath);

    // Ensure the config directory exists
    await FileSystem.ensureFolderAsync(configDir);

    const content: string = JSON.stringify(allowlist, null, 2);
    await FileSystem.writeFileAsync(allowlistPath, content, { ensureFolderExists: true });
  }

  /**
   * Validates launch options against the security allowlist.
   * Automatically denies dangerous options unless explicitly allowed by the user.
   *
   * @param launchOptions - The launch options to validate
   * @param terminal - Optional terminal for logging warnings
   * @returns Validation result with filtered options and warnings
   */
  public static async validateLaunchOptionsAsync(
    launchOptions: LaunchOptions,
    terminal?: ITerminal
  ): Promise<ILaunchOptionsValidationResult> {
    const allowlist: ILaunchOptionsAllowlist = await this.readAllowlistAsync();
    const allowedOptionsSet: Set<string> = new Set(allowlist.allowedOptions);

    const deniedOptions: Array<keyof LaunchOptions> = [];
    const warnings: string[] = [];
    const filteredOptions: LaunchOptions = { ...launchOptions };

    // Check each denied option
    for (const deniedOption of DENIED_LAUNCH_OPTIONS) {
      if (deniedOption in launchOptions) {
        // Check if it's in the allowlist
        if (!allowedOptionsSet.has(deniedOption)) {
          // Remove the option from the filtered result
          delete filteredOptions[deniedOption];
          deniedOptions.push(deniedOption);

          const warning: string =
            `Launch option '${deniedOption}' was denied for security reasons. ` +
            `To allow this option, add it to your local allowlist at: ${this.getAllowlistFilePath()}`;
          warnings.push(warning);

          if (terminal) {
            terminal.writeWarningLine(warning);
          }
        } else {
          if (terminal) {
            terminal.writeWarningLine(
              `Launch option '${deniedOption}' is allowed by user allowlist. ` +
                `Value: ${JSON.stringify(launchOptions[deniedOption])}`
            );
          }
        }
      }
    }

    return {
      isValid: deniedOptions.length === 0,
      deniedOptions,
      filteredOptions,
      warnings
    };
  }

  /**
   * Adds an option to the allowlist.
   */
  public static async addToAllowlistAsync(option: keyof LaunchOptions): Promise<void> {
    const allowlist: ILaunchOptionsAllowlist = await this.readAllowlistAsync();

    if (!allowlist.allowedOptions.includes(option)) {
      allowlist.allowedOptions.push(option);
      await this.writeAllowlistAsync(allowlist);
    }
  }

  /**
   * Removes an option from the allowlist.
   */
  public static async removeFromAllowlistAsync(option: keyof LaunchOptions): Promise<void> {
    const allowlist: ILaunchOptionsAllowlist = await this.readAllowlistAsync();
    allowlist.allowedOptions = allowlist.allowedOptions.filter((opt) => opt !== option);
    await this.writeAllowlistAsync(allowlist);
  }

  /**
   * Clears the entire allowlist.
   */
  public static async clearAllowlistAsync(): Promise<void> {
    await this.writeAllowlistAsync({
      allowedOptions: [],
      version: this._allowlistVersion
    });
  }

  /**
   * Gets a human-readable description of denied launch options.
   */
  public static getDeniedOptionsDescription(): string {
    const options: string[] = Array.from(DENIED_LAUNCH_OPTIONS);
    return (
      `The following launch options are denied by default for security:\n` +
      options.map((opt) => `  - ${opt}`).join('\n') +
      `\n\nThese options can potentially be abused for remote code execution from a compromised environment.`
    );
  }
}
