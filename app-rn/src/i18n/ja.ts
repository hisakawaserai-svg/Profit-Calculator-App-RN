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
    dbInitFailed: 'データベースの初期化に失敗しました',
    unimplemented: '（未実装）',
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
    /**
     * 複数レコードの Σ netProfit（月次カード / 下部累計 / データタブ）。
     * 種別語（純利益 / 利益）ではなく中立語にする ── 混ざった合計を種別語では呼べない（§5.2）
     */
    totalProfit: '収支',
    /** 文中に埋め込むとき。英語だけ小文字にする（Cumulative net total）── profitInline と同じ */
    totalProfitInline: '収支',
    totalSales: '売上',
    totalSalesAmount: '売上総額',
    deducted: '引かれる分',
    /** 内訳バーの下の 2 値。幅が無いので詰めた語にする（意味は keptLong と同じ） */
    kept: '手元',
    /** 内訳の一覧の行。こちらは幅があるので言い切る */
    keptLong: '手元に残る',
    /** 販売手数料の正式な語。amount.commissionShort（手数料）と使い分ける */
    commissionFull: '販売手数料',
    /** 内訳の一覧に出す手数料の行「販売手数料10%」 */
    commissionItem: '販売手数料{{rate}}%',
    breakdown: '内訳',
    breakdownAndMethod: '内訳と計算のしかた',
    /** 文中に埋め込むとき。英語だけ小文字にする */
    salesPriceInline: '販売価格',
    postageInline: '送料',
    envelopeCostInline: '梱包材',
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
    /** 文の途中に埋め込むとき。英語だけ小文字にする（profitInline と同じ理由） */
    targetProfitInline: {
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
    /** 文中に埋め込むとき。英語だけ小文字にする（Save the packaging you use often） */
    typeSiteInline: '販売サイト',
    typeShippingInline: '送料',
    typePackagingInline: '梱包材',
    pickerBack: '電卓',
    pickerEmptyBodyWithoutLink: '{{body}}\n設定タブの「{{section}}」から追加できます。',
    pickerEditLink: '設定で編集する ▸',
    pickerAddLink: '設定で追加する ▸',
    pickedCount: { one: '選択中{{count}}点', other: '選択中{{count}}点' } as PluralForms,
    shippingOnly: '送料のみ',
    withShippingMaterial: '＋資材 {{amount}}',
    pickerTitle: '{{type}}を選ぶ',
    /** 選んだあとで率を書き換えたチップの読み上げ（§4） */
    tagRateChanged: '{{name}}（率は変更ずみ）',
  },

  /** 記録の一覧（記録タブ。UI-SPEC §1.2） */
  list: {
    /** 状態と日付の見出し。行の中に収める短い語 */
    /** 帯の不足ぶんの区画（記録詳細） */
    shortfallSegment: '足りない',
    listingStatus: '出品中',
    listedDate: '出品',
    soldDate: '販売',
    soldRecords: '売れた記録',
    untitled: '無題',
    search: '検索',
    searchClear: '検索を消去',
    searchPlaceholder: '商品名で検索',
    sortSheetTitle: '並び替え',
    filter: '絞り込み',
    filterClear: '絞り込みを解除',
    /** 空表示の 2 種。**絞り込みの結果ゼロと、そもそも記録が無いのを別の文にする** */
    filterEmptyTitle: '条件に合う記録がありません',
    noRecordsTitle: 'この期間の記録はありません',
    noRecordsBody: '左下の ＋ を押すと記録できます',
    totalListingPrice: '出品価格の合計',
    /**
     * 一覧の合計行。件数と点数で語を分ける（記録の数と商品の数）。
     * 日本語は単複が無いが、英語（1 record / 2 records）のために形をそろえる。
     */
    recordCount: { one: '{{count}} 件', other: '{{count}} 件' } as PluralForms,
    listedItemCount: { one: '{{count}} 点', other: '{{count}} 点' } as PluralForms,
    expectedProfit: '売れたら {{amount}}',
    recordDetailAccessibility: '{{name}} の詳細',
  },

  /** 期間の切り替え（月 / 年 / 全期間） */
  period: {
    sheetTitle: '表示する期間',
    all: '全期間',
    /** 文中に埋め込むとき。英語だけ小文字にする（Net total for all time）── record.profitInline と同じ */
    allInline: '全期間',
    previousMonth: '前の月',
    nextMonth: '次の月',
    previousYear: '前の年',
    nextYear: '次の年',
    /** 「この月の収支」「2026年の収支」「全期間の収支」 */
    profitLabel: '{{subject}}の{{total}}',
    thisMonth: 'この月',
    buttonAccessibility: '表示する期間: {{title}}',
  },

  /** 長押しコピー（LongPressCopy） */
  copy: {
    done: '{{label}}をコピーしました',
    content: 'コピー内容：{{text}}',
    failed: '{{label}}のコピーに失敗しました',
  },

  /** 記録の入力フォーム（RecordFormSheet。UI-SPEC §3） */
  form: {
    newTitle: '新しい記録',
    editTitle: '記録を編集',
    save: '保存',
    itemName: '商品名',
    itemNameRequired: '⚠️ 商品名を入力してください',
    itemNameCaption: '商品名（必須）',
    itemNamePlaceholder: '例：えんぴつ',
    /** 折りたたみの見出し。梱包材とその他をまとめた 1 行 */
    envelopeAndOthers: '梱包材・その他',
    memo: 'メモ',
    /** 空のときだけ動詞を足す ── 「メモ」だけでは押せる行に見えない */
    memoWrite: 'メモを書く',
    unsetInput: '未入力',
    targetProfitUnset: '決めていません',
    /** 日付の節。出品中と売れた記録で欄名が変わる */
    listedDate: '出品日',
    soldDate: '販売日',
    dateSection: '{{label}} {{date}}',
    today: '今日（{{date}}）',
    listedDatePickerNote: '今日より後は選べません',
    soldDatePickerNote: '出品（{{date}}）より前と、今日より後は選べません',
    soldDateSingleDayNote: '出品日（{{date}}）だけが選べます',
    soldDateChipsNote: '出品日（{{date}}）より前は選べません',
    /**
     * 状態を切り替えるボタン。**1 文まるごとを 1 キーにする** ── 「{{status}}にする」の
     * 形で状態名を差し込むと、英語が「Mark as Sold records」のように崩れる
     * （状態名は一覧の見出し用の語で、文中に置ける形ではない）。
     */
    switchToSold: '売れた記録にする',
    switchToListing: '出品中にする',
    /** 一覧の行の「− 送料」のような引き算の表記。記号は全角（additionLabel と対） */
    deduction: '− {{name}}',
  },

  /** 商品写真（SPEC-V5） */
  photo: {
    field: '写真',
    empty: '写真なし',
    image: '商品写真',
    add: '写真を選ぶ',
    replace: '変更',
    remove: '削除',
    removeAccessibility: '写真を削除',
    permissionDenied: '写真へのアクセスが許可されていません。',
    openSettings: '設定を開く',
    saveFailed: '写真を保存できませんでした。',
  },

  /** タグ（SPEC-V4）のうち、記録フォームの節と選択シート */
  tag: {
    add: '＋ 追加',
    fieldEmpty: 'まだ付いていません',
    emptyTitle: 'タグがありません',
    pickerOpen: 'タグを選ぶ',
    pickerSearchPlaceholder: 'タグを探す・作る',
    pickerEmptyBody: '上の欄に名前を入れると、その場で作れます。',
    pickerDone: '完了',
    pickerEditLink: '設定で編集する ▸',
    create: '＋『{{name}}』を作る',
    removeAccessibility: '{{name}}を外す',
    /** 保存が押せない理由（§2.3）。ボタンがグレーなだけでは理由が分からない */
    errorNameRequired: '名前を入れてください',
    errorNameTooLong: '名前は{{max}}文字までです',
    errorNameHasSeparator: '「{{separator}}」は使えません',
    errorNameDuplicated: '同じ名前のタグがあります',
  },

  /** レコード詳細（SaleRecordDetailScreen。UI-SPEC §5） */
  detail: {
    edit: '編集する',
    deleteConfirmTitle: '削除しますか？',
    undo: '元に戻す',
    soldBadge: '売れた',
    soldDateRow: '売れた日',
    memoEmpty: 'なし',
    /** 金額が無い欄の代わりに置く記号。訳す対象ではないが 1 か所に集める */
    amountPlaceholder: 'ーー',
    /** 販売手数料の行。率を括弧で添える（内訳の「販売手数料10%」とは別の場所） */
    commissionRow: '販売手数料 ({{rate}}%)',
    expectedTotalProfit: '見込みの{{total}}',
    /** 出品中 → 売れた記録 への切り替えと、その取り消し */
    markAsSold: '売れた',
    markedAsSoldMessage: '売れた記録にしました',
    revertToListing: '出品中に戻す',
    revertToListingConfirmLabel: '戻す',
    revertToListingConfirmTitle: '販売日 {{date}} が消えます。戻しますか？',
    /** 種別・出品日・販売日を 1 行にまとめた経過（§4.7） */
    timelineListing: '{{kind}} ・ {{listedDate}} 出品（{{elapsed}}）',
    timelineSold: '{{kind}} ・ {{listedDate}} 出品 → {{soldDate}} 販売（{{days}}日）',
    photoAddFromDetail: '写真を追加',
    photoTapHint: '写真を押すと全画面で見られます',
    photoViewerClose: '閉じる',
  },

  /** 絞り込み（RecordFilterScreen。SPEC-V4 §4） */
  filter: {
    all: 'すべて',
    clearAll: 'すべて解除',
    kindSection: '種別',
    siteSection: '販売サイト',
    siteEmptyTitle: '販売サイトがありません',
    siteEmptyBody: '記録に販売サイトを入れると、ここから選べます。',
    tagSection: 'タグ',
    tagSectionWithCount: 'タグ（{{count}}）',
    tagEmptyBody: 'タグは記録するときに、品名の下から作れます。付けたタグはここに並びます。',
    tagOrHint: 'どれかが付いた記録が出ます',
    tagSearchPlaceholder: 'タグを探す',
    tagSearchCancel: 'キャンセル',
    tagSearchEmptyTitle: '「{{keyword}}」に合うタグがありません',
    tagSearchEmptyBody: '選んでいるタグ（{{names}}）は、そのまま効いています。',
    tagSearchResult: '{{total}}のうち{{matched}}が該当',
    /** 0 件になったときの理由。月を絞っているかで文が変わる */
    noMatchConditions: 'この{{count}}つが揃った記録がありません。',
    noMatchWithMonth: '{{month}}には、この{{count}}つが揃った記録がありません。',
    matchingRecordSold: 'この条件に合う記録',
    matchingRecordListing: 'この条件に合う出品中の記録',
  },

  /** 並び替え（recordSort.ts。一覧の並び替えシート） */
  sort: {
    newest: '新しい順',
    oldest: '古い順',
    largest: '多い順',
    smallest: '少ない順',
  },

  /** 過去の記録から複製（DuplicateSourceScreen） */
  duplicate: {
    title: '複製する記録を選ぶ',
    note: '商品名・種別・経費・タグ・目標を引き継ぎます。販売価格・写真・メモ・日付は引き継ぎません。',
    recentSection: '最近の記録',
    allSection: 'すべての記録',
    showAll: 'すべての記録を見る',
    tagFilter: 'タグで絞る',
    emptyTitle: '複製できる記録がありません',
    emptyBody: '記録を 1 件でも作ると、次からここに出ます。',
    noMatchTitle: '条件に合う記録がありません',
  },

  /** 経過日数と結論行（レコード詳細の帯の下。UI-SPEC §4.7 / O3 案） */
  elapsed: {
    /** 出品からの経過。0 日（出品当日）も出す */
    listing: { one: '{{count}}日経過', other: '{{count}}日経過' } as PluralForms,
    soldInDays: { one: '{{count}}日で売れました', other: '{{count}}日で売れました' } as PluralForms,
    soldSameDay: '記録した日に売れました',
    soldDateRange: '{{listed}} に記録 → {{sold}} に販売',
    perDayProfit: '1日 {{amount}}',
  },

  /**
   * 帯の下の結論行（1 行目 ＝ 用件、2 行目 ＝ 行き先）。
   * **状態ごとに 1 文まるごと**にする ── 額の位置と語順が状態で変わるため。
   */
  conclusion: {
    unpricedBreakdown: '価格を入れると内訳が計算できます',
    safe: 'あと {{room}} 下げても赤字になりません',
    safeWithTarget: '{{floor}}までなら、{{target}}{{amount}}を保てます',
    loss: 'あと{{shortfall}}の値上げで、赤字から抜けます',
    lossWithTarget: '{{target}}{{amount}}まで戻すなら{{price}}',
    unpriced: '価格を入れると、どこまで下げられるか分かります',
    detailSafe: '値下げを試す・赤字にならない価格を見る',
    detailSafeWithTarget: '値下げを試す・目標を保てる価格を見る',
    detailLoss: '値上げを試す・赤字から抜ける価格を見る',
    detailLossWithTarget: '値上げを試す・目標を保てる価格を見る',
    detailUnpriced: '売る価格を入力する',
    /** 売れたあとは過去形で結果を言う（もう動かせる価格が無い） */
    soldNoTarget: '交渉されても、あと{{room}}は応じられた計算でした',
    soldTargetMet: '{{floor}}まで、目標利益を保てました',
    soldBelowTarget: '目標まであと{{shortfall}}でした',
    soldDetailRoom: 'どこまで下げられたか見る',
    soldDetailShortfall: '目標にどれだけ届かなかったか見る',
  },

  /** いくらで売る？ / どうだった？（PricingScreen。SPEC-V9 §9） */
  pricing: {
    title: 'いくらで売る？',
    soldTitle: 'どうだった？',
    lossBadge: '赤字',
    priceUnsetBadge: '価格 未設定',
    listingDayBadge: '出品中 {{day}}日目',
    /** 価格が無いとき（G の節） */
    priceUnsetLead: '売る価格',
    priceUnsetDescription: '売る価格を入れると、手元に残る金額と、いくらまで下げられるかが出ます。',
    priceInputButton: '売る価格を入力する',
    knownWithoutPriceTitle: '価格がなくても分かっていること',
    knownWithoutPriceNote: '仕入 {{purchase}}・送料 {{postage}}・梱包 {{packing}} から計算しています。価格を入れる前でも、この下限は決まります。',
    noLossPrice: '赤字にならない価格',
    targetReachedPrice: '目標が出る価格',
    spentCost: 'すでにかかった費用',
    costBreakdownRow: '費用の内訳',
    minPrice: '{{price}} 以上',
    /** 主役の数字まわり */
    currentPriceLead: '今の価格 {{price}} で売れたら',
    netProfitEstimate: '手元に残る見込み',
    netProfitEstimateWithRate: '手元に残る見込み・利益率 {{rate}}%',
    remainingProfitLead: '残った利益',
    lossAmountNote: '売っても、手元のお金は {{amount}} 減ります',
    /** 結論の帯（1 行目 ＝ 行き先、2 行目 ＝ 余裕）。状態ごとに 1 文まるごと */
    conclusionSafe: '{{breakEven}} までなら赤字になりません。',
    conclusionSafeWithTarget: '{{floor}} までなら、{{target}} {{amount}} を保てます。',
    conclusionBelowTarget: '{{target}} {{amount}} まで、あと {{shortfall}} です。',
    conclusionBelowTargetDetail: '{{breakEven}} までなら赤字にはなりません。',
    conclusionLoss: 'あと {{shortfall}} の値上げで、赤字から抜けます。',
    conclusionLossDetail: '{{breakEven}} で利益ゼロ。それより上なら手元にお金が残ります。',
    conclusionLossWithTargetDetail: '{{target}} {{amount}} まで戻すなら {{price}}（今より {{gap}} 上）',
    discountRoom: '交渉されても、あと {{room}} は下げられます。',
    discountRoomNone: '今の価格がその下限です。これ以上は下げられません。',
    /** 価格ライン（§9.8） */
    tickBreakEven: 'ここで利益ゼロ',
    tickTarget: '目標利益ライン',
    tickCurrent: '今の価格',
    priceLineRaiseHint: '上げるほど残る →',
    priceGap: 'あと {{amount}}',
    previousPrice: '前の価格',
    /** シミュレーター（§9.9 / §9.10） */
    simulatorTitleLoss: '価格を動かしてみる',
    simulatorTitleSafe: '値下げしてみる',
    simulatorNote: '動かしても記録は変わりません',
    simulatorDisabledNote: '価格を入れると、ここで値下げを試せます',
    simulatorProfit: '見込み利益',
    simulatorProfitWithRate: '見込み利益・{{rate}}%',
    verdictLossStill: 'まだ赤字です（−{{amount}}）',
    verdictLossNew: '赤字になります（−{{amount}}）',
    verdictTurnsProfit: '黒字になります（手元に残る {{amount}}）',
    verdictRoomLeft: 'まだ {{room}} の余裕があります',
    verdictAtFloor: 'ここが下限です',
    verdictBelowTarget: '{{target}} {{amount}} まで あと {{shortfall}}',
    verdictTargetMet: '{{target}} {{amount}} を達成',
    applyPriceLoss: '価格を {{breakEven}} 以上に直す',
    applyPriceSafe: 'この価格でこのアプリに記録する',
    applyPriceNote: '出品しているサイトの価格は変わりません。',
    /** 書き換えの確認シート（§9.11） */
    applySheetTitle: 'この価格に書き換えます',
    applyCurrent: 'いまの記録',
    applyNext: '書き換えたあと',
    applyProfit: '見込みの利益',
    applyConfirm: '書き換える',
    applyExternalNote: '出品しているサイトの価格は変わりません。あちらはご自分で変更してください。',
    appliedMessage: 'このアプリの記録を {{price}} にしました',
    priceUndo: '取り消す',
    priceChangeArrow: '{{before}} → {{after}}',
    /** 目標を決めるシート（§9.14） */
    targetSheetTitle: '{{target}}を決める',
    targetClear: '目標を消す',
    targetRowValue: '{{amount}}（この記録だけ）',
    targetPreviewPrice: '目標が出る価格',
    targetPreviewRoom: 'あと下げられる額',
    /** 売れたあとの節（§9.12） */
    soldSectionTitleNoTarget: 'どこまで下げられた取引だったか',
    soldSectionTitleTarget: '値下げの余裕はどれだけあったか',
    soldBodyNoTarget: '{{breakEven}}で利益ゼロでした。{{price}}で売れたので、交渉されても{{room}}は応じられた計算です。',
    soldBodyTargetMet: '{{floor}}までなら目標を保てました。実際は{{price}}で売れたので、{{room}}は応じられた計算です。',
    soldBodyBelowTarget: '{{floor}}以上で売れていれば目標を保てましたが、実際は{{price}}で売れたため、{{shortfall}}足りませんでした。',
    soldOnBadge: '{{date}} に売れました',
    soldDateReversed: '記録した日より前に売れています',
    fixDate: '日付を直す',
    soldPriceRate: '販売価格 {{price}}',
    soldPriceRateWithRate: '販売価格 {{price}}・利益率 {{rate}}%',
    soldActualBar: '実際 {{amount}}',
    soldTargetBar: '目標 {{amount}}',
    targetAchievementBadge: '目標より {{diff}}',
    targetShortfallPast: '目標まであと{{amount}}でした',
    soldPerDayCaption: '仕入品のみ表示',
  },

  /** データタブ（グラフ・タグ別・期間比較。UI-SPEC §1.5） */
  data: {
    modeProfit: '収支',
    modeTag: 'タグ',
    modeAchievements: '実績',
    profitTrend: '{{total}}の推移',
    cumulativeProfit: '累計{{total}}',
    cumulativeValue: '累計 {{amount}}',
    noSoldData: '売却済みのデータがありません',
    clearSelection: '選択を解除',
    selectedRecordsCollapse: '閉じる',
    detailsExpand: '詳細を見る',
    detailsCollapse: '閉じる',
    /** グラフの刻み。軸の凡例と説明文が同じ語を使う */
    unitDay: '日ごと',
    unitMonth: '月ごと',
    unitYear: '年ごと',
    /** 凡例の文中に埋め込むとき。英語だけ小文字にする（Net total by month） */
    unitDayInline: '日ごと',
    unitMonthInline: '月ごと',
    unitYearInline: '年ごと',
    chartBarLegend: '{{unit}}の{{total}}',
    chartUnitNote:
      '年や{{all}}を選ぶと刻みが「{{month}}」（{{all}}で記録が{{years}}年ぶんを超えると「{{year}}」）に変わり、見出しも選んだ期間の語（「〇〇年の{{total}}」「{{all}}の{{total}}」）になります。',
    /** 期間サマリー段の 4 項目 */
    profitRate: '利益率',
    soldCount: '販売件数',
    perRecordProfit: '1件あたり',
    averageSaleDays: '平均販売日数',
    averageSaleDaysValue: '{{days}}日',
    profitRateValue: '{{rate}}%',
    /** グラフの点をタップしたときの見出し */
    selectedPointTitle: '{{date}}の記録　{{count}}件',
    selectedRecordsShowMore: 'すべて見る（あと{{count}}件）',
    /** 前期間比較（差分は矢印つき） */
    periodComparisonTitle: '前期間比較',
    periodComparisonEmpty: '比較対象のデータがありません',
    periodComparisonCountDiff: '{{arrow}}{{sign}}{{count}}件',
    periodComparisonRateDiff: '{{arrow}}{{sign}}{{value}}pt',
    /** タグ別 */
    tagProfitTrend: 'タグ別純利益の推移',
    tagSectionList: '一覧',
    tagSectionOverlay: 'グラフ',
    tagOverlayEmptyNote: 'タグを選ぶと、ここに折れ線が重なって表示されます。',
    tagSparklineNote: '小さな線は1月から12月。高さは全タグ共通の目盛りで、比べられます。',
    unclassifiedTag: '未分類',
    selectedTagTitle: '{{tag}}の記録　{{count}}件',
    selectedTagChartTitle: '{{date}}の{{tag}}の記録　{{count}}件',
    tagChartDaySummaryMeta: '{{tagCount}}タグ・{{records}}',
    tagProfitMeta: '{{rateLabel}} {{rate}}・{{count}}',
    tagSectionMeta: '{{period}}・{{count}}',
    zeroRecordTagsShow: '記録のない{{count}}タグを見る',
    zeroRecordTagsHide: '記録のない{{count}}タグを閉じる',
    /** 絞り込みの通知バー */
    filterClear: '解除',
    filterClearAction: '解除する',
    filterNoticeHint: '絞り込みの条件を変えます',
  },

  /** 日付を選ぶ（カレンダー・日付チップ・期間ピッカー。UI-SPEC §8.10 / §1.2-3） */
  calendar: {
    chooseMonth: '年月を選ぶ',
    previousMonth: '前の月',
    nextMonth: '次の月',
    /** 今日の印の読み上げ。印そのものは記号なので、語が出るのは読み上げだけ */
    todayMarker: '今日',
    dayAccessibility: '{{day}}日',
    /** 日付チップの相対表記。3 日ぶんだけ持つ（それより前は日付そのものを出す） */
    today: '今日',
    yesterday: '昨日',
    dayBeforeYesterday: '一昨日',
  },

  /** 期間を選ぶ（年グリッド ＋ 月グリッド） */
  periodPicker: {
    thisMonth: '今月',
    lastMonth: '先月',
    hasRecords: '記録あり',
    noRecords: '記録なし',
    yearTapHint: '年を押すと1年分',
    monthTapHint: '月を押すとその月だけ',
    yearSelectedHint: '1年分を選択中',
  },

  /** 実績（データタブの実績モード・一覧・詳細・トースト） */
  achievement: {
    listTitle: '実績一覧',
    earned: '獲得した実績',
    viewAll: 'すべて見る',
    next: '次の実績',
    progressCount: '{{earned}}/{{total}}',
    pageIndicator: '{{index}} / {{total}}',
    detailPrevious: '前の実績を見る',
    detailNext: '次の実績を見る',
    collapseRecords: '閉じる',
    showMoreRecords: 'すべて見る（あと{{count}}件）',
    lockedSectionTitle: '未解除（{{count}}）',
    completeTitle: 'すべての実績を達成しました',
    completeMessage: 'お疲れさまです。新しい実績が増えたらまたお知らせします。',
    /** 獲得トースト。1 件なら名前、複数なら件数でまとめる */
    toastOne: '実績「{{name}}」を達成しました',
    toastMany: '実績を{{count}}件達成しました',
    /** 次の実績までの進み具合。単位が円か件かで文を分ける */
    progressYen: '{{current}} / {{target}}円',
    progressCount2: '{{current}} / {{target}}件',
    remainingYen: 'あと{{amount}}で解除',
    remainingCount: 'あと{{count}}件で解除',
    runnerUpYen: '次点：{{name}}達成（あと{{amount}}）',
    runnerUpCount: '次点：{{name}}達成（あと{{count}}件）',
    /** バッジの段位 */
    tierBronze: 'ブロンズ',
    tierSilver: 'シルバー',
    tierGold: 'ゴールド',
    tierPlatinum: 'プラチナ',
    tierLegend: 'レジェンド',
    /** 一覧のジャンル見出し。絵文字は言語で変えない */
    genreStrike: '⚡一撃',
    genreCareerProfit: '💰累計利益',
    genreSoldCount: '📦販売件数',
    genreTagSpecialty: '🎯得意分野',
    genreTagBestseller: '🔍売れ筋',
    genreStart: '🌱はじめる系',
    genreTag: '🏷️タグ系',
    genreOther: 'その他',
    completedRecord: '達成した記録',
    completedRecordWithCount: '達成した記録（{{count}}件）',
    /** 実績の名前（38 件）。バッジと一覧・詳細・トーストが同じ語を使う */
    name: {
      first_sale: '初めての一歩',
      sale_debut: '販売デビュー',
      first_profit: '初利益',
      career_profit_1000: '累計¥1,000',
      record_count_10: '記録を続けよう',
      tag_debut: 'タグデビュー',
      tag_synergy: 'タグの総合力',
      tag_mastery: 'タグの達人',
      long_battle: '長期戦突破',
      instant_sale: '即売れ',
      goal_kept: '有言実行',
      goal_master: '目標マスター',
      all_rounder: 'なんでも屋',
      profit_1000: '一撃¥1,000',
      profit_5000: '一撃¥5,000',
      profit_10000: '一撃¥10,000',
      profit_30000: '一撃¥30,000',
      profit_50000: '一撃¥50,000',
      career_profit_10000: '累計利益¥10,000',
      career_profit_50000: '累計利益¥50,000',
      career_profit_100000: '累計利益¥100,000',
      career_profit_500000: '累計利益¥500,000',
      career_profit_1000000: '利益ハンター',
      sold_1: '1個売れました',
      sold_10: '10個販売',
      sold_50: '50個販売',
      sold_250: '250個販売',
      sold_500: '500個販売',
      tag_specialty_1000: '得意分野¥1,000',
      tag_specialty_5000: '得意分野¥5,000',
      tag_specialty_10000: '得意分野¥10,000',
      tag_specialty_50000: '得意分野¥50,000',
      tag_specialty_100000: '得意分野¥100,000',
      tag_bestseller_3: '売れ筋3件',
      tag_bestseller_10: '売れ筋10件',
      tag_bestseller_25: '売れ筋25件',
      tag_bestseller_50: '売れ筋50件',
      tag_bestseller_100: '売れ筋100件',
    },
    /** 獲得条件の説明（38 件）。数字は名前にも出るが、条件の側は文で言い切る */
    description: {
      first_sale: '初めて商品が売れた',
      sale_debut: '初めて商品を出品した',
      first_profit: '初めて純利益がプラスの記録で売れた',
      career_profit_1000: '累計純利益¥1,000に到達',
      record_count_10: '記録を10件作った',
      tag_debut: '初めてタグを付けた記録を作った',
      tag_synergy: '3つの異なるタグで、それぞれ累計純利益¥5,000以上を達成',
      tag_mastery: '3つの異なるタグで、それぞれ累計純利益¥10,000以上を達成',
      long_battle: '出品から{{days}}日以上かけて売れた商品がある',
      instant_sale: '出品したその日のうちに売れた商品がある',
      goal_kept: '目標利益を達成した記録がある',
      goal_master: '目標利益を達成した記録が10件以上',
      all_rounder: '仕入品・不用品の両方で純利益がプラスの記録がある',
      profit_1000: '1件の商品で純利益¥1,000以上を達成',
      profit_5000: '1件の商品で純利益¥5,000以上を達成',
      profit_10000: '1件の商品で純利益¥10,000以上を達成',
      profit_30000: '1件の商品で純利益¥30,000以上を達成',
      profit_50000: '1件の商品で純利益¥50,000以上を達成',
      career_profit_10000: '累計純利益¥10,000に到達',
      career_profit_50000: '累計純利益¥50,000に到達',
      career_profit_100000: '累計純利益¥100,000に到達',
      career_profit_500000: '累計純利益¥500,000に到達',
      career_profit_1000000: '累計純利益¥1,000,000に到達',
      sold_1: '累計1件を販売',
      sold_10: '累計10件を販売',
      sold_50: '累計50件を販売',
      sold_250: '累計250件を販売',
      sold_500: '累計500件を販売',
      tag_specialty_1000: '1つのタグで累計純利益¥1,000以上',
      tag_specialty_5000: '1つのタグで累計純利益¥5,000以上',
      tag_specialty_10000: '1つのタグで累計純利益¥10,000以上',
      tag_specialty_50000: '1つのタグで累計純利益¥50,000以上',
      tag_specialty_100000: '1つのタグで累計純利益¥100,000以上',
      tag_bestseller_3: '1つのタグで売却済み記録が3件以上',
      tag_bestseller_10: '1つのタグで売却済み記録が10件以上',
      tag_bestseller_25: '1つのタグで売却済み記録が25件以上',
      tag_bestseller_50: '1つのタグで売却済み記録が50件以上',
      tag_bestseller_100: '1つのタグで売却済み記録が100件以上',
    },
  },

  /** 自己ベスト（実績モードの上段） */
  personalBest: {
    sectionTitle: '自己ベスト',
    yourRecords: 'あなたの記録',
    careerNetProfit: '累計純利益',
    careerSales: '累計売上',
    bestNetProfit: '最高純利益',
    bestSalesPrice: '最高販売価格',
    bestMonthByProfit: '最高月間利益',
    bestMonthByCount: '最多販売月',
    bestTag: '最多販売タグ',
    fastestSale: '最速販売',
    bestMonthByCountValue: '{{month}}月・{{count}}件',
    bestTagValue: '{{tag}}・{{count}}件',
    bestTagOfTotal: '全{{count}}件中',
    fastestSaleValue: '{{days}}日',
    /** 自己ベストがまだ無いときの値 */
    emptyValue: '—',
  },

  /** バックアップと復元（SPEC-V8） */
  backup: {
    screenTitle: 'バックアップと復元',
    createSection: 'バックアップを作る',
    createNote: '今あるデータをまとめて1つのファイルにします。機種を変えるときは、このファイルを新しい端末に渡してください。',
    createButton: 'バックアップを作る',
    createWithoutPhotos: '写真なしで作る',
    creating: '作っています...',
    createFailed: 'バックアップを作れませんでした。',
    shareDialogTitle: 'バックアップを保存',
    sharingUnavailable: 'この端末では共有できません。',
    lastCreatedNever: 'まだ一度も作っていません',
    lastCreated: '前回作ったのは {{date}}',
    dayLabel: '{{year}}年{{month}}月{{day}}日',
    relativeToday: 'きょう',
    relativeYesterday: 'きのう',
    progressWaitNote: 'このままお待ちください',
    photoProgress: '写真 {{done}}枚目 / {{total}}',
    /** 写真を含めるか（§4） */
    photoSection: '商品の写真',
    photoInclude: '含める',
    photoExclude: '含めない',
    photoExcludeDetail: 'ファイルが軽い',
    photoIncludeDetail: '{{photos}}・{{size}}',
    noPhotoWarning: 'このバックアップに写真は含まれません。新しい端末で写真は表示されなくなります。',
    photoLimitTitle: '写真が多すぎます',
    photoLimitMessage: '写真を全部入れると、作っている途中でアプリが止まってしまいます。',
    photoLimitBarLabel: '今の写真 {{photos}}',
    photoLimitBarMax: '上限 {{size}}',
    photoLimitBarMin: '0',
    photoLimitFooter: '写真なしでも、記録{{records}}件・タグ{{tags}}件・プリセット{{presets}}件はすべて新しい端末に移せます。写真だけは「写真」アプリなどに保存してください。',
    limitCancel: 'やめる',
    /** 復元（§5.4） */
    restoreSection: '復元する',
    restoreNote: 'バックアップの ZIP ファイルか、それを解凍したフォルダを選びます。中身を確認するために解凍したあとでも復元できます。',
    pickFile: 'バックアップのファイルを選ぶ',
    pickFolder: '解凍したフォルダを選ぶ',
    pickAnotherFile: '別のファイルを選ぶ',
    folderPickUnavailable: 'この端末ではフォルダを選べません。ZIP ファイルのまま選んでください。',
    restoring: '読み込んでいます...',
    /** プレビュー（§5.4） */
    previewScreenTitle: '読み込む中身',
    previewBack: '戻る',
    createdLine: '作成日 {{day}}',
    createdLineNoPhoto: '作成日 {{day}}・写真なし',
    dayWithRelative: '{{day}}（{{relative}}）',
    diffCurrentHeader: '今の端末',
    diffFileHeader: 'ファイル',
    countRecords: '記録',
    countTags: 'タグ',
    countPresets: 'プリセット',
    countPhotos: '写真',
    countChip: '{{label}} {{count}}',
    replaceAll: 'すべて置き換える',
    replaceWithoutPhotos: '写真なしで置き換える',
    replaceWarning: '今あるデータ（記録{{count}}件）はすべて消えて、ファイルの中身に置き換わります。元には戻せません。',
    largeDecreaseNote: '記録が{{current}}件から{{next}}件に減ります。古いバックアップを選んでいないか確かめてください。',
    newestRecordNote: '中で一番新しい記録は {{day}}「{{name}}」です。見覚えがなければ、別の人のファイルです。',
    noPhotoInFileTitle: 'このファイルに写真は入っていません。',
    noPhotoInFileBody: '写真は復元されません。今この端末にある写真{{photos}}も、いっしょに削除されます。',
    /** 結果（§5.6） */
    resultScreenTitle: '読み込みの結果',
    restoredTitle: '復元しました。',
    resultOpenRecords: '記録を見る',
    restoredPhotoValue: '{{restored}}',
    restoredPhotoValueWithMissing: '{{restored}}（{{missing}}は復元できず）',
    missingPhotoNote: '写真{{photos}}はファイルの中に無いか壊れていたため、その{{count}}件は写真なしの記録として入りました。金額や日付は入っています。',
    missingPhotoRecords: '写真がなかった{{count}}件を見る',
    missingPhotoListTitle: '写真がなかった記録',
    /** エラー（§3.3） */
    errorTitle: 'バックアップを読み込めませんでした。',
    errorHint: '1か所でも読めない値があると、途中まで入れることはしません。ファイルを作り直すか、別のファイルを選んでください。',
    errorUnchangedNote: '現在のデータは変更されていません。',
    errorCopy: 'この内容をコピーする',
    errorCopyToast: 'エラーの内容',
    csvInsideNote: '中身はCSVですが、確認用です。編集して読み込むことは想定していません。',
    brokenZipMessage: 'ファイルを開けませんでした。壊れている可能性があります。',
    noCsvMessage: '選んだファイルはバックアップではないようです。バックアップの ZIP か、それを解凍したフォルダを選んでください。',
    unsupportedVersion: 'このバックアップの形式（バージョン {{version}}）には対応していません。アプリを更新してください。',
    missingFile: '{{file}} が見つかりません。',
    emptyFile: '{{file}} が空です。',
    columnCountMismatch: '{{file}} の列の数が違います。必要な列は {{expected}} ですが、ファイルには {{actual}} あります。',
    columnNameMismatch: '{{file}} の列名が違います。{{index}} 列目は「{{expected}}」のはずですが「{{actual}}」になっています。',
    fieldCount: '{{file}} {{line}}行目：項目の数が {{expected}} ではなく {{actual}} です。',
    columnError: '{{file}} {{line}}行目：「{{column}}」{{reason}}',
    emptyColumn: '{{file}} {{line}}行目：「{{column}}」が空です。',
    numberError: 'が正しい数値ではありません。',
    dateError: 'が正しい日付ではありません。',
    booleanError: 'が 0 か 1 ではありません。',
    enumError: 'が {{values}} のどれでもありません。',
    unknownRecordRef: 'record_tags.csv {{line}}行目：記録ID「{{id}}」が records.csv にありません。',
    unknownTagRef: 'record_tags.csv {{line}}行目：タグID「{{id}}」が tags.csv にありません。',
    /** 枚数・容量 */
    photoCount: '{{count}}枚',
    sizeMb: '{{value}}MB',
    sizeKb: '{{value}}KB',
    sizeUnderKb: '1KB未満',
  },

  /** CSV の書き出し（SPEC-V3 §5） */
  export: {
    sheetTitle: '書き出し（CSV）',
    shippingMaterialNote: '送料には{{material}}の代金を含みます',
    submit: '書き出す',
    cancel: 'キャンセル',
    kindSection: '種類',
    kindBackup: 'データ保存用',
    kindTax: '確定申告用',
    kindBackupNote: 'メモやタグも含めて、記録した内容をすべて書き出します。表計算で見るための形です。',
    kindTaxNote: '帳簿に要る列だけを書き出します。メモとタグは出しません。',
    groupingSection: 'まとめ方',
    groupingRecord: '1件ずつ',
    groupingDay: '日ごとにまとめる',
    groupingRecordNote: '1行に1件ずつ書き出します。',
    groupingDayNote: '同じ日の記録を1行に合算します。商品名は「えんぴつ ほか2件」の形になります。',
    periodSection: '期間',
    targetSection: '対象',
    targetSoldOnly: '売れた記録のみ',
    targetIncludeListing: '出品中も含める',
    summary: '{{period}}・{{target}}',
    summaryTargetBoth: '売れた記録と出品中',
    countLabel: '{{count}}',
    countLabelWithRows: '{{count}}（{{rows}}行）',
    emptyNote: 'この期間に対象の記録がありません。',
    emptyNoteWithListing: 'この期間に対象の記録がありません。出品中の記録は{{count}}件あります。',
    notRestorableNote: 'このCSVは復元には使えません。機種変更などでデータを移すときは「バックアップと復元」をお使いください。',
    taxNotice: '不用品でも、課税対象になる場合があります。書き出したあとで仕分けてください。',
    taxNoticeOpen: '詳しい説明を開く',
    failed: '書き出せませんでした。もう一度お試しください。',
    sharingUnavailable: 'この端末では共有シートを開けませんでした。',
    /** プレビュー（§5.9） */
    previewCardTitle: '書き出す表',
    previewOpen: '全部見る',
    previewScreenTitle: 'プレビュー',
    previewBack: 'シートに戻る',
    previewScrollHint: '横に動かすと残りの列が見えます',
    previewMeta: '先頭{{rows}}行・全{{columns}}列',
    previewScreenMeta: '全{{columns}}列・{{count}}',
    /** ファイルの中の語 */
    recordIdColumn: '記録ID',
    kindMixed: '混在',
    allPeriodFile: '全期間',
    fileBaseBackup: '売上記録',
    fileBaseTax: '確定申告',
  },

  /** タグの管理（設定タブ配下。SPEC-V4 §2） */
  tagAdmin: {
    listNote: 'タグを消しても、記録そのものは消えません。',
    emptyBody: '記録を追加するときにも作れます。',
    formTitleNew: 'タグを追加',
    formTitleEdit: 'タグを編集',
    nameField: '名前（必須）',
    namePlaceholder: '名前',
    previewLabel: 'タグ一覧での見え方',
    deleteLabel: 'このタグを削除',
    deleteA11y: '{{name}}を削除',
    deleteConfirm: 'このタグが付いた記録が{{count}}件あります。記録は残り、このタグだけが外れます。',
    deletedMessage: '『{{name}}』を削除しました',
    deletedMessageWithCount: '『{{name}}』を削除しました（{{count}}件の記録から外れました）',
  },

  /** プリセットの管理（設定タブ配下。SPEC-V3 §3.2 / §3.3 / SPEC-V10） */
  presetAdmin: {
    emptyTitle: '登録がありません',
    emptyBody: 'よく使う{{type}}を登録すると、記録するときに選ぶだけで入ります。',
    addLabel: '＋ {{type}}を追加',
    editMode: '編集',
    editModeDone: '完了',
    formTitleNew: '{{type}}を追加',
    formTitleEdit: '{{type}}を編集',
    deleteLabel: 'この{{type}}を削除',
    deleteConfirm: 'この{{type}}を使った記録が{{count}}件あります。記録とその金額は残り、今後の入力候補から外れます。',
    deletedMessage: '{{type}}を削除しました',
    listNoteSite: '選ぶと手数料率が入ります。保存済みの記録の手数料は変わりません。',
    listNoteShipping: '選ぶと送料が入ります。実際の料金は各配送サービスの案内で確認してください。',
    listNotePackaging: '電卓の中から複数選べます。合計が梱包材の欄に入ります。',
    editValueNoteRate: '手数料率を変えても、これまでの記録の手数料はそのままです。',
    editValueNoteAmount: '金額を変えても、これまでの記録の金額はそのままです。',
    /** 入力欄 */
    nameField: '名前',
    initialField: 'バッジの文字',
    initialHint: '{{max}}文字まで・押して直せます',
    initialEditingHint: '{{max}}文字まで',
    valueFieldRate: '手数料率（%）',
    valueFieldAmount: '金額',
    valueTextRate: '{{value}}%',
    priceModeLabel: '金額の入れ方',
    priceModeSingle: '1個ずつ',
    priceModePack: 'まとめ買い',
    calcMethodLabel: '計算方式',
    calcMethodCount: '個数から',
    calcMethodArea: '面積から',
    calcMethodUsage: '使用回数から',
    packQuantityField: '入数（個）',
    usageCountField: '想定使用回数（回）',
    packPriceField: '購入価格',
    packHeightField: '購入サイズ 縦（cm）',
    packWidthField: '購入サイズ 横（cm）',
    useHeightField: '平均使用サイズ 縦（cm）',
    useWidthField: '平均使用サイズ 横（cm）',
    useSizeNote: '任意です。入れると1回あたりの金額まで出ます。空のままなら1㎡あたりの金額が経費に入ります。',
    unitPrice: '1個あたり',
    usePrice: '1回あたり',
    areaUnitPrice: '1㎡あたり',
    usePriceWithSize: '1回あたり（{{height}}×{{width}}cm）',
    unitPriceEmpty: '—',
    /** 専用資材（SPEC-V6） */
    shippingMaterial: '専用資材',
    shippingMaterialField: '専用資材の代金',
    shippingTotal: '合計',
    shippingTotalNote: '記録でこのプリセットを選ぶと、この合計が送料に入ります。',
    shippingMaterialRow: '送料 {{postage}} ＋ 専用資材 {{material}}',
    /** 保存が押せない理由（§3.3 / SPEC-V10 §1.4） */
    errorNameRequired: '名前を入れてください',
    errorNameTooLong: '名前は{{max}}文字までです',
    errorRateRange: '手数料率は 0〜{{max}} の範囲で入れてください',
    errorAmountRange: '金額は 0 以上で入れてください',
    errorPackQuantity: '入数を入れてください',
    errorUsageCount: '想定使用回数を入れてください',
    errorPackPrice: '購入価格は 0 以上で入れてください',
    errorPackSize: '購入サイズの縦・横を入れてください',
    errorUseSize: '平均使用サイズは縦・横の両方を入れてください',
    errorMaterialCost: '専用資材は 0 以上で入れてください',
  },

  /** 色を選ぶ（設計案 50c / 51b） */
  color: {
    red: '赤', orange: 'オレンジ', yellow: '黄', green: '緑', teal: 'ティール',
    blue: '青', indigo: '藍', purple: '紫', pink: 'ピンク', brown: '茶', gray: 'グレー',
    pickerTitle: '色を選ぶ',
    pickerDone: '決定',
    custom: '自由色',
    customCreate: '新しい色を作る',
    customChange: '自由色を変える',
    selectableSection: '選べる色',
    unusedSection: 'まだ使っていない色',
    usedSection: '使用中',
    usedPickSection: '使用中の色から選ぶ',
    allUsedSubtitle: '固定の{{count}}色は使い切りました',
    remaining: '{{count}}色',
    otherUsedSection: 'ほかの{{entity}}が使用中',
    ownColor: '{{color}}（この{{entity}}の色）',
    userOne: '{{name}}',
    userMany: '{{name}} ほか{{count}}件',
    sameColorOne: '「{{name}}」と同じ色です',
    sameColorMany: '「{{name}}」ほか{{count}}件と同じ色です',
  },

  /** 初回起動チュートリアル（オンボーディング） */
  /**
   * 使いかたの図（HelpPartFigure / HelpDiagram）にしか出ない語。
   * 画面にも出る語は流用せず、その画面の節から引く（図だけ古い語で残るのを防ぐ）。
   */
  /**
   * 使いかたの本文（helpContent.ts の並びと図はコードが持ち、語だけここ）。
   * 項目の id は全ページを通して一意なので、そのままキーにしてある。
   */
  help: {
    /** 各画面の「？」から開くシートの見出し。その場に合った語にする */
    entries: {
      calc: '計算のしかた',
      recordList: '記録の見かた',
      recordDetail: '記録の見かた',
      recordForm: '記録の書きかた',
      pricing: '売る前と売ったあと',
      data: 'データの見かた',
      dataTag: 'データの見かた',
      dataAchievements: 'データの見かた',
      export: '書き出し（CSV）',
      backup: 'バックアップと復元',
      tagForm: 'タグの作りかた',
      presetForm: '登録のしかた',
    },
    readAllLabel: '使いかたを最初から読む ›',
    termsEntryLabel: 'ことばの説明 ›',
    screenTitle: '使いかた',
    buttonLabel: '使いかた',
    pages: {
      calc: { chip: '計算', title: '計算のしかた' },
      record: { chip: '記録', title: '記録の書きかた' },
      sell: { chip: '売る', title: '売る前と売ったあと' },
      data: { chip: 'データ', title: 'データの見かた' },
      keep: { chip: '残す', title: '書き出しとバックアップ' },
      terms: { chip: 'ことば', title: 'ことばの説明' },
    },
    groups: {
      calc1: '金額を出す',
      calc2: '入力を楽にする',
      calc3: '終わったら',
      record1: '作る',
      record2: '見る',
      record3: '探す',
      record4: '直す',
      record5: '設定タブで登録しておく',
      sell1: '出品したあとに考える',
      sell2: '売れたあと',
      data1: '3 つの見かた',
      data2: '収支のグラフ',
      data3: '期間と絞り込み',
      keep1: 'この端末の中のこと',
      keep2: 'バックアップと復元',
      keep3: '書き出し（CSV）',
    },
    items: {
      'calc-net': {
        title: 'いくら手元に残るか知りたい',
        body: '「純利益を出す」（仕入品では「利益を出す」）を選び、その下で不用品か仕入品かを選んでから、販売価格とかかるお金（送料・手数料・梱包材・その他）を入れます。仕入品のときは仕入価格の欄も出ます。上の大きな数字が手元に残る金額です。入れた欄だけで計算するので、全部を埋める必要はありません。',
      },
      'calc-target': {
        title: 'いくらで売ればいいか知りたい',
        body: '「目標から逆算」に切り替えて、ほしい利益と、かかるお金を入れます。上の数字が「この値段で売ればいい」という販売価格になります。同じ 1 本の帯を、どちら側から見るかの違いです。',
      },
      'calc-fee': {
        title: '手数料はどうやって入れるか',
        body: '手数料だけは、金額ではなく率（%）で入れます。ほかの欄と違って電卓は出ず、「手数料 10%」の行の「−」「＋」で 1% ずつ動かします。入れられるのは 0% から 50% までです。\n\n販売サイトを登録しておけば、行の横の印を押すだけで、その率とサイトの名前が同時に入ります。\n\n率をあとから変えても、これまでの記録の手数料はそのままです。記録に入っているのは、そのとき計算した金額そのものだからです。',
      },
      'calc-breakdown': {
        title: '何にいくらかかるか見たい',
        body: '数字の下の「内訳」を押すと、引かれる分の内訳が色分けの帯で出ます。どれがいちばん重いかがひと目で分かります。',
        linkLabel: '販売サイトの表示額との違いを見る ›',
      },
      'calc-calculator': {
        title: 'その場で足し算やかけ算をしたい',
        body: '金額を打ち込む欄（販売価格・仕入価格・送料・梱包材・その他）の右にある青い電卓のボタンを押すと電卓が開きます。「行を足す」で何行でも積めるので、箱代とテープ代を別々に入れて合計を出す、といった使い方ができます。「入れる」を押すと合計だけがその欄に入ります。手数料は率なので電卓は出ず、「−」「＋」で動かします。\n\n一度「入れる」を押したあとは、欄の数字をそのままにしておけば、次に電卓を開いたときも前の行がそのまま残っています。欄を手で打ち直したり、プリセットで入れ直したりすると、その数字 1 行から始まります。',
      },
      'calc-preset': {
        title: '毎回同じ数字を打つのをやめたい',
        body: '送料の欄の横にあるタグの印を押すと、登録しておいた送料から選べます。手数料の行の横にある印は「販売サイト」を選ぶもので、押して選ぶと手数料の率とサイトの名前が同時に入り、その下にサイト名の行が出ます。\n\n選んだあとは、印の右に「✕」が出ます。送料の「✕」は送料の欄を空に戻し、販売サイトの「✕」は名前だけを消します（率はそのまま残ります）。サイト名は、その下のサイト名の行の「✕」からも消せます。\n\n梱包材には欄の横に印がなく、電卓の中から選びます。登録は設定タブの「入力を減らす」から行います。',
        linkLabel: '登録のしかたを見る ›',
      },
      'calc-shipping-material': {
        title: '送料に箱代も一緒に入れたい',
        body: '送料の欄の横にあるタグの印を押すと、登録しておいた送料が一覧で出ます。送料のプリセットに「専用資材」の代金も登録しておくと、その行だけ「送料のみ」「＋資材」の 2 つに分かれます。どちらを押すといくらになるかは押す前に読めて、押した側の金額がそのまま欄に入ります。行そのものを押したときは「＋資材」のほうが選ばれます。\n\n宅配便の箱のように、その送り方でしか使わないものを入れておく場所です。どの発送にも使う封筒やテープは、梱包材のほうに登録してください。資材の代金を登録していない送料では、この 2 つは出ません。',
        linkLabel: '送料の登録のしかたを見る ›',
      },
      'calc-clear': {
        title: '入力を消してやり直したい',
        body: '結果の右上にある「クリア」を押すと、「入力をクリアしますか？」と一度確認が出ます。「クリア」をもう一度押すと、入れた数字がすべて空欄になり、種別も既定値に戻ります。何も入れていないときは押せません。',
      },
      'calc-to-record': {
        title: '計算した内容をそのまま残したい',
        body: '画面の下の「この内容で記録する」を押すと、いま入れている数字が入った状態で記録の画面が開きます。打ち直す必要はありません。「目標から逆算」で入れていたほしい利益は、そのまま記録の目標利益として引き継がれます。',
        linkLabel: '目標利益について見る ›',
      },
      'record-new': {
        title: '売れたもの・出品したものを残したい',
        body: '記録タブの左下の「＋ 記録」を押すと、「新しく作る」と「過去の記録から複製」の 2 つが出ます。「新しく作る」を選ぶと、空の記録の画面が開きます。計算タブの「この内容で記録する」からでも同じ画面が開きます。商品名だけは必ず入れてください。',
      },
      'record-duplicate': {
        title: '前と同じような物をまた出したい',
        body: '記録タブの「＋ 記録」から「過去の記録から複製」を選ぶと、これまでの記録の一覧が出ます。商品名でさがすことも、タグで絞ることもできます。\n\n押した記録の商品名・種別・仕入価格・送料・手数料・販売サイト・梱包材・その他・タグ・目標が入った状態で、新しい記録の画面が開きます。同じ送り方で同じような物を出すときに、経費を打ち直さずに済みます。\n\n販売価格・写真・メモは引き継ぎません。日付は今日から、状態は出品中から始まります。複製元は売れた記録でも出品中でもかまいません。作られるのは新しい記録なので、元の記録は変わりません。',
      },
      'record-kind': {
        title: '種別（不用品と仕入品）',
        body: '仕入品を選ぶと仕入価格の欄が増えます。不用品は家にあった物を売る記録なので、仕入価格の欄は出ません。あとから変えられます。',
        linkLabel: '違いを見る ›',
      },
      'record-status': {
        title: 'まだ売れていないものを残したい',
        body: '記録の画面で「出品中にする」を押すと、売れる前の記録として残せます。売れたら記録の詳細の「売れた」を押すか、記録の画面で「売れた記録にする」を押して、販売日を入れてください。',
      },
      'record-saledate': {
        title: '販売日が選べないとき',
        body: '出品する前に売れることはないため、販売日は出品日より前にできません。前の日付にしたいときは、先に出品日を直してください。',
      },
      'record-photo': {
        title: '写真を付けたい',
        body: '記録の画面で、商品名の左の四角い枠を押すと写真を選べます。選べるのは「写真」に入っているもので、この枠からカメラは開きません。先に撮ってから選んでください。1 件につき 1 枚です。\n\n付けると一覧・詳細・記録の画面の 3 か所に出るので、名前を読まなくてもどの商品か分かります。外したいときは写真の右上の「✕」を押します。',
        linkLabel: '写真がどこに入るかを見る ›',
      },
      'record-tag': {
        title: '「洋服」「食器」のように分けたい',
        body: '記録の画面で、金額の並びの下にある「タグ」の見出しの右の「＋ 追加」を押すと選べます。まだ無いタグは、その場の検索欄に打って「＋『洋服』を作る」で作れます。タグは付けなくてもかまいません。',
      },
      'record-memo': {
        title: 'メモを残したい',
        body: '記録の画面の下にある「メモを書く」を押すと開きます。何か書くと見出しは「メモ」に変わるので、畳んだままでも書いてあるかどうかが分かります。メモは、書き出し（CSV）の 2 種類のうちデータ保存用には入りますが、確定申告用には入りません。',
        linkLabel: '書き出しの 2 種類を見る ›',
      },
      'record-target': {
        title: 'この 1 件でいくら残したいか決めておきたい',
        body: '記録の画面の下のほうにある「目標の純利益」（仕入品では「目標利益」）を開くと、その 1 件だけの目標を入れておけます。決めておくと、あとから「いくらで売る？」の画面で、目標に届く価格と、あといくらまで下げられるかが出ます。\n\n空欄のままでもかまいません。目標は「こうしたい」という値なので、収支の計算には一切入りません。記録の合計にもデータタブの数字にも出ません。',
        linkLabel: '目標の使い道を見る ›',
      },
      'record-target-zero': {
        title: '「0 円」と「決めていません」は別のもの',
        body: '目標を入れていない記録には「決めていません」と出ます。これは目標を 0 円にした記録とは別のものです。\n\n0 を入れると、「赤字にならなければよい」という目標を決めたことになります。「いくらで売る？」の画面では、赤字にならない価格までの差が下げ幅として出ます。\n\n決めていない記録では、下げ幅そのものが出ません。何を基準に下げ止まればよいかが決まらないためです。決めていない状態に戻したいときは、0 ではなく空欄にしてください。',
      },
      'record-bar': {
        title: '1 件の内訳を見たい',
        body: '記録の詳細を開くと、金額のカードの先頭に色分けの帯が出ます。販売価格を 1 本の帯として、手元に残る分と引かれる分の割合を見るものです。\n\n緑が手元に残る分、オレンジが販売手数料、赤系がその他の経費です。計算タブの「内訳」と同じ色で、画面が変わっても意味は変わりません。\n\n帯そのものには名前を書いていません。色の意味は、その下に続く一覧の各行の左に付いた同じ色の丸が引き受けます。行を上から読めば、帯のどの区画がどの項目かが分かります。\n\n帯の下には、次に何ができるかの 1 行が出ます。出品中の記録では、あといくら下げられるか（赤字のときは、あといくら値上げすれば赤字から抜けられるか）。売れた記録では、どう終わったかのまとめです。押すと、出品中は「いくらで売る？」、売れた記録は「どうだった？」の画面に移れます。',
        linkLabel: '「いくらで売る？」を見る ›',
      },
      'record-copy': {
        title: '商品名や金額をコピーしたい',
        body: '記録の詳細で、商品名・販売価格・利益・経費の各行・メモを長押しすると、その内容がコピーされます。うまくいくと短く振動して、画面の上に「◯◯をコピーしました」と出ます。出品するときの商品名や、帳簿に書き写す金額を、打ち直さずに他のアプリへ貼れます。\n\n中身が空のところは長押しできません。「無題」「未入力」と出ている語そのものをコピーしても仕方がないためです。\n\n長押しはこのコピーのための操作にしてあります。プリセットのバッジやタグを直すときは、長押しではなく普通に押してください。',
      },
      'record-find-period': {
        title: '別の月を見たい',
        body: '記録タブの月の行の「◀」「▶」で前の月・次の月に移れます。月の名前を押すと「今月」「先月」「全期間」のボタンと月のカレンダーが出ます。年の見出しを押すと、その年 1 年分をまとめて選べます。',
      },
      'record-find-status': {
        title: '売れたものと出品中を切り替えたい',
        body: '金額が出ている行の右にある「売れた記録」「出品中」で切り替えます。上の合計も入れ替わり、「出品中」では収支ではなく「出品価格の合計」になります。一覧の行も、売れた記録は収支、出品中は出品価格と「売れたら 約◯円」の見込みに変わります。この見込みは、いま入っている経費を引いた金額です。送料などをまだ入れていなければ、その分は引かれていません。',
      },
      'record-find-filter': {
        title: '種別やタグで絞りたい',
        body: '月の行の右の「▽」を押すと、絞り込みの画面が開きます。「売れた記録」を見ているときは種別・販売サイト・タグの 3 つ、「出品中」を見ているときは販売サイトがまだ決まっていないので種別とタグの 2 つで絞れます。絞っている間は青い行が出て、そこを押すと同じ画面に戻れます。',
      },
      'record-tag-or': {
        title: 'タグを 2 つ選ぶとどうなるか',
        body: '絞り込みでタグを 2 つ以上選ぶと、どれか 1 つでも付いている記録が出ます。両方が付いている必要はありません。タグを増やすほど、出る記録は多くなります。\n\nデータタブの絞り込みでも同じです。',
      },
      'record-find-search': {
        title: '商品名でさがしたい・並び替えたい',
        body: '右上の虫めがねを押すと、上の行が入力欄に変わります。商品名の一部を打つと絞られます。さがせるのは商品名だけで、メモやタグの名前では絞れません。\n\n右上の上下の矢印を押すと、販売日・出品日・収支・経費が並び、それぞれの右にある「新しい順」「古い順」「多い順」「少ない順」を押すとその並びになります。「出品中」を見ているときは販売日がまだ無いので、出品日・見込みの収支・経費の 3 つになります。',
      },
      'record-edit': {
        title: 'あとから直したい・消したい',
        body: '記録の一覧で行を押すと詳細が開きます。下の「編集する」で直せます。詳細の「削除」を押したときは確認が出ます。\n\n一覧では行を左へスワイプしても消せますが、こちらは確認が出ず、押した時点ですぐ消えます。どちらで消しても元に戻すことはできません。',
      },
      'record-tag-delete': {
        title: 'タグを消したい・消すとどうなるか',
        body: 'タグは設定タブの「記録を分類する」で消せます。行を左へスワイプして「削除」です。名前と色も同じ画面から変えられます。\n\nタグを消しても、記録そのものは消えません。その記録からタグが外れるだけです。消した直後に画面の下に出る「元に戻す」を押せば、タグも付いていた記録も元どおりになります。',
      },
      'record-preset': {
        title: 'よく使う値を登録しておきたい',
        body: '設定タブの「入力を減らす」に、よく使う値（プリセット）として販売サイト・送料・梱包材を登録しておけます。一度登録すれば、次からは選ぶだけで欄に入ります。\n\n販売サイトと送料は、その欄の横にあるタグの印を押すと一覧から選べて、押した値がそのまま欄に入ります。梱包材だけは呼び出す場所が違います。\n\n送料の金額はご自身で登録したもので、実際の料金は配送サービスの案内で確認してください。',
      },
      'record-preset-material': {
        title: '梱包材はどこから選ぶか',
        body: '梱包材には、欄の横にタグの印がありません。梱包材の欄の右にある青い電卓のボタンを押し、開いた電卓の中の「梱包材から選ぶ」（タグの印の付いた青い文字）から選びます。\n\nここではいくつでも選べて、「入れる」を押すと選んだ分が 1 行ずつ積まれ、その合計が欄に入ります。箱とテープを別々に登録しておけば、2 つ選ぶだけで合計が出ます。',
      },
      'record-preset-pack': {
        title: 'まとめ買いした梱包材の 1 個あたり・1 回あたりを出したい',
        body: '梱包材の登録で「まとめ買い」を選ぶと、「計算方式」を「個数から」「面積から」「使用回数から」の 3 つから選べます。何で割るかが違うだけで、どれも 1 回ぶんの金額を出すためのものです。\n\n「個数から」は、入数と購入価格を入れると 1 個あたりが出ます。100 枚で 800 円なら 1 枚 8 円として登録されます。\n\n「面積から」は、購入サイズの縦・横と購入価格を入れると 1㎡あたりが出ます。ロールで買うプチプチのように、切って使うもの向けです。さらに「平均使用サイズ」の縦・横を入れると、1 回あたりまで出ます。この 2 つは任意で、空のままなら 1㎡あたりの金額が経費に入ります。\n\n「使用回数から」は、想定使用回数と購入価格を入れると 1 回あたりが出ます。テープのように、何回ぶん使えるかで数えるもの向けです。\n\n一覧では、その金額が「1個あたり」「1回あたり」「1㎡あたり」のどれなのかが行に出ます。',
      },
      'record-preset-edit': {
        title: '登録した値を直す・消す',
        body: 'プリセットの行を押すと編集の画面が開きます。消したいときは、いちばん下の「この送料を削除」（種類によって語が変わります）を押します。\n\n登録した値を直しても、保存済みの記録の金額は変わりません。手数料の率を変えても、これまでの記録の手数料はそのままです。記録に入っているのは、そのとき入れた金額そのものだからです。',
      },
      'record-badge': {
        title: 'バッジの文字を変えたい',
        body: 'よく使う値（プリセット）の登録・編集の画面には、上のほうに大きなバッジが出ています。このバッジをそのまま押すと、中の文字を直せます。文字を入れるための専用の欄はありません。\n\n何も入れなければ、名前の先頭が入ります。「A4・厚さ3cm以内」なら「A4」のように、自分で読みやすい 2 文字までを入れておくと、選ぶときに見分けやすくなります。\n\nここは普通に押すだけです。長押しは記録のコピーに使っているので、ここでは効きません。',
      },
      'record-color': {
        title: '色の選びかた',
        body: 'タグとプリセットの色は、固定の 11 色から選べます。丸は 2 つの群に分かれていて、上が「まだ使っていない色」、下が「使用中」です。編集のときは見出しが変わり、上が「選べる色」、下が「ほかのタグが使用中」（プリセットではその種類の名前）になります。いま自分が使っている色は、上の先頭に残ります。\n\n使用中の色も押して選べます。同じ色を 2 つに付けるのが間違いとは限らないので、止めずに「「洋服」と同じ色です」のように 1 行だけ出ます。',
      },
      'record-color-custom': {
        title: '11 色にない色を使いたい',
        body: '丸の最後にあるのが「自由色」です。押すと色を自分で作れて、「決定」で確定します。\n\n11 色を全部使い切ったときは、上が「新しい色を作る」の 1 行に変わり、固定の 11 色は「使用中の色から選ぶ」として下に並びます。',
      },
      'record-default-kind': {
        title: '最初に選ばれる種別を変えたい',
        body: '設定タブの「新規作成時の種別」で選べます。新しく作る記録で最初に選ばれる種別が変わるだけで、保存済みの記録は変わりません。',
      },
      'sell-open': {
        title: '「いくらで売る？」を開く',
        body: '記録の詳細で、金額のカードの帯の下にある行を押すと開きます。出品中の記録では「いくらで売る？」、売れた記録では「どうだった？」という画面になります。\n\nここは 1 つの商品だけを見る場所です。全体の売れ行きはデータタブ、この 1 つをいくらで売るかはこちら、と分かれています。\n\nまだ価格を入れていない記録でも開けます。そのときは「価格がなくても分かっていること」として、赤字にならない価格などが出ます。',
      },
      'sell-price-line': {
        title: '価格の目安を読む',
        body: '「いくらで売る？」の画面の中ほどに、横 1 本の線で価格の目安が出ます。印が付くのは「赤字にならない価格」と、いまの価格です。目標を決めてある記録では「目標が出る価格」も並びます。\n\nいまの価格がどのあたりにあるかで、まだ下げられるのか、下げると赤字になるのかがひと目で分かります。',
      },
      'sell-simulator': {
        title: '値下げを試してみる',
        body: '「いくらで売る？」の画面の下のほうにあるシミュレーターです。つまみを左右に動かすと、その価格で売れたときに手元へいくら残るかがその場で出ます。動かしただけでは記録は変わりません。\n\n試した価格をそのまま残したいときは「この価格でこのアプリに記録する」を押します。押すとすぐには書き換わらず、「この価格に書き換えます」の確認が出ます。いまの記録と書き換えたあとが並ぶので、読んでから「書き換える」で確定します。その価格では赤字になるときは、ボタンが「価格を ◯◯円 以上に直す」に変わります。\n\n書き換わるのはこのアプリの記録だけで、出品しているサイトの価格は変わりません。サイト側はご自身で直してください。\n\n書き換えたあとは画面の下に「取り消す」が出るので、間違えたときはその場で戻せます。価格をまだ入れていない記録では、つまみは動かせません。',
      },
      'sell-room': {
        title: 'あといくらまで下げられるかを見る',
        body: '「いくらで売る？」の画面で、主役の数字（手元に残る見込み）のすぐ下にある帯に出ます。値下げの相談が来たときに見る数字です。目標を決めてある記録では「目標に届く範囲であと何円下げられるか」が出ます。\n\n目標を決めていない記録では、下げ幅は出ません。何を基準に下げ止まればよいかが決まらないので、根拠のない金額を出さないためです。',
        linkLabel: '「0 円」と「決めていません」の違いを見る ›',
      },
      'sell-target': {
        title: '目標をあとから決める・消す',
        body: '「いくらで売る？」の画面のいちばん下にある「目標の純利益」（仕入品では「目標利益」）の行を押すと、その場で目標を決められます。金額を入れると、目標が出る価格とあと下げられる額がすぐ下に出るので、決める前に何が変わるかを読めます。\n\n決めた目標はその記録に残るので、次に開いたときも同じ判断ができます。やめたいときは同じ画面の「目標を消す」を押してください。0 を入れても消したことにはなりません。0 は「赤字にならなければよい」という目標そのものです。',
      },
      'sell-sold': {
        title: '実際にどうだったかを見返す',
        body: '記録の詳細で帯の下にある行は、売れた記録では「どうだった？」になります。押して開いた画面に出るのは見込みではなく、実際に残った利益と、出品してから売れるまでにかかった日数です。\n\n売れたあとは価格を動かす意味がないので、シミュレーターは出ません。',
      },
      'data-modes': {
        title: '収支・タグ・実績を切り替えたい',
        body: 'グラフのカードの上に「収支」「タグ」「実績」の 3 つが並んでいます。押すと同じ画面の中身が入れ替わります。\n\n「収支」は期間ごとの売れ行き、「タグ」は何がよく売れているか、「実績」はこれまでの積み上げを見るところです。月の行と絞り込みが効くのは「収支」と「タグ」だけです。',
      },
      'data-tag': {
        title: 'タグごとの成績を見たい',
        body: '「タグ」を押すと、その期間にどのタグでいくら残ったかが多い順に並びます。タグの付いていない記録は「未分類」としてまとめて出ます。行を押すと、そのタグが付いた記録が下に並びます。\n\n行の右の小さな線は 1 月から 12 月までの動きです。高さの目盛りはすべてのタグで共通なので、そのまま見比べられます。\n\nカードの右上の「一覧」「グラフ」で見せ方を変えられます。「グラフ」にすると、選んだタグぶんの折れ線を 1 枚に重ねられます。線の上の点を押すと、その日のタグごとの内訳が出ます。',
      },
      'data-achievements': {
        title: '実績を見たい',
        body: '「実績」を押すと、これまでの積み上げが 4 つのカードで出ます。「次の実績」（あといくつで届くか）、「あなたの記録」（累計の売上と利益）、「獲得した実績」、「自己ベスト」です。\n\n達成のもとになった記録には、一覧や詳細で小さなバッジが付きます。',
      },
      'data-achievement-kinds': {
        title: '実績の種類と段位',
        body: '実績には 2 とおりあります。1 つは 5 つのジャンルをそれぞれ 5 段階で登っていくもの、もう 1 つは「初めての一歩」「即売れ」のように条件を満たすと 1 回だけ付くものです。\n\nどの実績にも難しさの段位が付いていて、やさしいほうからブロンズ・シルバー・ゴールド・プラチナ・レジェンドの 5 つです。実績のバッジを押すと、★の数と段位の名前、そして何をすれば達成できるかが出ます。段位はバッジの縁の色にもなっているので、一覧を眺めるだけでも重いものが分かります。',
      },
      'data-achievement-period': {
        title: '実績だけ月と絞り込みが効かない',
        body: '「実績」を見ているときは、月の行も絞り込みも効きません。いつでも全期間の売れた記録すべてで数えます。今月ぶんの成績ではなく、これまで全部の積み上げを見るところだからです。',
      },
      'data-chart': {
        title: 'グラフの見かた',
        body: '棒 1 本がその日の収支、線はその日までの合計です。売れた日がない日は棒が立ちません。まだ売れていない記録はグラフに入りません。\n\n棒を押すと、その日に売れた記録が下に出ます。行を押すとその記録の詳細が開きます。',
        linkLabel: '「収支」ということばについて ›',
      },
      'data-compare': {
        title: '前の期間と比べたい',
        body: 'グラフの下に、1 つ前の同じ長さの期間と比べたカードが出ます。月を見ているときは前の月と、年を見ているときは前の年の同じ月までと比べます。「全期間」を選んでいるときは比べる相手がないので、このカードごと出ません。',
      },
      'data-period': {
        title: '期間を変えたい',
        body: '月の行の「◀」「▶」で移れます。月の名前を押すと「今月」「先月」「全期間」のボタンと月のカレンダーが出ます。年の見出しを押すとその年 1 年分になります。長い期間を選ぶと、棒の刻みが日ごとから月ごと・年ごとに自動で変わります。',
      },
      'data-filter': {
        title: '種別やタグで絞って見たい',
        body: '月の行の右の「▽」から絞り込めます。記録タブと同じ絞り込みですが、それぞれのタブで別々に効きます。グラフも合計も、選んだ分だけで計算し直されます。\n\n「実績」を見ているときだけは効きません。',
      },
      'backup-where': {
        title: '記録はどこにあるか',
        body: '記録も写真も、この端末の中だけに保存されています。どこかに送られることはありません。',
      },
      'backup-photos': {
        title: '写真はどこに入るか',
        body: '選んだ写真はこのアプリの中に小さくして保存され、外に送られることはありません。書き出し（CSV）には写真は入りませんが、バックアップには入ります（「含める」を選んだとき）。',
      },
      'backup-delete': {
        title: 'アプリを消すとどうなるか',
        body: 'このアプリを削除すると、中の記録と写真も一緒に消えます。機種を変えるときも、そのままでは新しい端末に何も引き継がれません。戻すには、あらかじめ作っておいたバックアップのファイルが要ります。',
      },
      'backup-create': {
        title: 'バックアップを作る',
        body: '設定タブの「バックアップと復元」を開き、下の「バックアップを作る」を押します。記録・タグ・プリセット・写真が 1 つのファイルにまとまります。期間を選ぶ必要はなく、いつでも全部が入ります。\n\n写真は「含める」「含めない」を選べます。はじめは「含める」です。「含めない」にするとファイルは軽くなりますが、そのファイルから戻したときに写真は出てきません。\n\n写真の合計が大きすぎるとき（50MB を超えるとき）は、押したあとに知らせが出ます。そのときは「写真なしで作る」を選んでください。記録・タグ・プリセットはすべて新しい端末へ移せます。写真だけは「写真」アプリなどに別に残しておいてください。\n\nボタンの下に、前に作った日が出ます。ほかに知らせは出ないので、思い出す手がかりはこの 1 行だけです。月末など、区切りのいいときに作るのがおすすめです。',
      },
      'backup-restore': {
        title: 'バックアップから復元する',
        body: '復元すると、いまこの端末にある記録・タグ・プリセットは、すべてファイルの中身に入れ替わります。今あるものに足されるのではありません。\n\n設定タブの「バックアップと復元」を開き、「復元する」から、バックアップのファイル（ZIP）か、それを解凍したフォルダを選びます。中身を確かめるために解凍したあとでも戻せます。\n\n選んでもすぐには戻りません。先に「読み込む中身」の画面が出て、そこで「すべて置き換える」を押したときに入れ替わります。やめたいときは「別のファイルを選ぶ」で選び直せます。読み込めなかったときは、いまのデータは何も変わりません。',
      },
      'backup-preview': {
        title: '「読み込む中身」の読みかた',
        body: '復元するファイルを選ぶと、先にこの画面が出ます。今の端末とファイルの中身を並べた表で、減るものは赤い数字になります。中で一番新しい記録の商品名も出るので、見覚えがなければ別のファイルです。\n\nこの 1 枚が確認そのものなので、このあとに確認のダイアログは出ません。「すべて置き換える」を押した時点で入れ替わります。',
      },
      'backup-migrate': {
        title: '機種を変えるときの手順',
        body: '古い端末で「バックアップを作る」を押すと、共有の画面が開きます。そこでファイルをこの端末の外へ出しておきます。「ファイル」アプリでも、クラウドでも、パソコンへ送るのでもかまいません。新しい端末から取り出せる場所であれば、どこでも同じです。\n\n新しい端末にこのアプリを入れたら、「バックアップと復元」の「復元する」からそのファイルを選びます。記録・タグ・プリセットが戻り、写真を含めて作ったバックアップなら写真も戻ります。\n\nアプリどうしが直接つながることはないので、この 1 往復が引っ越しの唯一の道です。古い端末を手放す前にファイルを出せているか、必ず確かめてください。',
      },
      'export-kinds': {
        title: '書き出しの 2 種類',
        body: '設定タブの「書き出し（CSV）」から書き出せます。どちらも表計算などで中身を読むためのファイルで、アプリに読み込んで元に戻すことはできません。戻すためのものは「バックアップと復元」です。\n\n「データ保存用」はメモやタグも含めて、記録した内容をすべて出すもの。「確定申告用」は帳簿に要る列だけを出すものです。確定申告用でも金額の列は減りません。帳簿に関係のない記述を、申告の書類へ持ち込まないための形です。',
      },
      'export-period': {
        title: 'いつの分が入るか',
        body: '期間は「販売日」で決まります。お金が振り込まれた日ではありません。既定では売れた記録だけが入り、「出品中も含める」を選ぶとまだ売れていない記録も入ります。記録タブやデータタブで絞り込んでいても、その絞り込みは書き出しには効きません。',
      },
      'export-preview': {
        title: '何が入るか先に見たい',
        body: '「書き出す表」に、実際にファイルへ入る先頭の行がそのまま出ます。押すと全部の行を見られます。日付や金額は、ファイルに入るとおりの形で出ています。書き出すものが 1 件も無いときは、出す表がないのでこの欄ごと出ません。',
      },
      'export-grouping': {
        title: '日ごとにまとめたい',
        body: '確定申告用では「まとめ方」を選べます。「日ごとにまとめる」にすると、同じ日の売上が 1 行にまとまります。金額は合算され、商品名は「えんぴつ ほか2件」、販売サイトは「フリマA ほか1件」の形になります。種別が混ざった日は「混在」と入ります。',
      },
      'export-share': {
        title: '書き出したファイルをどう受け取るか',
        body: '「書き出す」を押すとファイルが作られ、共有の画面が開きます。そこからメールで送る、「ファイル」アプリに保存する、パソコンへ送るなど、受け取り方を選べます。\n\nファイルがアプリの中に残るわけではないので、この画面で送り先を決めてください。この端末で共有の画面を開けないときは、その旨が出ます。',
      },
      'export-tax': {
        title: '確定申告に使うときの注意',
        body: 'このファイルは帳簿そのものではなく、帳簿を作るための材料です。実際の申告では、内容を確認して収支内訳書などに転記してください。\n\n不用品がすべて非課税とは限りません。服・食器・家電など生活に通常必要なものを売った所得は非課税ですが、ゴルフ用品や趣味の道具など「生活に通常必要でないもの」は課税対象になります。また貴金属・宝石・書画・骨とうは、1 個または 1 組が 30 万円を超えると課税対象です。\n\n判断に迷うときは税務署か税理士に相談してください。',
        linkLabel: '消費税の扱いを見る ›',
      },
      'export-rounding': {
        title: '合計が画面と 1 円違うのはなぜか',
        body: 'ファイルの中の金額は、1 件ずつ 1 円未満を四捨五入してから足した合計です。画面の合計は元の数字のまま足すため、1 円ずれることがあります。どちらかが間違っているわけではありません。',
      },
      'terms-kind': {
        title: '不用品と仕入品の違い',
        body: '不用品は家にあったもの、仕入品は売るために買ってきたものです。引くものが 1 つ増えるだけで、計算のしかたは同じです。仕入品を選ぶと仕入価格の欄が出ます。',
      },
      'terms-words': {
        title: '純利益・利益・収支の使い分け',
        body: '呼び方が違うだけで、どれも「販売価格から経費を引いた金額」です。記録タブの合計行とデータタブの数字は、すべて収支です。',
      },
      'terms-site': {
        title: '販売サイトの表示額との違い',
        body: '経費を入れているぶん、このアプリの数字のほうが少なくなります。差はそのまま、実際に出ていったお金です。どちらかが間違っているわけではありません。',
      },
      'terms-expenses': {
        title: '経費にふくまれるもの',
        body: '仕入価格・送料・販売手数料・梱包材・その他の 5 つです。仕入価格が出るのは仕入品のときだけです。\n\nこの 5 つを足したものが「引かれる分」で、販売価格から引いた残りが手元に残る金額です。入れた欄だけで計算するので、使わない欄は空のままでかまいません。',
      },
      'terms-tax': {
        title: '消費税はどう扱われるか',
        body: 'このアプリは、入れた販売価格と経費の金額をそのまま使って計算します。その金額に消費税が含まれているかどうかは区別していません。税込・税抜のどちらのつもりで入れても、入れた数字がそのまま計算に入ります。\n\n消費税の申告や納税が要らない場合は、この前提のままで困ることはありません。手元にいくら残るかは、実際にやりとりした金額のとおりに出ます。\n\n取引の規模が大きく、消費税の申告・納税の義務がある場合は、このアプリの数字に消費税の分は反映されていません。申告に使う金額はご自身で確認するか、税務署か税理士に相談してください。',
      },
    },
  },

  helpFigure: {
    /**
     * 図の題材（作り物の商品名・タグ名・プリセット名）。金額や件数は図が持つが、
     * **語だけはここに置く** ── 英語表示で図の中だけ日本語が残るのを防ぐ。
     */
    envelopeOthersPart: '{{envelope}}ほか {{amount}}',
    sampleParcel: '宅配 60サイズ',
    sampleFlatRate: 'A4・厚さ3cm以内',
    sampleTagClothes: '洋服',
    sampleTagTableware: '食器',
    sampleTagBooks: '本',
    sampleItemCushion: 'クッション',
    sampleItemMug: 'マグカップ',
    sampleItemPictureBook: '絵本',
    modeProfitNote: 'この 2 つで切り替えます',
    modeTargetNote: 'こちらに切り替えると、ほしい利益から販売価格を出します',
    calculatorNote: '青いボタンを押すと電卓が開きます',
    commissionFieldNote: 'ここだけ電卓が出ません。「−」「＋」で 1% ずつ動かします',
    breakdownNote: '「内訳」を押すと、この帯と項目ごとの金額が出ます',
    presetTagNote: 'タグの印を押すと、登録した値から選べます',
    shippingMaterialNote: '資材の代金を登録した送料だけ、この 2 つが出ます',
    addRecordNote: '記録タブの左下・タブバーの上にあります',
    kindSelectorNote: '記録の画面のここで選びます',
    statusToggleNote: '左が今の状態、右を押すともう一方に変わります',
    photoNote: '空の枠を押すと写真を選べます。付いた写真は右上の「✕」で外せます',
    tagRowNote: '「＋」を押すと選べます。まだ無いタグはその場で作れます',
    monthBarNote: '「◀」「▶」で前後の月へ。月の名前を押すと期間を選べます',
    filterEntryNote: '右端の「▽」から開きます。効いている間は青くなります',
    searchSortNote: '左が商品名でさがす、右が並び替え',
    soldListingNote: '上の合計も、選んだほうの記録で計算されます',
    presetListNote: '設定タブの「入力を減らす」に、この形で並びます',
    targetFieldNote: '入れていないときは「決めていません」。「¥0」とは別のものです',
    priceLineNote: '目標を決めていない記録では、真ん中の目盛りが出ません',
    simulatorNote: 'つまみを動かすと、その価格での見込みが上に出ます（この図では動きません）',
    dataModesNote: 'グラフのカードの上端にあります',
    tagViewNote: 'タグのカードの右上で切り替えます',
    photoIncludeNote: '既定は「含める」。「含めない」で作ると、そのファイルから写真は戻せません',
    presetBadgeNote: 'バッジそのものを押すと文字を直せます',
    recordBarNote: '帯の色は、下の行に付いた同じ色の丸が表します',
    colorGroupsNote: '上がまだ使っていない色、下が使用中。どちらも押して選べます',
    exportTargetNote: '既定は「{{soldRecords}}のみ」です',
    exportPreviewNote: '押すと全部の行を見られます',
    filterOffCaption: '絞り込みなし',
    filterOnCaption: '絞り込み中',
    searchCaption: 'さがす',
    kindSubtitle: '{{kind}}で売れたとき',
    siteAmountSubtitle: '同じ 1 件を、どこまで引いた金額で見ているか',
    targetSubtitle: 'ほしい利益が先に決まっているとき',
    csvKindsSubtitle: '減るのはメモとタグだけ',
    costPartsSubtitle: 'このアプリが販売価格から引くのは、この 5 つ',
    dayGroupSubtitle: '同じ日に 3 件売れたとき',
    backupPreviewSubtitle: '古いファイルを選んでしまったとき',
    backupReplaceNote: '赤い数字は減るもの。押すとこの中身に置き換わります',
    achievementKindsSubtitle: '実績には 2 とおりある',
    achievementLadderLabel: '5 段階で登るもの（⚡一撃の例）',
    achievementOnceLabel: '条件を満たすと 1 回だけ付くもの',
    keptLabel: '残る分',
    targetProfitLabel: 'ほしい利益',
    saleDateRangeLabel: '販売日に選べる範囲',
    targetRowTitle: 'ほしい利益から逆に足す',
    hitLabel: '出る',
    missLabel: '出ない',
    includedLabel: '入る',
    excludedLabel: '入らない',
    noneMark: '－',
    fileLabel: 'ファイル',
    screenLabel: '画面',
    csvBasicLabel: '日付・商品名・金額',
    csvSiteLabel: '販売サイト・種別',
    csvBreakdownLabel: '経費の内わけ',
    purchaseNote: '売るために買ったお金（{{kind}}では出ません）',
    postageNote: '発送にかかったお金',
    commissionNote: '販売サイトに引かれるお金',
    envelopeNote: '箱・封筒・テープなど',
    othersNote: '交通費など、上に当てはまらないもの',
    bothSoldSubtitle: 'どちらも{{salesPrice}} {{price}}で売れたとき',
    targetRoomSubtitle: '同じ記録（今の価格 {{price}}）で、目標だけを変えたとき',
    sourcedRowTitle: '{{kind}}（{{purchasePrice}} {{price}}）',
    singleRecordLabel: '{{kind}} 1 件',
    siteAmountMeasure: 'サイトの表示 {{amount}}（{{commission}}と{{postage}}まで）',
    appAmountMeasure: 'このアプリ {{amount}}（{{envelope}}ほかも引く）',
    totalPriceMeasure: 'これが{{salesPrice}} {{price}}',
    tagOrSubtitle: '「{{first}}」と「{{second}}」を選ぶと',
    duplicateSubtitle: '複製元から新しい記録へ',
    duplicateCopiedLabel: '写る',
    duplicateSkippedLabel: '写らない',
    duplicateDateLabel: '日付（今日から）',
    duplicateStatusLabel: '状態（{{status}}から）',
    migrateSubtitle: 'ファイルを 1 往復させる',
    migrateOldLabel: '古い端末',
    migrateNewLabel: '新しい端末',
    totalCaption: '2 件以上をまとめた金額',
    purchaseShortLabel: '仕入',
    packQuantityLabel: '入数',
    packSubtitle: '購入価格を何で割るかだけが違う',
    packAreaLabel: '購入サイズ',
    packUseLabel: '平均使用サイズ',
    packUsageLabel: '想定使用回数',
    oneByOneLabel: '1 件ずつ',
    groupedLabel: '日ごとにまとめる',
    roundingSubtitle: '10.4 円と 10.4 円の 2 件なら',
    roundFirstLabel: '10 ＋ 10（先に丸める）',
    roundLastLabel: '20.8（後で丸める）',
    packUseNote: '{{useLabel}} {{size}} を入れると {{usePrice}} {{price}}',
    csvKindLabel: '{{label}}\n{{count}} 列',
  },

  onboarding: {
    skip: 'スキップ',
    start: 'はじめる',
    previousPage: '前のページへ',
    nextPage: '次のページへ',
    pageIndicator: '{{index}} / {{total}}',
    calcTitle: '入れた分だけ、利益が見える',
    calcBody: '販売価格・送料・手数料を入れると、その場で手元に残る金額が計算されます。',
    targetTitle: '目標から逆算もできる',
    targetBody: '欲しい利益を入れれば、必要な販売価格がわかります。そのまま記録にも残せます。',
    recordAdded: '記録に追加されました',
    saveTitle: '写真やタグも一緒に残せる',
    saveBody: '商品名だけで保存できます。写真・タグ・種別もまとめて記録に残せます。',
    presetTitle: 'よく使う値はプリセットに',
    presetBody: '販売サイト・送料は欄の横の印から、梱包材は電卓の中から選べます。電卓からの入力もいつでも使えます。',
    simulatorTitle: '出品中でも、値下げを試せる',
    simulatorBody: '今の価格から動かして、見込みの利益をその場で確認できます。動かしても記録は変わりません。',
    /** 3 つに割ってあるのは、条件の核心だけ色と太さを変えて描くため（つなぐと 1 文） */
    simulatorNotePrefix: '目標のラインは、その記録に',
    simulatorNoteEmphasis: '目標の純利益（仕入品では「目標利益」）を入力',
    simulatorNoteSuffix: 'しているときだけ出ます。',
    packagingPresetTitle: '梱包材はまとめ買いも自動計算',
    /** こちらも 3 つに割って、呼び出し場所だけを強調する */
    packagingPresetPrefix: '設定タブの「{{section}}」で入数と購入価格を登録しておくだけで、1個あたりの金額を自動で計算します。次からは',
    packagingPresetEmphasis: '電卓の中から',
    packagingPresetSuffix: '選んで呼び出せます。',
    dataTitle: '3つの見かたで販売を振り返る',
    dataBody: '収支・タグ・実績。見たい角度でこれまでの販売がわかります。',
    achievementsTitle: '続けるほど実績が増えていく',
    achievementsBody: '販売を重ねるごとに、新しい実績が解除されていきます。',
    achievementsNote: '困ったときは各画面の「？」、または設定の「使いかた」からいつでも確認できます。',
    /** チュートリアルの図に出す作り物のプリセット名（英語表示で日本語が残らないように） */
    examplePresetShipping: '宅配 60サイズ',
    examplePresetSite: '手数料10%',
    examplePresetPackaging: '緩衝材（小）',
    examplePresetPackagingInitial: '緩',
    exampleItemName: '腕時計',
    exampleTag: 'アクセサリー',
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
