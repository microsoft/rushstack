Object.defineProperty(exports, "__esModule", { value: true });
exports.default = {
    paths: {
        sourceMatch: [
            'src/**/*.ts',
            'src/**/*.tsx',
            'typings/tsd.d.ts'
        ],
        lessMatch: ['src/**/*.less'],
        htmlMatch: ['src/**/*.html'],
        staticsMatch: [
            'src/**/*.css',
            'src/**/*.jpg',
            'src/**/*.js',
            'src/**/*.png'
        ],
        libFolder: 'lib'
    },
    copyTo: {},
    isLintingEnabled: false,
    lintConfig: require('../../tslint.json')
};
