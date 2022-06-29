const { tsBundleDefaultConfig } = require( "./defaults" );
const path = require("path");
const fs = require("fs");

// ----------------------------------------------------------------------------- READ CONFIG FROM PROJECT PATH

/**
 * Read tsbundle config from a package root path.
 * @param projectPath Valid path to package root. Do not include package.json into path. Can be absolute or relative to cwd.
 * @returns Normalized tsbundle config object.
 */
exports.readConfigFromProjectPath = function ( projectPath ) {
    const packageRoot = path.normalize( projectPath );
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
    // Check validity of config
    if ( typeof packageData.tsbundle !== "object" )
        throw new Error(`package.json needs a "tsbundle" property.\n${packageJsonPath}`)
    // Target file list from package.json.
    // Can be "tsbundle" property directly (if an array)
    // Otherwise will be "tsbundle.files" and config override will be "tsbundl"
    let files = packageData.tsbundle;
    let packageConfigOverride = {}
    if ( Array.isArray(packageData.tsbundle.files) ) {
        files = packageData.tsbundle.files
        packageConfigOverride = { ...packageData.tsbundle }
        delete packageConfigOverride.files
    }
    /**
     * Override order :
     * 1. Default config (from tsbundle defaults)
     * 2. Package config override (from package.json#tsbundle)
     * 3. File config (from file node in package.json)
     */
    const bundleConfig = {
        libraryName: packageData.name,
        ...tsBundleDefaultConfig,
        ...packageConfigOverride,
    }
    // Browse all files to compile, check validity and count total
    let total = 0
    let normalizedOutputs = []
    const normalizedFileConfigs = []
    for ( const fileConfig of files ) {
        // Override current config
        const currentConfig = {
            ...bundleConfig,
            ...fileConfig
        }
        // Extract properties
        let { output, formats } = currentConfig
        // Normalize output path
        const normalizedOutputPath = path.normalize( path.join( packageRoot, output ) )
        normalizedOutputs.push( normalizedOutputPath )
        // Check if output is valid to avoid destroying wrong folder !
        if (
            // No output or output as root
            !output || output === "/" || output === "./"
            // Invalid outputs
            || output.indexOf("node_modules") !== -1
            // Dist path can target a parent
            || output.indexOf("..") !== -1
            // Computed dist path is same as package root
            || normalizedOutputPath === path.normalize( packageRoot )
        )
            throw new Error(`Output ${output} should be into a sub-directory of package root.`)
        // Normalize input
        const input = path.normalize( path.join( packageRoot, currentConfig.input) )
        // Check input
        if ( !fs.existsSync(input) )
            throw new Error(`Input ${input} not found`)
        // Replace formats "default" string by defaults values
        if ( formats.find( s => s.toLowerCase() === "defaults") )
            formats = [
                ...tsBundleDefaultConfig.formats,
                ...formats.filter( s => s.toLowerCase() !== "defaults" )
            ]
        // Re-inject normalized properties into config object
        currentConfig.formats = formats
        currentConfig.output = output
        currentConfig.input = input

        // if ( typeof generateTypeDefinitions === "undefined" )
        //     currentConfig.generateTypeDefinitions = defaultGenerateTypeDefinitions
        //
        // if ( typeof reportGzipped === "undefined" )
        //     currentConfig.reportGzipped = defaultReportGzipped
        //
        // // Configs can cancel type definition exports
        // currentConfig.generateTypeDefinitions = (
        //     !('generateTypeDefinitions' in currentConfig)
        //     || currentConfig.generateTypeDefinitions === true
        // )
        normalizedFileConfigs.push( currentConfig )
        // Add total formats to total count
        total += formats.length
    }
    // Remove duplicates for output dist paths
    normalizedOutputs = normalizedOutputs.filter( exports.filterDuplicates )
    // Return normalized config
    // TODO : Normalize all input and outputs in files objects ?
    return {
        packageRoot, total, normalizedOutputs,
        files: normalizedFileConfigs,
    }
}

// ----------------------------------------------------------------------------- COMMON UTILS

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