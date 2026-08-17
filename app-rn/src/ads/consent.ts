// 広告の初期化と同意フロー（UMP）の唯一の入口。画面から mobileAds() を直接触らないこと。
//
// 流れは公式の推奨どおり（react-native-google-mobile-ads の European User Consent）:
//   1. AdsConsent.gatherConsent() … 同意情報を更新し、必要ならフォームを出す
//   2. canRequestAds が true になってから mobileAds().initialize() を呼ぶ
//   3. 1 が失敗しても 2 は試みる … UMP は**前回セッションの同意状態**を端末に持っているので、
//      今回の通信に失敗しても「前に同意済み」なら広告は出せる。ここで諦めると、
//      電波の悪い場所で一度失敗しただけで以降ずっと広告が出ないアプリになる
//
// 1 には**待ち時間の上限**を付けてある（CONSENT_TIMEOUT_MS）。gatherConsent は端末と
// ネットワークの状態次第でいつまでも解決しないことがあり（シミュレータで再現）、
// そのまま待つと 2 に進めないまま「広告リクエストが一度も出ないアプリ」になる。
// 失敗として扱われないぶん、放置すると気付けない ── 上限を切って先へ進める。
//
// ATT（iOS のトラッキング許可）は**アプリ側から出さない**。AdMob の管理画面で IDFA メッセージを
// 設定してあれば UMP のフォームが続けて出してくれるので、expo-tracking-transparency は要らない。
// 文言（NSUserTrackingUsageDescription）は app.json の config plugin 側に置いてある。
//
// 呼び出し箇所はルートレイアウトの起動時 1 か所だけ（app/_layout.tsx）。
// **初回起動はチュートリアルを閉じてから呼ぶ** ── チュートリアルの上に同意ダイアログが
// 重なると、初回体験が「何を聞かれているか分からないダイアログ」から始まってしまう。
import mobileAds, { AdsConsent, AdsConsentDebugGeography } from 'react-native-google-mobile-ads';
import { create } from 'zustand';

import { createConsentFlow } from './consentFlow';

/**
 * 同意取得を待つ上限。
 *
 * 通常は 1〜2 秒で返る（フォームを出す場合はその表示までの時間）。5 秒は「遅い回線でも
 * 取れるが、止まっているなら見切れる」あたりの値。伸ばすと起動直後に広告が出ない時間が
 * 延び、縮めると遅い回線で不要に非パーソナライズへ落ちる。
 */
const CONSENT_TIMEOUT_MS = 5000;

/**
 * 同意フォームの動作確認用。**true にすると端末が EEA（欧州）にあるものとして扱われ**、
 * 同意フォームが必ず出る。確認が済んだら false に戻すこと（コミットは false のまま）。
 *
 * 併せて TEST_DEVICE_IDENTIFIERS に自分の端末のハッシュ ID を入れる必要がある。取得手順:
 *   1. この定数を true にしたまま dev build を起動する
 *   2. ネイティブログを見る（iOS: Xcode のコンソール / Android: `adb logcat`）
 *      「To enable debug mode for this device, set: ...」のような行に 32 桁のハッシュが出る
 *   3. その値を TEST_DEVICE_IDENTIFIERS に貼る
 * シミュレータ・エミュレータは自動でテスト端末として扱われるので、この手順は実機のときだけ。
 *
 * 同意を一度出したあとにもう一度出したいときは `AdsConsent.reset()` を挟むか、
 * アプリを削除して入れ直す（同意状態は端末に残る）。
 */
const DEBUG_FORCE_EEA = false;

/** DEBUG_FORCE_EEA を実機で使うときのテスト端末ハッシュ ID（取得手順は上のコメント） */
const TEST_DEVICE_IDENTIFIERS: string[] = [];

/**
 * 広告 SDK の初期化が終わったか。**AdBanner はこれが true になるまで描画しない。**
 *
 * 設定（src/settings）と同じく zustand で持つ ── 値そのものはモジュール変数でも足りるが、
 * 「初期化が終わった瞬間にバナーを出す」には購読が要る。
 */
type AdsStore = {
  initialized: boolean;
  nonPersonalized: boolean;
  markInitialized: (nonPersonalized: boolean) => void;
};

const useAdsStore = create<AdsStore>((set) => ({
  initialized: false,
  nonPersonalized: false,
  markInitialized: (nonPersonalized) => set({ initialized: true, nonPersonalized }),
}));

/** 広告 SDK の初期化が終わっているか（AdBanner が購読する） */
export function useAdsInitialized(): boolean {
  return useAdsStore((state) => state.initialized);
}

/**
 * 非パーソナライズ広告として要求するか（AdBanner が購読する）。
 *
 * true になるのは**同意の状態が分からないまま広告を出しているとき**だけ ── 同意が取れて
 * いれば（canRequestAds が true なら）パーソナライズの可否は UMP が端末に持つ同意情報から
 * SDK が判断するので、こちらから指定することはない。
 * 分からないときに既定（＝パーソナライズ）で出さないためのフラグ。
 */
export function useNonPersonalizedAds(): boolean {
  return useAdsStore((state) => state.nonPersonalized);
}

/**
 * 同意フローと初期化の手順（consentFlow.ts）に、実物の依存を繋いだもの。
 *
 * 手順そのものは consentFlow.ts が持ち、ここは「AdsConsent / mobileAds / ストア」を
 * 渡すだけ ── 時間と順番で決まる振る舞いを、実機を起動せずに固定できるようにするため。
 */
const flow = createConsentFlow({
  gatherConsent: () =>
    AdsConsent.gatherConsent({
      ...(DEBUG_FORCE_EEA && __DEV__
        ? {
            debugGeography: AdsConsentDebugGeography.EEA,
            testDeviceIdentifiers: TEST_DEVICE_IDENTIFIERS,
          }
        : null),
    }),
  getConsentInfo: () => AdsConsent.getConsentInfo(),
  initializeSdk: async () => {
    await mobileAds().initialize();
  },
  onInitialized: (nonPersonalized) => useAdsStore.getState().markInitialized(nonPersonalized),
  onFailure: warnAdsFailure,
  timeoutMs: CONSENT_TIMEOUT_MS,
});

/**
 * 同意を取り、広告 SDK を初期化する。**アプリの起動につき 1 回だけ呼ぶ。**
 * 失敗しても投げない（広告が出ないだけで、アプリの機能は何も損なわれないため）。
 *
 * 打ち切ったことは**どこにも保存しない**。手順が持つ状態はモジュールの寿命と同じなので、
 * 次の起動では同意取得からやり直す ── 諦めた状態で固定しない。
 */
export function initializeAds(): void {
  flow.start();
}

/** 失敗はログに残すだけ。広告は「出れば出る」もので、出ないことを利用者に見せる必要はない */
function warnAdsFailure(error: unknown): void {
  if (__DEV__) {
    console.warn('[ads] 初期化に失敗しました:', error);
  }
}
