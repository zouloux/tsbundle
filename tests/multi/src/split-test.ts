// Test local dependencies with extension replacement
import { includedMethod } from "./included";
//export * from "./included"
import { zOrderTest } from "./z-order-test";
// Test with node lib
// import path from "path"
// TODO : Test with node_modules libs (should keep same input like node lib)


export function fromIndex ( base:number ) {
	// return `${path.join("a", "b")} ${base} ${includedMethod().test} ${zOrderTest()}`
	return `${base} ${includedMethod().test} ${zOrderTest()}`
}

console.log( fromIndex(10) )
