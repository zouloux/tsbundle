#!/usr/bin/env node

const { CLICommands, nicePrint, tryTask, execSync, table, newLine } = require("@solid-js/cli")
const path = require("path")
const { browsePackages, targetPackagesFromCli } = require( "./utils/cli-utils" );
const { File, Directory } = require("@solid-js/files")
const { recursiveChangeExtension } = require( "./utils/builder" );
const zlib = require( "zlib" );
const fs = require( "fs" );
const chalk = require("chalk")
const { defaultTerserOptions, defaultFormats, replaceImportsRegex } = require( "./utils/defaults" );
const { naiveHumanFileSize, filterDuplicates } = require( "./utils/common" );

// -----------------------------------------------------------------------------

/**
 * INSPIRATION & RESOURCES
 * - microbundle : https://github.com/developit/microbundle
 * - enabling modern js on npm : https://jasonformat.com/enabling-modern-js-on-npm/
 * - tsconfig lib : https://www.typescriptlang.org/tsconfig#lib
 * - tsconfig module : https://www.typescriptlang.org/tsconfig#module
 */

/**
 * SOUCIS :
 * - CJS et MJS : Il faut renomer les imports et require dans le code source avec une regex...
 * 					Pas props
 * 		SOLUTION : S'inspirer de solid ? Exporter juste .js et .mjs ont l'air de marcher,
 * 					a voir avec node si ça marche dans les 2 cas
 * - Browser : Terser à l'air d'inclure dans le désordre + il s'en fout des imports export
 * 				et il les réinclus ce débile.
 * 		SOLUTION : Faire un outFile sans modules en es2017 et terser ça ensuite avec un
 * 					fallback es5 si possible en plus du es2017 ? Peut-être plus besoin d'es5
 * IMPACTS :
 * - Changer la conf
 * 		{
 * 		 	"commonjs" : "es2017" | false,
 * 		 	"module" : "es2020" | false,
 * 		 	"browser" : "es2017" | false -> + ça min derrière avec terser
 * 		}
 *
 * -> C'est moins flexible mais on contrôle mieux les effets de bord
 */

/**
 * -- MODULE FORMATS --
 *
 * CJS - Common js
 * - Legacy NodeJS module format
 * - require and module.exports functions
 *
 * MJS - Module JS
 * - Modern NodeJS and Browser format
 * - import and export keywords
 *
 * UMD - Universal Module Definition
 * - Multiple system compatible format, mainly for legacy browsers and node.
 * - Compatible with AMD, CommonJS, define / require / etc
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


/**
 * TODO
 * - Node abstract version (not cli) should return an array of transformed files
 * 		- Then cli should convert it to cli table with human file sizes
 * 	 	- cli table shows wrong files. It should be clearer with input -> output(s)`
 * - Refacto all this
 */

const targetBin = (bin) => path.join( __dirname, '..', 'node_modules', '.bin', bin )

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
	let defaultOutput = "./dist/"
	if ( Array.isArray(packageConfig.tsbundle.files) ) {
		files = packageConfig.tsbundle.files
		if ( packageConfig.tsbundle.output )
			defaultOutput = packageConfig.tsbundle.output
		if ( Array.isArray(packageConfig.tsbundle.formats) )
			packageDefaultFormats = packageConfig.tsbundle.formats
	}
	// Empty all dist folders before compiling anything
	// To avoid to delete something freshly compiled
	// (if multiple entries with same output directory for example)
	// TODO : Extract clean and count method
	let total = 0
	let current = 0
	for ( const currentConfig of files ) {
		// Target config and dist path
		let { output, formats } = currentConfig
		// Default output
		if ( !output )
			output = defaultOutput
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
		// Re-inject formats and output into config
		currentConfig.formats = formats
		currentConfig.output = output
		// Count total formats
		total += formats.length
	}
	// Size report output
	let outputReports = []
	progressHandler(current, total)
	// Remember all dist paths
	const distPaths = []
	// Browse package config files to compile
	for ( const currentConfig of  files ) {
		// Target config and dist path
		const distPath = path.join( packageRoot, currentConfig.output )
		// Create a temporary tsconfig file for this package
		// and save it at tsbundle package's root
		const tsconfigTempPath = path.join(tsBundleRoot, "tsconfig.temp.json")
		const tsconfigTemp = new File( tsconfigTempPath )
		const rootFilePath = path.join(packageRoot, currentConfig.input)
		const outDirPath = path.join(packageRoot, currentConfig.output)
		tsconfigTemp.json({
			"extends": "./tsconfig.json",
			"include": [ rootFilePath ],
			"exclude" : [ path.join(packageRoot, "node_modules") ],
			"compilerOptions" : {
				"outDir" : outDirPath,
				// "outFile" : path.join(outDirPath, "test.js")
			}
		})
		await tsconfigTemp.save()
		progressHandler(++current, total, 'preparing')
		// Browse all formats to compile to
		for ( let i in currentConfig.formats ) {
			const format = currentConfig.formats[ i ]
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
			// module = "none" // fixme
			// If we need to minify and bundle output to one compressed file
			// .min is always before extension and after format
			const minify = split.length > 2 && split[ split.length - 2 ].toLowerCase() === "min"
			// Configs can cancel type definition exports
			const allowTypeDefinition = !('typeDefinition' in currentConfig) || currentConfig.typeDefinition === true
			// Create tsc compile command
			const command = [
				targetBin('tsc'),
				`-p ${tsconfigTempPath}`,
				// Export declaration only at first pass.
				`--declaration ${i === 0 && allowTypeDefinition ? 'true' : 'false'}`,
				`--module ${module}`,
				`--target ${target}`,
				// TODO : Load from tsconfig, should be overridable
				// FIXME : DOM should not be here
				`--lib DOM,${target}`
			].join(" ")
			// Execute tsc command
			// FIXME : Catch errors, do it async ?
			execSync( command, 3 );
			// Compute extension format to be compatible with modules and bundled files
			// const formatExtension = minify ? format : extension
			const formatExtension = format
			// Rename to format + torename extension. We will rename everything correctly later
			// we remove the .js info because tsc will always output .js no matter what.
			// it's easier to manage by marking now and  distribute correct file extension later
			const changed = recursiveChangeExtension( distPath, '.js', `.${formatExtension}.torename` );
			// console.log( Object.keys( changed ) );

			// console.log( baseNames );

			const baseNames = Object.keys( changed ).map( p => path.parse(p).name )
			for ( const source of Object.keys( changed ) ) {
				const dest = changed[ source ]
				const file = new File( dest )
				await file.load();
				// Keep node modules targets like
				// - import fs from "fs"
				// - import("fs")
				// - require("fs"
				// Add custom extension on targets like
				// We detect that "module" is a local dependency thanks to baseNames
				// - import { test } from "./module"
				// - import { test } from "./module.js"
				// - import { test } from "module.js"
				// - import("module.js")
				// - require("module.js")
				file.content(
					c => c.replaceAll(
						replaceImportsRegex,
						(...rest) => (
							( baseNames.indexOf(rest[3]) === -1)
							? rest[0]
							: `${rest[1]} "${rest[2]}${rest[3]}.${formatExtension}"`
						)
					)
				)
				await file.save();
			}

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
				// Generated minified file from multiple files and mark it as "compressed"
				// We do it that way so it's easy to separate terser source and output files
				const destFilePath = `${mainFilePathWithoutExtension}.${formatExtension}.compressed`
				const terserCommand = [
					targetBin('terser'),
					...defaultTerserOptions,
					// One output
					`-o ${ destFilePath }`,
					// Multiple inputs
					`-- ${ Object.values( changed ).join(' ') }`
				].join(" ")
				// Execute terser command
				// FIXME : Catch errors, do it async ?
				execSync( terserCommand, 3 );
				addFileReport( `${mainFilePathWithoutExtension}.${formatExtension}`, destFilePath, true )
				// Delete terser source files
				Object.values( changed ).map( p => fs.unlinkSync(p) )
				// Mark output as to rename now we removed source files
				recursiveChangeExtension( distPath, `.compressed`, '.torename', true );
			}
			// Multiple outputs
			else {
				// Browse every generated files to add to the report
				Object.keys( changed ).map( key => addFileReport( key, changed[key], false ) )
			}
			// Update progress
			progressHandler( ++current, total, afterMessage )
		}
		// Register this dist path to rename all files later
		distPaths.push( distPath )
		// Remove tsconfig file
		await tsconfigTemp.delete()
	}
	// Rename all files now
	// If we do it in the loop, we may rename files incorrectly
	distPaths
		.filter( filterDuplicates )
		.map( p => recursiveChangeExtension( p, '.torename', '' ) )
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