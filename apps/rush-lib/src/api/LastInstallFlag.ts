import * as path from 'path';
import * as _ from 'lodash';
import { FileSystem, JsonFile, JsonObject } from '@microsoft/node-core-library';

export const LAST_INSTALL_FLAG_FILE_NAME: string = 'last-install.flag';

interface IPropertyErrorDeps {
      /**
       * Original content property must match this value in order to check for
       * inequality
       */
      [prop: string]: string;
}
interface IPropertyErrors {
  /**
   * The properties to check and force an abort on inequality
   */
  [key: string]: {
    /**
     * Properties to check in the original content before checking for inequality.
     * All deps must match.  If no deps are defined, then inequality will be checked
     * unconditionally
     */
    deps?: IPropertyErrorDeps;
    /**
     * In case an inequality is found, and all deps match, then throw this error
     */
    error: string;
  }
}

const PROPERTY_ERRORS: IPropertyErrors = {
  storePath: {
    deps: {
      packageManager: "pnpm"
    },
    error: "Current PNPM store path does not match the last one used.  This may cause inconsistency in your builds.\n\n" +
      "If you wish to install with the currently configured path, please run \"rush update --purge\"\n\n" +
      "Old: <%= oldValue %>\n" +
      "New: <%= newValue %>"
  }
}

/**
 * A helper class for managing last-install flags, which are persistent and
 * indicate that something installed in the folder was sucessfully completed.
 * It also compares state, so that if something like the Node.js version has changed,
 * it can invalidate the last install.
 * @internal
 */
export class LastInstallFlag {
  private _path: string;
  private _state: JsonObject;

  /**
   * Creates a new LastInstall flag
   * @param folderPath - the folder that this flag is managing
   * @param state - optional, the state that should be managed or compared
  */
  public constructor(folderPath: string, state: JsonObject = {}) {
    this._path = path.join(folderPath, LAST_INSTALL_FLAG_FILE_NAME);
    this._state = state;
  }

  /**
   * Returns true if the file exists and the contents match the current state
   * @param abortOnInvalid - If the current state is not equal to the previous
   * state, and an error is defined for the condition that causes inequality, then abort with
   * the defined error message
   */
  public isValid(abortOnInvalid: boolean = false): boolean {
    if (!FileSystem.exists(this._path)) {
      return false;
    }
    let contents: JsonObject;
    try {
      contents = JsonFile.load(this._path);
    } catch (err) {
      return false;
    } 
    if (!_.isEqual(contents, this._state)) {
      if (abortOnInvalid) {
        for (const errorKey of Object.keys(PROPERTY_ERRORS)) {
          const errorDeps: IPropertyErrorDeps = PROPERTY_ERRORS[errorKey].deps || {};
          const depKeys: string[] = Object.keys(errorDeps);
          const depsMatch: boolean = depKeys.length === 0 || depKeys.every((depProp) => errorDeps[depProp] === contents[depProp])
          if (!_.isEqual(contents[errorKey], this._state[errorKey]) && depsMatch) {
            throw _.template(PROPERTY_ERRORS[errorKey].error)({
              oldValue: contents[errorKey],
              newValue: this._state[errorKey]
            });
          }
        }
      }
      return false;
    }
    return true;
  }

  /**
   * Writes the flag file to disk with the current state
   */
  public create(): void {
    JsonFile.save(this._state, this._path, {
      ensureFolderExists: true
    });
  }

  /**
   * Removes the flag file
   */
  public clear(): void {
    FileSystem.deleteFile(this._path);
  }

  /**
   * Returns the full path to the flag file
   */
  public get path(): string {
    return this._path;
  }
}