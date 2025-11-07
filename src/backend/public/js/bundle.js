"use strict";
(() => {
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __commonJS = (cb, mod) => function __require() {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  };

  // src/frontend/entrypoint.ts
  var require_entrypoint = __commonJS({
    "src/frontend/entrypoint.ts"() {
      var button = document.querySelector("#test-button");
      button?.addEventListener("click", (event) => {
        event.preventDefault();
        setTimeout(() => {
          alert("you clicked around 1 seconds ago");
        }, 1e3);
      });
    }
  });
  require_entrypoint();
})();
//# sourceMappingURL=bundle.js.map
