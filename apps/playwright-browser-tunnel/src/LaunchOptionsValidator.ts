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
   * All launch options are denied by default unless explicitly allowed by the user.
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
    const filteredOptions: LaunchOptions = {};

    // Check each provided launch option - deny all unless explicitly allowed
    for (const key of Object.keys(launchOptions) as Array<keyof LaunchOptions>) {
      if (allowedOptionsSet.has(key)) {
        // Option is in the user's allowlist - permit it
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (filteredOptions as any)[key] = launchOptions[key];

        if (terminal) {
          terminal.writeWarningLine(
            `Launch option '${key}' is allowed by user allowlist. ` +
              `Value: ${JSON.stringify(launchOptions[key])}`
          );
        }
      } else {
        // Option is not in allowlist - deny it
        deniedOptions.push(key);

        const warning: string =
          `Launch option '${key}' was denied (not in allowlist). ` +
          `To allow this option, add it to your local allowlist at: ${this.getAllowlistFilePath()}`;
        warnings.push(warning);

        if (terminal) {
          terminal.writeWarningLine(warning);
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
   * Gets a human-readable description of the allowlist security model.
   */
  public static getAllowlistDescription(): string {
    return (
      `All launch options are denied by default for security.\n` +
      `Only options explicitly added to your allowlist will be permitted.\n\n` +
      `Allowlist location: ${this.getAllowlistFilePath()}`
    );
  }
}
