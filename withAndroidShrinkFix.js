const { withGradleProperties } = require('expo/config-plugins');

module.exports = function withAndroidShrinkFix(config) {
  return withGradleProperties(config, (config) => {
    // Ensure proguard is enabled in release builds so that minify is true.
    // This resolves the mismatch where shrinkResources is somehow true but minifyEnabled is false.
    config.modResults.push({
      type: 'property',
      key: 'expo.android.enableProguardInReleaseBuilds',
      value: 'true',
    });
    config.modResults.push({
      type: 'property',
      key: 'react.enableShrinkResourcesInReleaseBuilds',
      value: 'false',
    });
    return config;
  });
};
