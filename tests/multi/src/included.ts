
export interface IIncludedType {
	test:number
}

export function includedMethod ():IIncludedType {
	return {
		test: 42
	}
}

export function notIncludeded () {
	return "ok"
}