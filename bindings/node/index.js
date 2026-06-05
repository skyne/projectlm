'use strict';

const path = require('path');

function loadNative() {
  const candidates = [
    path.join(__dirname, 'build', 'Release', 'projectlm_native.node'),
    path.join(__dirname, 'build', 'Debug', 'projectlm_native.node'),
  ];

  for (const candidate of candidates) {
    try {
      return require(candidate);
    } catch (err) {
      if (err.code !== 'MODULE_NOT_FOUND') {
        throw err;
      }
    }
  }

  throw new Error(
    'ProjectLM native addon not built. Run: npm run build (from bindings/node)',
  );
}

module.exports = loadNative();
