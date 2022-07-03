import { Signal } from "@zouloux/signal"


async function asyncTest () {
	return 200;
}

export default function test <G> (...rest):Promise<G> {
	return new Promise<G>( async resolve => {

		const signal = Signal();
		signal.dispatch(12)
		signal.clear();

		const delay = await asyncTest()
		rest[0] ??= "default value"
		window.setTimeout(() => resolve(rest[0] as G), delay)
	})
}
