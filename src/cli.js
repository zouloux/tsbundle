const { CLICommands, nicePrint, tryTask, execSync, table, newLine } = require("@solid-js/cli")
const path = require("path")
const { browsePackages, targetPackagesFromCli } = require( "./common/cli-utils" );
const { File, Directory } = require("@solid-js/files")
const { recursiveChangeExtension } = require( "./common/builder" );
const zlib = require( "zlib" );
const fs = require( "fs" );
const chalk = require("chalk")

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
 * 🚫 Class and extends keywords
 * 🚫 Tagged literal strings
 * 🚫 Native promise
 * 🚫 Native spread
 * 🚫 Nullish coalescing operator
 *
 * ES2015
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

// All terser options @see https://github.com/terser/terser
const terserOptions = [
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

const defaultFormats = [
	"es5.min.cjs",
	"es2019.cjs",
	"es2019.min.cjs",
	"es2019.mjs",
	"es2022.mjs",
	"es2022.min.mjs",
]

function humanFileSize ( size ) {
	if (size > 1000)
		size = ~~(size / 10) / 100 + 'k'
	return size + 'b'
}


// TODO : Move to common/builder.js #refacto a bit more
async function buildPackage ( packageConfig, progressHandler = function () {}, forceFormats = [] ) {
	// TODO : forceFormats which anihilate defaultFormats and format reading from package.json
	// Target tsbundle package's root
	const tsBundleRoot = path.normalize( path.join(__dirname, "/../") )
	// Target package's root and check config validity
	const packageRoot = packageConfig.__root
	if ( !packageConfig.tsbundle ) {
		// TODO : Full auto mode ?
		// TODO : Better error message
		throw new Error(`package.json needs a tsbundle property`)
	}
	// Default formats
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
	let total = 0
	let current = 0
	for ( const from in files ) {
		// Target config and dist path
		const currentConfig = files[ from ]
		const distPath = path.join( packageRoot, currentConfig.output )
		// Clean output directory
		const directory = new Directory( distPath )
		await directory.clean();
		// Target formats and count them
		if ( !Array.isArray(currentConfig.formats) )
			currentConfig.formats = packageDefaultFormats
		total += currentConfig.formats.length
	}
	// Size report output
	const output = []
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
			const split = format.split(".")
			const target = split[0].toUpperCase()
			let extension = split.length === 2 ? split[1] : split[2]
			// Force commonjs as default module and extension
			if ( extension === "js" )
				extension = "cjs"
			// Force esnext module if not CommonJS
			// FIXME : Allow UMD and AMD maybe ?
			const module = extension === "cjs" ? "commonjs" : "esnext"
			const minify = split.length === 3 && split[1] === "min"
			// Compile command and rename
			const command = [
				`tsc -p ${tsconfigTempPath}`,
				`--declaration ${i === 0 ? 'true' : 'false'}`,
				`--module ${module}`,
				`--target ${target}`,
				`--lib DOM,${target}`, // TODO : Load from tsconfig, should be overridable
			].join(" ")
			execSync(command, 3); // FIXME : Catch errors
			const changed = recursiveChangeExtension( distPath, '.js', '.'+format );
			// Target renamed file, if no file were renamed, we have an issue
			const generatedFile = changed[ Object.keys(changed)[0] ]
			// FIXME : better check and better error
			if ( !generatedFile )
				throw new Error(`Unable to generate ...`)
			// Messaged shown after progress bar
			const relativeFileName = path.relative(packageRoot, generatedFile)
			const afterMessage = `${module}@${target} ➡ ${ relativeFileName }`
			const report = [
				relativeFileName, module, target,
				chalk.cyan(
					humanFileSize( fs.statSync( generatedFile ).size )
				)
			]
			// Minify if .min extension is found
			if ( minify ) {
				progressHandler( current + .5, total, afterMessage )
				const generatedFiles = Object.values( changed )
				const parsed = path.parse( rootFilePath )
				// Generated minified file from multiple files and mark it as "to rename"
				// We do it that way so it's easy to rename all others files
				const dest = path.join(outDirPath, parsed.name) + ".torename"
				const terserCommand = [
					`node_modules/.bin/terser`,
					terserOptions.join(' '),
					// `-o ${generatedFile}`,
					`-o ${dest}`,
					`-- ${generatedFiles.join(' ')}`
				].join(" ")
				execSync( terserCommand );
				// Add gzipped size to output
				const gzip = zlib.gzipSync( fs.readFileSync(generatedFile) )
				report.push( chalk.cyan.bold( humanFileSize( gzip.length ) ) )
				// Mark source files (before terser) as to delete
				// We do not do it right now because of async in a map (can be refactored if needed)
				recursiveChangeExtension( distPath, '.'+format, '.todelete', true );
				// Rename minified from to rename to the real format
				recursiveChangeExtension( distPath, '.torename', '.'+format );
			}
			else {
				report.push("-")
			}
			// Add file size to output
			output.push( report )
			progressHandler( ++current, total, afterMessage )
		});
		// Delete files marked as "to delete"
		const filesToDelete = await File.find( path.join(outDirPath, '**/*.todelete' ) );
		for ( const f of filesToDelete )
			await f.delete()
		// Remove tsconfig file
		await tsconfigTemp.delete()
	}
	return output
}

// ----------------------------------------------------------------------------- COMMANDS

function showIntroMessage () {
	const tsbundlePackage = require(path.normalize(__dirname+"/../package.json"))
	nicePrint(`{d}Using ${tsbundlePackage.name} v{b/d}${tsbundlePackage.version}`)
}

// Get packages list and configs before all actions
let packages = {}
CLICommands.before((cliOptions, cliArguments) => {
	showIntroMessage();
	packages = targetPackagesFromCli( cliOptions, cliArguments )
})

CLICommands.add("build", async () => {
	let output = []
	await browsePackages( packages, async (key, config) => {
		//console.log(key, config)
		await tryTask(`Building ${key}`, async task => {
			output.push( await buildPackage( config, task.progress ) )
		})
	})

	newLine()
	output = [
		["File", "Module", "Target", "Size", "GZip"],
		...output.flat()
	]
	table(output, true, [20], '    ' )
	newLine()
})
CLICommands.add("dev", () => {

})
CLICommands.add("test", () => {

})
CLICommands.add("clean", () => {

})
CLICommands.add("reset", () => {

})
CLICommands.add("link", () => {

})
CLICommands.add("publish", () => {

})

// Start CLI command listening
CLICommands.start( (commandName, error, cliArguments, cliOptions, results) => {
	// console.log({commandName, error, cliArguments, cliOptions, results})
	error && nicePrint( `{b/r}${error.message}`, { code: 1 })
});