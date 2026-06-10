const { withAppBuildGradle } = require('expo/config-plugins');

module.exports = function withAndroidShrinkFix(config) {
  return withAppBuildGradle(config, (config) => {
    // Ensure that if shrinkResources is somehow true, minifyEnabled is also true
    // Or we just forcefully disable shrinkResources if minifyEnabled is false.
    // The safest is to just disable shrinkResources because the build currently fails
    // or just enable minifyEnabled. Let's just enable minifyEnabled.
    // Actually, in React Native templates, the lines often look like:
    // minifyEnabled enableProguardInReleaseBuilds
    // shrinkResources enableProguardInReleaseBuilds
    // If it's literally `shrinkResources true` and `minifyEnabled false`, we can replace it.
    
    // Let's just set shrinkResources to false, since it's the easiest to fix the error.
    config.modResults.contents = config.modResults.contents.replace(
      /shrinkResources\s+(true|enableProguardInReleaseBuilds)/g,
      'shrinkResources false'
    );
    
    return config;
  });
};
