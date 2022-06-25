const path = require( "path" );
const fs = require( "fs" );
const rimraf = require( "rimraf" );
const { execSync } = require( "@solid-js/cli" );
const glob = require( "glob" );
const zlib = require( "zlib" );

/**
 * Utility to recursively change files extensions into a folder
 */
exports.recursiveChangeExtension = function ( dir, from, to, multipleDots = false ) {
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
		else if (
			multipleDots
			? path.basename( f ).lastIndexOf( from ) === f.length - from.length
			: path.extname( f ) === from
		) {
			const destinationPath = filePath.replace(from, to)
			fs.renameSync( filePath, destinationPath );
			changed[ filePath ] = destinationPath;
		}
	});
	return changed
}

