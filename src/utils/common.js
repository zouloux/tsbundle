const path = require("path");
const fs = require("fs");

// -----------------------------------------------------------------------------

exports.readPackageJSONFromProjectPath = function ( projectPath ) {
    const packageJsonPath = path.join( projectPath, 'package.json' )
    const relativePackageJsonPath = path.relative( process.cwd(), packageJsonPath )
    if ( !fs.existsSync(packageJsonPath) )
        throw new Error(`Unable to find ${relativePackageJsonPath} at ${projectPath}`)
    let packageData;
    try {
        packageData =  require( packageJsonPath )
    }
    catch ( e ) {
        console.error( e )
        throw new Error(`Invalid JSON file ${relativePackageJsonPath} at ${projectPath}`)
    }
    if ( !("tsbundle" in packageData) )
        throw new Error(`${relativePackageJsonPath} does not contains tsbundle property. It should be an object with source as key and destination (without extension) as value.`)
    return packageData
}

/**
 * Show bytes report as bytes or kilobytes.
 * Very naive implementation.
 */
exports.naiveHumanFileSize = function ( size ) {
    if ( size > 1000 ) // is it base 10 or ^2 ?
        size = ~~(size / 10) / 100 + 'k'
    return size + 'b'
}

/**
 * TODO : Go to ecma-core
 * Filter duplicate from any array.
 * To be used as array.filter( filterDuplicates )
 */
exports.filterDuplicates = ( value, index, array ) => array.indexOf(value) === index