export const ASSETS_BASE_URL2: string = requireFolder({
  outputFolder: 'assets2_[hash]',
  sources: [
    {
      globsBase: '../assets',
      globPatterns: ['**/*']
    }
  ]
});
