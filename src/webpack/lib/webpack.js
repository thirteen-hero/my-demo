/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/

"use strict";

const util = require("util");
const webpackOptionsSchemaCheck = require("../schemas/WebpackOptions.check.js");
const webpackOptionsSchema = require("../schemas/WebpackOptions.json");
const Compiler = require("./Compiler");
const MultiCompiler = require("./MultiCompiler");
const WebpackOptionsApply = require("./WebpackOptionsApply");
const {
	applyWebpackOptionsDefaults,
	applyWebpackOptionsBaseDefaults
} = require("./config/defaults");
const { getNormalizedWebpackOptions } = require("./config/normalization");
const NodeEnvironmentPlugin = require("./node/NodeEnvironmentPlugin");
const memoize = require("./util/memoize");

/** @typedef {import("../declarations/WebpackOptions").WebpackOptions} WebpackOptions */
/** @typedef {import("../declarations/WebpackOptions").WebpackPluginFunction} WebpackPluginFunction */
/** @typedef {import("./Compiler").WatchOptions} WatchOptions */
/** @typedef {import("./MultiCompiler").MultiCompilerOptions} MultiCompilerOptions */
/** @typedef {import("./MultiStats")} MultiStats */
/** @typedef {import("./Stats")} Stats */

const getValidateSchema = memoize(() => require("./validateSchema"));

/**
 * @template T
 * @callback Callback
 * @param {Error | null} err
 * @param {T=} stats
 * @returns {void}
 */

/**
 * @param {ReadonlyArray<WebpackOptions>} childOptions options array
 * @param {MultiCompilerOptions} options options
 * @returns {MultiCompiler} a multi-compiler
 */
const createMultiCompiler = (childOptions, options) => {
	const compilers = childOptions.map((options, index) =>
		createCompiler(options, index)
	);
	const compiler = new MultiCompiler(compilers, options);
	for (const childCompiler of compilers) {
		if (childCompiler.options.dependencies) {
			compiler.setDependencies(
				childCompiler,
				childCompiler.options.dependencies
			);
		}
	}
	return compiler;
};

/**
 * @param {WebpackOptions} rawOptions options object
 * @param {number=} compilerIndex index of compiler
 * @returns {Compiler} a compiler
 */
const createCompiler = (rawOptions, compilerIndex) => {
  // 标准化webpack配置,确保配置格式正确
	const options = getNormalizedWebpackOptions(rawOptions);
  // 应用基本的webpack配置默认值
	applyWebpackOptionsBaseDefaults(options);
  // 创建compiler实例
	const compiler = new Compiler(
		/** @type {string} */ (options.context),
		options
	);
  // 应用node环境相关插件,设置基础设施日志
	new NodeEnvironmentPlugin({
		infrastructureLogging: options.infrastructureLogging
	}).apply(compiler);
  // 注册自定义插件(并不会立马执行,而是订阅相关hooks的触发)
	if (Array.isArray(options.plugins)) {
		for (const plugin of options.plugins) {
			if (typeof plugin === "function") {
        // 若插件是一个函数,则调用并传入compiler
				/** @type {WebpackPluginFunction} */
				(plugin).call(compiler, compiler);
			} else if (plugin) {
        // 若插件是一个有apply方法的对象,则调用apply方法并传入compiler
				plugin.apply(compiler);
			}
		}
	}
  // 补全剩余的webpack配置默认值
	const resolvedDefaultOptions = applyWebpackOptionsDefaults(
		options,
		compilerIndex
	);
	if (resolvedDefaultOptions.platform) {
		compiler.platform = resolvedDefaultOptions.platform;
	}
  // 触发环境设置相关钩子
	compiler.hooks.environment.call();
  // 触发环境设置完成后的钩子
	compiler.hooks.afterEnvironment.call();
  // 负责最终的配置合成与应用,注册所有内置插件
	new WebpackOptionsApply().process(options, compiler);
  // 触发编译初始化完成的钩子
	compiler.hooks.initialize.call();
	return compiler;
};

/**
 * @callback WebpackFunctionSingle
 * @param {WebpackOptions} options options object
 * @param {Callback<Stats>=} callback callback
 * @returns {Compiler} the compiler object
 */

/**
 * @callback WebpackFunctionMulti
 * @param {ReadonlyArray<WebpackOptions> & MultiCompilerOptions} options options objects
 * @param {Callback<MultiStats>=} callback callback
 * @returns {MultiCompiler} the multi compiler object
 */

/**
 * @template T
 * @param {Array<T> | T} options options
 * @returns {Array<T>} array of options
 */
const asArray = options =>
	Array.isArray(options) ? Array.from(options) : [options];

const webpack = /** @type {WebpackFunctionSingle & WebpackFunctionMulti} */ (
	/**
	 * @param {WebpackOptions | (ReadonlyArray<WebpackOptions> & MultiCompilerOptions)} options options
	 * @param {Callback<Stats> & Callback<MultiStats>=} callback callback
	 * @returns {Compiler | MultiCompiler | null} Compiler or MultiCompiler
	 */
  // 接收webpack的配置和可选的回调函数
	(options, callback) => {
		const create = () => {
			if (!asArray(options).every(webpackOptionsSchemaCheck)) {
				getValidateSchema()(webpackOptionsSchema, options);
				util.deprecate(
					() => {},
					"webpack bug: Pre-compiled schema reports error while real schema is happy. This has performance drawbacks.",
					"DEP_WEBPACK_PRE_COMPILED_SCHEMA_INVALID"
				)();
			}
			/** @type {MultiCompiler|Compiler} */
      // 定义编译器的实例
			let compiler;
			/** @type {boolean | undefined} */
      // 是否开启观察模式的标志
			let watch = false;
			/** @type {WatchOptions|WatchOptions[]} */
      // 观察模式的配置
			let watchOptions;
      // 配置是数组 处理为多重编译配置
			if (Array.isArray(options)) {
				/** @type {MultiCompiler} */
				compiler = createMultiCompiler(
					options,
					/** @type {MultiCompilerOptions} */ (options)
				);
				watch = options.some(options => options.watch);
				watchOptions = options.map(options => options.watchOptions || {});
			} else {
        /** 
         * compiler和compilation
         * compiler webpack的核心,贯穿于整个构建周期。compiler封装了webpack环境的全局配置,包括但不限于配置信息、输出路径等。
         * compilation 表示单次的构建过程及其产出。与compiler不同,compilation对象在每次构建中都是新创建的,描述了构建的具体过程,包括模块资源、编译后的产出资源、文件的变化,以及依赖关系的状态。在watch mode下,每当文件变化触发重新构建时,都会生成一个新的compilation实例。
         * compiler是一个长期存在的环境描述,贯穿整个webpack运行周期。而compilation是对单次构建的具体描述,每一次构建过程都可能有所不同。
         */
				const webpackOptions = /** @type {WebpackOptions} */ (options);
				/** @type {Compiler} */
				compiler = createCompiler(webpackOptions);
				watch = webpackOptions.watch;
				watchOptions = webpackOptions.watchOptions || {};
			}
			return { compiler, watch, watchOptions };
		};
		if (callback) {
			try {
        // 核心逻辑
				const { compiler, watch, watchOptions } = create();
				if (watch) {
			    // 开启观察模式 调用compiler.watch
					compiler.watch(watchOptions, callback);
				} else {
          // 没有开启观察模式 调用compiler.run
					compiler.run((err, stats) => {
						compiler.close(err2 => {
							callback(
								err || err2,
								/** @type {options extends WebpackOptions ? Stats : MultiStats} */
								(stats)
							);
						});
					});
				}
        // 返回创建的编译器实例
				return compiler;
			} catch (err) {
				process.nextTick(() => callback(/** @type {Error} */ (err)));
				return null;
			}
		} else {
      // 核心逻辑
			const { compiler, watch } = create();
      if (watch) {
				util.deprecate(
					() => {},
					"A 'callback' argument needs to be provided to the 'webpack(options, callback)' function when the 'watch' option is set. There is no way to handle the 'watch' option without a callback.",
					"DEP_WEBPACK_WATCH_WITHOUT_CALLBACK"
				)();
			}
      // 返回创建的编译器实例
			return compiler;
		}
	}
);

module.exports = webpack;
