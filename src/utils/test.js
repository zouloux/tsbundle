const { execAsync } = require( "@solid-js/cli" );


exports.testLibrary = async function ( packageConfig, buildMinimumOutput = true ) {
	if ( !('test' in packageConfig.scripts) )
		return true;
	// TODO : Build only needed output
	//  -> buildMinimumOutput
	// FIXME : Does ora works ? It seems not ... How to do ? --no-ora ?
	return await execAsync(`npm run test`, 0, {
		cwd: packageConfig.packageRoot
	})
}
