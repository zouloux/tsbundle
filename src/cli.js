const { CLICommands, nicePrint, tryTask, execSync } = require("@solid-js/cli")
const path = require("path")
const { browsePackages, targetPackagesFromCli } = require( "./common/cli-utils" );
const { File, Directory } = require("@solid-js/files")
const { recursiveChangeExtension } = require( "./common/builder" );
const zlib = require( "zlib" );
const fs = require( "fs" );

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


// TODO : Move to common/builder.js #refacto a bit more
async function buildPackage ( packageConfig, progressHandler = function () {}, forceFormats = [] ) {

	// TODO : forceFormats which anihilate defaultFormats and format reading from package.json

	// Target tsbundle package's root
	const tsBundleRoot = path.normalize( path.join(__dirname, "/../") )
	// Target package's root
	const packageRoot = packageConfig.__root
	// Get tsbundle files config
	//const files = packageConfig.tsbundle.files ?? packageConfig.tsbundle
	let defaultFormats = [
		"es5.min.cjs",
		"es2019.cjs",
		"es2019.min.cjs",
		"es2019.mjs",
		"es2022.mjs",
		"es2022.min.mjs",
	];
	if ( !packageConfig.tsbundle ) {
		// TODO : Full auto mode ?
		throw new Error(`package.json needs a tsbundle propertyy`) // TODO : Better
	}
	// tsbundle as file list or as config root with a files property array
	let files = packageConfig.tsbundle
	if ( Array.isArray(packageConfig.tsbundle.files) ) {
		files = packageConfig.tsbundle.files
		if ( Array.isArray(packageConfig.tsbundle.formats) )
			defaultFormats = packageConfig.tsbundle.formats
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
			currentConfig.formats = defaultFormats
		total += currentConfig.formats.length
	}

	let output = [] // FIXME

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
		tsconfigTemp.json({
			"extends": "./tsconfig.json",
			"include": [ path.join(packageRoot, from) ],
			"exclude" : [
				path.join(packageRoot, "node_modules")
			],
			"compilerOptions" : {
				"outDir" : path.join(packageRoot, currentConfig.output),
			}
		})
		await tsconfigTemp.save()
		progressHandler(++current, total, 'preparing')

		currentConfig.formats.map( (format, i) => {
			const split = format.split(".")
			const target = split[0].toUpperCase()
			let extension = split.length === 2 ? split[1] : split[2]
			// Force commonjs as default module and extension
			if ( extension === "js" )
				extension = "cjs"
			// Force esnext module if not CommonJS
			const module = extension === "cjs" ? "commonjs" : "esnext"
			const minify = split.length === 3 && split[1] === "min"
			// FIXME : Some warning about module ES2022 not valid ?
			const command = [
				`tsc -p ${tsconfigTempPath}`,
				`--declaration ${i === 0 ? 'true' : 'false'}`,
				`--module ${module}`,
				`--target ${target}`,
				`--lib DOM,${target}`,
			].join(" ")

			execSync(command, 3); // FIXME : Catch errors
			const changed = recursiveChangeExtension( distPath, '.js', '.'+format );

			// Target renamed file, if no file were renamed, we have an issue
			const generatedFile = changed[ Object.keys(changed)[0] ]
			if ( !generatedFile ) {
				throw new Error(`Unable to generate ...`) // fixme : better error
			}
			let afterCommand = `${module}@${target} ➡ ${ path.relative(packageRoot, generatedFile) }`

			output[ generatedFile ] = [ fs.statSync( generatedFile ).size ]

			// Terser
			if ( minify ) {
				progressHandler( current + .5, total, afterCommand )
				execSync(`node_modules/.bin/terser ${terserOptions.join(' ')} -o ${generatedFile} -- ${generatedFile}`);
				output[ generatedFile ].push( zlib.gzipSync( fs.readFileSync(generatedFile) ).length )
			}

			progressHandler( ++current, total, afterCommand )
		})
	}

	console.log(output)

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

CLICommands.add("build", () => {
	browsePackages( packages, async (key, config) => {
		//console.log(key, config)
		await tryTask(`Building ${key}`, async task => {
			await buildPackage( config, task.progress )
		})
		// await oraTask(`Building ${key}`, task => {
		//
		// })
	})
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