const path = require("path");
const fs = require("fs");

// ----------------------------------------------------------------------------- READ PACKAGE.JSON FILES

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
