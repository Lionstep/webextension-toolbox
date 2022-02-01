const { resolve } = require('path')
const webpack = require('webpack')
const { CleanWebpackPlugin } = require('clean-webpack-plugin')
const GlobEntriesPlugin = require('webpack-watched-glob-entries-plugin')
const CaseSensitivePathsPlugin = require('case-sensitive-paths-webpack-plugin')
const CopyPlugin = require('copy-webpack-plugin')
const WebextensionPlugin = require('webpack-webextension-plugin')
const getExtensionInfo = require('./utils/get-extension-info')
const createPreset = require('./preset')
const WebpackBar = require('webpackbar')

module.exports = function webpackConfig({
  src = 'app',
  target = 'build/[vendor]',
  packageTarget = 'packages',
  dev = false,
  copyIgnore = ['**/*.js', '**/*.json'],
  devtool = false,
  minimize = false,
  vendor = 'chrome',
  vendorVersion
} = {}) {
  const mode = dev ? 'development' : 'production'

  // Set the NODE_ENV (needed for babel)
  process.env.NODE_ENV = mode

  // Compile variable targets
  target = resolve(target.replace('[vendor]', vendor))
  packageTarget = resolve(packageTarget.replace('[vendor]', vendor))

  // Get some defaults
  const { version, name, description } = getExtensionInfo(src)

  /******************************/
  /*      WEBPACK               */
  /******************************/
  const config = {
    mode,
    context: resolve(src)
  }

  // Automatically resolve the following extensions:
  config.resolve = {
    extensions: ['.js', '.json', '.mjs', '.jsx']
  }

  // Source-Maps
  config.devtool = devtool

  /******************************/
  /*       WEBPACK.ENTRY        */
  /******************************/
  const entries = []

  // Add main entry glob
  entries.push(resolve(src, '*.{js,mjs,jsx}'))
  entries.push(resolve(src, '?(scripts)/*.{js,mjs,jsx}'))

  // We use the GlobEntriesPlugin in order to
  // restart the compiler in watch mode, when new
  // files got added.
  config.entry = GlobEntriesPlugin.getEntries(
    entries
  )

  /******************************/
  /*       WEBPACK.OUTPUT       */
  /******************************/
  config.output = {
    path: target,
    filename: '[name].js',
    chunkFilename: '[id].chunk.js'
  }
  /******************************/
  /*    WEBPACK.OPTIMIZATION    */
  /******************************/
  config.optimization = { minimize: minimize }

  /******************************/
  /*       WEBPACK.LOADERS      */
  /******************************/
  config.module = {
    rules: []
  }

  const babelLoader = {
    loader: require.resolve('babel-loader'),
    options: {
      sourceMaps: true,
      cacheDirectory: true,
      ...createPreset({
        vendor,
        vendorVersion
      })
    }
  };

  // Add babel support
  config.module.rules.push(
    {
      test: /\.((tsx?)|js|jsx|mjs)$/,
      exclude: [
        /node_modules/,
        resolve(process.cwd(), 'app/scripts/fontawesome.js'),
      ],
      use: babelLoader,
    },
    {
      test: /\.js$/,
      use: [require.resolve('source-map-loader')],
      enforce: 'pre'
    },
    // {
    //   test: /\.(js|jsx|mjs)$/,
    //   exclude: /node_modules/,
    //   use: babelLoader,
    // },
    // {
    //   test: /\.tsx?$/,
    //   exclude: /node_modules/,
    //   use: [babelLoader, 'ts-loader'],
    // }
  )

  /******************************/
  /*     WEBPACK.PLUGINS        */
  /******************************/
  config.plugins = []

  // Clear output directory
  // config.plugins.push(new CleanWebpackPlugin());
  config.plugins.push(new webpack.CleanPlugin({keep: /manifest\.json/}));

  // Watcher doesn't work well if you mistype casing in a path so we use
  // a plugin that prints an error when you attempt to do this.
  config.plugins.push(new CaseSensitivePathsPlugin())

  // Add Wilcard Entry Plugin
  config.plugins.push(new GlobEntriesPlugin())

  // Add webextension polyfill
  if (['chrome', 'opera', 'edge'].includes(vendor)) {
    config.plugins.push(
      new webpack.ProvidePlugin({
        browser: require.resolve('webextension-polyfill')
      })
    )

    // The webextension-polyill doesn't work well with webpacks ProvidePlugin.
    // So we need to monkey patch it on the fly
    // More info: https://github.com/mozilla/webextension-polyfill/pull/86
    config.module.rules.push({
      test: /webextension-polyfill[\\/]+dist[\\/]+browser-polyfill\.js$/,
      loader: require.resolve('string-replace-loader'),
      options: {
        search: 'typeof browser === "undefined"',
        replace: 'typeof window.browser === "undefined" || Object.getPrototypeOf(window.browser) !== Object.prototype'
      }
    })
  }

  // Set environment vars
  config.plugins.push(
    new webpack.EnvironmentPlugin({
      VENDOR: vendor,
      WEBEXTENSION_TOOLBOX_VERSION: version
    })
  )

  // Copy non js files & compile manifest
  config.plugins.push(
    new CopyPlugin({
      patterns: [
        {
          // Copy all files except (.js, .json, _locales)
          context: resolve(src),
          from: resolve(src, '**/*').replace(/\\/g, '/'),
          globOptions: {
            ignore: copyIgnore
          },
          to: target
        },
        {
          // Copy all language json files
          context: resolve(src),
          from: resolve(src, '_locales/**/*.json').replace(/\\/g, '/'),
          to: target
        }
      ]
    })
  )

  // Compile and validate manifest and autoreload
  // extension in watch mode
  config.plugins.push(
    new WebextensionPlugin({
      vendor,
      manifestDefaults: {
        name,
        description,
        version
      }
    })
  )

  // Disable webpacks usage of eval & function string constructor
  // @url https://github.com/webpack/webpack/blob/master/buildin/global.js
  config.node = false

  // In order to still be able to use global we use window instead
  config.plugins.push(
    new webpack.ProvidePlugin({
      global: require.resolve('./utils/global.js')
    })
  )

  config.plugins.push(new WebpackBar())

  return config
}
