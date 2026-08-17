// 英語の辞書。キーの形は ja.ts が決めるので、ここは `Translations` に従うだけ。
// 足りないキー・余計なキーがあれば型チェックで落ちる。

import type { Translations } from './ja';

export const en: Translations = {
  common: {
    // 日本語の「N件」。英語は 1 件だけ語形が変わるので、ここで複数形が効いてくる
    count: { one: '{{count}} item', other: '{{count}} items' },
    notRegistered: 'Nothing saved yet',
    tag: 'Tags',
  },

  tabs: {
    calc: 'Calculator',
    records: 'Records',
    data: 'Data',
    settings: 'Settings',
  },

  settings: {
    help: {
      label: 'How to Use',
      note: 'You can also open just one screen’s help from the “?” at its top right.',
    },
    replayTutorial: {
      label: 'Watch the Tutorial Again',
    },
    language: {
      title: 'Language',
      system: 'System',
      note: '“System” follows your device’s language setting. Anything other than Japanese is shown in English.',
    },
    recordKind: {
      label: 'Type for New Records',
      note: 'The type selected first when you add a new record. The type of records you have already saved does not change.',
    },
    preset: {
      title: 'Type Less',
      note: 'Save the values you use often, and you can fill them in by picking one while you record.',
    },
    tag: {
      title: 'Organize Records',
      note: 'Tag your records and you can narrow them down later — “clothes only”, for example.',
    },
    data: {
      title: 'Data',
      csvExport: 'Export (CSV)',
      backup: 'Back Up & Restore',
      // 日本語の「記録の件数」をそのまま訳すと、値の「12 items」と合わせて
      // 「Number of records: 12 items」と重複して読める。行の名前は「Records」に留める
      recordCount: 'Records',
    },
    version: 'Version {{version}}',
  },
};
