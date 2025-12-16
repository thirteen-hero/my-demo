'use strict';

const fs = require('fs');
const path = require('path');
const webpack = require('webpack');
const resolve = require('resolve');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CaseSensitivePathsPlugin = require('case-sensitive-paths-webpack-plugin');
const InlineChunkHtmlPlugin = require('react-dev-utils/InlineChunkHtmlPlugin');
const TerserPlugin = require('terser-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const CssMinimizerPlugin = require('css-minimizer-webpack-plugin');
const { WebpackManifestPlugin } = require('webpack-manifest-plugin');
const InterpolateHtmlPlugin = require('react-dev-utils/InterpolateHtmlPlugin');
const WorkboxWebpackPlugin = require('workbox-webpack-plugin');
const ModuleScopePlugin = require('react-dev-utils/ModuleScopePlugin');
const getCSSModuleLocalIdent = require('react-dev-utils/getCSSModuleLocalIdent');
const ESLintPlugin = require('eslint-webpack-plugin');
const paths = require('./paths');
const modules = require('./modules');
const getClientEnvironment = require('./env');
const ModuleNotFoundPlugin = require('react-dev-utils/ModuleNotFoundPlugin');
const ForkTsCheckerWebpackPlugin =
  process.env.TSC_COMPILE_ON_ERROR === 'true'
    ? require('react-dev-utils/ForkTsCheckerWarningWebpackPlugin')
    : require('react-dev-utils/ForkTsCheckerWebpackPlugin');
const ReactRefreshWebpackPlugin = require('@pmmmwh/react-refresh-webpack-plugin');

const createEnvironmentHash = require('./webpack/persistentCache/createEnvironmentHash');

const WebpackBundleAnalyzer = require('webpack-bundle-analyzer');

// Source maps are resource heavy and can cause out of memory issue for large source files.
const shouldUseSourceMap = process.env.GENERATE_SOURCEMAP !== 'false';

const reactRefreshRuntimeEntry = require.resolve('react-refresh/runtime');
const reactRefreshWebpackPluginRuntimeEntry = require.resolve(
  '@pmmmwh/react-refresh-webpack-plugin'
);
const babelRuntimeEntry = require.resolve('babel-preset-react-app');
const babelRuntimeEntryHelpers = require.resolve(
  '@babel/runtime/helpers/esm/assertThisInitialized',
  { paths: [babelRuntimeEntry] }
);
const babelRuntimeRegenerator = require.resolve('@babel/runtime/regenerator', {
  paths: [babelRuntimeEntry],
});

// Some apps do not need the benefits of saving a web request, so not inlining the chunk
// makes for a smoother build process.
const shouldInlineRuntimeChunk = process.env.INLINE_RUNTIME_CHUNK !== 'false';

const emitErrorsAsWarnings = process.env.ESLINT_NO_DEV_ERRORS === 'true';
const disableESLintPlugin = process.env.DISABLE_ESLINT_PLUGIN === 'true';

const imageInlineSizeLimit = parseInt(
  process.env.IMAGE_INLINE_SIZE_LIMIT || '10000'
);

// Check if TypeScript is setup
const useTypeScript = fs.existsSync(paths.appTsConfig);

// Check if Tailwind config exists
const useTailwind = fs.existsSync(
  path.join(paths.appPath, 'tailwind.config.js')
);

// Get the path to the uncompiled service worker (if it exists).
const swSrc = paths.swSrc;

// style files regexes
const cssRegex = /\.css$/;
const cssModuleRegex = /\.module\.css$/;
const sassRegex = /\.(scss|sass)$/;
const sassModuleRegex = /\.module\.(scss|sass)$/;
const lessRegex = /\.less$/;
const lessModuleRegex = /\.module\.less$/;

const hasJsxRuntime = (() => {
  if (process.env.DISABLE_NEW_JSX_TRANSFORM === 'true') {
    return false;
  }

  try {
    require.resolve('react/jsx-runtime');
    return true;
  } catch (e) {
    return false;
  }
})();

// This is the production and development configuration.
// It is focused on developer experience, fast rebuilds, and a minimal bundle.
module.exports = function (webpackEnv) {
  const isEnvDevelopment = webpackEnv === 'development';
  const isEnvProduction = webpackEnv === 'production';

  // Variable used for enabling profiling in Production
  // passed into alias object. Uses a flag if passed into the build command
  const isEnvProductionProfile =
    isEnvProduction && process.argv.includes('--profile');

  // We will provide `paths.publicUrlOrPath` to our app
  // as %PUBLIC_URL% in `index.html` and `process.env.PUBLIC_URL` in JavaScript.
  // Omit trailing slash as %PUBLIC_URL%/xyz looks better than %PUBLIC_URL%xyz.
  // Get environment variables to inject into our app.
  const env = getClientEnvironment(paths.publicUrlOrPath.slice(0, -1));

  const shouldUseReactRefresh = env.raw.FAST_REFRESH;

  // common function to get style loaders
  const getStyleLoaders = (cssOptions, preProcessor) => {
    const loaders = [
      isEnvDevelopment && require.resolve('style-loader'),
      isEnvProduction && {
        loader: MiniCssExtractPlugin.loader,
        // css is located in `static/css`, use '../../' to locate index.html folder
        // in production `paths.publicUrlOrPath` can be a relative path
        options: paths.publicUrlOrPath.startsWith('.')
          ? { publicPath: '../../' }
          : {},
      },
      {
        loader: require.resolve('css-loader'),
        options: cssOptions,
      },
      {
        // Options for PostCSS as we reference these options twice
        // Adds vendor prefixing based on your specified browser support in
        // package.json
        loader: require.resolve('postcss-loader'),
        options: {
          postcssOptions: {
            // Necessary for external CSS imports to work
            // https://github.com/facebook/create-react-app/issues/2677
            ident: 'postcss',
            config: false,
            plugins: !useTailwind
              ? [
                  'postcss-flexbugs-fixes',
                  [
                    // 将最新css语言特性转译为兼容性更佳的低版本代码
                    'postcss-preset-env',
                    {
                      // 自动添加浏览器前缀
                      autoprefixer: {
                        flexbox: 'no-2009',
                      },
                      stage: 3,
                    },
                  ],
                  // Adds PostCSS Normalize as the reset css with default options,
                  // so that it honors browserslist config in package.json
                  // which in turn let's users customize the target behavior as per their needs.
                  'postcss-normalize',
                ]
              : [
                  'tailwindcss',
                  'postcss-flexbugs-fixes',
                  [
                    'postcss-preset-env',
                    {
                      autoprefixer: {
                        flexbox: 'no-2009',
                      },
                      stage: 3,
                    },
                  ],
                ],
          },
          sourceMap: isEnvProduction ? shouldUseSourceMap : isEnvDevelopment,
        },
      },
    ].filter(Boolean);
    // 使用预处理器将对应样式代码转译为css代码,例如less-loader、sass-loader等
    if (preProcessor) {
      loaders.push(
        {
          loader: require.resolve('resolve-url-loader'),
          options: {
            sourceMap: isEnvProduction ? shouldUseSourceMap : isEnvDevelopment,
            root: paths.appSrc,
          },
        },
        {
          loader: require.resolve(preProcessor),
          options: {
            sourceMap: true,
          },
        }
      );
    }
    return loaders;
  };

  /** webpack编译流程 */
  // 输入 从文件系统读入代码文件
  // 模块递归处理 调用Loader转移Module内容,并将结果转换为AST,从中分析出模块依赖关系,进一步递归调用模块处理过程,直到所有依赖文件都处理完毕
  // 后处理 所有模块递归处理完毕后开始执行后处理,包括模块合并、注入运行时、产物优化等,最终输出chunk集合
  // 输出 将chunk写出道外部文件系统

  // 从打包流程角度来看,webpack配置项大体上可以分为两类
  // 流程类: 作用于打包流程某个或某几个环节,直接影响编译打包效果的配置项
  // 工具类: 打包主流程之外,提供更多工程化工具的配置项

  return {
    /** 打包流程强相关配置项 */
    // 输入输出
    // These are the "entry points" to our application.
    // This means they will be the "root" imports that are included in JS bundle.
    // 定义项目入口文件,webpack会从入口文件开始按图索骥找出所有项目文件
    entry: paths.appIndexJs, // src/index
    // 项目执行上下文路径
    // context: {},
    // 配置产物输出路径名称等
    output: {
      // The build folder.
      // 构建输出目录  
      path: paths.appBuild,
      // Add /* filename */ comments to generated require()s in the output.
      pathinfo: isEnvDevelopment,
      // There will be one main bundle, and one file per asynchronous chunk.
      // In development, it does not produce real files.
      // 输出文件名称
      filename: isEnvProduction
        // fullHash 整个项目的内容hash值,项目中任何模块内容变化都会产生新的fullhash
        // chunkhash 产物对应的chunk的hush,chunk中任意模块变化都会产生新的chunkhush
        // contenthash 产物内容hash值,仅当产物内容发生变化时才会产生新的contenthash
        // 生产环境使用哈希文件名
        ? 'static/js/[name].[contenthash:8].js'
        // 开发环境使用固定文件名
        : isEnvDevelopment && 'static/js/bundle.js',
      // There are also additional JS chunk files if you use code splitting.
      // 异步加载的chunk文件名
      chunkFilename: isEnvProduction
        ? 'static/js/[name].[contenthash:8].chunk.js'
        : isEnvDevelopment && 'static/js/[name].chunk.js',
      // 静态资源文件名称
      assetModuleFilename: 'static/media/[name].[hash][ext]',
      // webpack uses `publicPath` to determine where the app is being served from.
      // It requires a trailing slash, or the file assets will get an incorrect path.
      // We inferred the "public path" (such as / or /my-project) from homepage.
      // 公共路径
      publicPath: paths.publicUrlOrPath,
      // Point sourcemap entries to original disk location (format as URL on Windows)
      devtoolModuleFilenameTemplate: isEnvProduction
        ? info =>
            path
              .relative(paths.appSrc, info.absoluteResourcePath)
              .replace(/\\/g, '/')
        : isEnvDevelopment &&
          (info => path.resolve(info.absoluteResourcePath).replace(/\\/g, '/')),
    },

    // 模块处理
    // 用于配置模块路径解析规则,帮助webpack更精确、高效地找到指定模块
    resolve: {
      // This allows you to set a fallback for where webpack should look for modules.
      // We placed these paths second because we want `node_modules` to "win"
      // if there are any conflicts. This matches Node resolution mechanism.
      // https://github.com/facebook/create-react-app/issues/253
      // 模块查找路径
      modules: ['node_modules', paths.appNodeModules].concat(
        modules.additionalModulePaths || []
      ),
      // These are the reasonable defaults supported by the Node ecosystem.
      // We also include JSX as a common component filename extension to support
      // some tools, although we do not recommend using it, see:
      // https://github.com/facebook/create-react-app/issues/290
      // `web` extension prefixes have been added for better support
      // for React Native Web.
      // 支持的扩展名
      extensions: paths.moduleFileExtensions
        .map(ext => `.${ext}`)
        .filter(ext => useTypeScript || !ext.includes('ts')),
      alias: {
        // Support React Native Web
        // https://www.smashingmagazine.com/2016/08/a-glimpse-into-the-future-with-react-native-for-web/
        // 支持react native web
        'react-native': 'react-native-web',
        // Allows for better profiling with ReactDevTools
        ...(isEnvProductionProfile && {
          'react-dom$': 'react-dom/profiling',
          'scheduler/tracing': 'scheduler/tracing-profiling',
        }),
        // 自定义别名
        ...(modules.webpackAliases || {}),
      },
      plugins: [
        // Prevents users from importing files from outside of src/ (or node_modules/).
        // This often causes confusion because we only process files within src/ with babel.
        // To fix this, we prevent you from importing files out of src/ -- if you'd like to,
        // please link the files into your node_modules/ and let module-resolution kick in.
        // Make sure your source files are compiled, as they will not be processed in any way.
        // 限制模块导入范围,防止从src目录外导入模块
        new ModuleScopePlugin(paths.appSrc, [
          // 项目的package.json文件
          paths.appPackageJson,
          // react热更新运行时入口文件
          reactRefreshRuntimeEntry,
          // react热更新插件的运行时入口文件
          reactRefreshWebpackPluginRuntimeEntry,
          // babel运行时的入口文件
          babelRuntimeEntry,
          // babel运行时的辅助函数文件
          babelRuntimeEntryHelpers,
          // babel运行时的regenerator文件
          babelRuntimeRegenerator,
        ]),
      ],
    },
    // 用于配置模块加载规则,例如针对什么类型的资源用什么loader进行处理
    module: {
      // 如果模块导出不存在,webpack会抛出错误
      strictExportPresence: true,
      rules: [
        // Handle node_modules packages that contain sourcemaps
        // 在开发环境中,使用source-map-loader加载source maps,以便在调试时能定位到源代码
        shouldUseSourceMap && {
          // 确保当前loader在其他loader之前执行
          enforce: 'pre',
          // 排除@babel/runtime中的文件,避免重复处理
          exclude: /@babel(?:\/|\\{1,2})runtime/,
          // 匹配这些文件类型
          test: /\.(js|mjs|jsx|ts|tsx|css)$/,
          loader: require.resolve('source-map-loader'),
        },
        {
          // "oneOf" will traverse all following loaders until one will
          // match the requirements. When no loader matches it will fall
          // back to the "file" loader at the end of the loader list.
          // oneOf规则是webpack的一种优化机制,它会按顺序遍历规则列表,直到找到匹配的规则。如果没有匹配的规则,则使用最后的file-loader
          oneOf: [
            // TODO: Merge this config once `image/avif` is in the mime-db
            // https://github.com/jshttp/mime-db
            {
              // 处理avif格式的图片
              test: [/\.avif$/],
              // 将文件作为资源处理
              type: 'asset',
              // 指定文件的mime类型
              mimetype: 'image/avif',
              // 小于imageInlineSizeLimit的图片会被转化为base64编码
              // 大于imageInlineSizeLimit的图片被重命名并存放在产物文件夹下,同时在代码中插入图片url地址
              // output.assetModuleFileName控制图片资源存放位置
              parser: {
                dataUrlCondition: {
                  maxSize: imageInlineSizeLimit,
                },
              },
            },
            // "url" loader works like "file" loader except that it embeds assets
            // smaller than specified limit in bytes as data URLs to avoid requests.
            // A missing `test` is equivalent to a match.
            {
              // 处理常见图片格式
              test: [/\.bmp$/, /\.gif$/, /\.jpe?g$/, /\.png$/],
              // 将图片作为资源处理
              type: 'asset',
              // 小于imageInlineSizeLimit的图片会被转化为base64编码
              // 大于imageInlineSizeLimit的图片被重命名并存放在产物文件夹下,同时在代码中插入图片url地址。
              // output.assetModuleFileName控制图片资源存放位置
              parser: {
                dataUrlCondition: {
                  maxSize: imageInlineSizeLimit,
                },
              },
            },
            {
              // 处理svg图片
              test: /\.svg$/,
              use: [
                {
                  // 使用@svgr/webpack将svg图片转换为React组件
                  loader: require.resolve('@svgr/webpack'),
                  options: {
                    prettier: false,
                    svgo: false,
                    svgoConfig: {
                      plugins: [{ removeViewBox: false }],
                    },
                    titleProp: true,
                    ref: true,
                  },
                },
                {
                  // svg图片被重命名并存放在产物文件夹下,同时在代码中插入图片url地址
                  // 处理svg图片的静态资源路径
                  loader: require.resolve('file-loader'),
                  options: {
                    name: 'static/media/[name].[hash].[ext]',
                  },
                },
              ],
              issuer: {
                and: [/\.(ts|tsx|js|jsx|md|mdx)$/],
              },
            },
            // Process application JS with Babel.
            // The preset includes JSX, Flow, TypeScript, and some ESnext features.
            {
              // 使用babel编译js和ts代码
              test: /\.(js|mjs|jsx|ts|tsx)$/,
              // 仅处理src目录下的文件
              include: paths.appSrc,
              loader: require.resolve('babel-loader'),
              options: {
                customize: require.resolve(
                  'babel-preset-react-app/webpack-overrides'
                ),
                presets: [
                  [
                    // 使用babel-preset-react-app预设,支持react和ts
                    require.resolve('babel-preset-react-app'),
                    {
                      runtime: hasJsxRuntime ? 'automatic' : 'classic',
                    },
                  ],
                ],
                
                plugins: [
                  // 在开发环境中启用react热更新
                  isEnvDevelopment &&
                    shouldUseReactRefresh &&
                    require.resolve('react-refresh/babel'),
                ].filter(Boolean),
                // This is a feature of `babel-loader` for webpack (not Babel itself).
                // It enables caching results in ./node_modules/.cache/babel-loader/
                // directory for faster rebuilds.
                // 启用babel缓存,加快构建速度
                cacheDirectory: true,
                // See #6846 for context on why cacheCompression is disabled
                // 使用Gzip压缩每个babel transform输出
                cacheCompression: false,
                compact: isEnvProduction,
              },
            },
            // Process any JS outside of the app with Babel.
            // Unlike the application JS, we only compile the standard ES features.
            {
              // 使用babel编译第三方库的代码
              test: /\.(js|mjs)$/,
              // 排除@babel/runtime中的文件
              exclude: /@babel(?:\/|\\{1,2})runtime/,
              loader: require.resolve('babel-loader'),
              options: {
                babelrc: false,
                configFile: false,
                compact: false,
                presets: [
                  [
                    // 使用babel-preset-react-app/dependencies预设,仅编译标准的ES特性
                    require.resolve('babel-preset-react-app/dependencies'),
                    { helpers: true },
                  ],
                ],
                cacheDirectory: true,
                // See #6846 for context on why cacheCompression is disabled
                cacheCompression: false,
                
                // Babel sourcemaps are needed for debugging into node_modules
                // code.  Without the options below, debuggers like VSCode
                // show incorrect code and set breakpoints on the wrong lines.
                sourceMaps: shouldUseSourceMap,
                inputSourceMap: shouldUseSourceMap,
              },
            },
            // "postcss" loader applies autoprefixer to our CSS.
            // "css" loader resolves paths in CSS and adds assets as dependencies.
            // "style" loader turns CSS into JS modules that inject <style> tags.
            // In production, we use MiniCSSExtractPlugin to extract that CSS
            // to a file, but in development "style" loader enables hot editing
            // of CSS.
            // By default we support CSS Modules with the extension .module.css
            /** style-loader */
            // style-loader不会对代码内容做任何修改,而是简单注入一系列运行时代码,用于将css-loader转译出的js字符串插入到页面的<style>标签,配合htmlWebpackplugin插件,动态以style标签注入样式,支持hmr
            // 经过style-loader+css-loader处理后,页面样式代码最终会被写入到bundle文件,并在运行时通过<style>标签注入到页面。这种将js、css代码合并进同一个产物文件的方式有几个问题:
            // js、css资源无法并行加载,从而降低页面性能（将css样式转译为js代码并采用js的方式引入,无法并行加载。并且script标签带defer属性,需要等html结构解析完成后才会执行js脚本,那么网速慢的用户,有可能看到css样式未生效的页面内容）
            // 资源缓存粒度变大,js、css任意一种变更都会致使缓存失效
            /** mini-css-extract-plugin */
            // 生产环境通常会用mini-css-extract-plugin插件替代style-loader,将样式代码抽离成单独的css文件
            // 至此,webpack会同时生成html、css、js三种产物文件
            // 这种提取方式在开发环境不支持hmr,因为浏览器无法在不刷新页面的情况下加载css文件
            // 注意:
            // 1、同时提供loader、plugin插件,需要同时使用
            // 2、不可和style-loader混用,否则会报错
            // 3、需要与html-webpack-plugin同时使用,才能将产物路径以link标签方式插入到html中（将css样式文件抽离成单独的产物文件,采用link标签的方式就可以进行并行加载,不会阻塞页面解析和渲染）
            /** css-loader */
            // css-loader提供了很多处理css代码的基础能力,包括css到js转译、依赖解析、sourcemap、css-in-module等,基于这些能力,webpack才能像处理js模块一样处理css模块代码
            /** postcss-loader */
            // 将css源码解析未AST结构,并传入postCss插件做处理
            {
              // 处理普通的css文件
              test: cssRegex,
              exclude: cssModuleRegex,
              use: getStyleLoaders({
                importLoaders: 1,
                sourceMap: isEnvProduction
                  ? shouldUseSourceMap
                  : isEnvDevelopment,
                modules: {
                  mode: 'icss',
                },
              }),
              // Don't consider CSS imports dead code even if the
              // containing package claims to have no side effects.
              // Remove this when webpack adds a warning or an error for this.
              // See https://github.com/webpack/webpack/issues/6571
              sideEffects: true,
            },
            // Adds support for CSS Modules (https://github.com/css-modules/css-modules)
            // using the extension .module.css
            {
              // 处理css modules文件
              test: cssModuleRegex,
              use: getStyleLoaders({
                importLoaders: 1,
                sourceMap: isEnvProduction
                  ? shouldUseSourceMap
                  : isEnvDevelopment,
                modules: {
                  // 启用css modules的局部作用域
                  mode: 'local', 
                  // 使用cra的类名生成规则
                  getLocalIdent: getCSSModuleLocalIdent,
                },
              }),
            },
            // Opt-in support for SASS (using .scss or .sass extensions).
            // By default we support SASS Modules with the
            // extensions .module.scss or .module.sass
            {
              test: sassRegex,
              exclude: sassModuleRegex,
              use: getStyleLoaders(
                {
                  importLoaders: 3,
                  sourceMap: isEnvProduction
                    ? shouldUseSourceMap
                    : isEnvDevelopment,
                  modules: {
                    mode: 'icss',
                  },
                },
                'sass-loader'
              ),
              // Don't consider CSS imports dead code even if the
              // containing package claims to have no side effects.
              // Remove this when webpack adds a warning or an error for this.
              // See https://github.com/webpack/webpack/issues/6571
              sideEffects: true,
            },
            // Adds support for CSS Modules, but using SASS
            // using the extension .module.scss or .module.sass
            {
              test: sassModuleRegex,
              use: getStyleLoaders(
                {
                  importLoaders: 3,
                  sourceMap: isEnvProduction
                    ? shouldUseSourceMap
                    : isEnvDevelopment,
                  modules: {
                    mode: 'local',
                    getLocalIdent: getCSSModuleLocalIdent,
                  },
                },
                'sass-loader'
              ),
            },
            {
              test: lessRegex,
              exclude: lessModuleRegex,
              use: getStyleLoaders(
                {
                  importLoaders: 3,
                  sourceMap: isEnvProduction
                    ? shouldUseSourceMap
                    : isEnvDevelopment,
                },
                'less-loader'
              ),
              sideEffects: true,
            },
            {
              test: lessModuleRegex,
              use: getStyleLoaders(
                {
                  importLoaders: 3,
                  sourceMap:  isEnvProduction
                  ? shouldUseSourceMap
                  : isEnvDevelopment,
                  modules: {
                    // 启用css modules的局部作用域
                    mode: 'local',
                    // 使用cra的类名生成规则
                    getLocalIdent: getCSSModuleLocalIdent,
                  }
                },
                'less-loader'
              ),
            },
            // "file" loader makes sure those assets get served by WebpackDevServer.
            // When you `import` an asset, you get its (virtual) filename.
            // In production, they would get copied to the `build` folder.
            // This loader doesn't use a "test" so it will catch all modules
            // that fall through the other loaders.
            {
              // 处理其他类型的文件,如图片、字体等
              // Exclude `js` files to keep "css" loader working as it injects
              // its runtime that would otherwise be processed through "file" loader.
              // Also exclude `html` and `json` extensions so they get processed
              // by webpacks internal loaders.
              exclude: [/^$/, /\.(js|mjs|jsx|ts|tsx)$/, /\.html$/, /\.json$/],
              // 将文件作为静态资源处理,并输出到指定目录
              type: 'asset/resource',
            },
            // ** STOP ** Are you adding a new loader?
            // Make sure to add the new loader(s) before the "file" loader.
          ],
        },
      ].filter(Boolean),
    },
    // 用于声明外部资源,webpack会直接忽略这部分资源,跳过这些资源的解析、打包操作
    // externals: {}

    // 后处理
    // 用于控制如何优化产物包体积,内置Dead Code Elimination、Scope Hoisting、代码混淆、代码压缩等功能
    // Dead Code Elimination: 它会在运行过程中静态分析模块之间的导入导出,判断哪些模块导出值没有被其他模块使用,相当于模块层面的dead code,并将其删除。tree-shaking就是一种基于es module规范的Dead Code Elimination技术。
      // tree-shaking强依赖于es module原因,为何不能作用于AMD、CMD?
      // AMD、CMD等导入方式是动态的,可能出现在代码的任何地方,包括外部依赖的js模块,这种很难进行确切的依赖分析,所以无法保证某块代码是否真正的被引用,因此无法tree-shaking。但EMS更多是编译时的规范,能够明确知道模块间的依赖关系,因此没有上述问题。
    // Scope Hoisting: webpack打包后会将每一个模块都包裹进一段相似的函数模版代码中,Scope Hoisting会将符合条件的多个模块合并到同一个函数空间中,从而减少产物体积,优化性能。Scope Hoisting基于es module方案的静态特性,推断模块之间的依赖关系,并进一步判断模块与模块能否合并。在非esm模块或模块被多个chunk引用的情况下Scope Hoisting失效。
    // 代码混淆: 代码混淆侧重降低代码可读性,从而达到保护代码、降低代码被有心人利用的目的。代码压缩是代码混淆的一种实现手段,因为代码压缩必然会导致代码可读性降低,但代码混淆有时会导致代码体积膨胀。
    // 代码压缩原理: 将字符串形态的代码转换为结构化、容易分析处理的AST(抽象语法树)形态,之后在AST上做各种语法、语义、逻辑推理与简化替换(删除不必要的字符、变量名压缩、逻辑语句合并),最后按精简过的AST生成结果代码。这样减小了代码体积,在web场景中能够有效减少浏览器从服务器获取代码资源所消耗的传输量,降低网络通信耗时,提升页面启动速度。
    optimization: {
      // 告知webpack以TerserPlugin或其他optimization.minimizer定义的插件压缩bundle,覆盖默认压缩工具
      // TerserPlugin原生实现了多进程并行压缩能力
      minimize: isEnvProduction,
      minimizer: [
        // This is only used in production mode
        // 生产环境压缩js代码
        new TerserPlugin({
          terserOptions: {
            parse: {
              // We want terser to parse ecma 8 code. However, we don't want it
              // to apply any minification steps that turns valid ecma 5 code
              // into invalid ecma 5 code. This is why the 'compress' and 'output'
              // sections only apply transformations that are ecma 5 safe
              // https://github.com/facebook/create-react-app/pull/4234
              ecma: 8,
            },
            compress: {
              ecma: 5,
              warnings: false,
              // Disabled because of an issue with Uglify breaking seemingly valid code:
              // https://github.com/facebook/create-react-app/issues/2376
              // Pending further investigation:
              // https://github.com/mishoo/UglifyJS2/issues/2011
              comparisons: false,
              // Disabled because of an issue with Terser breaking valid code:
              // https://github.com/facebook/create-react-app/issues/5250
              // Pending further investigation:
              // https://github.com/terser-js/terser/issues/120
              inline: 2,
            },
            mangle: {
              safari10: true,
            },
            // Added for profiling in devtools
            keep_classnames: isEnvProductionProfile,
            keep_fnames: isEnvProductionProfile,
            output: {
              ecma: 5,
              comments: false,
              // Turned on because emoji and regex is not minified properly using default
              // https://github.com/facebook/create-react-app/issues/2488
              ascii_only: true,
            },
          },
        }),
        // This is only used in production mode
        // 生产环境压缩css代码
        // 需要使用mini-css-extract-plugin将css代码抽取为单独的文件才能命中css-minimizer-webpack-plugin默认的test规则
        // 默认使用cssnano压缩代码,不需要额外安装依赖
        new CssMinimizerPlugin(),
      ],
    },
    // 用于配置编译产物的目标运行环境,支持web、node、electron等值,不同值最终产物会有所差异
    target: ['browserslist'],
    // 编译模式短语
    mode: isEnvProduction ? 'production' : isEnvDevelopment && 'development',

    /** 工具类配置项 */
    // 开发效率类
    // 用于配置持续监听文件变化,持续构建
    // watch: {},
    // 用于配置产物sourceMap生成规则
    devtool: isEnvProduction
      ? shouldUseSourceMap
        ? 'source-map'
        : false
      : isEnvDevelopment && 'cheap-module-source-map',
    // 用于配置与HMR强相关的开发服务器功能
    // devServer: {},

    // 性能优化类
    // 控制如何缓存编译过程信息与编译结果
    // webpack的缓存机制可以显著提升构建性能,尤其在大型项目中。它的核心作用包括:
    // 减少重复编译: 通过缓存已编译的模块,避免重复处理未变化的文件
    // 加快构建速度: 在后续构建中直接使用缓存结果,减少构建时间
    // 支持增量构建: 只重新编译变化的文件,而不是整个项目
    cache: {
      // 启用文件系统缓存,将缓存数据存储到磁盘中
      // webpack5引入了持久化缓存功能,支持将缓存数据存储到文件系统中
      // 与内存缓存(memory)相比,文件系统缓存在重启构建后仍然有效
      type: 'filesystem',
      // 为缓存生成一个唯一的版本标识符
      // createEnvironmentHash是一个工具函数,用于根据环境变量生成哈希值
      // 当环境变量发生变化时,缓存版本会更新,确保缓存数据的有效性
      version: createEnvironmentHash(env.raw),
      // 指定缓存文件的存储目录
      cacheDirectory: paths.appWebpackCache,
      // 指定缓存存储方式
      // pack是webpack5中的一种缓存存储方式,它会将缓存数据打包成一个文件
      // 这种方式可以减少文件数量,提升缓存读写效率
      store: 'pack',
      // 指定构建依赖,当这些依赖发生变化时,缓存会失效
      buildDependencies: {
        // 将webpack的核心库作为构建依赖,如果webpack版本发生变化,缓存会失效
        defaultWebpack: ['webpack/lib/'],
        // 将当前配置文件作为构建依赖,当前构建文件发生变化,缓存会失效
        config: [__filename],
        // 将ts配置文件和js配置文件作为构建依赖,如果这些文件发生变化,缓存会失效
        tsconfig: [paths.appTsConfig, paths.appJsConfig].filter(f =>
          fs.existsSync(f)
        ),
      },
    },
    // 用于配置当产物大小超过阈值时,如何通知开发者
    // Turn off performance processing because we utilize
    // our own hints via the FileSizeReporter
    performance: false,

    // 日志类
    // 精确地控制编译过程的日志内容,在做比较细致的性能调试时非常有用
    // Webpack noise constrained to errors and warnings
    stats: 'errors-warnings',
    // 控制日志输出方式,例如可以配置将日志输出到磁盘文件
    infrastructureLogging: {
      level: 'none',
    },
    
    // Stop compilation early in production
    bail: isEnvProduction,
    plugins: [
      // Generates an `index.html` file with the <script> injected.
      // 生成index.html文件,并自动注入打包后的js和css文件
      new HtmlWebpackPlugin(
        Object.assign(
          {},
          {
            // 自动将生成的资源文件注入到html中
            inject: true,
            // 使用指定的html模版 public/index.html
            template: paths.appHtml,
          },
          // 在生产环境启用html压缩,移除注释、空白字符等
          isEnvProduction
            ? {
                minify: {
                  // 移除备注
                  removeComments: true,
                  // 移除节点间的空字符串
                  collapseWhitespace: true,
                  removeRedundantAttributes: true,
                  // 使用精简doctype定义
                  useShortDoctype: true,
                  removeEmptyAttributes: true,
                  removeStyleLinkTypeAttributes: true,
                  keepClosingSlash: true,
                  minifyJS: true,
                  minifyCSS: true,
                  minifyURLs: true,
                },
              }
            : undefined
        )
      ),
      // Inlines the webpack runtime script. This script is too small to warrant
      // a network request.
      // https://github.com/facebook/create-react-app/issues/5358
      // 生产环境将webpack的runtime代码内联到html中,减少网络请求
      // 指定需要操作的html插件 HtmlWebpackPlugin
      // 匹配需要内联的runtime文件 [/runtime-.+[.]js/]
      isEnvProduction &&
        shouldInlineRuntimeChunk &&
        new InlineChunkHtmlPlugin(HtmlWebpackPlugin, [/runtime-.+[.]js/]),
      // Makes some environment variables available in index.html.
      // The public URL is available as %PUBLIC_URL% in index.html, e.g.:
      // <link rel="icon" href="%PUBLIC_URL%/favicon.ico">
      // It will be an empty string unless you specify "homepage"
      // in `package.json`, in which case it will be the pathname of that URL.
      // 在html中插入环境变量 例如,%PUBLIC_URL%会被替换publicUrlOrPath。
      // 指定需要操作的html插件 HtmlWebpackPlugin
      // 环境变量对象
      new InterpolateHtmlPlugin(HtmlWebpackPlugin, env.raw),
      // This gives some necessary context to module not found errors, such as
      // the requesting resource.
      // 在模块未找到时提供更友好的错误提示,帮助开发者快速定位问题
      new ModuleNotFoundPlugin(paths.appPath),
      // Makes some environment variables available to the JS code, for example:
      // if (process.env.NODE_ENV === 'production') { ... }. See `./env.js`.
      // It is absolutely essential that NODE_ENV is set to production
      // during a production build.
      // Otherwise React will be compiled in the very slow development mode.
      // 在编译时将环境变量注入到代码中
      new webpack.DefinePlugin(env.stringified),
      // new WebpackBundleAnalyzer.BundleAnalyzerPlugin({
      //   analyzerMode: 'server',
      //   analyzerHost: 'localhost',
      //   analyzerPort: 3000,
      //   reportFilename: 'index.html',
      //   defaultSizes: 'parsed',
      //   openAnalyzer: true,
      //   generateStatsFile: false,
      //   statsFilename: 'stats.json',
      //   statsOptions: null,
      //   logLevel: 'info'
      // }),
      // Experimental hot reloading for React .
      // https://github.com/facebook/react/tree/main/packages/react-refresh
      // 在开发环境下启用react组件的热更新
      isEnvDevelopment &&
        shouldUseReactRefresh &&
        new ReactRefreshWebpackPlugin({
          // 禁用错误覆盖层
          overlay: false,
        }),
      // Watcher doesn't work well if you mistype casing in a path so we use
      // a plugin that prints an error when you attempt to do this.
      // See https://github.com/facebook/create-react-app/issues/240
      // 在开发环境中检查文件路径的大小写敏感性,避免因路径大小写不一致导致的错误
      isEnvDevelopment && new CaseSensitivePathsPlugin(),
      // 在生产环境中,将css提取为单独的文件,而不是内联到js中
      isEnvProduction &&
        new MiniCssExtractPlugin({
          // Options similar to the same options in webpackOptions.output
          // both options are optional
          // 主css文件的输出路径和名称
          filename: 'static/css/[name].[contenthash:8].css',
          // 异步加载的css文件的输出路径和名称
          chunkFilename: 'static/css/[name].[contenthash:8].chunk.css',
        }),
      // Generate an asset manifest file with the following content:
      // - "files" key: Mapping of all asset filenames to their corresponding
      //   output file so that tools can pick it up without having to parse
      //   `index.html`
      // - "entrypoints" key: Array of files which are included in `index.html`,
      //   can be used to reconstruct the HTML if necessary
      // 生成资源清单文件,记录所有打包后的资源文件及其路径
      new WebpackManifestPlugin({
        // 清单文件的名称
        fileName: 'asset-manifest.json',
        // 资源的公共路径
        publicPath: paths.publicUrlOrPath,
        // 自定义清单文件的生成逻辑
        generate: (seed, files, entrypoints) => {
          const manifestFiles = files.reduce((manifest, file) => {
            manifest[file.name] = file.path;
            return manifest;
          }, seed);
          const entrypointFiles = entrypoints.main.filter(
            fileName => !fileName.endsWith('.map')
          );

          return {
            files: manifestFiles,
            entrypoints: entrypointFiles,
          };
        },
      }),
      // Moment.js is an extremely popular library that bundles large locale files
      // by default due to how webpack interprets its code. This is a practical
      // solution that requires the user to opt into importing specific locales.
      // https://github.com/jmblog/how-to-optimize-momentjs-with-webpack
      // You can remove this if you don't use Moment.js:
      // 忽略moment.js中的本地化文件,减小打包体积
      new webpack.IgnorePlugin({
        // 匹配要忽略的资源
        resourceRegExp: /^\.\/locale$/,
        // 匹配资源的上下文
        contextRegExp: /moment$/,
      }),
      // Generate a service worker script that will precache, and keep up to date,
      // the HTML & assets that are part of the webpack build.
      // 生成Service Worker文件,支持PWA（渐进式web应用）
      // 仅在生产环境且swSrc文件存在时启用
      isEnvProduction &&
        fs.existsSync(swSrc) &&
        new WorkboxWebpackPlugin.InjectManifest({
          // service worker的源文件路径
          swSrc,
          // 匹配不需要缓存的文件
          dontCacheBustURLsMatching: /\.[0-9a-f]{8}\./,
          // 排除不需要缓存的文件
          exclude: [/\.map$/, /asset-manifest\.json$/, /LICENSE/],
          // Bump up the default maximum size (2mb) that's precached,
          // to make lazy-loading failure scenarios less likely.
          // See https://github.com/cra-template/pwa/issues/13#issuecomment-722667270
          // 设置缓存文件的最大大小
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        }),
      // TypeScript type checking
      // 在单独的进程中检查ts类型错误,提升构建速度
      useTypeScript &&
        new ForkTsCheckerWebpackPlugin({
          // 在开发环境中异步检查类型错误
          async: isEnvDevelopment,
          typescript: {
            // ts包路径
            typescriptPath: resolve.sync('typescript', {
              basedir: paths.appNodeModules,
            }),
            configOverwrite: {
              compilerOptions: {
                sourceMap: isEnvProduction
                  ? shouldUseSourceMap
                  : isEnvDevelopment,
                skipLibCheck: true,
                inlineSourceMap: false,
                declarationMap: false,
                noEmit: true,
                incremental: true,
                tsBuildInfoFile: paths.appTsBuildInfoFile,
              },
            },
            context: paths.appPath,
            diagnosticOptions: {
              syntactic: true,
            },
            mode: 'write-references',
            // profile: true,
          },
          // 需要检查的文件范围
          issue: {
            // This one is specifically to match during CI tests,
            // as micromatch doesn't match
            // '../cra-template-typescript/template/src/App.tsx'
            // otherwise.
            include: [
              { file: '../**/src/**/*.{ts,tsx}' },
              { file: '**/src/**/*.{ts,tsx}' },
            ],
            exclude: [
              { file: '**/src/**/__tests__/**' },
              { file: '**/src/**/?(*.){spec|test}.*' },
              { file: '**/src/setupProxy.*' },
              { file: '**/src/setupTests.*' },
            ],
          },
          // 控制日志输出
          logger: {
            infrastructure: 'silent',
          },
        }),
      // 在webpack构建过程中运行eslint,检查代码规范
      !disableESLintPlugin &&
        new ESLintPlugin({
          // Plugin options
          // 需要检查的文件扩展名
          extensions: ['js', 'mjs', 'jsx', 'ts', 'tsx'],
          // 指定eslint的输出格式
          formatter: require.resolve('react-dev-utils/eslintFormatter'),
          eslintPath: require.resolve('eslint'),
          // 在发现错误时是否终止构建
          failOnError: !(isEnvDevelopment && emitErrorsAsWarnings),
          // 指定eslint的工作目录
          context: paths.appSrc,
          // 启用eslint缓存,提升检查速度
          cache: true,
          cacheLocation: path.resolve(
            paths.appNodeModules,
            '.cache/.eslintcache'
          ),
          // ESLint class options
          cwd: paths.appPath,
          resolvePluginsRelativeTo: __dirname,
          // 指定eslint的基础配置
          baseConfig: {
            extends: [require.resolve('eslint-config-react-app/base')],
            rules: {
              ...(!hasJsxRuntime && {
                'react/react-in-jsx-scope': 'error',
              }),
            },
          },
        }),
    ].filter(Boolean),
  };
};
