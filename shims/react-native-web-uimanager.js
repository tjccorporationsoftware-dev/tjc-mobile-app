// Web-only shim for UIManager. react-native-maps calls UIManager.hasViewManagerConfig at module
// load, which react-native-web does not implement. Map views have no web implementation, so
// report "no native view manager" and expose the same object as default and named export.
// Wired up in metro.config.js (web platform only).
const RNW = require("../node_modules/react-native-web/dist/cjs/index.js");

const UIManager = RNW.UIManager || {};
if (typeof UIManager.hasViewManagerConfig !== "function") {
  UIManager.hasViewManagerConfig = () => false;
}

module.exports = UIManager;
module.exports.default = UIManager;
