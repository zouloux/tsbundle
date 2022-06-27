import { includedMethod } from "./included";
export * from "./included"

import fs from "fs"

export function fromIndex ( base:number ) {
	const a = !!fs.rmSync
	return (a ? 1 : 0) + base + includedMethod().test
}

console.log( fromIndex(10) )