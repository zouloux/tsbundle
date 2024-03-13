
/**
 * Default terser options to minify and bundle outputs
 * @see https://github.com/terser/terser
 * TODO : Function with ecma as parameter ? terser input.js --compress ecma=2015,computed_props=false
 */

// TODO : Add options into package config (and transform defaultTerserOptions to a function)
const keepClassNames = false;
const keepFunctionNames = false;

exports.defaultTerserOptions = [
	// Compress and shorten names
	'--compress', [
		`ecma=2017`,
		'passes=3',
		`keep_classnames=${keepClassNames}`,
		`keep_fnames=${keepFunctionNames}`,
		'dead_code=true',
		'unsafe_arrows=true',
		'unsafe_methods=true',
		'unsafe_undefined=true',
		'keep_fargs=false',
		'conditionals=false'
	].join(","),
	// Mangle variables and functions
	'--mangle', [
		'toplevel=true',
		`keep_classnames=${keepClassNames}`,
		`keep_fnames=${keepFunctionNames}`
	].join(","),
	// Mangle properties starting with an underscore
	`--mangle-props`, [`regex=/^_/`].join(','),
	// Set env as production for dead code elimination
	`-d 'process.env.NODE_ENV="production"'`,
	// Threat as module (remove "use strict")
	'--module',
	'--toplevel',
];

/**
 * Default ts bundle config
 * TODO : terser config override
 */
exports.tsBundleDefaultConfig = {
	// Default relative output path from package.json
	output: "./dist/",
	// Generate .d.ts type definitions for this entry point
	generateTypeDefinitions: true,
	// Default formats, if none specified or if "defaults" is used.
	formats : [
		// Node v12 compatible, non bundled as CommonJS
		"es2019.cjs",
		// Modern output, non bundled, as modern modules
		"es2022.mjs",
		// Will default export a UMD bundled file (single output file) for browsers
		// with ES2017 compatibility level (not going down to ES5 by default)
		"es2017.min.js",
	],
	// When testing lib, only one format is created
	testFormat: "es2020.mjs",
	// Do not export bits by default
	exportBits: false,
	// Filter generated ts files
	filterGlob: null,
}

/**
 * Keep node modules targets like
 * - import fs from "fs"
 * - import("fs")
 * - require("fs"
 * Add custom extension on targets like
 * We detect that "module" is a local dependency thanks to baseNames
 * - import { test } from "./module"
 * - import { test } from "./module.js"
 * - import { test } from "module.js"
 * - import("module.js")
 * - require("module.js")
 */
// https://regexr.com/6oi36
module.exports.replaceImportsRegex = /(from|import\s*\(|require\s*\()\s*["']([.\/]*)([a-zA-Z0-9-_]*)(\..*)?["']/gmi
