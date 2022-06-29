const path = require( "path" );
const { Directory, File, FileFinder } = require( "@solid-js/files" );
const { execSync, execAsync } = require( "@solid-js/cli" );
const { replaceImportsRegex, defaultTerserOptions } = require( "./utils/defaults" );
const fs = require("fs")
const { filterDuplicates } = require( "./utils/common" );
const { bundleFiles } = require( "./utils/bundler" );


/**
 * Target a path from tsbundle package's root.
 * Arguments are path parts.
 * Ex : targetBuilderPath('tmp', 'tsconfig.json)
 */
function targetBuilderPath ( ...parts ) {
	const tsBundleRoot = path.normalize( path.join(__dirname, '../') )
	return path.join( tsBundleRoot, ...parts )
}

/**
 * Target a bin
 */
const targetBin = (bin) => targetBuilderPath( 'node_modules', '.bin', bin )

/**
 * Ensure, create and clean temp directory.
 */
exports.resetTmpDirectory = async function () {
	const dir = new Directory( targetBuilderPath('tmp') )
	await dir.ensureParents()
	await dir.clean()
}

/**
 * Create tsconfig file for a project.
 * Will be created into tmp folder.
 */
exports.createTsConfigForProject = async function ( packageRootPath, input, output ) {
	// Create a temporary tsconfig file for this package
	// and save it at tsbundle package's root
	const tsConfigPath = targetBuilderPath('tmp', 'tsconfig.json')
	const tsconfigFile = new File( tsConfigPath )
	tsconfigFile.json({
		"extends": "../tsconfig.json",
		"include": [ input ],
		"exclude" : [
			path.join(packageRootPath, "node_modules")
		],
		"compilerOptions" : {
			"outDir" : output
		}
	})
	await tsconfigFile.save()
	return [
		// Return ts config path
		tsConfigPath,
		// And a function which will delete the temp tsconfig file
		() => tsconfigFile.delete()
	]
}

/**
 * Clean generated outputs from normalized package outputs paths.
 */
exports.cleanOutputs = async function ( packageConfig ) {
	for ( const output of packageConfig.normalizedOutputs ) {
		const outputDirectory = new Directory( output )
		await outputDirectory.clean()
	}
}

/**
 * Patch require and imports of all js files into a directory.
 * Will replace with "extension" argument.
 * Will use "replaceImportsRegex" regex from "defaults" file.
 * JS Files will be also renamed following "extension" argument.
 * Ex : "${rootDir}/index.js" containing a require("./dependency")
 * Will be replaced by require("./dependency.es2020.cjs")
 * if extension = ".es2020.cjs"
 */
exports.patchPathsAndRenameExportedFiles = async function ( rootDir, extension ) {
	// Target files
	const javascriptFiles = await FileFinder.list( path.join(rootDir, '**/*.js') )
	// Rename files
	const renamedJavascriptFiles = []
	for ( const file of javascriptFiles ) {
		const newFileName = file.replace('.js', extension)
		renamedJavascriptFiles.push( newFileName )
		await fs.promises.rename( file, newFileName )
	}
	// Get all unique file names to detect if a file is imported or a node dependency or node_modules
	const baseNames = javascriptFiles.map( p => path.parse(p).name ).filter( filterDuplicates )
	// Browser all renamed files and
	for ( const destination of renamedJavascriptFiles ) {
		// Open and load file
		const file = new File( destination )
		await file.load();
		// Replace content by detecting imports / requires of local file dependencies
		file.content(
			c => c.replaceAll(
				replaceImportsRegex,
				(...rest) => (
					( baseNames.indexOf(rest[3]) === -1)
					? rest[0]
					: `${rest[1]} "${rest[2]}${rest[3]}${extension}"`
				)
			)
		)
		await file.save();
	}
	return [ javascriptFiles, renamedJavascriptFiles ]
}

exports.buildPackage = async function ( packageConfig, progressHandler ) {
	if ( !progressHandler ) progressHandler = () => {}
	// Prepare tmp
	let currentStep = 0
	progressHandler("Cleaning", currentStep)
	await exports.cleanOutputs( packageConfig )
	const outputPath = targetBuilderPath('tmp')
	// Browse files to compile
	for ( const fileConfig of packageConfig.files ) {
		let isFirstFormat = true
		for ( const format of fileConfig.formats ) {
			// Reset temp directory and prepare tsconfig for this file
			await exports.resetTmpDirectory();
			progressHandler("Preparing ts config", ++currentStep)
			const [ tsConfigPath, deleteTsConfig ] = await exports.createTsConfigForProject(
				packageConfig.packageRoot, fileConfig.input, outputPath
			);
			// Split parts
			const split = format.split(".")
			if ( split.length < 2 ) {
				await deleteTsConfig();
				throw new Error(`format ${format} is invalid. It should have at least es-format and module type as for ex : es2015.cjs`)
			}
			// Target is at first, force case
			const target = split[0].toLowerCase()
			// Find extension as the last piece
			let extension = split[ split.length - 1 ]
			// Guess module from extension
			// CommonJS modules if cjs or min.js extension
			let module
			if ( extension === "cjs" || extension === "js" ) {
				module = "commonjs"
				extension = "cjs"
			}
			// ExNext modules if mjs.
			else if ( extension === "mjs" )
				module = "esnext"
			// We do not care about any other module system
			else {
				await deleteTsConfig();
				throw new Error(`format ${format} is invalid. Extension should be .cjs / .js or .mjs`)
			}
			// If we need to minify and bundle output to one compressed file
			// .min is always before extension and after format
			const bundleAndMinifyOutput = split.length > 2 && split[ split.length - 2 ].toLowerCase() === "min"
			// Target main output file (the file generated by entry point)
			const moduleExtension = `.${target}.${extension}`
			const entryPointName = path.parse( fileConfig.input ).name
			//const mainOutputFilePath = path.join( outputPath, entryPointName + moduleExtension )
			// Progress
			progressHandler(`Compiling ${path.basename(fileConfig.input)}`, ++currentStep)
			// Split format to get composite info
			// Create tsc compile command
			const tscCommand = [
				targetBin('tsc'),
				`-p ${tsConfigPath}`,
				// Export declaration only at first pass.
				`--declaration ${isFirstFormat && fileConfig.generateTypeDefinitions ? 'true' : 'false'}`,
				`--module ${module}`,
				`--target ${target}`,
				// TODO : Load from tsconfig, should be overridable by project
				// FIXME : DOM should not be here
				`--lib DOM,${target}`
			].join(" ")
			isFirstFormat = false
			// Execute tsc command
			try {
				await execAsync( tscCommand );
			}
			catch ( e ) {
				await deleteTsConfig();
				throw new Error(`Typescript error detected`, { cause: e })
			}
			await deleteTsConfig();
			const distOutput = path.join( packageConfig.packageRoot, fileConfig.output );
			// If we need to bundle and minify output
			if ( bundleAndMinifyOutput ) {
				const [ inputFiles, generatedFiles ] = await exports.patchPathsAndRenameExportedFiles( outputPath, '' );
				const minifiedFilePath = path.join( outputPath, entryPointName + '.' + format )
				const mainInputPath = path.join( outputPath, entryPointName )
				progressHandler(`Bundling ${path.basename(fileConfig.input)}`, ++currentStep)
				await bundleFiles( generatedFiles, mainInputPath, minifiedFilePath, fileConfig.libraryName )
				// Compress and minify output
				progressHandler(`Compressing ${path.basename(fileConfig.input)}`, ++currentStep)
				const terserCommand = [
					targetBin('terser'),
					...defaultTerserOptions,
					// Override bundled file
					`-o ${ minifiedFilePath }`,
					`-- ${ minifiedFilePath }`
				].join(" ")
				// Execute terser command
				try {
					await execAsync( terserCommand );
				}
				catch ( e ) {
					throw new Error(`Terser error detected`, { cause: e })
				}
				// Export to output path
				// Move minified
				await fs.promises.rename(
					minifiedFilePath,
					path.join( distOutput, path.basename(minifiedFilePath) )
				)
			}
			else {
				// Patch extensions of files and patch extensions in require / imports
				await exports.patchPathsAndRenameExportedFiles( outputPath, moduleExtension );
				// Move all files to dist output
				const directory = new Directory( outputPath )
				const children = await directory.children('all')
				for ( const fileEntity of children )
					await fileEntity.copyTo( distOutput + '/' )
			}
			await exports.resetTmpDirectory();
			// TODO : Stats
			// TODO : + Gzip stat for all files
		}
	}
}