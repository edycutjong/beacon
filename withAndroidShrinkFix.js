const { withGradleProperties } = require('expo/config-plugins');

module.exports = function withAndroidShrinkFix(config) {
  return withGradleProperties(config, (config) => {
    // In RN 0.76 / Expo SDK 56, the build script looks for `android.enableMinifyInReleaseBuilds`.
    // But Expo's prebuild template sometimes still generates `android.enableProguardInReleaseBuilds`.
    // This causes minifyEnabled to evaluate to false while shrinkResources is true, breaking the build.
    // We fix this by renaming the property in gradle.properties during prebuild.
    
    const propIndex = config.modResults.findIndex(
      (prop) => prop.type === 'property' && prop.key === 'android.enableProguardInReleaseBuilds'
    );
    
    if (propIndex !== -1) {
      config.modResults[propIndex].key = 'android.enableMinifyInReleaseBuilds';
    } else {
      // If it doesn't exist, let's just make sure it's set to true to match shrinkResources
      config.modResults.push({
        type: 'property',
        key: 'android.enableMinifyInReleaseBuilds',
        value: 'true',
      });
    }

    return config;
  });
};
