#!/usr/bin/env node

const { CLICommands, nicePrint, table, newLine, oraTask, execAsync, print, askList, askInput, execSync } = require("@solid-js/cli")
const path = require("path")
const chalk = require("chalk")
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
 *
 * ULAMD - Ultra Light AMD
 * - Compatible with all browsers
 * - Minified, will pollute "require" and "import" functions in global scope
 * - Tiny
 * - Can be compatible with CommonJS Node loading for lib testing
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

CLICommands.add("build", async (cliArguments, cliOptions) => {
	// Browse all packages from cli arguments
	await browsePackages( packages, async (key, packageConfig) => {
		if (packageConfig.files.length === 0) return
		// Create a cli task for each package
		await oraTask({ text: `Building ${packageConfig.libraryName}` }, async task => {
			// Build this package, get reports and catch errors
			let reports = []
			try {
				reports = await buildPackage( packageConfig, (text, index) => {
					task.setAfterText( text )
					task.setProgress( index, packageConfig.total * 5 + 1 )
				})
			}
			// An error happened, stop task and halt process
			catch ( e ) {
				task.error( e.message )
				newLine();
				console.error( e )
				e.cause && console.error( e.cause )
				process.exit( 2 )
			}
			// Success, show report
			task.success(`Built ${packageConfig.libraryName}`)
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

// TODO : Implement test library
async function testLibrary ( packageConfig ) {
	// TODO : Skip if no test script
	// FIXME : Does ora works ?
	try {
		// await execAsync(`npm run test`, 3, {
		// 	cwd: packageConfig.packageRoot
		// })
	}
	catch (e) {
		process.exit();
	}
}

CLICommands.add("test", async () => {
	// TODO : Build only needed output and execute `npm run test` for specific package
	await testLibrary();
})
CLICommands.add("clean", () => {
	// TODO : Extract clean function and execute it only here
})
CLICommands.add("publish", async (cliArguments, cliOptions) => {
	// Check NPM connected user
	await oraTask({text: `Connected user`}, async task => {
		try {
			const whoami = await execAsync(`npm whoami`, 0)
			task.success(nicePrint(`Hello {b/c}${whoami}`, {output: 'return'}).trim())
			return whoami
		}
		catch (e) {
			task.error(`Please connect to npm with ${chalk.bold('npm login')}`)
		}
	})
	// Compile
	await CLICommands.run(`build`, cliArguments, cliOptions)
	// Browse libraries
	await browsePackages( packages, async (key, packageConfig) => {
		// Prepare commands
		let { version, libraryName, packageRoot } = packageConfig
		const libraryExecOptions = { cwd: packageRoot };
		const stdioLevel = 3;
		// Test this library, and exit if it fails
		await testLibrary( packageConfig );
		// Test passed, show current version and git status
		nicePrint(`Current version of {b/c}${libraryName}{/} is {b/c}${version}`)
		newLine();
		// Ask how to increment version
		const increment = await askList(`How to increment ?`, {
			patch: 'patch (0.0.X) - No new features, patch bugs or optimize code',
			minor: 'minor (0.X.0) - No breaking change, have new or improved features',
			major: 'major (X.0.0) - Breaking change',
			// Keep but publish on NPM (if already increment in package.json)
			keep: `keep (${ version }) - Publish current package.json version`,
			// Skip this lib (no publish at all, go to next library)
			skip: `skip - Do not publish ${ libraryName }`
		}, { returnType: 'key' });
		// Go to next library
		if ( increment === 'slip' )
			return
		// execSync(`git status -s`, stdioLevel, libraryExecOptions)
		// Ask for commit message
		let message = await askInput(`Commit message ?`);
		message = message.replace(/["']/g, "'");
		// If we increment, use npm version
		if ( increment !== 'keep' ) {
			version = execSync(`npm version ${increment} --no-git-tag-version -m"${libraryName} - %s - ${message}"`, stdioLevel, libraryExecOptions).toString().trim();
		}
		// Add to git and push
		execSync(`git add .`, stdioLevel, libraryExecOptions);
		execSync(`git commit -m"${libraryName} - ${version} : ${message}"`, stdioLevel, libraryExecOptions);
		execSync(`git push`, stdioLevel, libraryExecOptions);
		// Publish on npm as public
		// FIXME : Access public as an option for private repositories
		// Ingore script to avoid infinite loop (if "package.json.scripts.publish" == "tsbundle publish")
		execSync(`npm publish --access public --ignore-scripts`, stdioLevel, libraryExecOptions);
		newLine();
		nicePrint(`👌 {b/g}${libraryName}{/}{g} Published, new version is {b/g}${version}`)
	})
})

// Start CLI command listening
CLICommands.start( (commandName, error, cliArguments, cliOptions, results) => {
	// console.log({commandName, error, cliArguments, cliOptions, results})
	error && nicePrint( `{b/r}${error.message}`, { code: 1 })
});