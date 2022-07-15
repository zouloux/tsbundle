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
 * TODO : Add fallback to node native require if module is not found
 * TODO : Test fallback to previous require if module is not found
 * TODO : Define should not override modules if already defined, find something neat
 */
const superLightModuleSystem = `
	var modulesRegistry = {}
	var previousRequire = scope.require
	var define = ( modulePath, factory ) => modulesRegistry[ modulePath ] = factory
	var require = modulePath => {
		var module = modulesRegistry[modulePath]
		if ( (typeof module)[0] == 'f' ) {
			var exports = {}
			module( exports )
			module = modulesRegistry[ modulePath ] = exports
		}
		return module ? module : (previousRequire ? previousRequire( modulePath ) : {})
	}
	if ( !scope.define ) {
		scope.define = define
		scope.require = require
	}
`
const superLightModuleSystem2 = `
	if ( !scope.__modulesRegistry )
		scope.__modulesRegistry = {}
	var define = ( modulePath, factory ) => scope.__modulesRegistry[ modulePath ] = factory
	var require = modulePath => {
		var module = scope.__modulesRegistry[ modulePath ]
		if ( (typeof module)[0] == 'f' ) {
			var exports = {}
			module( exports )
			module = scope.__modulesRegistry[ modulePath ] = exports
		}
		return module
	}
	if ( !scope.define ) {
		scope.define = define
		scope.require = require
	}
`

exports.bundleFiles = async function ( allInputPaths, mainInputPath, outputPath, libraryName, exportMap, includedLibraries ) {
	// TODO : Add option into package config
	const cjsCompatible = false;
	// Prepare bundle lines
	let bundleStreamLines = [
		// Create IIFE wrapper
		"!function ( scope, hostModule ) {",
		// Include default export target helper
		`var def = a => a ? (a.default ? a.default : a) : null`
	]
	// Inject super light implementation of AMD-like if we have several files to bundle only
	// const isMultiFiles = allInputPaths.length > 1
	const useDefineInstructions = true
	if ( useDefineInstructions )
		bundleStreamLines.push( superLightModuleSystem )
	// Browse all files
	for ( const filePath of allInputPaths ) {
		// Load file content
		const file = new File( filePath )
		await file.load();
		// Wrap this module into a "define" call if we have several files
		if ( useDefineInstructions )
			file.content( c => {
				let defineKey
				// Included library, use include key aka npm package name (like @zouloux/signal)
				if (
					includedLibraries
					&& Object.values( includedLibraries ).indexOf( filePath ) !== -1
				) {
					defineKey = Object.keys( includedLibraries ).find(
						key => filePath === includedLibraries[ key ]
					)
				}
				// Target relative path for this bundle
				else {
					defineKey = './' + path.relative(
						path.dirname( mainInputPath ), filePath
					)
				}
				return [
					// Module define header
					`define("${defineKey}", function (exports) {`,
					// Module content
					c,
					// Module close
					`});`,
				].join("\n")
			})
		bundleStreamLines.push( file.content() )
	}
	// Call entry point if we have multiple file
	const entryPoint = path.basename(mainInputPath)
	bundleStreamLines.push(`var lib = require("./${entryPoint}")`)
	// Expose public exported members
	// If we have multiple export members, do a for loop at runtime
	if ( typeof exportMap === "object" && Object.keys(exportMap).length > 1 && useDefineInstructions ) {
		bundleStreamLines.push(`var exportMap = ${JSON.stringify(exportMap)}`) // TODO : Filter export map with existing file in allInputPaths
		bundleStreamLines.push(`for (var i in exportMap) {`)
		bundleStreamLines.push(`	var module = require(exportMap[i])`)
		bundleStreamLines.push(`	Object.assign( lib, module )`)
		bundleStreamLines.push(`	scope[i] = def( module )`)
		bundleStreamLines.push(`}`)
	}
	// If we have only one file
	else {
		// Get library name from export map or from package data
		const localLibraryName = (
			typeof exportMap === "object"
			? Object.keys(exportMap)[0]
			: libraryName
		)
		bundleStreamLines.push(`scope["${localLibraryName}"] = def(lib)`)
		// For node CommonJS, use module.exports as lib
		// if ( cjsCompatible )
		// 	bundleStreamLines.push(`if (hostModule && hostModule.exports) hostModule.exports = exports`)
	}
	// For browser, define main package as lib
	bundleStreamLines.push(`define("${libraryName}", lib)`)
	// For node CommonJS, use module.exports as lib
	if ( cjsCompatible )
		bundleStreamLines.push(`if (hostModule && hostModule.exports) hostModule.exports = lib`)
	// Close IIFE, Node CJS + Browser compatible
	cjsCompatible
	? bundleStreamLines.push(`}(typeof self < 'u' ? self : {}, typeof module < 'u' ? module : null)`)
	// Only for browser (self is always defined and is equal to window)
	: bundleStreamLines.push(`}(self)`)
	// Filter out useless stuff generated by TS
	bundleStreamLines = bundleStreamLines.join("\n").split("\n").flat()
		.filter( line => !line.startsWith(`Object.defineProperty(exports, "__esModule", { value: true })`) )
		.filter( line => !line.match(/exports\.(.*)\s?=\s?void\s0;/) )
	// Inject Object.defineProperty helper and compress all Object.defineProperty into a var call
	const totalODP = bundleStreamLines.filter( line => line.match(/Object\.defineProperty/)).length
	if ( totalODP >= 3) {
		bundleStreamLines = bundleStreamLines.map( line =>
			line.replaceAll('Object.defineProperty(', '_objectDefineProperty(')
		)
		bundleStreamLines.splice(1, 0, `var _objectDefineProperty = Object.defineProperty`)
	}
	// Concat lines
	let buffer = bundleStreamLines.join("\n")
	// Replace all local modules names to indexes
	if ( useDefineInstructions ) {
		//console.log(bundleStreamLines)
		const localDefineRegex = /define.*\(.*["'](\.\/.*)["']/gmi
		const localRequireRegex = /require.*\(.*["'](\.\/.*)["']/gmi
		const localModuleMap = []
		buffer = buffer.replaceAll( localDefineRegex, (...rest) => {
			const index = localModuleMap.push( rest[1] ) - 1
			return 'define('+index
		})
		buffer = buffer.replaceAll( localRequireRegex, (...rest) => {
			const index = localModuleMap.indexOf(rest[1])
			return index !== -1 ? ('require('+index) : rest[0]
		})
	}
	// Concat everything into the file output
	const outputFile = new File( outputPath )
	outputFile.content( buffer )
	await outputFile.save();
}


