// 広告の初期化と同意フロー（UMP）の唯一の入口。画面から mobileAds() を直接触らないこと。
//
// 流れは公式の推奨どおり（react-native-google-mobile-ads の European User Consent）:
//   1. AdsConsent.gatherConsent() … 同意情報を更新し、必要ならフォームを出す
//   2. canRequestAds が true になってから mobileAds().initialize() を呼ぶ
//   3. 1 が失敗しても 2 は試みる … UMP は**前回セッションの同意状態**を端末に持っているので、
//      今回の通信に失敗しても「前に同意済み」なら広告は出せる。ここで諦めると、
//      電波の悪い場所で一度失敗しただけで以降ずっと広告が出ないアプリになる
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
  markInitialized: () => void;
};

const useAdsStore = create<AdsStore>((set) => ({
  initialized: false,
  markInitialized: () => set({ initialized: true }),
}));

/** 広告 SDK の初期化が終わっているか（AdBanner が購読する） */
export function useAdsInitialized(): boolean {
  return useAdsStore((state) => state.initialized);
}

/**
 * mobileAds().initialize() を二重に呼ばないための番人。
 *
 * initializeAds() は「同意フローの完了後」と「その場で即時」の 2 経路から startAdsSdk() を
 * 呼ぶ（公式の例と同じ形）── 同意が要らない・前回すでに同意済みの端末で、フォームの
 * 往復を待たずに広告を出し始めるため。2 経路あるぶん、実際の初期化はここで 1 回に絞る。
 */
let sdkStartCalled = false;

/**
 * 実行中の初期化。**同期に立つのはこちら**（sdkStartCalled が立つのは canRequestAds を
 * 待ったあとなので、2 経路が同時に来ると両方とも番人をすり抜ける）。
 * 走り終えたら null に戻すので、canRequestAds が false で戻った回は後からやり直せる。
 */
let startInFlight: Promise<void> | null = null;

function startAdsSdk(): Promise<void> {
  if (sdkStartCalled) return Promise.resolve();
  startInFlight ??= runStartAdsSdk().finally(() => {
    startInFlight = null;
  });
  return startInFlight;
}

async function runStartAdsSdk(): Promise<void> {
  const { canRequestAds } = await AdsConsent.getConsentInfo();
  // 同意が必要なのにまだ取れていない状態。ここで広告を要求してはいけない
  if (!canRequestAds) return;

  sdkStartCalled = true;
  await mobileAds().initialize();
  useAdsStore.getState().markInitialized();
}

/**
 * 同意を取り、広告 SDK を初期化する。**アプリの起動につき 1 回だけ呼ぶ。**
 * 失敗しても投げない（広告が出ないだけで、アプリの機能は何も損なわれないため）。
 */
export function initializeAds(): void {
  AdsConsent.gatherConsent({
    ...(DEBUG_FORCE_EEA && __DEV__
      ? {
          debugGeography: AdsConsentDebugGeography.EEA,
          testDeviceIdentifiers: TEST_DEVICE_IDENTIFIERS,
        }
      : null),
  })
    .then(startAdsSdk)
    .catch(warnAdsFailure);

  // 同意フローの結果を待たずにもう一度試す。前回セッションの同意状態で canRequestAds が
  // すでに true なら、フォームの往復を待たずに初期化できる（上の catch の受け皿も兼ねる）
  startAdsSdk().catch(warnAdsFailure);
}

/** 失敗はログに残すだけ。広告は「出れば出る」もので、出ないことを利用者に見せる必要はない */
function warnAdsFailure(error: unknown): void {
  if (__DEV__) {
    console.warn('[ads] 初期化に失敗しました:', error);
  }
}
