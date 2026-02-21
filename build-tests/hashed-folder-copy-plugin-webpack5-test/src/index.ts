import { ASSETS_BASE_URL2 } from './submodule.ts';

const ASSETS_BASE_URL: string = requireFolder({
  outputFolder: 'assets_[hash]',
  sources: [
    {
      globsBase: '../assets',
      globPatterns: ['**/*']
    }
  ]
});

const HEFT_SRC_FILES_BASE_URL: string = requireFolder({
  outputFolder: 'heft_src_files_[hash]',
  sources: [
    {
      globsBase: '@rushstack/heft/src',
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
appendImageToBody(`${ASSETS_BASE_URL}/subfolder/yellow.png`);

appendImageToBody(`${ASSETS_BASE_URL2}/red.png`);
appendImageToBody(`${ASSETS_BASE_URL2}/green.png`);
appendImageToBody(`${ASSETS_BASE_URL2}/blue.png`);
appendImageToBody(`${ASSETS_BASE_URL2}/subfolder/yellow.png`);

console.log(HEFT_SRC_FILES_BASE_URL);
