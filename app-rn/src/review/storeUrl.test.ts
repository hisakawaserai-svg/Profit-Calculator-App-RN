// 設定タブ「レビューを書く」が開く URL。
// **ここは API（expo-store-review）を通さない経路**で、その理由は storeUrl.ts の冒頭にある。

import { describe, expect, it } from 'vitest';

import { APP_STORE_ID, PLAY_STORE_PACKAGE, storeReviewUrl } from './storeUrl';

describe('レビューを書く先の URL', () => {
  it('iOS はレビュー投稿の画面を直接開く', () => {
    expect(storeReviewUrl('ios')).toBe(
      `https://apps.apple.com/app/id${APP_STORE_ID}?action=write-review`,
    );
  });

  it('Android は掲載ページを開く（同等の直リンクが無いため）', () => {
    expect(storeReviewUrl('android')).toBe(
      `https://play.google.com/store/apps/details?id=${PLAY_STORE_PACKAGE}`,
    );
  });

  it('ストアの無い経路（web）では開く先が無い', () => {
    expect(storeReviewUrl('web')).toBe(null);
  });

  it('パッケージ名は app.json の android.package と同じ', () => {
    expect(PLAY_STORE_PACKAGE).toBe('com.sera.profitcalculator');
  });
});
