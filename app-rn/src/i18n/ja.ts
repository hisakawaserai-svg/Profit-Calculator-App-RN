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
    pickerTitle: '{{type}}を選ぶ',
    /** 選んだあとで率を書き換えたチップの読み上げ（§4） */
    tagRateChanged: '{{name}}（率は変更ずみ）',
  },

  /** 記録の一覧（記録タブ。UI-SPEC §1.2） */
  list: {
    /** 状態と日付の見出し。行の中に収める短い語 */
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
