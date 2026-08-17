// 日本語の辞書。**キーの形はこのファイルが決める**（en.ts は `Translations` に従う）。
//
// キーは画面単位ではなく**機能単位**にしてある。labels.ts が
// 「同じ語はひとつの定数を指す」（`RECORD_SETTINGS_SECTION_TITLE = RECORDS_TAB_LABEL`、
// `TAG_CARD_EMPTY_LABEL = PRESET_CARD_EMPTY_LABEL` など）という形で組まれているので、
// 画面ごとに切ると同じ語が複数のキーに割れ、その不変条件が辞書の側で崩れる。
// 節の分け方は labels.ts の `// ---- ... ----` の区切りにそろえる。
//
// ステップ 1 では**設定タブの一覧画面が使う語だけ**を置く。他の画面は順次移す。

/** 件数の複数形。日本語は 1 件と 2 件で語が変わらないので one / other に同じ文を置く */
type PluralForms = {
  one: string;
  other: string;
};

export const ja = {
  // ---- 画面をまたいで使う語 ----
  common: {
    /**
     * 「N件」（labels.ts の presetCountLabel）。プリセット・タグ・記録・バックアップが共有する。
     * 日本語は複数形を持たないが、英語（item / items）のために形をそろえておく。
     */
    count: { one: '{{count}}件', other: '{{count}}件' } as PluralForms,
    /** まだ 1 件も登録がないカードの 1 行。プリセットとタグで同じ語を使う */
    notRegistered: 'まだ登録がありません',
    /**
     * タグそのものの表示名。
     * **TODO（ステップ 2）**: labels.ts の `TAG_LABEL` はまだ定数のまま 9 ファイルから
     * 参照されている。それらを `tagLabel()` に移すまで、同じ語がここと定数の 2 か所にある。
     */
    tag: 'タグ',
  },

  // ---- 画面の名前（UI-SPEC §1） ----
  //
  // タブ名とヘッダの見出しは同じ語にする、という labels.ts の方針をそのまま持ち込む。
  tabs: {
    calc: '計算',
    /**
     * 設定タブ「記録」群の見出しにもこのキーを使う（labels.ts の
     * `RECORD_SETTINGS_SECTION_TITLE = RECORDS_TAB_LABEL`）── どのタブに効く設定なのかを、
     * 見出しとタブバーで別の語にしない。
     *
     * **TODO（ステップ 2）**: `RECORDS_TAB_LABEL` の定数はチュートリアル・使いかた・
     * 記録一覧の 3 ファイルがまだ参照している（どれもステップ 1 の対象外）。
     */
    records: '記録',
    data: 'データ',
    settings: '設定',
  },

  /** 画面をまたぐ操作の語（ボタン・読み上げ） */
  action: {
    cancel: 'キャンセル',
    close: '閉じる',
    clear: 'クリア',
    delete: '削除',
    /** 「＋ 送料」のような追加の口。記号は全角（半角に振れないよう labels.ts の規約） */
    addition: '＋ {{name}}',
    deleteNamed: '{{name}}を削除',
    /** 選んだプリセット・サイト名を外す（チップの ✕） */
    removeNamed: '{{name}}を外す',
    increase: '{{label}}を増やす',
    decrease: '{{label}}を減らす',
  },

  /** 金額の欄と集計の語（SPEC-V2 §5.3 の確定ラベル表） */
  amount: {
    salesPrice: '販売価格',
    purchasePrice: '仕入価格',
    postage: '送料',
    envelopeCost: '梱包材',
    othersCost: 'その他',
    expenses: '経費',
    totalSales: '売上',
    totalSalesAmount: '売上総額',
    deducted: '引かれる分',
    /** 内訳バーの中に収める短い語。「手元に残る」の意味だが幅が無い */
    kept: '手元',
    breakdown: '内訳',
    breakdownAndMethod: '内訳と計算のしかた',
    commissionShort: '手数料',
    commissionField: '手数料 {{rate}}%',
    /** 式の中の「目標」。targetProfit（種別で変わる語）とは別で、こちらは式の項の名前 */
    formulaTarget: '目標',
  },

  /** 記録そのものに付く語（種別・利益の呼び分け・作る口） */
  record: {
    /** 種別の名前（§1.1 の確定値）。画面によって変わらない */
    kind: {
      used: '不用品',
      sourced: '仕入品',
    },
    /** レコード 1 件の netProfit に付ける語（§5.3）。不用品は「手取り」ではなく「純利益」 */
    profit: {
      used: '純利益',
      sourced: '利益',
    },
    /**
     * 文の途中に埋め込むときの利益の語。日本語は profit と同じだが、
     * **英語は文中で小文字にする必要がある**（Find the net profit）── 見出しに使う
     * profit（Net profit）をそのまま差し込むと語中で大文字が立ってしまう。
     */
    profitInline: {
      used: '純利益',
      sourced: '利益',
    },
    /** 計算タブの逆算入力に付ける語（§5.3） */
    targetProfit: {
      used: '目標の純利益',
      sourced: '目標利益',
    },
    /** アイコンだけのボタンの読み上げ語。名詞だけでは何が起きるか言えないので動詞まで入れる */
    addAction: '記録を追加',
    /** 記録タブの FAB。押した先の見出し（menu.title）と語をそろえる */
    addFab: '記録する',
    menu: {
      title: '記録を作る',
      newLabel: '新しく作る',
      newNote: '空の記録から入力します',
      duplicateLabel: '過去の記録から複製',
      duplicateNote: '送料や手数料を引き継いで作ります',
    },
  },

  /** 計算タブ（UI-SPEC §1.1） */
  calc: {
    /** タブ名（tabs.calc）とは別の語。ヘッダには幅があるので何の計算かまで言う */
    title: '利益計算',
    /** 結果カード先頭の 2 択。左が結果、右が逆算 */
    profitTab: '{{profit}}を出す',
    targetTab: '目標から逆算',
    /** 入力カードの折りたたみ見出し。開く前でも合計だけは見せる */
    optionalCosts: '梱包材・その他を入力',
    optionalCostsWithTotal: '梱包材・その他を入力（{{total}}）',
    /** 結果カード右上のリセット。ボタンの語だけでは何が消えるか言えないので読み上げは補う */
    clearInputAction: '入力をクリア',
    clearConfirmTitle: '入力をクリアしますか？',
    clearConfirmMessage: 'すべての金額が空欄になり、種別も既定値に戻ります。',
    /** 逆算の結果（採用案 12c） */
    requiredPriceHeadline: 'この値段で出せばよい',
    requiredSales: '必要な売上',
    requiredSalesPrice: '必要な販売価格',
    /**
     * 逆算の式。**行ごとに 1 つのキーにする** ── 語順が言語で変わるので、
     * 部品を連結する形にすると英語で組み立て直せない。
     */
    formulaTargetOnly: '目標{{target}}',
    formulaTargetAndExpenses: '目標{{target}} ＋ 経費{{expenses}} ＝ {{subtotal}}',
    formulaCommission: '手数料{{rate}}%が引かれるので ÷ {{divisor}}',
    formulaResult: '→ {{price}}',
    formulaResultRoundedUp: '→ {{exact}} を切り上げて {{price}}',
    /** 逆算のまとめ文。こちらも 1 文まるごとを 1 キーにする */
    summaryWithDeductions: '{{price}}で売ると、{{deductions}}が引かれて{{kept}}が残ります。',
    summaryNoDeductions: '{{price}}で売ると、そのまま{{kept}}が残ります。',
    /** 引かれるものを並べるときの区切り（「手数料100円と経費50円」） */
    deductionSeparator: 'と',
    deductionCommission: '手数料{{amount}}',
    deductionExpenses: '経費{{amount}}',
    /** 目標に届かない値段を入れたときの注意（案 12c） */
    lowerPriceWarning: '{{price}}では{{profit}}にしかならず、目標に届きません',
  },

  /** 金額欄の中の電卓（MiniCalculator。UI-SPEC §7） */
  calculator: {
    title: '{{field}}の計算',
    accessibility: '{{field}}の電卓',
    total: '合計',
    addRow: '行を足す',
    pickPackaging: '梱包材から選ぶ',
    submit: '入れる',
    backspaceAccessibility: '1 文字消す',
    clearAllAccessibility: 'すべて消す',
    blockedNegative: '合計がマイナスのままでは入れられません',
    blockedEmpty: '数字を入れると合計が出ます',
  },

  /** プリセット（SPEC-V3 §1）のうち、計算タブ・記録フォームから触る部分 */
  preset: {
    typeSite: '販売サイト',
    typeShipping: '送料',
    typePackaging: '梱包材',
    pickerTitle: '{{type}}を選ぶ',
    /** 選んだあとで率を書き換えたチップの読み上げ（§4） */
    tagRateChanged: '{{name}}（率は変更ずみ）',
  },

  // ---- 設定タブの一覧画面（UI-SPEC §1.6） ----
  settings: {
    /** §1.6-1: 見出しなしの 1 行カードと、その下の注記 */
    help: {
      label: '使いかた',
      note: '各画面の右上の「？」からも、その画面の説明だけを開けます。',
    },
    /** 初回起動チュートリアルをもう一度開く行 */
    replayTutorial: {
      label: 'チュートリアルをもう一度見る',
    },
    /**
     * 表示言語（3 択）。選択肢のうち「日本語」「English」は**訳さない** ──
     * 言語の名前はその言語で書くのが通例で、英語表示のときに「Japanese」と出すと
     * 「いまどれを選んでいるか」を母語で探せなくなる。だから辞書に持つのは
     * 「システム」だけで、残りの 2 つは labels.ts が固定値として持つ。
     */
    language: {
      title: '表示言語',
      system: 'システム',
      note: '「システム」を選ぶと端末の言語設定に合わせます。日本語以外のときは英語で表示します。',
    },
    /** §1.6-2 / SPEC-V2 §3.4: 注記で**効く範囲**まで言う（既存の記録は変わらない） */
    recordKind: {
      label: '新規作成時の種別',
      note: '新しく記録を追加するときに最初に選ばれている種別です。保存済みの記録の種別は変わりません。',
    },
    /** SPEC-V3 §3.1: 「入力を減らす」群 */
    preset: {
      title: '入力を減らす',
      note: 'よく使う値を登録しておくと、記録するときに選ぶだけで入ります。',
    },
    /** SPEC-V4 §2.1: 「記録を分類する」群。プリセットの語（登録・選ぶと入る）は流用しない */
    tag: {
      title: '記録を分類する',
      note: '記録にタグを付けておくと、あとから『洋服だけ』のように絞り込めます。',
    },
    /** §1.6-4: データ群の 3 行 */
    data: {
      title: 'データ',
      csvExport: '書き出し（CSV）',
      backup: 'バックアップと復元',
      recordCount: '記録の件数',
    },
    /** §1.6-5: 最下部のバージョン表記 */
    version: 'バージョン {{version}}',
  },
};

/**
 * 辞書の形。en.ts はこの型に従うので、**キーの追加・削除は必ず両方に効く**
 * （日本語だけ足して英語を忘れると型チェックで落ちる）。
 *
 * `as const` を付けていないので値は `string` に広がる ── 付けるとリテラル型になり、
 * en.ts が「日本語と同じ文字列」しか受け付けなくなる。
 */
export type Translations = typeof ja;
