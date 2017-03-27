export default class PrereleaseToken {
  private _name: string;

  constructor(private _prereleaseName?: string, private _suffixName?: string) {
    if (_prereleaseName && _suffixName) {
      throw new Error('Pre-release name and suffix cannot be provided at the same time.');
    }
    this._name = !!_prereleaseName ? _prereleaseName : _suffixName;
  }

  public hasValue(): boolean {
    return !!this._prereleaseName || !!this._suffixName;
  }

  public isPrerelease(): boolean {
    return !!this._prereleaseName;
  }

  public isSuffix(): boolean {
    return !!this._suffixName;
  }

  public get name(): string {
    return this._name;
  }
}