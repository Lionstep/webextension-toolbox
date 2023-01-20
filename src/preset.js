/* eslint-disable no-unused-vars */
/* eslint-disable global-require */
const browserslist = require('browserslist')

/**
 * Returns the latest
 * vendor version
 * @param {String} vendor
 * @return {Number} version
 */
function latest(vendor) {
  const { versions } = browserslist.data[vendor]
  return versions[versions.length - 1]
}

/**
 * Returns the appropriate
 * vendor version to target
 * @param {String} vendor
 * @param {String} version
 * @return {Number}
 */
function getTargetVendorVersion(vendor, version) {
  // Return the specified version if it is numeric
  if (!Number.isNaN(version)) {
    return parseInt(version, 10)
  }

  // Default to the latest version of each browser
  let query = 'last 1 version';

  // For "auto" use project's config restricted to target vendor.
  // If target vendor is not in the project's config, use defaults
  if (typeof version === 'string' && version.toLowerCase() === 'auto') {
    query = `browserslist config and ${vendor} > 0 or defaults`
  }

  // The last value returned by `browserslist()` is the "oldest" that matches the query
  const browserString = browserslist(query).filter(browser => browser.indexOf(vendor) !== -1).pop()

  // Convert the browser string (ex "chrome 67") to just the version number
  return parseInt(browserString.replace(`${vendor  } `, ''), 10)
}

exports.getTargetByVendor = ({ vendor, vendorVersion }) => `${vendor}${getTargetVendorVersion(vendor, vendorVersion)}`

module.exports = ({ vendor, vendorVersion }) => {
  const env = process.env.BABEL_ENV || process.env.NODE_ENV
  const isProduction = env === 'production'
  const targets = {}
  targets[vendor] = getTargetVendorVersion(vendor, vendorVersion)

  return {
    presets: [
      // Latest stable ECMAScript features
      require('@babel/preset-typescript').default,
      [
        require('@babel/preset-env').default, {
          // `entry` transforms `@babel/polyfill` into individual requires for
          // the targeted browsers. This is safer than `usage` which performs
          // static code analysis to determine what's required.
          // This is probably a fine default to help trim down bundles when
          // end-users inevitably import '@babel/polyfill'.
          useBuiltIns: 'entry',
          corejs: { version: '3.20.3' },
          // Do not transform modules to CJS
          modules: false,
          // debug: true,
          // Restrict to current vendor
          targets,
        }],
      [
        require('@babel/preset-react').default,
        {
          // Adds component stack to warning messages
          // Adds __self attribute to JSX which React will use for some warnings
          development: !isProduction
        }
      ]
    ],
    plugins: [
      // Necessary to include regardless of the environment because
      // in practice some other transforms (such as object-rest-spread)
      // don't work without it: https://github.com/babel/babel/issues/7215
      require('@babel/plugin-transform-destructuring').default,
      // class { handleClick = () => { } }
      require('@babel/plugin-proposal-class-properties').default,
      // The following two plugins use Object.assign directly, instead of Babel's
      // extends helper. Note that this assumes `Object.assign` is available.
      // { ...todo, completed: true }
      [
        require('@babel/plugin-proposal-object-rest-spread').default,
        {
          useBuiltIns: true
        }
      ],
      // Transforms JSX
      [
        require('@babel/plugin-transform-react-jsx').default,
        {
          useBuiltIns: true
        }
      ],
      // Polyfills the runtime needed for async/await and generators
      [
        require('@babel/plugin-transform-runtime').default,
        {
          helpers: false,
          regenerator: true
        }
      ],
      // Remove PropTypes from production build
      isProduction && [require.resolve('babel-plugin-transform-react-remove-prop-types'), {
        removeImport: true
      }]
    ].filter(Boolean)
  }
}
