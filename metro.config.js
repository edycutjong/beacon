const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName.includes('resolve-config.node.js')) {
    return { type: 'empty' };
  }
  if (platform === 'web' && moduleName === '@qvac/sdk') {
    return {
      type: 'sourceFile',
      filePath: require.resolve('./__mocks__/@qvac/sdk.js')
    };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
