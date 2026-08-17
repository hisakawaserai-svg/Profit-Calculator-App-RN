// 表示言語の 3 択（システム / 日本語 / English）。
//
// RecordKindSelector と同じ SegmentedControl で組んである ── 設定タブに並ぶ選択の見た目を、
// 項目ごとに変えないため。あちらと違って**ラベルをモジュールスコープで畳めない**
// （`const LABELS = ...` にすると import 時の言語のまま固まる）ので、描画のたびに作る。
import { SegmentedControl } from '@/components/SegmentedControl';
import {
  LANGUAGE_EN_LABEL,
  LANGUAGE_JA_LABEL,
  languageSystemLabel,
} from '@/logic/labels';
import { LANGUAGE_SETTINGS, type LanguageSetting } from '@/settings';

type Props = {
  language: LanguageSetting;
  onChange: (language: LanguageSetting) => void;
};

export function LanguageSelector({ language, onChange }: Props) {
  // 並びは LANGUAGE_SETTINGS のまま（system / ja / en）。
  // 「システム」を左端に置くのは、それが既定だから（RecordKindSelector が既定を左に置くのと同じ）
  const options = [languageSystemLabel(), LANGUAGE_JA_LABEL, LANGUAGE_EN_LABEL];

  return (
    <SegmentedControl
      options={options}
      selectedIndex={LANGUAGE_SETTINGS.indexOf(language)}
      onChange={(index) => onChange(LANGUAGE_SETTINGS[index] ?? 'system')}
    />
  );
}
