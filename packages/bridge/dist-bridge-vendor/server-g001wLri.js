//#region src/gateway/server.ts
async function loadServerImpl() {
	return await import("./server.impl-CrwguHCb.js");
}
async function startGatewayServer(...args) {
	return await (await loadServerImpl()).startGatewayServer(...args);
}
async function __resetModelCatalogCacheForTest() {
	(await loadServerImpl()).__resetModelCatalogCacheForTest();
}
//#endregion
export { startGatewayServer as n, __resetModelCatalogCacheForTest as t };
