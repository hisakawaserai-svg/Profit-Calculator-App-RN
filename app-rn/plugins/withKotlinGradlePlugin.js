// Android の Kotlin **コンパイラ**（kotlin-gradle-plugin）のバージョンを固定する config plugin。
//
// **なぜ必要か。** react-native-google-mobile-ads が引く play-services-ads 25.4.0 は
// Kotlin 2.3.0 でコンパイルされている。一方 Expo SDK 57 / RN 0.86 が既定で使う Kotlin は
// 2.1.20 で、Kotlin のコンパイラは**自分より新しいメタデータを読めない**ため、
// :react-native-google-mobile-ads:compileDebugKotlin が
// 「Module was compiled with an incompatible version of Kotlin」で必ず落ちる。
//
// **expo-build-properties の android.kotlinVersion だけでは直らない。** あれが書くのは
// gradle.properties の `android.kotlinVersion` で、効くのは Expo のバージョンカタログ
// （kotlin-stdlib や KSP の選定）まで。ルートの buildscript classpath に載る
// kotlin-gradle-plugin＝実際にコンパイルするコンパイラは 2.1.20 のまま残るので、
// stdlib だけが 2.3.0 に上がって react-native-safe-area-context まで道連れに落ちる。
// **両方**必要なので、app.json では expo-build-properties とこのプラグインを対で入れてある。
//
// android/build.gradle は prebuild で毎回作り直される生成物なので、手で直すと次の
// prebuild で消える。ここで mod として当てるのが CNG での正しいやり方。
//
// Expo 側が既定の Kotlin を 2.3 以上に上げたら、このプラグインと
// expo-build-properties の kotlinVersion は両方とも外せる。
const { withProjectBuildGradle } = require('expo/config-plugins');

/** expo-build-properties の android.kotlinVersion と**同じ値**にすること */
const KOTLIN_VERSION = '2.3.0';

/** prebuild が書く素の行（バージョン指定なし）。これを見つけられなければ何もしない */
const UNVERSIONED = "classpath('org.jetbrains.kotlin:kotlin-gradle-plugin')";

module.exports = function withKotlinGradlePlugin(config) {
  return withProjectBuildGradle(config, (gradleConfig) => {
    const { contents } = gradleConfig.modResults;

    // すでにバージョン付きなら二重に当てない（prebuild を続けて回したときなど）
    if (contents.includes(`kotlin-gradle-plugin:${KOTLIN_VERSION}`)) {
      return gradleConfig;
    }

    if (!contents.includes(UNVERSIONED)) {
      // テンプレートの書き方が変わった＝この当て方が前提を失っている。黙って通すと
      // 「広告モジュールだけがビルドで落ちる」謎の失敗になるので、ここで気付けるようにする
      throw new Error(
        `withKotlinGradlePlugin: android/build.gradle に "${UNVERSIONED}" が見つかりません。` +
          'Expo のテンプレートが変わった可能性があります（Kotlin の既定が 2.3 以上になったなら、このプラグインごと外せます）。',
      );
    }

    gradleConfig.modResults.contents = contents.replace(
      UNVERSIONED,
      `classpath('org.jetbrains.kotlin:kotlin-gradle-plugin:${KOTLIN_VERSION}')`,
    );
    return gradleConfig;
  });
};
