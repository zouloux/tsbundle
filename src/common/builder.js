const path = require( "path" );
const fs = require( "fs" );
const rimraf = require( "rimraf" );
const { execSync } = require( "@solid-js/cli" );
const glob = require( "glob" );
const zlib = require( "zlib" );

// ----------------------------------------------------------------------------- LIBRARY BUILDING

// Files copied to package before build
const templateRootPath = path.join( 'libraries', '_template' );
//const templateFiles = glob.sync(path.join( templateRootPath, '*' ), { dot: true });
const templateFiles = [
	'.npmignore',
	'tsconfig.json'
].map( f => path.join(templateRootPath, f) );

// All terser options @see https://github.com/terser/terser
const terserOptions = [
	// Compress and shorten names
	'--compress',
	'--mangle',
	// Set env as production for dead code elimination
	'-d process.env.NODE_ENV=\"PRODUCTION\"',
	// Keep class names but do not keep function names
	'--keep_classnames',
	//'--keep_fnames',
	// Allow top level mangling
	'--toplevel',
	// Threat as module (remove "use strict")
	'--module',
];

/**
 * Build library for given name.
 * @param libraryName
 * @param buildLevel
 *           0 -> Build only CommonJS
 *           1 -> Build EsNext modules and CommonJS
 *           2 -> Also build .min.js + estimate gzip size. Only if not a node lib.
 * @param progress Called each time build progresses
 */
exports.buildLibrary = function ( libraryName, buildLevel = 1, progress )
{
	// Update percentage (0%)
	progress && progress( 0, 1 );

	// Compute library typescript config path
	const libraryPath = path.join( 'libraries', libraryName );
	const libraryConfigPath = path.join( libraryPath, 'tsconfig.json' );
	const distPath = path.join(libraryPath, 'dist');

	// Copy npmignore and tsconfig from templates
	templateFiles.map( file => fs.copyFileSync(file, path.join(libraryPath, path.basename( file ))) );

	// Clean files
	//rimraf.sync( distPath );

	// Will compile typescript files to js files in two phases
	if ( buildLevel >= 1 )
	{
		// Execute typescript to compile modules as esnext (with import statements)
		// Do not add declaration files (.d.ts)
		execSync(`tsc -p ${libraryConfigPath} --declaration false --module esnext`);

		// Rename every js file to mjs file
		exports.recursiveChangeExtension( distPath, '.js', '.mjs' );

		// Update percentage
		progress && progress( 1, buildLevel + 1);
	}

	// Execute typescript to compile modules as commonjs (with require statements)
	// Do add declaration files (.d.ts) this time
	execSync(`tsc -p ${libraryConfigPath} --declaration true --module commonjs`);

	// Update percentage
	progress && progress( buildLevel >= 1 ? 2 : 1, buildLevel + 1);

	// If we need to minify this lib
	// and this lib is not a node one (no need to minify for node)
	if ( libraryName.indexOf('node-') !== 0 && buildLevel >= 2 )
	{
		// Browse all .js and .mjs files in dist folder
		const allJsFiles = glob.sync( path.join(distPath, '**/*.?(m)js') );

		// Browse all those files and compress every of them adding a .min in file name
		let output = [];
		allJsFiles.map( (fileName, i) =>
		{
			// Create destination file name
			const destinationFileName = fileName
			.replace('.mjs', '.min.mjs')
			.replace('.js', '.min.js');

			// Compress this file with terser and options
			execSync(`node_modules/.bin/terser ${terserOptions.join(' ')} -o ${destinationFileName} -- ${fileName}`);

			// Update percentage for each file
			progress && progress( 2 + ((i+1) / allJsFiles.length), buildLevel + 1 );

			// Filter out non module files
			if ( fileName.indexOf('.mjs') === -1 ) return;

			// Compress file as gzip to know its size
			const zipped = zlib.gzipSync( fs.readFileSync(destinationFileName) );

			// Add terser stats to output
			output.push([
				path.basename( fileName ),
				fs.statSync( fileName ).size,
				fs.statSync( destinationFileName ).size,
				zipped.length
			])
		});
		return output;
	}
};

// --–--–--–--–--–--–--–--–--–--–--–--–--–--–--–--–--–--–--–--–--–--–--–--–----- LIBRARY TESTING

/**
 * 'npm run test' a lib if tests are available.
 */
exports.testLibrary = function ( libraryName )
{
	const libraryPath = path.join( 'libraries', libraryName );
	const packageContent = exports.getLibraryPackageJson( libraryName );

	if ( !('scripts' in packageContent) ) return;
	const hasTest = 'test' in packageContent.scripts;
	const hasTests = 'tests' in packageContent.scripts;
	if ( !hasTest && !hasTests ) return;

	// Execute this test
	execSync(`npm run ${hasTest ? 'test' : 'tests'}`, 3, {
		cwd: libraryPath
	});
}

// --–--–--–--–--–--–--–--–--–--–--–--–--–--–--–--–--–--–--–--–--–--–--–--–-----

/**
 * Utility to recursively change files extensions into a folder
 */
exports.recursiveChangeExtension = function ( dir, from, to ) {
	const changed = {}
	// Browse this folder
	fs.readdirSync( dir ).forEach( f => {
		// Get file info
		const filePath = path.join( dir, f );
		const stats = fs.lstatSync( filePath );

		// Recursive browse and rename if this is a directory
		if ( stats.isDirectory() )
			exports.recursiveChangeExtension( filePath, from, to );

		// Rename if this is searched type of file
		else if ( path.extname( f ) === from ) {
			const destinationPath = filePath.replace(from, to)
			fs.renameSync( filePath, destinationPath );
			changed[ filePath ] = destinationPath;
		}
	});
	return changed
}

