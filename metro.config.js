const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const SHIM = path.resolve(__dirname, "shims", "react-native-web-codegen.js");
const UIMANAGER_SHIM = path.resolve(__dirname, "shims", "react-native-web-uimanager.js");

const config = getDefaultConfig(__dirname);
const defaultResolveRequest = config.resolver.resolveRequest;

// On web, Expo rewrites "react-native" imports to react-native-web (e.g. "react-native-web/dist/index"
// or per-export paths). Native packages that import codegenNativeComponent / codegenNativeCommands
// from "react-native" (react-native-maps, react-native-svg, gesture-handler) would crash on web.
// These hooks route those imports to shims in ./shims that patch react-native-web for web only.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const isShimOrigin =
    context.originModulePath === SHIM || context.originModulePath === UIMANAGER_SHIM;

  if (platform === "web" && !isShimOrigin) {
    if (
      moduleName === "react-native" ||
      moduleName === "react-native-web" ||
      moduleName === "react-native-web/dist/index"
    ) {
      return { type: "sourceFile", filePath: SHIM };
    }
    if (moduleName === "react-native-web/dist/exports/UIManager") {
      return { type: "sourceFile", filePath: UIMANAGER_SHIM };
    }
  }

  return defaultResolveRequest
    ? defaultResolveRequest(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
