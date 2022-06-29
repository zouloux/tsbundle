const { File } = require( "@solid-js/files" );
const path = require("path")

/**
 * TODO :
 * - Convert all require / define paths to numbers, to patch relativity (../)
 * 		and for smaller outputs.
 * - Find a way to include dependencies when calling
 * 		(like if we have a dep to Signal for ex)
 */

/**
 * Super light AMD implementation which is missing a lot of stuff
 * but should work for tsc outputs.
 * ES5 compatible, absolutely no error checking.
 */
const superLightAMDModuleSystem = `
	const _registry = {}
	function define ( modulePath, factory ) { _registry[ modulePath ] = factory }
	function require ( modulePath ) {
		const moduleFactory = _registry[ modulePath ]
		if ( typeof moduleFactory === "function" ) {
			let exports = {}
			moduleFactory( module, exports );
			_registry[ modulePath ] = exports
		}
		return _registry[ modulePath ];
	}
`

exports.bundleFiles = async function ( allInputPaths, mainInputPath, outputPath, packageName ) {
	// Create IIFE wrapper
	const bundleStreamLines = ["!function () {"]
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
					`define("./${relativeFilePath}", (module, exports) => {`,
					c,
					`});`,
				].join("\n")
			})
		bundleStreamLines.push( file.content() )
	}
	// Call entry point and end IIFE wrapper
	const entryPoint = path.basename(mainInputPath)
	bundleStreamLines.push(
		isMultiFiles
		? `self["${packageName}"] = require("./${entryPoint}")`
		: `self["${packageName}"] = exports`
		// ? `return require("./${entryPoint}")`
		// : `return exports`
	)
	bundleStreamLines.push(`}( self )`)
	// Concat everything into the file output
	const outputFile = new File( outputPath )
	if ( isMultiFiles ) {
		// TODO : Replace all identifiers by indexes, will patch ../ targets
	}
	outputFile.content( bundleStreamLines.join("\n") )
	await outputFile.save();
}


