class LoadThemedStylesMock {
  public static loadedData: string[] = [];

  public static loadStyles(data: string): void {
    this.loadedData.push(data);
  }
}

export = LoadThemedStylesMock;
