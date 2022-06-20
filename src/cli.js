const { CLICommands, nicePrint, tryTask, execSync } = require("@solid-js/cli")
const path = require("path")
const { browsePackages, targetPackagesFromCli } = require( "./common/cli-utils" );
const { File, Directory } = require("@solid-js/files")
const { recursiveChangeExtension } = require( "./common/builder" );

// -----------------------------------------------------------------------------

async function buildPackage ( packageConfig ) {
	/**
	 * TODO
	 * - Clean dist before each compile
	 * - Save cjs / esm / modern
	 */
	// Target tsbundle package's root
	const tsBundleRoot = path.normalize( path.join(__dirname, "/../") )
	// Target package's root
	const packageRoot = packageConfig.__root
	// Empty all dist folders before compiling anything
	// To avoid to delete something freshly compiled
	// (if multiple entries with same output directory for example)
	for ( const from in packageConfig.tsbundle ) {
		// Target config and dist path
		const currentConfig = packageConfig.tsbundle[ from ]
		const distPath = path.join( packageRoot, currentConfig.output )
		// Clean output directory
		const directory = new Directory( distPath )
		await directory.clean();
	}
	// Browse package config files to compile
	for ( const from in packageConfig.tsbundle ) {
		// Target config and dist path
		const currentConfig = packageConfig.tsbundle[ from ]
		const distPath = path.join( packageRoot, currentConfig.output )
		// Create a temporary tsconfig file for this package
		// save it at tsbundle package's root
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


		execSync(`tsc -p ${tsconfigTempPath} --declaration false --module esnext`, 3);
		recursiveChangeExtension( distPath, '.js', '.module.mjs' );

		execSync(`tsc -p ${tsconfigTempPath} --declaration true --module commonjs`, 3);
		recursiveChangeExtension( distPath, '.js', '.legacy.cjs' );

		execSync(`tsc -p ${tsconfigTempPath} --declaration false --module esnext --target es2022`, 3);
		recursiveChangeExtension( distPath, '.js', '.modern.js' );
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
			task.progress(0, 10)
			await buildPackage( config )
			task.progress(5, 10)
			await buildPackage( config )
			task.success()
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