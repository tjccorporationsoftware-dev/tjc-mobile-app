// Web-only shim: react-native-web has no `codegenNativeComponent` / `codegenNativeCommands`.
// Native packages (react-native-maps specs, react-native-svg fabric specs, gesture-handler specs)
// import them from "react-native", which Expo aliases to react-native-web on web, and the
// call crashes at load time. This re-exports react-native-web and adds stubs.
// Wired up in metro.config.js (web platform only). Native builds never load this file.
const React = require("react");
// Relative path (not "react-native-web") so the resolver hook does not loop back here.
const RNW = require("../node_modules/react-native-web/dist/cjs/index.js");

function codegenNativeComponent(_componentName, _options) {
  // Native specs are meaningless on web. Render a plain View instead.
  return React.forwardRef(function CodegenStub(props, ref) {
    return React.createElement(RNW.View, { ...props, ref });
  });
}

function codegenNativeCommands(options) {
  const commands = {};
  for (const name of (options && options.supportedCommands) || []) {
    commands[name] = () => {};
  }
  return commands;
}

// react-native-maps probes UIManager.hasViewManagerConfig at module load (missing on web).
// Map views have no web implementation, so report "no native view manager".
const UIManager = RNW.UIManager || {};
if (typeof UIManager.hasViewManagerConfig !== "function") {
  UIManager.hasViewManagerConfig = () => false;
}

module.exports = {
  ...RNW,
  UIManager,
  codegenNativeComponent,
  codegenNativeCommands,
  // Some packages read UIManager via the default export (u.default.hasViewManagerConfig).
  default: UIManager,
};
