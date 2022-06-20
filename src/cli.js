const { CLICommands, nicePrint } = require("@solid-js/cli")
const { readPackageJSONFromProjectPath } = require( "./utils" );
const path = require("path")

// ----------------------------------------------------------------------------- COMMON

const forceArray = a => Array.isArray(a) ? a : [a]

function getProjectsPaths ( cliOptions, cliArguments ) {
	return [
		cliOptions,
		// Browse into those keys
		["p", "project"].map( key => cliArguments[key] ).flat(),
	]
		// Flatten and remove empties
		.flat().filter( v => !!v )
		// Normalize paths (remove unneeded dots and slashes)
		.map( path.normalize )
		// Remove duplicates after normalization
		.filter( (value, index, array ) => array.indexOf(value) === index )
}

function targetPackagesFromCli ( cliOptions, cliArguments ) {
	const projectsPackageJsons = {}
	let projects = getProjectsPaths( cliOptions, cliArguments )
	if ( projects.length === 0 )
		projects.push(".")
	projects.map( projectPath => {
		const absoluteProjectPath = path.join(process.cwd(), projectPath)
		try {
			projectsPackageJsons[ projectPath ] = readPackageJSONFromProjectPath( absoluteProjectPath )
		}
		catch (e) {
			nicePrint(`{b/r}${e.message}`, { code: 2 })
		}
	})
	if ( Object.keys(projectsPackageJsons).length === 0 )
		nicePrint(`
			{b/r}No project found.
			{w}- Invoke {b}tsbundle{/} within a directory containing a {b}package.json{/} file
			- Specify project folders with {b}tsbundle ./project-path/{/} or {b}tsbundle -p ./project-path/{/}
		`, { code: 3 })
	return projectsPackageJsons;
}

// ----------------------------------------------------------------------------- COMMANDS

CLICommands.add("build", (cliOptions, cliArguments) => {
	const packages = targetPackagesFromCli( cliOptions, cliArguments )
	console.log( packages );
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

CLICommands.start((commandName, error, cliArguments, cliOptions, results) => {
	// console.log({commandName, error, cliArguments, cliOptions, results})
	error && nicePrint( `{b/r}${error.message}`, { code: 1 })
});