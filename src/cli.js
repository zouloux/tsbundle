#!/usr/bin/node

const { CLICommands, nicePrint, tryTask, execSync, table, newLine } = require("@solid-js/cli")
const path = require("path")
const { browsePackages, targetPackagesFromCli } = require( "./utils/cli-utils" );
const { File, Directory } = require("@solid-js/files")
const { recursiveChangeExtension } = require( "./utils/builder" );
const zlib = require( "zlib" );
const fs = require( "fs" );
const chalk = require("chalk")
const { defaultTerserOptions, defaultFormats } = require( "./defaults" );
const { naiveHumanFileSize } = require( "./utils/common" );

// -----------------------------------------------------------------------------

/**
 * INSPIRATION & RESOURCES
 * - microbundle : https://github.com/developit/microbundle
 * - enabling modern js on npm : https://jasonformat.com/enabling-modern-js-on-npm/
 * - tsconfig lib : https://www.typescriptlang.org/tsconfig#lib
 * - tsconfig module : https://www.typescriptlang.org/tsconfig#module
 */

/**
 * -- MODULE FORMATS --
 *
 * CJS - Common js - Legacy NodeJS module format
 * - require and module.exports functions
 *
 * MJS - Module JS - Modern NodeJS and Browser format
 * - import and export keywords
 */

/**
 * ES5 - Legacy browsers and node
 * ⚠️ Can prepend Class and Promise helpers at top of file !
 * 🚫 Class and extends keywords
 * 🚫 Tagged literal strings
 * 🚫 Native promise
 * 🚫 Native spread
 * 🚫 Nullish coalescing operator
 *
 * ES2015
 * ⚠️ Can prepend Promise helpers at top of file !
 * 👍 Class and extends keywords
 * 👍 Tagged literal strings
 * 🚫 Native promise
 * 🚫 Native spread
 * 🚫 Nullish coalescing operator
 *
 * ES2017
 * 👍 Class and extends keywords
 * 👍 Tagged literal strings
 * 👍 Native promise
 * 🚫 Native spread
 * 🚫 Nullish coalescing operator
 *
 * ES2022
 * 👍 Class and extends keywords
 * 👍 Tagged literal strings
 * 👍 Native promise
 * 👍 Native spread
 * 👍 Nullish coalescing operator
 */

// TODO : Move to common/builder.js #refacto a bit more
async function buildPackage ( packageConfig, progressHandler = function () {}, forceFormats = [] ) {
	// TODO : forceFormats which anihilate defaultFormats and format reading from package.json
	// Target tsbundle package's root
	const tsBundleRoot = path.normalize( path.join(__dirname, "/../") )
	// Target package's root and check config validity
	const packageRoot = packageConfig.__root
	if ( !packageConfig.tsbundle )
		throw new Error(`package.json needs a tsbundle property`)
	// Clone default formats
	let packageDefaultFormats = [ ...defaultFormats ];
	// tsbundle as file list or as config root with a files property array
	let files = packageConfig.tsbundle
	if ( typeof packageConfig.tsbundle.files === "object" ) {
		files = packageConfig.tsbundle.files
		if ( Array.isArray(packageConfig.tsbundle.formats) )
			packageDefaultFormats = packageConfig.tsbundle.formats
	}
	// Empty all dist folders before compiling anything
	// To avoid to delete something freshly compiled
	// (if multiple entries with same output directory for example)
	// TODO : Extract clean and count method
	let total = 0
	let current = 0
	for ( const from in files ) {
		// Target config and dist path
		const currentConfig = files[ from ]
		let { output, formats } = currentConfig
		const distPath = path.join( packageRoot, output )
		// Check if output is valid to avoid destroying wrong folder !
		if (
			// No output or output as root
			!output || output === "/" || output === "./"
			// Invalid outputs
			|| output.indexOf("node_modules") !== -1
			// Dist path can target a parent
			|| output.indexOf("..") !== -1
			// Computed dist path is same as package root
			|| path.normalize(distPath) === path.normalize(packageRoot)
		)
			throw new Error(`Output ${output} should be into a sub-directory of package root.`)
		// Clean output directory
		const directory = new Directory( distPath )
		await directory.clean();
		// Target formats and count them for progress handler
		if ( !Array.isArray(formats) )
			formats = packageDefaultFormats
		// Replace formats "default" string by defaults values
		if ( formats.find( s => s.toLowerCase() === "defaults") )
			formats = [ ...defaultFormats, ...formats.filter( s => s.toLowerCase() !== "defaults" ) ]
		// Re-inject formats into config
		currentConfig.formats = formats
		// Count total formats
		total += formats.length
	}
	// Size report output
	let outputReports = []
	progressHandler(current, total)
	// Browse package config files to compile
	for ( const from in files ) {
		// Target config and dist path
		const currentConfig = files[ from ]
		const distPath = path.join( packageRoot, currentConfig.output )
		// Create a temporary tsconfig file for this package
		// and save it at tsbundle package's root
		const tsconfigTempPath = path.join(tsBundleRoot, "tsconfig.temp.json")
		const tsconfigTemp = new File( tsconfigTempPath )
		const rootFilePath = path.join(packageRoot, from)
		const outDirPath = path.join(packageRoot, currentConfig.output)
		tsconfigTemp.json({
			"extends": "./tsconfig.json",
			"include": [ rootFilePath ],
			"exclude" : [
				path.join(packageRoot, "node_modules")
			],
			"compilerOptions" : {
				"outDir" : outDirPath,
			}
		})
		await tsconfigTemp.save()
		progressHandler(++current, total, 'preparing')
		// Browse all formats to compile to
		currentConfig.formats.map( (format, i) => {
			// Split format to get composite info
			const split = format.split(".")
			if ( split.length < 2 )
				throw new Error(`format ${format} is invalid. It should have at least format and extension as for ex : es2015.cjs`)
			// Target is at first, force upper case
			const target = split[0].toUpperCase()
			// Find extension as the last piece
			let extension = split[ split.length - 1 ]
			// Guess module from extension
			let module
			if ( extension === "cjs" )
				module = "commonjs"
			else if ( extension === "js" )
				module = "UMD"
			else if ( extension === "mjs" )
				module = "esnext"
			else
				throw new Error(`format ${format} is invalid. Extension should be .cjs / .js or .mjs`)
			// If we need to minify and bundle output to one compressed file
			// .min is always before extension and after format
			const minify = split.length > 2 && split[ split.length - 2 ].toLowerCase() === "min"
			// Create tsc compile command
			const command = [
				`tsc -p ${tsconfigTempPath}`,
				// Export declaration only at first pass.
				`--declaration ${i === 0 ? 'true' : 'false'}`,
				`--module ${module}`,
				`--target ${target}`,
				// TODO : Load from tsconfig, should be overridable
				// FIXME : DOM should not be here
				`--lib DOM,${target}`,
			].join(" ")
			// Execute tsc command
			// FIXME : Catch errors, do it async ?
			execSync( command, 3 );
			// Rename to format + torename extension. We will rename everything correctly later
			// we remove the .js info because tsc will always output .js no matter what.
			// it's easier to manage by marking now and  distribute correct file extension later
			const changed = recursiveChangeExtension( distPath, '.js', `.${format}.torename` );
			// No file were output by tsc
			if ( Object.values(changed).length === 0 )
				throw new Error(`Error, no file were generated by tsc for ${rootFilePath} with format ${format}`)
			// Target main generated file, without extension
			const parsed = path.parse( rootFilePath )
			const mainFilePathWithoutExtension = path.join(outDirPath, parsed.name)
			// Messaged shown after progress bar
			const afterMessage = `${module}@${target} ➡ ${ path.relative(packageRoot, mainFilePathWithoutExtension) }.js`
			// Locally scoped helper to add an exported report for a specific file
			function addFileReport (source, destination, gzip) {
				const relativeFileName = path.relative(packageRoot, source)
				const report = [
					relativeFileName, module, target,
					chalk.cyan( naiveHumanFileSize( fs.statSync( destination ).size ) )
				]
				// Add gzipped size to output
				if (gzip) {
					const gzip = zlib.gzipSync( fs.readFileSync( destination ) )
					report.push( chalk.cyan.bold( naiveHumanFileSize( gzip.length ) ) )
				}
				else
					report.push("-")
				outputReports.push( report )
			}
			// If we need to bundle and minify this format
			if ( minify ) {
				progressHandler( current + .5, total, afterMessage )
				// Generated minified file from multiple files and mark it as "to rename"
				// We do it that way so it's easy to rename all others files
				const destFilePath = `${mainFilePathWithoutExtension}.${format}.compressed`
				const terserCommand = [
					`node_modules/.bin/terser`,
					defaultTerserOptions.join(' '),
					// One output
					`-o ${ destFilePath }`,
					// Multiple inputs
					`-- ${ Object.values( changed ).join(' ') }`
				].join(" ")
				// Execute terser command
				// FIXME : Catch errors, do it async ?
				execSync( terserCommand, 3 );
				addFileReport( `${mainFilePathWithoutExtension}.${format}`, destFilePath, true )
				// Mark source files (before terser) as to delete
				// We do not do it right now because of async in a map (can be refactored if needed)
				recursiveChangeExtension( distPath, `.${format}.torename`, '.todelete', true );
				recursiveChangeExtension( distPath, `.compressed`, '.torename', true );
			}
			// Multiple outputs
			else {
				// Browse every generated files to add to the report
				Object.keys( changed ).map( key => addFileReport( key, changed[key], false ) )
			}
			// Update progress
			progressHandler( ++current, total, afterMessage )
		});
		// Delete files marked as "to delete"
		const filesToDelete = await File.find( path.join(outDirPath, '**/*.todelete' ) );
		for ( const f of filesToDelete )
			await f.delete()
		// Rename all files to rename
		recursiveChangeExtension( distPath, '.torename', '' );
		// Remove tsconfig file
		await tsconfigTemp.delete()
	}
	return outputReports
}

// ----------------------------------------------------------------------------- COMMANDS

// TODO : Move it to @zouloux/node-toolbox
function showIntroMessage () {
	const tsbundlePackage = require(path.normalize(__dirname+"/../package.json"))
	nicePrint(`{w}Using {w/b}${tsbundlePackage.name}{d} {w}v${tsbundlePackage.version}`)
}

// Get packages list and configs before any action
let packages = {}
CLICommands.before((cliOptions, cliArguments) => {
	showIntroMessage();
	packages = targetPackagesFromCli( cliOptions, cliArguments )
})

CLICommands.add("build", async () => {
	// Browse all packages from cli arguments
	await browsePackages( packages, async (key, config) => {
		// Build this packages
		let output = []
		await tryTask(`Building ${key}`, async task => {
			output.push( await buildPackage( config, task.progress ) )
		})
		// Show report
		newLine()
		output = [
			["File", "Module", "Target", "Size", "GZip"],
			...output.flat()
		]
		table(output, true, [20], '    ')
		newLine()
	})

})
CLICommands.add("test", () => {
	// TODO : Build only needed output and execute `npm run test` for specific package
})
CLICommands.add("clean", () => {
	// TODO : Extract clean function and execute it only here
})
CLICommands.add("publish", () => {
	// TODO : Run test (with minimal building)
	// TODO : If test passing : Ask for increment and message
	// TODO : Then build everything (should pass because of test passing
	// TODO : Then git push + npm publish
})

// Start CLI command listening
CLICommands.start( (commandName, error, cliArguments, cliOptions, results) => {
	// console.log({commandName, error, cliArguments, cliOptions, results})
	error && nicePrint( `{b/r}${error.message}`, { code: 1 })
});