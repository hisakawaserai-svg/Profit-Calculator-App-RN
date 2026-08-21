// Android の**リリース署名**を設定する config plugin。
//
// **なぜ必要か。** prebuild が吐く android/app/build.gradle は、release ビルドを
// **debug キーストアで署名する**（テンプレートの既定。"Caution! In production..." の
// コメントが付いている箇所）。debug 鍵で署名した AAB は Google Play が受け付けないので、
// アップロード鍵で署名し直す必要がある。
//
// **expo-build-properties では設定できない。** あのプラグインの android 側スキーマは
// kotlinVersion / minSdkVersion / packagingOptions などビルド設定のみで、
// storeFile・keyAlias といった署名系のキーは一つも持っていない（型定義で確認済み）。
// したがって build.gradle を直接 mod する自作プラグインが要る。
//
// **パスワードはリポジトリに置かない。** 実際の値は ~/.gradle/gradle.properties
// （グローバル。リポジトリ外で、prebuild の再生成対象でもない）に置き、ここでは
// **変数名を参照するだけ**。公式ドキュメントは android/gradle.properties に書く手順を
// 案内しているが、あれは prebuild で消える上に平文パスワードがリポジトリに入るので採らない。
// Gradle はホームの gradle.properties を自動でプロジェクトプロパティにマージするため、
// build.gradle からは変数名でそのまま参照できる。
//
// android/app/build.gradle は prebuild で毎回作り直される生成物なので、手で直すと次の
// prebuild で消える。ここで mod として当てるのが CNG での正しいやり方。
const { withAppBuildGradle } = require('expo/config-plugins');

/** ~/.gradle/gradle.properties に定義してある変数名の接頭辞 */
const PREFIX = 'URITSUMI_UPLOAD_';

/** prebuild が書く素の signingConfigs ブロック。これを見つけられなければ何もしない */
const TEMPLATE_SIGNING_CONFIGS = `    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
    }`;

/** release が debug 鍵を使っている箇所。コメント込みで拾わないと debug ビルド側と区別できない */
const RELEASE_USES_DEBUG_KEY = `            // Caution! In production, you need to generate your own keystore file.
            // see https://reactnative.dev/docs/signed-apk-android.
            signingConfig signingConfigs.debug`;

/**
 * release 署名を **hasProperty で条件付き**にしてあるのは、鍵を持たない環境
 * （CI の lint、他の開発者、debug ビルドだけしたいとき）で prebuild や debug ビルドまで
 * 巻き添えで落とさないため。プロパティが無いまま release をビルドした場合は
 * storeFile 未設定で Gradle が落ちる＝**debug 鍵入りの AAB が黙って出来ることはない**。
 */
const SIGNING_CONFIGS_WITH_RELEASE = `    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
        release {
            // 値は ~/.gradle/gradle.properties から読む。ここには絶対に書かないこと
            if (project.hasProperty('${PREFIX}STORE_FILE')) {
                storeFile file(${PREFIX}STORE_FILE)
                storePassword ${PREFIX}STORE_PASSWORD
                keyAlias ${PREFIX}KEY_ALIAS
                keyPassword ${PREFIX}KEY_PASSWORD
            }
        }
    }`;

module.exports = function withAndroidSigning(config) {
  return withAppBuildGradle(config, (gradleConfig) => {
    const { contents } = gradleConfig.modResults;

    // すでに当たっているなら二重に当てない（prebuild を続けて回したときなど）
    if (contents.includes(`${PREFIX}STORE_FILE`)) {
      return gradleConfig;
    }

    // テンプレートの書き方が変わった＝この当て方が前提を失っている。黙って通すと
    // 「debug 鍵で署名された AAB が出来て Play に弾かれる」ところまで気付けないので、
    // ここで止める
    if (!contents.includes(TEMPLATE_SIGNING_CONFIGS)) {
      throw new Error(
        'withAndroidSigning: android/app/build.gradle に既定の signingConfigs ブロックが' +
          '見つかりません。Expo のテンプレートが変わった可能性があります。',
      );
    }
    if (!contents.includes(RELEASE_USES_DEBUG_KEY)) {
      throw new Error(
        'withAndroidSigning: android/app/build.gradle の release が debug 署名を使っている' +
          '箇所を特定できません。Expo のテンプレートが変わった可能性があります。',
      );
    }

    gradleConfig.modResults.contents = contents
      .replace(TEMPLATE_SIGNING_CONFIGS, SIGNING_CONFIGS_WITH_RELEASE)
      .replace(RELEASE_USES_DEBUG_KEY, '            signingConfig signingConfigs.release');

    return gradleConfig;
  });
};
