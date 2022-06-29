
(function () {
	const _registry = {}
	const define = ( modulePath, factory ) => _registry[ modulePath ] = factory
	function require ( modulePath ) {
		const moduleFactory = _registry[ modulePath ]
		if ( typeof moduleFactory === "function" ) {
			let module = {}
			let exports = {}
			moduleFactory( module, exports );
			_registry[ modulePath ] = { ...exports, ...module.exports }
		}
		return _registry[ modulePath ];
	}
	define("./split-test.es2017.cjs", (module, exports) => {
		"use strict";
		Object.defineProperty(exports, "__esModule", { value: true });
		exports.fromIndex = void 0;
		// Test local dependencies with extension replacement
		const included_1 = require("./included.es2017.cjs");
		//export * from "./included.es2017.cjs"
		const z_order_test_1 = require("./z-order-test.es2017.cjs");
		// Test with node lib
		// import path from "path"
		// TODO : Test with node_modules libs (should keep same input like node lib)
		function fromIndex(base) {
			// return `${path.join("a", "b")} ${base} ${includedMethod().test} ${zOrderTest()}`
			return `${base} ${(0, included_1.includedMethod)().test} ${(0, z_order_test_1.zOrderTest)()}`;
		}
		exports.fromIndex = fromIndex;
		console.log(fromIndex(10));
	});
	define("./included.es2017.cjs", (module, exports) => {
		"use strict";
		Object.defineProperty(exports, "__esModule", { value: true });
		exports.notIncludeded = exports.includedMethod = void 0;
		function includedMethod() {
			return {
				test: 42
			};
		}
		exports.includedMethod = includedMethod;
		function notIncludeded() {
			return "ok";
		}
		exports.notIncludeded = notIncludeded;
	});
	define("./z-order-test.es2017.cjs", (module, exports) => {
		"use strict";
		Object.defineProperty(exports, "__esModule", { value: true });
		exports.zOrderTest = void 0;
		function zOrderTest() {
			return 1;
		}
		exports.zOrderTest = zOrderTest;
	})
	require("./split-test.es2017.cjs");
})()
