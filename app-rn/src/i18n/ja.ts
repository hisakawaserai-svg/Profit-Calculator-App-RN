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
