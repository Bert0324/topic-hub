//#region src/shared/runtime-import.ts
async function importRuntimeModule(baseUrl, parts) {
	return await import(new URL(parts.join(""), baseUrl).href);
}
//#endregion
export { importRuntimeModule as t };
