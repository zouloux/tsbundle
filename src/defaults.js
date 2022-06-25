

// Default terser options to minify and bundle outputs
// @see https://github.com/terser/terser
module.exports.defaultTerserOptions = [
	// Compress and shorten names
	'--compress',
	'--mangle',
	// Set env as production for dead code elimination
	'-d process.env.NODE_ENV=\"PRODUCTION\"',
	// Keep class names and function names
	'--keep_classnames',
	'--keep_fnames',
	// Allow top level mangling
	'--toplevel',
	// Threat as module (remove "use strict")
	'--module',
];

// Default formats, if none specified or if "defaults" is used.
module.exports.defaultFormats = [
	// Will default export a UMD bundled file (single output file) for browsers
	// with ES2017 compatibility level (not going down to ES5 by default)
	"es2017.min.js",
	// Node v12 compatible, non bundled as CommonJS
	"es2019.cjs",
	// Modern output, non bundled, as modern modules
	"es2022.mjs",
]
