import type { IncomingMessage, Server as HttpServer, ServerResponse } from "node:http";
import { WebSocketServer } from "ws";
import { CANVAS_HOST_PATH } from "../canvas-host/a2ui.js";
import { type CanvasHostHandler, createCanvasHostHandler } from "../canvas-host/server.js";
import type { CliDeps } from "../cli/deps.types.js";
import type { createSubsystemLogger } from "../logging/subsystem.js";
import type { PluginRegistry } from "../plugins/registry.js";
import {
  pinActivePluginChannelRegistry,
  pinActivePluginHttpRouteRegistry,
  releasePinnedPluginChannelRegistry,
  releasePinnedPluginHttpRouteRegistry,
  resolveActivePluginHttpRouteRegistry,
} from "../plugins/runtime.js";
import type { RuntimeEnv } from "../runtime.js";
import type { AuthRateLimiter } from "./auth-rate-limit.js";
import type { ResolvedGatewayAuth } from "./auth.js";
import type { ChatAbortControllerEntry } from "./chat-abort.js";
import type { ControlUiRootState } from "./control-ui.js";
import type { HooksConfigResolved } from "./hooks.js";
import { isLoopbackHost, resolveGatewayListenHosts } from "./net.js";
import type { GatewayBroadcastFn, GatewayBroadcastToConnIdsFn } from "./server-broadcast-types.js";
import { createGatewayBroadcaster } from "./server-broadcast.js";
import {
  type ChatRunEntry,
  createChatRunState,
  createToolEventRecipientRegistry,
} from "./server-chat.js";
import { MAX_PREAUTH_PAYLOAD_BYTES } from "./server-constants.js";
import {
  attachGatewayUpgradeHandler,
  createAsyncGatewayHttpRequestHandler,
  createGatewayHttpServer,
  stripGatewayEmbedPathPrefixFromUrl,
  type HookClientIpConfig,
} from "./server-http.js";
import type { DedupeEntry } from "./server-shared.js";
import { createGatewayHooksRequestHandler } from "./server/hooks.js";
import { listenGatewayHttpServer } from "./server/http-listen.js";
import {
  createGatewayPluginRequestHandler,
  shouldEnforceGatewayAuthForPluginPath,
  type PluginRoutePathContext,
} from "./server/plugins-http.js";
import {
  createPreauthConnectionBudget,
  type PreauthConnectionBudget,
} from "./server/preauth-connection-budget.js";
import type { ReadinessChecker } from "./server/readiness.js";
import type { GatewayTlsRuntime } from "./server/tls.js";
import type { GatewayWsClient } from "./server/ws-types.js";

export async function createGatewayRuntimeState(params: {
  cfg: import("../config/config.js").OpenClawConfig;
  bindHost: string;
  port: number;
  controlUiEnabled: boolean;
  controlUiBasePath: string;
  controlUiRoot?: ControlUiRootState;
  openAiChatCompletionsEnabled: boolean;
  openAiChatCompletionsConfig?: import("../config/types.gateway.js").GatewayHttpChatCompletionsConfig;
  openResponsesEnabled: boolean;
  openResponsesConfig?: import("../config/types.gateway.js").GatewayHttpResponsesConfig;
  strictTransportSecurityHeader?: string;
  resolvedAuth: ResolvedGatewayAuth;
  /** Optional rate limiter for auth brute-force protection. */
  rateLimiter?: AuthRateLimiter;
  gatewayTls?: GatewayTlsRuntime;
  hooksConfig: () => HooksConfigResolved | null;
  getHookClientIpConfig: () => HookClientIpConfig;
  pluginRegistry: PluginRegistry;
  pinChannelRegistry?: boolean;
  deps: CliDeps;
  canvasRuntime: RuntimeEnv;
  canvasHostEnabled: boolean;
  allowCanvasHostInTests?: boolean;
  logCanvas: { info: (msg: string) => void; warn: (msg: string) => void };
  log: { info: (msg: string) => void; warn: (msg: string) => void };
  logHooks: ReturnType<typeof createSubsystemLogger>;
  logPlugins: ReturnType<typeof createSubsystemLogger>;
  getReadiness?: ReadinessChecker;
  /** When set, bind gateway HTTP/WS to this existing server under pathPrefix (no extra listen). */
  embed?: {
    parentHttpServer: HttpServer;
    pathPrefix: string;
  };
}): Promise<{
  canvasHost: CanvasHostHandler | null;
  releasePluginRouteRegistry: () => void;
  httpServer: HttpServer;
  httpServers: HttpServer[];
  httpBindHosts: string[];
  wss: WebSocketServer;
  preauthConnectionBudget: PreauthConnectionBudget;
  clients: Set<GatewayWsClient>;
  broadcast: GatewayBroadcastFn;
  broadcastToConnIds: GatewayBroadcastToConnIdsFn;
  agentRunSeq: Map<string, number>;
  dedupe: Map<string, DedupeEntry>;
  chatRunState: ReturnType<typeof createChatRunState>;
  chatRunBuffers: Map<string, string>;
  chatDeltaSentAt: Map<string, number>;
  chatDeltaLastBroadcastLen: Map<string, number>;
  addChatRun: (sessionId: string, entry: ChatRunEntry) => void;
  removeChatRun: (
    sessionId: string,
    clientRunId: string,
    sessionKey?: string,
  ) => ChatRunEntry | undefined;
  chatAbortControllers: Map<string, ChatAbortControllerEntry>;
  toolEventRecipients: ReturnType<typeof createToolEventRecipientRegistry>;
  /** Present when `embed` was used; call on shutdown before closing gateway state. */
  embedHttpDetach?: () => void;
}> {
  pinActivePluginHttpRouteRegistry(params.pluginRegistry);
  if (params.pinChannelRegistry !== false) {
    pinActivePluginChannelRegistry(params.pluginRegistry);
  } else {
    releasePinnedPluginChannelRegistry();
  }
  try {
    let canvasHost: CanvasHostHandler | null = null;
    if (params.canvasHostEnabled) {
      try {
        const handler = await createCanvasHostHandler({
          runtime: params.canvasRuntime,
          rootDir: params.cfg.canvasHost?.root,
          basePath: CANVAS_HOST_PATH,
          allowInTests: params.allowCanvasHostInTests,
          liveReload: params.cfg.canvasHost?.liveReload,
        });
        if (handler.rootDir) {
          canvasHost = handler;
          params.logCanvas.info(
            `canvas host mounted at http://${params.bindHost}:${params.port}${CANVAS_HOST_PATH}/ (root ${handler.rootDir})`,
          );
        }
      } catch (err) {
        params.logCanvas.warn(`canvas host failed to start: ${String(err)}`);
      }
    }

    const clients = new Set<GatewayWsClient>();
    const { broadcast, broadcastToConnIds } = createGatewayBroadcaster({ clients });

    const handleHooksRequest = createGatewayHooksRequestHandler({
      deps: params.deps,
      getHooksConfig: params.hooksConfig,
      getClientIpConfig: params.getHookClientIpConfig,
      bindHost: params.bindHost,
      port: params.port,
      logHooks: params.logHooks,
    });

    const handlePluginRequest = createGatewayPluginRequestHandler({
      registry: params.pluginRegistry,
      log: params.logPlugins,
    });
    const shouldEnforcePluginGatewayAuth = (pathContext: PluginRoutePathContext): boolean => {
      return shouldEnforceGatewayAuthForPluginPath(
        resolveActivePluginHttpRouteRegistry(params.pluginRegistry),
        pathContext,
      );
    };

    if (params.cfg.gateway?.controlUi?.dangerouslyAllowHostHeaderOriginFallback === true) {
      params.log.warn(
        "⚠️  gateway.controlUi.dangerouslyAllowHostHeaderOriginFallback=true is enabled. " +
          "Host-header origin fallback weakens origin checks and should only be used as break-glass.",
      );
    }

    const listenerOpts = {
      canvasHost,
      clients,
      controlUiEnabled: params.controlUiEnabled,
      controlUiBasePath: params.controlUiBasePath,
      controlUiRoot: params.controlUiRoot,
      openAiChatCompletionsEnabled: params.openAiChatCompletionsEnabled,
      openAiChatCompletionsConfig: params.openAiChatCompletionsConfig,
      openResponsesEnabled: params.openResponsesEnabled,
      openResponsesConfig: params.openResponsesConfig,
      strictTransportSecurityHeader: params.strictTransportSecurityHeader,
      handleHooksRequest,
      handlePluginRequest,
      shouldEnforcePluginGatewayAuth,
      resolvedAuth: params.resolvedAuth,
      rateLimiter: params.rateLimiter,
      getReadiness: params.getReadiness,
    };

    const httpServers: HttpServer[] = [];
    const httpBindHosts: string[] = [];
    let httpServer: HttpServer;
    let embedHttpDetach: (() => void) | undefined;

    const wss = new WebSocketServer({
      noServer: true,
      maxPayload: MAX_PREAUTH_PAYLOAD_BYTES,
    });
    const preauthConnectionBudget = createPreauthConnectionBudget();

    if (params.embed) {
      params.log.info("embedding gateway HTTP/WS into parent server (path prefix)…");
      const pathPrefix = params.embed.pathPrefix;
      const parent = params.embed.parentHttpServer;
      const asyncGateway = createAsyncGatewayHttpRequestHandler(listenerOpts);
      type RequestListener = (req: IncomingMessage, res: ServerResponse) => void;
      const existingListeners = parent.listeners("request").slice() as RequestListener[];

      /**
       * A prepended `request` listener runs before Express but still yields at the first
       * `await` inside the gateway, so Node continues to the next listener and Express can
       * send 404 while the gateway is still handling the body — causing ERR_HTTP_HEADERS_SENT.
       * Replace the listener chain with a single combinator: await gateway for prefixed
       * paths, then fall through to the captured host listeners only if no response was sent.
       */
      const combinedRequestListener: RequestListener = (req, res) => {
        if ((req.headers.upgrade ?? "").toLowerCase() === "websocket") {
          for (const fn of existingListeners) {
            fn(req, res);
          }
          return;
        }
        const raw = req.url ?? "/";
        const stripped = stripGatewayEmbedPathPrefixFromUrl(raw, pathPrefix);
        if (!stripped.matched) {
          for (const fn of existingListeners) {
            fn(req, res);
          }
          return;
        }
        const prevUrl = req.url;
        req.url = `${stripped.pathname}${stripped.search}`;
        void (async () => {
          try {
            await asyncGateway(req, res);
          } catch (err) {
            console.error("[gateway-http] embedded gateway request failed:", err);
          } finally {
            req.url = prevUrl;
          }
          if (!res.writableEnded && !res.headersSent) {
            for (const fn of existingListeners) {
              fn(req, res);
            }
          }
        })();
      };

      parent.removeAllListeners("request");
      parent.on("request", combinedRequestListener);
      const detachUpgrade = attachGatewayUpgradeHandler({
        httpServer: parent,
        wss,
        canvasHost,
        clients,
        preauthConnectionBudget,
        resolvedAuth: params.resolvedAuth,
        rateLimiter: params.rateLimiter,
        pathPrefix,
      });
      embedHttpDetach = () => {
        parent.removeListener("request", combinedRequestListener);
        for (const fn of existingListeners) {
          parent.on("request", fn);
        }
        detachUpgrade();
      };
      httpServer = params.embed.parentHttpServer;
      httpServers.push(httpServer);
      httpBindHosts.push("embedded");
    } else {
      const bindHosts = await resolveGatewayListenHosts(params.bindHost);
      if (!isLoopbackHost(params.bindHost)) {
        params.log.warn(
          "⚠️  Gateway is binding to a non-loopback address. " +
            "Ensure authentication is configured before exposing to public networks.",
        );
      }
      for (const host of bindHosts) {
        const srv = createGatewayHttpServer({
          ...listenerOpts,
          tlsOptions: params.gatewayTls?.enabled ? params.gatewayTls.tlsOptions : undefined,
        });
        try {
          await listenGatewayHttpServer({
            httpServer: srv,
            bindHost: host,
            port: params.port,
          });
          httpServers.push(srv);
          httpBindHosts.push(host);
        } catch (err) {
          if (host === bindHosts[0]) {
            throw err;
          }
          params.log.warn(
            `gateway: failed to bind loopback alias ${host}:${params.port} (${String(err)})`,
          );
        }
      }
      httpServer = httpServers[0]!;
      if (!httpServer) {
        throw new Error("Gateway HTTP server failed to start");
      }
      for (const server of httpServers) {
        attachGatewayUpgradeHandler({
          httpServer: server,
          wss,
          canvasHost,
          clients,
          preauthConnectionBudget,
          resolvedAuth: params.resolvedAuth,
          rateLimiter: params.rateLimiter,
        });
      }
    }

    const agentRunSeq = new Map<string, number>();
    const dedupe = new Map<string, DedupeEntry>();
    const chatRunState = createChatRunState();
    const chatRunRegistry = chatRunState.registry;
    const chatRunBuffers = chatRunState.buffers;
    const chatDeltaSentAt = chatRunState.deltaSentAt;
    const chatDeltaLastBroadcastLen = chatRunState.deltaLastBroadcastLen;
    const addChatRun = chatRunRegistry.add;
    const removeChatRun = chatRunRegistry.remove;
    const chatAbortControllers = new Map<string, ChatAbortControllerEntry>();
    const toolEventRecipients = createToolEventRecipientRegistry();

    return {
      canvasHost,
      releasePluginRouteRegistry: () => {
        // Releases both pinned HTTP-route and channel registries set at startup.
        releasePinnedPluginHttpRouteRegistry(params.pluginRegistry);
        // Release unconditionally (no registry arg): the channel pin may have
        // been re-pinned to a deferred-reload registry that differs from the
        // original params.pluginRegistry, so an identity-guarded release would
        // be a no-op and leak the pin across in-process restarts.
        releasePinnedPluginChannelRegistry();
      },
      httpServer,
      httpServers,
      httpBindHosts,
      wss,
      preauthConnectionBudget,
      clients,
      broadcast,
      broadcastToConnIds,
      agentRunSeq,
      dedupe,
      chatRunState,
      chatRunBuffers,
      chatDeltaSentAt,
      chatDeltaLastBroadcastLen,
      addChatRun,
      removeChatRun,
      chatAbortControllers,
      toolEventRecipients,
      ...(embedHttpDetach ? { embedHttpDetach } : {}),
    };
  } catch (err) {
    releasePinnedPluginHttpRouteRegistry(params.pluginRegistry);
    releasePinnedPluginChannelRegistry();
    throw err;
  }
}
