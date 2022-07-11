const path = require( "path" );
const { Directory, File, FileFinder } = require( "@solid-js/files" );
const { execAsync } = require( "@solid-js/cli" );
const { replaceImportsRegex, defaultTerserOptions } = require( "./utils/defaults" );
const fs = require("fs")
const { filterDuplicates, naiveHumanFileSize } = require( "./utils/common" );
const { bundleFiles } = require( "./utils/bundler" );
const zlib = require( "zlib" );
const chalk = require( "chalk" );


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
const targetBin = (packageRoot, bin) => {
	const binFromPackageRoot = path.join(packageRoot, 'node_modules', '.bin', bin)
	return (
		// From package node_modules if it exists
		fs.existsSync( binFromPackageRoot )
		? binFromPackageRoot
		// Otherwise, from tsbundle package node_modules
		: targetBuilderPath( 'node_modules', '.bin', bin )
	)
}

/**
 * Weight a file and return original + gzipped size
 */
async function gzipSize ( filePath ) {
	const content = await fs.promises.readFile( filePath )
	return [ content.length, zlib.gzipSync( content ).length ];
}


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
				(...rest) => {
					// console.log(rest)
					return (
						// If imported file exists in all renamed files
						// Or, if we target a file which is compiled from another target
						// we check if it starts with ./. Otherwise, it's a node_module
						( baseNames.indexOf(rest[3]) === -1 && rest[2] !== "./")
						// Keep original (certainly on node_module)
						? rest[0]
						// Target file with same extension and es-level
						: `${rest[1]} "${rest[2]}${rest[3]}${extension}"`
					)
				}
			)
		)
		await file.save();
	}
	return {
		input: javascriptFiles,
		output: renamedJavascriptFiles,
	}
}

exports.buildPackage = async function ( packageConfig, progressHandler ) {
	// Prepare
	if ( !progressHandler ) progressHandler = () => {}
	let currentStep = 0
	progressHandler("Cleaning", currentStep)
	await exports.cleanOutputs( packageConfig )
	const outputPath = targetBuilderPath('tmp')
	const reports = []
	// Browse files to compile
	for ( const fileConfig of packageConfig.files ) {
		// Browse formats for this file
		let isFirstFormat = true
		for ( const format of fileConfig.formats ) {
			// Reset temp directory and prepare tsconfig for this file
			await exports.resetTmpDirectory();
			progressHandler("Preparing", ++currentStep)
			const [ tsConfigPath, deleteTsConfig ] = await exports.createTsConfigForProject(
				packageConfig.packageRoot, fileConfig.input, outputPath
			);
			// Split parts
			const split = format.toLowerCase().split(".")
			if ( split.length < 2 ) {
				await deleteTsConfig();
				throw new Error(`format ${format} is invalid. It should have at least es-format and module type as for ex : es2015.cjs`)
			}
			// Target is at first
			const target = split[0]
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
				throw new Error(`Format ${format} is invalid. Extension should be .cjs / .js or .mjs`)
			}
			// If we need to minify and bundle output to one compressed file
			// .min is always before extension and after format
			const bundleAndMinifyOutput = split.length > 2 && split[ split.length - 2 ] === "min"
			if ( bundleAndMinifyOutput && module !== "commonjs" )
				throw new Error(`Config error for ${path.basename(fileConfig.input)}. Only .min.js extension is allowed to create bundles.`)
			// Target main output file (the file generated by entry point)
			const moduleExtension = `.${target}.${extension}`
			const entryPointName = path.parse( fileConfig.input ).name
			//const mainOutputFilePath = path.join( outputPath, entryPointName + moduleExtension )
			// Progress
			progressHandler(`Compiling ${path.basename(fileConfig.input)} - ${format}`, ++currentStep)
			// Split format to get composite info
			// Create tsc compile command
			const tscCommand = [
				targetBin(packageConfig.packageRoot, 'tsc'),
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
				await execAsync( tscCommand, 3 );
			}
			catch ( e ) {
				await deleteTsConfig();
				throw new Error(`Typescript error detected for ${path.basename(fileConfig.input)} - ${format}`, { cause: e })
			}
			await deleteTsConfig();
			const distOutput = path.join( packageConfig.packageRoot, fileConfig.output );
			let minifiedFilePath
			let fileSizes = [ 0, 0 ]
			// If we need to bundle and minify output
			let generatedFiles = []
			let outputFileName = entryPointName + '.' + format
			if ( bundleAndMinifyOutput ) {
				if ( fileConfig.outName )
					outputFileName = fileConfig.outName + '.' + format
				minifiedFilePath = path.join( outputPath, outputFileName )
				progressHandler(`Bundling ${path.basename(minifiedFilePath)}`, ++currentStep);
				generatedFiles = (await exports.patchPathsAndRenameExportedFiles( outputPath, '' )).output;
				// Include generated files
				if ( typeof fileConfig.include === "object" ) {
					const normalizedIncludedFilePaths = Object.keys( fileConfig.include )
						.map( key => {
							const filePath = fileConfig.include[ key ]
							const normalized = path.normalize( path.join( packageConfig.packageRoot, filePath))
							fileConfig.include[ key ] = normalized
							return normalized;
						})
					generatedFiles = [
						...generatedFiles,
						...normalizedIncludedFilePaths
					]
				}
				const mainInputPath = path.join( outputPath, entryPointName )
				await bundleFiles( generatedFiles, mainInputPath, minifiedFilePath, fileConfig.libraryName, fileConfig.exportMap, fileConfig.include )
				// Compress and minify output
				progressHandler(`Compressing ${path.basename(minifiedFilePath)}`, ++currentStep)
				const terserCommand = [
					targetBin(packageConfig.packageRoot, 'terser'),
					...defaultTerserOptions,
					// Override bundled file
					`-o ${ minifiedFilePath }`,
					`-- ${ minifiedFilePath }`
				].join(" ")
				// console.log( terserCommand );process.exit();
				// Execute terser command
				try {
					await execAsync( terserCommand, 3 );
				}
				catch ( e ) {
					throw new Error(`Terser error detected for ${minifiedFilePath}`, { cause: e })
				}
				// Weight bundled output before moving it
				fileSizes = await gzipSize( minifiedFilePath )
				// Export to output path
				// Move minified
				progressHandler(`Exporting ${path.basename(minifiedFilePath)} to ${ fileConfig.output }`, ++currentStep)
				const outputDirectory = new Directory( distOutput )
				await outputDirectory.ensureParents()
				await fs.promises.rename(
					minifiedFilePath,
					path.join( distOutput, path.basename(minifiedFilePath) )
				)
			}
			else {
				// Match same amount of steps than minifying
				currentStep += 2
				progressHandler(`Exporting ${path.basename(fileConfig.input)} to ${ fileConfig.output }`, ++currentStep)
				// Patch extensions of files and patch extensions in require / imports
				generatedFiles = (await exports.patchPathsAndRenameExportedFiles( outputPath, moduleExtension )).output
				// Weight generated files before moving them
				for ( const file of generatedFiles ) {
					const size = await gzipSize( file )
					fileSizes[0] += size[0]
					fileSizes[1] += size[1]
				}
				// Move all files to dist output
				const directory = new Directory( outputPath )
				const children = await directory.children('all')
				for ( const fileEntity of children )
					await fileEntity.copyTo( distOutput + '/' )
			}
			// Always reset tmp directory before and after build, to keep things tidy
			await exports.resetTmpDirectory();
			// Generate report for this format
			const report = [
				// Input
				path.relative( packageConfig.packageRoot, fileConfig.input ),
				// Module & target
				module, target,
				// Output
				path.join( fileConfig.output, outputFileName ),
			]
			// Additional bundled files
			report.push(
				`${generatedFiles.length} file${generatedFiles.length > 1 ? 's' : ''} ${bundleAndMinifyOutput ? chalk.magenta('bundle') : chalk.green('flat')}`
			)
			// Export bit svg file for this format
			if ( fileConfig.exportBits ) {
				const bitPath = path.join( packageConfig.packageRoot, 'bits', `${outputFileName}.svg` )
				const svgBitFile = new File( bitPath );
				const sizeContent = naiveHumanFileSize( fileSizes[1] )
				svgBitFile.content( () => [
					`<svg width="${sizeContent.length * 10}" height="22" xmlns="http://www.w3.org/2000/svg">`,
					`<text y="21" font-size="16px" font-family="monospace" fill="green">${sizeContent}</text>`,
					`</svg>`,
				].join(""))
				await svgBitFile.ensureParents()
				await svgBitFile.save();
			}
			// Add sizes
			reports.push([
				...report,
				...fileSizes
					.map( naiveHumanFileSize )
					.map( (s, i) => bundleAndMinifyOutput || !i ? s : `-` )
					.map( (s, i) => i === 0 ? chalk.cyan( s ) : chalk.cyan.bold( s ) )
			])
		}
	}
	return reports
}