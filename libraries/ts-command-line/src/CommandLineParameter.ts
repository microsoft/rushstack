/**
 * @Copyright (c) Microsoft Corporation.  All rights reserved.
 */
export interface IConverterFunction<T> {
  (initial: any): T; /* tslint:disable-line:no-any */
}

export interface ICommandLineParserData {
  action: string;
  [key: string]: any; /* tslint:disable-line:no-any */
}

export class CommandLineParameter<T> {
  private _converter: IConverterFunction<T>;
  private _value: T;
  private _key: string;
  constructor(key: string, converter: (data: string) => T) {
    this._converter = converter || ((data: string) => data as any as T); /* tslint:disable-line:no-any */
    this._key = key;
  }

  public setValue(data: ICommandLineParserData): void {
    this._value = this._converter(data[this._key]);
  }

  public get value(): T {
    return this._value;
  }

  // An internal key used to retrieve the value from the parser's dictionary
  public get key(): string {
    return this._key;
  }
}

export class CommandLineStringParameter extends CommandLineParameter<string> { }

export class CommandLineListParameter extends CommandLineParameter<string[]> { }

export class CommandLineFlagParameter extends CommandLineParameter<boolean> { }

export class CommandLineIntegerParameter extends CommandLineParameter<number> { }