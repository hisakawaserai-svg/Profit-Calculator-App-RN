// レコード種別（不用品 / 仕入品）の選択（SPEC-V2 §1.1 / §1.3）。
// 計算タブ・記録フォーム・設定画面の 3 か所で同じ見た目・同じ並びにするため部品にしている。
//
// 表示名は §1.1 の確定値。「純利益 / 利益 / 収支」の出し分け（Step 3 の labels.ts）とは別で、
// 種別そのものの名前なので画面によって変わらない。
import { SegmentedControl } from '@/components/SegmentedControl';
import type { RecordKind } from '@/db/schema';

/** セグメントの並び。既定種別の 'used' を左に置く */
const KINDS: readonly RecordKind[] = ['used', 'sourced'];
const LABELS = ['不用品', '仕入品'];

type Props = {
  kind: RecordKind;
  onChange: (kind: RecordKind) => void;
};

export function RecordKindSelector({ kind, onChange }: Props) {
  return (
    <SegmentedControl
      options={LABELS}
      selectedIndex={KINDS.indexOf(kind)}
      onChange={(index) => onChange(KINDS[index] ?? 'used')}
    />
  );
}
