// 「押しても開いたと分からない」画面が、素の `router.push` に戻っていないかの回帰テスト。
//
// **一度実際に壊した箇所の見張り。** 書き出しシートのプレビューを押すと、
// 開いたことに気付かず押し直され、押した回数だけ同じ画面が重なる ──
// 実際の利用者から報告された（戻るを何度も押す羽目になっていた）。
//
// **一覧は規則ではなく列挙。** `router.push` そのものは悪くない（行き先が元と
// はっきり違って見えるところでは押し直しが起きないので、素の push で足りる）。
// ここに挙げてあるのは**行き先が元と同じ見た目**の 2 か所だけで、
// これは形からは判定できないので目で選んだものを書き留めてある。
//
// 増やすときの目安（pushOnce.ts の冒頭と同じ）: 表 → 表、一覧 → 一覧のように
// 「進んだことが画面の絵で読めない」経路。
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { describe, expect, it } from 'vitest';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');

/** 行き先が押す前と同じ見た目になる経路を持つ画面 */
const MUST_PUSH_ONCE = [
  // 表（簡易プレビュー）→ 表（全画面プレビュー）。SPEC-V3 §5.9
  'screens/ExportSheet.tsx',
  // カードの中の横スクロールのバッジ列 → 同じ形のカードが並ぶ実績一覧
  'components/AchievementsSection.tsx',
];

describe('pushOnce', () => {
  for (const file of MUST_PUSH_ONCE) {
    it(`${file} は router.push を直に呼ばない`, () => {
      const source = readFileSync(join(SRC, file), 'utf8');

      // 文字列の中の言及（コメント）は拾わないよう、呼び出しの形だけを見る
      expect(source).not.toMatch(/\brouter\.push\s*\(/);
      expect(source).toMatch(/\busePushOnce\s*\(\s*\)/);
    });
  }
});
