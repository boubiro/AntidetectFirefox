/* -*- Mode: indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* vim: set sts=2 sw=2 et tw=80: */
"use strict";

XPCOMUtils.defineLazyServiceGetter(this, "handlerService",
                                   "@mozilla.org/uriloader/handler-service;1",
                                   "nsIHandlerService");
XPCOMUtils.defineLazyServiceGetter(this, "protocolService",
                                   "@mozilla.org/uriloader/external-protocol-service;1",
                                   "nsIExternalProtocolService");
Cu.importGlobalProperties(["URL"]);

const handlers = new WeakMap();

function hasHandlerApp(handlerConfig) {
  let protoInfo = protocolService.getProtocolHandlerInfo(handlerConfig.protocol);
  let appHandlers = protoInfo.possibleApplicationHandlers;
  for (let i = 0; i < appHandlers.length; i++) {
    let handler = appHandlers.queryElementAt(i, Ci.nsISupports);
    if (handler instanceof Ci.nsIWebHandlerApp &&
        handler.uriTemplate === handlerConfig.uriTemplate) {
      return true;
    }
  }
  return false;
}

/* eslint-disable mozilla/balanced-listeners */
extensions.on("manifest_protocol_handlers", (type, directive, extension, manifest) => {
  for (let handlerConfig of manifest.protocol_handlers) {
    if (hasHandlerApp(handlerConfig)) {
      continue;
    }

    let handler = Cc["@mozilla.org/uriloader/web-handler-app;1"]
                    .createInstance(Ci.nsIWebHandlerApp);
    handler.name = handlerConfig.name;
    handler.uriTemplate = handlerConfig.uriTemplate;

    let protoInfo = protocolService.getProtocolHandlerInfo(handlerConfig.protocol);
    protoInfo.possibleApplicationHandlers.appendElement(handler, false);
    handlerService.store(protoInfo);
  }
  handlers.set(extension, manifest.protocol_handlers);
});

extensions.on("shutdown", (type, extension) => {
  if (!handlers.has(extension) || extension.shutdownReason === "APP_SHUTDOWN") {
    return;
  }
  for (let handlerConfig of handlers.get(extension)) {
    let protoInfo = protocolService.getProtocolHandlerInfo(handlerConfig.protocol);
    let appHandlers = protoInfo.possibleApplicationHandlers;
    for (let i = 0; i < appHandlers.length; i++) {
      let handler = appHandlers.queryElementAt(i, Ci.nsISupports);
      if (handler instanceof Ci.nsIWebHandlerApp &&
          handler.uriTemplate === handlerConfig.uriTemplate) {
        appHandlers.removeElementAt(i);
        if (protoInfo.preferredApplicationHandler === handler) {
          protoInfo.preferredApplicationHandler = null;
          protoInfo.alwaysAskBeforeHandling = true;
        }
        handlerService.store(protoInfo);
        break;
      }
    }
  }
  handlers.delete(extension);
});
