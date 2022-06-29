const path = require( "path" );
const { nicePrint } = require( "@solid-js/cli" );
const { filterDuplicates, readConfigFromProjectPath } = require( "./common" );

/**
 * Get project paths from cli options and arguments.
 * Will read cli options ( after $ command -- )
 * Will read cli arguments for -p and --project
 * Output is filtered and sanitized
 */
exports.getProjectsPaths = function ( cliOptions, cliArguments ) {
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
	.filter( filterDuplicates )
}

/**
 * Target and read configs of package.json from cli options and arguments.
 * @see getProjectsPaths( cliOptions, cliArguments )
 * Will return list of valid tsbundle configs.
 */
exports.targetPackagesFromCli = function ( cliOptions, cliArguments ) {
	// Read project paths from cli options and arguments
	const projectsPackageJsons = {}
	let projects = exports.getProjectsPaths( cliOptions, cliArguments )
	// If not found, use current directory
	if ( projects.length === 0 )
		projects.push(".")
	// Browse them and check if we find any package.json
	projects.map( projectPath => {
		const absoluteProjectPath = path.join(process.cwd(), projectPath)
		// Read package.json
		try {
			projectsPackageJsons[ projectPath ] = readConfigFromProjectPath( absoluteProjectPath )
		}
		// Invalid package.json
		catch (e) {
			console.error( e )
			nicePrint(`{b/r}${e.message}`, { code: 2 })
		}
	})
	// If still not found any project, show help
	if ( Object.keys(projectsPackageJsons).length === 0 )
		nicePrint(`
			{b/r}No project found.
			{w}- Invoke {b}tsbundle{/} within a directory containing a {b}package.json{/} file
			- Specify project folders with {b}tsbundle ./project-path/{/} or {b}tsbundle -p ./project-path/{/}
		`, { code: 3 })
	return projectsPackageJsons;
}

/**
 * Browse listed packages with asynchronous handlers
 */
exports.browsePackages = async function (packages, handler) {
	for ( const key of Object.keys( packages ) )
		await handler( key, packages[ key ] )
}