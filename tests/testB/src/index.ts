
async function asyncTest () {
	return 200;
}

export function test <G> (...rest):Promise<G> {
	return new Promise<G>( async resolve => {
		const delay = await asyncTest()
		window.setTimeout(() => resolve(rest[0] as G), delay)
	})
}

