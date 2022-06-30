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
const superLightAMDModuleSystem = `
	if ( typeof _.define === "undefined" ) {
		var _registry = {}
		_.define = function ( modulePath, factory ) { _registry[ modulePath ] = factory }
		_.require = function ( modulePath ) {
			var moduleFactory = _registry[ modulePath ]
			if ( typeof moduleFactory === "function" ) {
				var exports = {}
				moduleFactory( module, exports );
				_registry[ modulePath ] = exports
			}
			return _registry[ modulePath ];
		}
	}
	require = _.require
`

exports.bundleFiles = async function ( allInputPaths, mainInputPath, outputPath, packageName, shortPackageName ) {
	// Create IIFE wrapper
	let bundleStreamLines = ["!function (_) {"]
	// Inject super light implementation of AMD if we have several files to bundle only
	const isMultiFiles = allInputPaths.length > 1
	if ( isMultiFiles )
		bundleStreamLines.push( superLightAMDModuleSystem )
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
					`_.define("./${relativeFilePath}", (module, exports) => {`,
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
	if ( isMultiFiles )
		bundleStreamLines.push(`var exports = require("./${entryPoint}")`)
	// Declare library name in global scope
	const inlinedDefaultExports = `exports.default ? exports.default : exports`
	let key = shortPackageName ? shortPackageName : packageName
	bundleStreamLines.push(`_["${key}"] = ${inlinedDefaultExports}`)
	bundleStreamLines.push(`}(typeof self !== 'undefined' ? self : this)`)
	// Concat everything into the file output
	const outputFile = new File( outputPath )
	if ( isMultiFiles ) {
		// TODO : Replace all identifiers by indexes, will patch ../ targets
	}
	// Filter out useless stuff
	bundleStreamLines = bundleStreamLines.join("\n").split("\n").flat()
		.filter( line => !line.startsWith(`Object.defineProperty(exports, "__esModule", { value: true })`) )
	// Filter out useless liens
	outputFile.content( bundleStreamLines.join("\n") )
	await outputFile.save();
}


