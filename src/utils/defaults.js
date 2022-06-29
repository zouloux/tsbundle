
/**
 * Default terser options to minify and bundle outputs
 * @see https://github.com/terser/terser
 */
exports.defaultTerserOptions = [
	// Compress and shorten names
	'--compress',
	// '--no-compress',
	'--mangle',
	// '--no-mangle',
	// '--beautify',
	// Set env as production for dead code elimination
	'-d process.env.NODE_ENV=\"PRODUCTION\"',
	// Keep class names and function names
	'--keep_classnames',
	'--keep_fnames',
	// Allow top level mangling
	// '--toplevel',
	// '--no-toplevel',
	// Threat as module (remove "use strict")
	// '--module'
];

/**
 * Default ts bundle config
 * TODO : terser config override
 */
exports.tsBundleDefaultConfig = {
	// Default relative output path from package.json
	output: "./dist/",
	// Default formats, if none specified or if "defaults" is used.
	formats : [
		// Will default export a UMD bundled file (single output file) for browsers
		// with ES2017 compatibility level (not going down to ES5 by default)
		"es2017.min.js",
		// Node v12 compatible, non bundled as CommonJS
		"es2019.cjs",
		// Modern output, non bundled, as modern modules
		"es2022.mjs",
	],
	// Generate .d.ts type definitions for this entry point
	generateTypeDefinitions: true,
	// Generate size reports (min+gzip) also for non minified outputs
	reportSize: true,
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
