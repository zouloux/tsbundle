#!/usr/bin/env node

const { CLICommands, nicePrint, table, newLine, oraTask } = require("@solid-js/cli")
const path = require("path")
const { browsePackages, targetPackagesFromCli } = require( "./utils/cli-utils" );
const { buildPackage } = require( "./tsbundle" );

// -----------------------------------------------------------------------------

/**
 * TODO 1.2.0 - Features
 * 	- Allow bundle as <script module> with native export tag for modern browsers ?
 * 		- Why not use non bundled version directly ? With http2 push it should work well.
 * 	- Allow dependency inclusion from node_modules (like @zouloux/ecma-core for ex)
 * 		- Also better interop if several bundle are loaded, need tests !
 * 	- Ability to rename bundles ?
 */
/**
 * TODO 1.3.0 - Config optioons
 * 	- tsconfig override
 * 	- terserrc override
 */
/**
 * TODO 1.4.0 - Release and doc
 *  - npm ignore
 * 	- tsbundle test
 * 	- tsbundle clean
 * 	- tsbundle publish
 * 	- Move every solid lib to @zouloux/ and refacto with this tool
 * 	- Replace stats in README.md with nanostache
 * 	- RC DOC
 */

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
 * CJS - Common js
 * - Legacy NodeJS module format
 * - require and module.exports functions
 *
 * MJS - Module JS
 * - Modern NodeJS and Browser format
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
	await browsePackages( packages, async (key, packageConfig) => {
		// Create a cli task for each package
		await oraTask({ text: `Building ${packageConfig.libraryName}` }, async taskUpdater => {
			// Build this package, get reports and catch errors
			let reports = []
			try {
				reports = await buildPackage( packageConfig, (text, index) => {
					taskUpdater.setAfterText( text )
					taskUpdater.setProgress( index, packageConfig.total * 5 + 1 )
				})
			}
			// An error happened, stop task and halt process
			catch ( e ) {
				taskUpdater.error( e.message )
				newLine();
				console.error( e )
				e.cause && console.error( e.cause )
				process.exit( 2 )
			}
			// Success, show report
			taskUpdater.success(`Built ${packageConfig.libraryName}`)
			if (!reports) return;
			newLine()
			reports = [
				["File", "Module", "Target", "Output", "Bundle", "Size", "GZip"],
				...reports
			]
			table(reports, true, [20], '    ')
			newLine()
		})
	})
})

CLICommands.add("test", () => {
	// TODO : Build only needed output and execute `npm run test` for specific package
})
CLICommands.add("clean", () => {
	// TODO : Extract clean function and execute it only here
})
CLICommands.add("publish", () => {
	// TODO : Inspire from solid-js
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