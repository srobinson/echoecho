const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// Watch all files in the monorepo so Metro can resolve shared packages.
config.watchFolders = [workspaceRoot];

// Resolve packages from the app's own node_modules first, then from the
// workspace root. This ensures sibling-app packages (e.g. @rnmapbox/maps
// installed only in apps/admin/) are never accidentally bundled into student.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// Prevent Metro from crawling sibling app directories. This is the key guard
// against admin-only native modules leaking into the student bundle.
config.resolver.blockList = [
  new RegExp(`${path.resolve(workspaceRoot, 'apps/admin')}/.*`),
];

module.exports = config;
