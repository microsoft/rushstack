export class ChunkClass {
  public doStuff(): void {
    console.log('CHUNK');
  }

  public getImageUrl(): string {
    return require('./image.png');
  }
}
