// craco.config.js — postcss handled entirely by postcss.config.js
const webpack = require('webpack');

module.exports = {
    webpack: {
        configure: (webpackConfig) => {
            webpackConfig.resolve.fallback = {
                http:   require.resolve('stream-http'),
                https:  require.resolve('https-browserify'),
                crypto: require.resolve('crypto-browserify'),
                stream: require.resolve('stream-browserify'),
                buffer: require.resolve('buffer-browserify'),
                zlib: false,
                url:  false,
                vm:   false,
            };
            webpackConfig.output = { ...webpackConfig.output, publicPath: '/' };
            webpackConfig.plugins = (webpackConfig.plugins || []).concat(
                new webpack.ProvidePlugin({ Buffer: ['buffer', 'Buffer'] })
            );
            webpackConfig.ignoreWarnings = [
                ...(webpackConfig.ignoreWarnings || []),
                { message: /Failed to parse source map/ },
            ];
            return webpackConfig;
        },
    },
};
