// Copyright (c) 2026 DRS AI. All rights reserved.
//
// Expo config plugin: adds a release signing config to android/app/build.gradle that
// reads the keystore from environment variables at build time. Nothing secret is
// written into the generated project. When the variables are absent, the build
// falls back to the template's default (debug) signing so local builds still work.
//
//   RAFEEQ_KEYSTORE_PATH      absolute path to the .jks/.p12 keystore
//   RAFEEQ_KEYSTORE_PASSWORD  keystore password
//   RAFEEQ_KEY_ALIAS          key alias
//   RAFEEQ_KEY_PASSWORD       key password
const { withAppBuildGradle, createRunOncePlugin } = require('expo/config-plugins');

const MARKER = '// RAFEEQ_RELEASE_SIGNING';

const SNIPPET = `
${MARKER}
android {
    signingConfigs {
        rafeeqRelease {
            def ksPath = System.getenv("RAFEEQ_KEYSTORE_PATH")
            if (ksPath) {
                storeFile file(ksPath)
                storePassword System.getenv("RAFEEQ_KEYSTORE_PASSWORD")
                keyAlias System.getenv("RAFEEQ_KEY_ALIAS")
                keyPassword System.getenv("RAFEEQ_KEY_PASSWORD")
                if (ksPath.endsWith(".p12")) {
                    storeType "pkcs12"
                }
            }
        }
    }
    buildTypes {
        release {
            if (System.getenv("RAFEEQ_KEYSTORE_PATH")) {
                signingConfig signingConfigs.rafeeqRelease
            }
        }
    }
}
`;

function withReleaseSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== 'groovy') {
      throw new Error('withReleaseSigning: only groovy build.gradle is supported');
    }
    if (!cfg.modResults.contents.includes(MARKER)) {
      cfg.modResults.contents += SNIPPET;
    }
    return cfg;
  });
}

module.exports = createRunOncePlugin(withReleaseSigning, 'rafeeq-release-signing', '1.0.0');
