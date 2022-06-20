
export interface IIncludedType {
	test:boolean
}

export function includedMethod ():IIncludedType {
	return {
		test: true
	}
}