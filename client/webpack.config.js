const path = require('path');
const { VueLoaderPlugin } = require('vue-loader');
const webpack = require('webpack');

const node_env = process.env.NODE_ENV;
const isDevelopment = (!node_env || node_env === 'development');
const mode = isDevelopment ? 'development' : 'production';
console.log(`Environment: ${node_env}, mode: ${mode}`);

const configs = {
  mode,
  entry: {
    main: './src/index.ts',
    style: './src/style.ts'
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        loader: 'ts-loader',
        options: {
          appendTsSuffixTo: [/\.vue$/],
        },
        exclude: /node_modules/
      },
      {
        test: /\.vue$/,
        use: ['vue-loader'],
      },
      {
        test: /\.css$/,
        use: ['vue-style-loader', 'css-loader']
      }
    ],
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js', '.vue']
  },
  plugins: [
    new webpack.DefinePlugin({
      "__VUE_OPTIONS_API__": true,
      "__VUE_PROD_DEVTOOLS__": false
    }),
    new VueLoaderPlugin()
  ],
  output: {
    path: path.resolve(__dirname, 'dist'),
  },
};

if (isDevelopment) {
  configs.devtool = 'inline-source-map';
  configs.devServer = {
    proxy: {
      '/auth': 'http://localhost:8081',
      '/app': 'http://localhost:8082',
      '/ws-app': {
        target: 'http://localhost:8082',
        ws: true,
      }
    },
    static: ['./dist', './public']
  };
}

module.exports = configs;