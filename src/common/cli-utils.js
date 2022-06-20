const path = require( "path" );
const { nicePrint } = require( "@solid-js/cli" );
const { readPackageJSONFromProjectPath } = require( "./utils" );

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
	.filter( (value, index, array ) => array.indexOf(value) === index )
}

exports.targetPackagesFromCli = function ( cliOptions, cliArguments ) {
	const projectsPackageJsons = {}
	let projects = exports.getProjectsPaths( cliOptions, cliArguments )
	if ( projects.length === 0 )
		projects.push(".")
	projects.map( projectPath => {
		const absoluteProjectPath = path.join(process.cwd(), projectPath)
		try {
			const config = readPackageJSONFromProjectPath( absoluteProjectPath )
			config["__root"] = absoluteProjectPath
			projectsPackageJsons[ projectPath ] = config
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

exports.browsePackages = async function (packages, handler) {
	for ( const key of Object.keys( packages ) )
		await handler( key, packages[ key ] )
}