// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * @public
 */
export interface IConverterFunction<T> {
  (initial: any): T; /* tslint:disable-line:no-any */
}

/**
 * @internal
 */
export interface ICommandLineParserData {
  action: string;
  [key: string]: any; /* tslint:disable-line:no-any */
}

/**
 * The base class for the various command-line parameter types.
 *
 * @remarks
 *
 * The "subclasses" of this class are not actually constructed directly.  Instead,
 * they are used as shorthand for various parameterizations of CommandLineParameter<T>.
 * @public
 */
export class CommandLineParameter<TValue> {
  private _converter: IConverterFunction<TValue>;
  private _value: TValue;
  private _keyData: string;

  constructor(key: string, converter?: (data: string) => TValue) {
    this._converter = converter || ((data: string) => data as any as TValue); /* tslint:disable-line:no-any */
    this._keyData = key;
  }

  /**
   * Called internally by CommandLineParameterProvider._processParsedData()
   * @internal
   */
  public _setValue(data: ICommandLineParserData): void {
    this._value = this._converter(data[this._keyData]);
  }

  /**
   * After the command line has been parsed, this returns the value of the parameter.
   * @remarks
   * For example, for a CommandLineFlagParameter it will be a boolean indicating
   * whether the switch was provided.  For a CommandLineStringListParameter it will
   * be an array of strings.
   */
  public get value(): TValue {
    return this._value;
  }

  /**
   * An internal key used to retrieve the value from the parser's dictionary
   * @internal
   */
  public get _key(): string {
    return this._keyData;
  }
}

/**
 * The data type returned by {@link CommandLineParameterProvider.defineOptionParameter}.
 * @public
 */
export class CommandLineOptionParameter extends CommandLineParameter<string> { }

/**
 * The data type returned by {@link CommandLineParameterProvider.defineStringParameter}.
 * @public
 */
export class CommandLineStringParameter extends CommandLineParameter<string> { }

/**
 * The data type returned by {@link CommandLineParameterProvider.defineStringListParameter}.
 * @public
 */
export class CommandLineStringListParameter extends CommandLineParameter<string[]> { }

/**
 * The data type returned by {@link CommandLineParameterProvider.defineFlagParameter}.
 * @public
 */
export class CommandLineFlagParameter extends CommandLineParameter<boolean> { }

/**
 * The data type returned by {@link CommandLineParameterProvider.defineIntegerParameter}.
 * @public
 */
export class CommandLineIntegerParameter extends CommandLineParameter<number> { }
