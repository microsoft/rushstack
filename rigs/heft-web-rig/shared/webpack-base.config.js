'use strict';

const webpack = require('webpack');
const path = require('path');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const { DefinePlugin } = webpack;
const CssMinimizerPlugin = require('css-minimizer-webpack-plugin');
const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer');
const { merge, mergeWithCustomize, mergeWithRules, unique } = require('webpack-merge');
const sass = require('sass');
const autoprefixer = require('autoprefixer');

/**
 * If the "--production" command-line parameter is specified when invoking Heft, then the
 * "production" function parameter will be true.  You can use this to enable bundling optimizations.
 */
function createWebpackConfig({ env, argv, projectRoot, configOverride, extractCssInProduction }) {
  const { production } = env;

  const defaultArgs = {
    // Documentation: https://webpack.js.org/configuration/mode/
    mode: production ? 'production' : 'development',
    resolve: {
      extensions: ['.mjs', '.js', '.json']
    },
    output: production
      ? {
          chunkFilename: '[name].[contenthash].js',
          filename: '[name].[contenthash].js',
          sourceMapFilename: '[name].[contenthash].js.map'
        }
      : {},
    module: {
      rules: [
        {
          // The source-map-loader extracts existing source maps from all JavaScript entries. This includes both
          // inline source maps as well as those linked via URL. All source map data is passed to Webpack for
          // processing as per a chosen source map style specified by the devtool option in webpack.config.js.
          // https://www.npmjs.com/package/source-map-loader
          test: /\.js$/,

          // Include source maps from other library projects in the monorepo workspace,
          // but exclude source maps for external NPM packages.  Webpack tests the fs.realPathSync() path,
          // so external packages will be under "common/temp/node_modules/.pnpm/".
          exclude: /[\\/]\.pnpm[\\/]/,

          enforce: 'pre',
          use: [
            {
              loader: require.resolve('source-map-loader')
            }
          ]
        },

        {
          // CSS/SASS INPUT FORMATS
          //
          // We recommend the newer .scss file format because its syntax is a proper superset of familiar CSS.
          // The older .sass syntax is also accepted for backwards compatibility.
          //
          // The Sass documentation is here: https://sass-lang.com/documentation/syntax
          //
          // File extensions    Sass  Autoprefixer  CSS modules    .d.ts
          // -----------------  ----  ------------  -------------  -----
          // *.scss:            YES   YES           YES            YES     (recommended)
          // *.sass:            YES   YES           YES            YES     (deprecated)
          // *.global.scss:     YES   YES           NO             NO
          // *.global.sass:     YES   YES           NO             NO      (deprecated)
          // *.css:             NO    YES           NO             NO
          //
          // If you want .css syntax but with CSS modules, use the .scss file extension; its syntax
          // is a superset of CSS. (There's a small performance penalty for applying Sass to a CSS file,
          // but the extra syntax validation justifies that cost.)
          //
          // COMPILATION STRATEGY
          //
          // - Sass compilation:   handled by Webpack
          // - .d.ts generation:   handled by @rushstack/heft-sass-plugin, configured using config/sass.json
          // - Autoprefixer:       handled by Webpack
          // - CSS modules:        handled by Webpack
          test: /\.(scss|sass|css)$/,
          exclude: /node_modules/,
          use: [
            // "For production builds it's recommended to extract the CSS from your bundle being able to
            // use parallel loading of CSS/JS resources later on. This can be achieved by using the
            // mini-css-extract-plugin, because it creates separate css files."
            //
            // "For development mode (including webpack-dev-server) you can use style-loader, because it injects
            // CSS into the DOM using multiple <style></style> and works faster."
            //
            // "WARNING: Do not use style-loader and mini-css-extract-plugin together."
            production && extractCssInProduction
              ? {
                  loader: MiniCssExtractPlugin.loader
                }
              : {
                  // Generates JavaScript code that injects CSS styles into the DOM at runtime.
                  // The default configuration creates <style> elements from JS strings
                  // https://www.npmjs.com/package/style-loader
                  loader: require.resolve('style-loader')
                },

            {
              // Translates CSS into CommonJS
              // https://www.npmjs.com/package/css-loader
              loader: require.resolve('css-loader'),
              options: {
                // 0 => no loaders (default);
                // 1 => postcss-loader;
                // 2 => postcss-loader, sass-loader
                importLoaders: 2,

                // Enable CSS modules:  https://github.com/css-modules/css-modules
                modules: {
                  // The "auto" setting has a confusing design:
                  // - "false" disables CSS modules, i.e. ":local" and ":global" selectors can't be used at all
                  // - "true" means magically disable CSS modules if the file extension isn't like ".module.css"
                  //   or ".module.scss"
                  // - a lambda disables CSS modules only if the lambda returns false; the function parameter is
                  //   the resource path
                  // - a RegExp disables CSS modules only if the resource path does not match the RegExp
                  //
                  // NOTE: Counterintuitively, if you instead set "modules=true" then CSS modules are enabled
                  //       without magic, equivalent to "auto: () => true" instead of "auto: true"
                  //
                  // DEFAULT: "true" (i.e. path based magic)
                  auto: (resourcePath) => {
                    // Enable CSS modules...
                    const useCssModules =
                      // ...UNLESS the filename opts out using a file extension like "filename.global.scss"
                      !/\.global\.\w+$/i.test(resourcePath) &&
                      // ...UNLESS this is a .css file.
                      !/\.css$/i.test(resourcePath);
                    return useCssModules;
                  },

                  // This setting has no effect unless CSS modules is enabled. Possible values:
                  // - "local": global CSS by default, overridable using the ":local" selector
                  // - "global": local CSS by default, overridable using the ":global" selector
                  // - "pure": requires selectors to contain at least one local class or id
                  // - a lambda that returns the mode string; the function parameter is the resource path
                  //
                  // DEFAULT: "local"
                  mode: 'local',

                  // Set this to true if you want to be able to reference the global declarations using import statements
                  // similar to local CSS modules
                  //
                  // DEFAULT: false
                  // exportGlobals: true,

                  // Provide a recognizable class/module names for developers
                  //
                  // DEFAULT: "[hash:base64]"
                  localIdentName: production ? '[hash:base64]' : '[local]__[hash:base64:5]'
                },

                sourceMap: !production
              }
            }
          ],

          // Nested rules are applied after the parent rules.
          // https://webpack.js.org/configuration/module/#nested-rules
          rules: [
            {
              // Prevent postcss-loader and sass-loader from processing the .css file extension
              test: /\.(scss|sass)$/,

              use: [
                {
                  // PostCSS is a general-purpose CSS transformer; however, we prefer to avoid custom CSS syntaxes
                  // and only use the standard SASS syntax.  Thus postcss-loader is used here only to apply the popular
                  // "autoprefixer" plugin improves browser compatibility by generating vendor prefixes.
                  // https://www.npmjs.com/package/postcss-loader
                  loader: require.resolve('postcss-loader'),
                  options: {
                    postcssOptions: {
                      plugins: [
                        // https://www.npmjs.com/package/autoprefixer
                        autoprefixer
                      ]
                    },

                    sourceMap: !production
                  }
                },
                {
                  // Compiles SASS syntax into CSS
                  // https://www.npmjs.com/package/sass-loader
                  loader: require.resolve('sass-loader'),

                  options: {
                    implementation: sass,
                    sassOptions: {
                      includePaths: [path.resolve(__dirname, 'node_modules')]
                    },

                    sourceMap: !production
                  }
                }
              ]
            }
          ]
        },

        {
          test: /\.(jpeg|jpg|png|gif|svg|ico|webp|avif|woff|woff2|ttf|eot)$/,
          // Allows import/require() to be used with an asset file. The file will be copied to the output folder,
          // and the import statement will return its URL.
          // https://webpack.js.org/guides/asset-modules/#resource-assets
          type: 'asset/resource'
        }
      ]
    },
    devServer: {
      host: 'localhost',
      port: 8080
    },
    // See here for documentation: https://webpack.js.org/configuration/devtool
    devtool: production ? undefined : 'eval-source-map',
    optimization: {
      minimize: !!production,
      nodeEnv: production ? 'production' : 'development',
      minimizer: [
        new CssMinimizerPlugin({
          minimizerOptions: {
            preset: ['default', { discardComments: { removeAll: !!production } }]
          }
        }),
        // This magic constant indicates the minimizer defaults
        // https://webpack.js.org/configuration/optimization/#optimizationminimizer
        '...'
      ]
    },
    plugins: [
      // See here for documentation: https://webpack.js.org/plugins/mini-css-extract-plugin/
      new MiniCssExtractPlugin({
        filename: '[name].[contenthash].css'
      }),

      // See here for documentation: https://webpack.js.org/plugins/define-plugin/
      new DefinePlugin({
        DEBUG: !production
      }),

      process.env.REPORT ? new BundleAnalyzerPlugin({ analyzerMode: 'static' }) : undefined
    ]
  };

  let result = mergeWithCustomize({
    // Remove duplicate of HtmlWebpackPlugin
    // this allows projects to override the default rig behavior if applicable (ex. when targeting older browsers)
    customizeArray: unique(
      'plugins',
      ['HtmlWebpackPlugin'],
      (plugin) => plugin && plugin.constructor && plugin.constructor.name
    )
  })(defaultArgs, configOverride);

  // Remove undefined/null plugins
  if (Array.isArray(result.plugins)) {
    result.plugins = result.plugins.filter(Boolean);
  }

  return result;
}

createWebpackConfig.merge = merge;
createWebpackConfig.mergeWithCustomize = mergeWithCustomize;
createWebpackConfig.mergeWithRules = mergeWithRules;

module.exports = createWebpackConfig;
