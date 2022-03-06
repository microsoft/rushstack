import type { IRequireFolderOptions } from '@rushstack/hashed-folder-copy-plugin';

declare function requireFolder(options: IRequireFolderOptions): string;

const ASSETS_BASE_URL: string = requireFolder({
  outputFolder: 'assets_[hash]',
  sources: [
    {
      globsBase: '../assets',
      globPatterns: ['**/*']
    }
  ]
});

function appendImageToBody(url: string): void {
  const image: HTMLImageElement = document.createElement('img');
  image.src = url;
  document.body.appendChild(image);
}

appendImageToBody(`${ASSETS_BASE_URL}/red.png`);
appendImageToBody(`${ASSETS_BASE_URL}/green.png`);
appendImageToBody(`${ASSETS_BASE_URL}/blue.png`);
