// トーストの自動クローズまでの長さ。react-native-toast-message の既定値（4000ms）と
// 同じ値を明示的に持つ ── ToastProgressBar 側のアニメーション長を、Toast.show に渡す
// visibilityTime と一致させるため（片方だけ変えると進捗バーと実際のクローズがずれる）。
export const TOAST_VISIBILITY_MS = 4000;
