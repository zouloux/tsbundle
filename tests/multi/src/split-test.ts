import { includedMethod } from "./included";
export * from "./included"
export function fromIndex () {
	return 42 + includedMethod().test
}