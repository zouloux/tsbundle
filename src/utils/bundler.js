const { File } = require( "@solid-js/files" );
const path = require("path")

/**
 * TODO :
 * - Convert all require / define paths to numbers, to patch relativity (../)
 * 		and for smaller outputs.
 * 		Only keep main bundle because can be included from other bundles ?
 * - Find a way to include dependencies when calling
 * 		(like if we have a dep to Signal for ex)
 * TODO :
 * - Better AMD implementation, which works with several bundles and dependencies ?
 * TODO :
 * - Allow node_modules inclusion like @zouloux/ecma-core
 */

/**
 * FIXME : Sometimes terser will remove IIFE wrapper.
 * 			Which can pollute global scope.
 * 			But it seems very edge case so treat only if it happens in a real case.
 */

// -----------------------------------------------------------------------------

/**
 * Super light AMD implementation which is missing a lot of stuff
 * but should work for tsc outputs.
 * ES5 compatible, absolutely no error checking.
 * TODO : Add fallback to native require if module is not found
 */
// const superLightAMDModuleSystem = `
// 	if ( !scope.define ) {
// 		var __amdRegistry = {}
// 		scope.define = function ( modulePath, factory ) { __amdRegistry[ modulePath ] = factory }
// 		scope.require = function ( modulePath ) {
// 			var moduleFactory = __amdRegistry[ modulePath ]
// 			if ( typeof moduleFactory === "function" ) {
// 				var exports = {}
// 				moduleFactory( exports );
// 				__amdRegistry[ modulePath ] = exports
// 			}
// 			return __amdRegistry[ modulePath ];
// 		}
// 	}
// 	var require = scope.require
// `

const superLightModuleSystem = `
	var modulesRegistry = {}
	var previousRequire = scope.require
	function define ( modulePath, factory ) { modulesRegistry[ modulePath ] = factory }
	function require ( modulePath ) {
		var module = modulesRegistry[modulePath]
		if ( typeof module === "function" ) {
			var exports = {}
			module( exports )
			module = modulesRegistry[ modulePath ] = exports
		}
		if ( module )
			return module
		if ( previousRequire )
			return previousRequire( modulePath )
		throw {}
	}
	if ( !scope.define ) {
		scope.define = define
		scope.require = require
	}
`

exports.bundleFiles = async function ( allInputPaths, mainInputPath, outputPath, libraryName, exportMap ) {

	const cjsCompatible = false;

	let bundleStreamLines = [
		// Create IIFE wrapper
		"!function ( scope, hostModule ) {",
		// Include default export target helper
		`function def (a) { return a ? (a.default ? a.default : a) : null }`
	]
	// Inject super light implementation of AMD-like if we have several files to bundle only
	const isMultiFiles = allInputPaths.length > 1
	if ( isMultiFiles )
		bundleStreamLines.push( superLightModuleSystem )
	// Browse all files
	for ( const filePath of allInputPaths ) {
		// Load file content
		const file = new File( filePath )
		await file.load();
		// Wrap this module into a "define" call if we have several files
		if ( isMultiFiles )
			file.content( c => {
				// Target relative path for this bundle
				const relativeFilePath = path.relative(
					path.dirname( mainInputPath ),
					filePath
				)
				return [
					// Module define header
					`define("./${relativeFilePath}", function (exports) {`,
					// Module content
					c,
					// Module close
					`});`,
				].join("\n")
			})
		bundleStreamLines.push( file.content() )
	}
	// Call entry point and end IIFE wrapper
	const entryPoint = path.basename(mainInputPath)
	if ( isMultiFiles ) {
		bundleStreamLines.push(`var exports = require("./${entryPoint}")`)
	}
	// Expose public exported members
	if ( typeof exportMap === "object" && isMultiFiles ) {
		bundleStreamLines.push(`var lib = {}`)
		bundleStreamLines.push(`var exportMap = ${JSON.stringify(exportMap)}`) // TODO : Filter export map with existing file in allInputPaths
		bundleStreamLines.push(`for (var i in exportMap) {`)
		bundleStreamLines.push(`	var module = require(exportMap[i])`)
		bundleStreamLines.push(`	Object.assign( lib, module )`)
		bundleStreamLines.push(`	scope[i] = def( module )`)
		bundleStreamLines.push(`}`)
		// For browser, define main package as lib
		bundleStreamLines.push(`define("${libraryName}", lib)`)
		// For node CommonJS, use module.exports as lib
		if ( cjsCompatible )
			bundleStreamLines.push(`if (hostModule && hostModule.exports) hostModule.exports = lib`)
	}
	else {
		bundleStreamLines.push(`scope["${libraryName}"] = def(exports)`)
	}
	// Close IIFE
	cjsCompatible
	? bundleStreamLines.push(`}(typeof self !== 'undefined' ? self : {}, typeof module !== 'undefined' ? module : null)`)
	: bundleStreamLines.push(`}(typeof self !== 'undefined' ? self : {})`)
	// Concat everything into the file output
	const outputFile = new File( outputPath )
	if ( isMultiFiles ) {
		// TODO : Replace all identifiers by indexes, will patch ../ targets
	}
	// Filter out useless stuff
	bundleStreamLines = bundleStreamLines.join("\n").split("\n").flat()
		.filter( line => !line.startsWith(`Object.defineProperty(exports, "__esModule", { value: true })`) )
		.filter( line => !line.match(/exports\.(.*)\s?=\s?void\s0;/) )
	// Filter out useless liens
	outputFile.content( bundleStreamLines.join("\n") )
	await outputFile.save();
}


