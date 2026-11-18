import java.io.File

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

// UI preview screenshots (Robolectric native graphics). Opt-in so the shipped APK has no test manifest entries:
//   ./gradlew :app:testDebugUnitTest -Pwakil.previews=true --tests '*UiPreviews*'
val previews = providers.gradleProperty("wakil.previews").orNull == "true"


android {
    namespace = "com.wakil.agent"
    compileSdk = 35
    buildToolsVersion = "35.0.0"

    defaultConfig {
        applicationId = "com.wakil.agent"
        minSdk = 26
        targetSdk = 34
        versionCode = 34
        versionName = "4.0.0"
        ndk { abiFilters += listOf("arm64-v8a") }
    }

    // Fixed debug key kept in the repo so every future build signs identically and installs as an update.
    // (v1.0.0 was signed with a throwaway ~/.android/debug.keystore that no longer exists.)
    signingConfigs {
        getByName("debug") {
            storeFile = rootProject.file("keystore/wakil-debug.keystore")
            storePassword = "android"
            keyAlias = "androiddebugkey"
            keyPassword = "android"
        }
        // Real release key is injected by CI via environment (GitHub Secrets). It is never
        // committed to the repo; when absent, release falls back to the fixed debug key
        // so assembleRelease still produces an installable APK for local testing.
        val env = System.getenv()
        val ksFile = env["WAKIL_KEYSTORE_FILE"]
        if (!ksFile.isNullOrBlank() && File(ksFile).exists()) {
            create("release") {
                storeFile = File(ksFile)
                storePassword = env["WAKIL_KEYSTORE_PASSWORD"]
                keyAlias = env["WAKIL_KEY_ALIAS"]
                keyPassword = env["WAKIL_KEY_PASSWORD"]
            }
        }
    }

    buildTypes {
        debug { isMinifyEnabled = false; signingConfig = signingConfigs.getByName("debug") }
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.findByName("release") ?: signingConfigs.getByName("debug")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    buildFeatures { compose = true; buildConfig = true; aidl = false; renderScript = false }
    // libwakil_pty.so is prebuilt by scripts/build-pty.sh into src/main/jniLibs (like the llama/proot libs).
    packaging {
        // proot must be extracted to nativeLibraryDir so it can be exec'd (W^X on Android 10+)
        jniLibs {
            useLegacyPackaging = true
            keepDebugSymbols += listOf("**/*.so")
        }
        resources { excludes += listOf("META-INF/*") }
    }
    testOptions { unitTests.isIncludeAndroidResources = previews }
    if (previews) sourceSets["test"].java.srcDir("src/previewTest/java")
    // Native lib (libwakil_llama.so) is prebuilt by scripts/build-native.sh into src/main/jniLibs.
}

dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2024.12.01")
    implementation(composeBom)
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.activity:activity-compose:1.9.3")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.7")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.8.7")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")
    implementation("org.apache.commons:commons-compress:1.27.1")
    implementation("com.tom-roush:pdfbox-android:2.0.27.0")
    // sherpa-onnx 1.13.8 (Apache-2.0): Kotlin API classes; its .so files live in src/main/jniLibs/arm64-v8a
    implementation(files("libs/sherpa-onnx-1.13.8.jar"))
    // Tesseract4Android 4.9.0 (Apache-2.0): Java API; libtesseract/libleptonica/libjpeg/libpngx in jniLibs/arm64-v8a
    implementation(files("libs/tesseract4android-4.9.0.jar"))
    implementation("dev.rikka.shizuku:api:13.1.5")
    implementation("dev.rikka.shizuku:provider:13.1.5")
    testImplementation("junit:junit:4.13.2")
    if (previews) {
        testImplementation(composeBom)
        testImplementation("org.robolectric:robolectric:4.18")
        testImplementation("androidx.compose.ui:ui-test-junit4")
        debugImplementation("androidx.compose.ui:ui-test-manifest")
    }
    testImplementation("org.json:json:20240303")
}

tasks.withType<Test>().configureEach {
    systemProperty("wakil.previews.dir", rootProject.file("../out/v1.5-previews").absolutePath)
    maxHeapSize = "2g"
    // demo-video frame dump (RobotRigPreviews.demoFrames): -Pwakil.demo.frames=/tmp/frames
    providers.gradleProperty("wakil.demo.frames").orNull?.let { systemProperty("wakil.demo.frames", it) }
    providers.gradleProperty("wakil.demo.set").orNull?.let { systemProperty("wakil.demo.set", it) }
}
