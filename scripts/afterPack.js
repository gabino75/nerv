/**
 * electron-builder afterPack hook
 * Runs after the app has been packed but before it's signed/notarized
 */

const fs = require('fs');
const path = require('path');

exports.default = async function (context) {
  const { appOutDir, packager } = context;
  const platform = packager.platform.name;

  console.log(`afterPack: Processing ${platform} build in ${appOutDir}`);

  // Make hook binary executable on Unix platforms
  if (platform === 'mac' || platform === 'linux') {
    const resourcesDir = path.join(appOutDir, 'resources');
    const hookPath = path.join(resourcesDir, 'nerv-hook');

    if (fs.existsSync(hookPath)) {
      fs.chmodSync(hookPath, 0o755);
      console.log(`afterPack: Made ${hookPath} executable`);
    } else {
      console.warn(`afterPack: Hook binary not found at ${hookPath}`);
    }
  }
};
