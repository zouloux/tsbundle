



export function standaloneTest () {
	return new Promise<void>( resolve => {
		window.setTimeout( () => resolve(), 200 )
	})
}


// TODO : Require from node_modules test
//			- Test with included (inlined into dist as a single .js)
//			- Test with linked (require / import)

