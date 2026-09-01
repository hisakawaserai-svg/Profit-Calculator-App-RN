# Android クローズドテスト用 AAB のビルド手順

## 前提

- `./gradlew app:bundleRelease` は **作業ディレクトリ上のファイルからビルドする**。
  git のコミット状態は関係ない。コミット済みの内容だけを含めたい場合は、
  ビルド前に変更をコミットするか `git stash -u` で退避しておくこと。

## 手順

1. `app-rn/android/app/build.gradle` の `versionCode` を +1 する。

2. AAB を作り直す（コミット済みの内容でビルドする場合は、先にコミットしておくこと）。

   ```bash
   cd /Users/hs./Documents/Programming/Profit-Calculator-App-RN/app-rn/android && \
   JAVA_HOME="$(/usr/libexec/java_home -v 17)" \
   ANDROID_HOME="$HOME/Library/Android/sdk" \
   ./gradlew app:bundleRelease
   ```

   出力先: `app-rn/android/app/build/outputs/bundle/release/app-release.aab`

3. 署名を確認する。`apksigner` は APK 専用で AAB は検証できないため `jarsigner` を使う。

   ```bash
   "$(/usr/libexec/java_home -v 17)/bin/jarsigner" -verify -verbose:summary -certs \
   /Users/hs./Documents/Programming/Profit-Calculator-App-RN/app-rn/android/app/build/outputs/bundle/release/app-release.aab | grep -A2 "CN="
   ```

   `CN=SeraApps` が出れば成功。
