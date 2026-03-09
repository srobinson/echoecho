const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// Watch all files in the monorepo so Metro can resolve shared packages.
config.watchFolders = [workspaceRoot];

// Resolve packages from the app's own node_modules first, then from the
// workspace root. Admin has its own native-heavy deps (@rnmapbox/maps,
// expo-camera, expo-image-picker) that must not leak into student.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// Prevent Metro from crawling the sibling student app directory.
config.resolver.blockList = [
  new RegExp(`${path.resolve(workspaceRoot, 'apps/student')}/.*`),
];

module.exports = config;
