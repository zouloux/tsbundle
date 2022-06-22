const { CLICommands, nicePrint, tryTask, execSync } = require("@solid-js/cli")
const { untab } = require("@solid-js/core")
const path = require("path")
const { browsePackages, targetPackagesFromCli } = require( "./common/cli-utils" );
const { File, Directory } = require("@solid-js/files")
const { recursiveChangeExtension } = require( "./common/builder" );

// -----------------------------------------------------------------------------


/**
 * CJS - Common js
 * - require and module.exports functions
 *
 * MJS - Module JS
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

// TODO : Move to common/builder.js #refacto a bit more
async function buildPackage ( packageConfig, progressHandler = function () {} ) {
	/**
	 * TODO
	 * - Clean dist before each compile
	 * - Save cjs / esm / modern
	 */
	// Target tsbundle package's root
	const tsBundleRoot = path.normalize( path.join(__dirname, "/../") )
	// Target package's root
	const packageRoot = packageConfig.__root
	// Get tsbundle files config
	//const files = packageConfig.tsbundle.files ?? packageConfig.tsbundle
	let defaultFormats = [
		"es5.min.cjs",
		"es2015.cjs",
		"es2019.cjs",
		"es2022.cjs",
		"es2022.min.cjs",

		"es5.min.mjs",
		"es2015.mjs",
		"es2019.mjs",
		"es2022.mjs",
		"es2022.min.mjs",
	];
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
		progressHandler(++current, total)

		currentConfig.formats.map( (format, i) => {
			// console.log(format)
			// Compiling commonjs module (require / module.exports) as ES2015
			// - Promises with awaiter
			// - Spread operator
			// Also create declaration .d.ts file with this one

			const split = format.split(".")

			const target = split[0].toUpperCase()
			const extension = split.length === 2 ? split[1] : split[2]
			const module = extension === "cjs" ? "commonjs" : target
			const minify = split.length === 3 && split[2] === "min"

			// FIXME : Some warning about module ES2022 not valid ?

			const command = [
				`tsc -p ${tsconfigTempPath}`,
				`--declaration ${i === 0 ? 'true' : 'false'}`,
				`--module ${module}`,
				`--target ${target}`,
				`--lib DOM,${target}`,
			].join(" ")

			execSync(command, 3);
			recursiveChangeExtension( distPath, '.js', '.'+format );
			progressHandler( ++current, total, command )

			if ( minify ) {
				// TODO : Terser and gz + report
			}
		})
	}

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