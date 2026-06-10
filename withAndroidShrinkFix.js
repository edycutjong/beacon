const { withAppBuildGradle } = require('expo/config-plugins');

module.exports = function withAndroidShrinkFix(config) {
  return withAppBuildGradle(config, (config) => {
    // In RN 0.76 / Expo SDK 56, shrinkResources might be enabled by default by AGP or the react plugin.
    // The safest way to fix the Gradle build error is to explicitly set BOTH to false 
    // inside the release buildType.
    // The standard RN template contains: `minifyEnabled enableProguardInReleaseBuilds`
    
    if (config.modResults.contents.includes('minifyEnabled enableProguardInReleaseBuilds')) {
      config.modResults.contents = config.modResults.contents.replace(
        /minifyEnabled\s+enableProguardInReleaseBuilds/g,
        'minifyEnabled false\n            shrinkResources false'
      );
    } else {
      // Fallback if the string is slightly different
      config.modResults.contents = config.modResults.contents.replace(
        /release\s*\{/g,
        'release {\n            minifyEnabled false\n            shrinkResources false\n'
      );
    }
    
    return config;
  });
};
