// レコード種別（不用品 / 仕入品）の選択（SPEC-V2 §1.1 / §1.3）。
// 計算タブ・記録フォーム・設定画面の 3 か所で同じ見た目・同じ並びにするため部品にしている。
//
// 表示名は §1.1 の確定値。「純利益 / 利益 / 収支」の出し分けとは別で、
// 種別そのものの名前なので画面によって変わらない（文字列は labels.ts に集約）。
import { SegmentedControl } from '@/components/SegmentedControl';
import type { RecordKind } from '@/db/schema';
import { recordKindLabel } from '@/logic/labels';
import { useLocale } from '@/settings';

/** セグメントの並び。既定種別の 'used' を左に置く */
const KINDS: readonly RecordKind[] = ['used', 'sourced'];

type Props = {
  kind: RecordKind;
  onChange: (kind: RecordKind) => void;
};

export function RecordKindSelector({ kind, onChange }: Props) {
  // **表示名をモジュールスコープで畳まない。** かつては `const LABELS = KINDS.map(recordKindLabel)`
  // だったが、それだと import 時の言語のまま固まって切り替わらない。
  // 描画のたびに作り、locale を引数で渡す（React Compiler 対策。src/i18n/index.ts の冒頭）
  const locale = useLocale();
  const labels = KINDS.map((value) => recordKindLabel(locale, value));

  return (
    <SegmentedControl
      options={labels}
      selectedIndex={KINDS.indexOf(kind)}
      onChange={(index) => onChange(KINDS[index] ?? 'used')}
    />
  );
}
