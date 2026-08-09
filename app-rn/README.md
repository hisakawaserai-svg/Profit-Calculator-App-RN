# 利益計算アプリ（React Native 版）

SwiftUI + CoreData 版（リポジトリ直下の `.swift` ファイル群）を React Native へ移植したもの。
仕様は [../docs/SPEC.md](../docs/SPEC.md) を参照。

## 技術スタック

- **Expo**（managed workflow, SDK 57）+ TypeScript
- **expo-router** — ファイルベースルーティング（タブレイアウト）
- **expo-sqlite + drizzle-orm** — 永続化（CoreData の代替）
- **react-native-gifted-charts** — データタブのグラフ（Swift Charts の代替）
- **zustand** — 状態管理
- **expr-eval** — 簡易電卓の式評価（NSExpression の代替、SPEC 決定 §7-13）

## ディレクトリ構成

```
app-rn/
├── app/                  # expo-router のルート（画面）
│   ├── _layout.tsx       # ルートレイアウト（Stack）
│   └── (tabs)/           # SPEC §3.1 の 5 タブ
│       ├── _layout.tsx   # タブ定義
│       ├── index.tsx     # 計算（CalcView）
│       ├── listings.tsx  # 出品中（MonthlyRecordList isSold=false）
│       ├── sold.tsx      # 実績（MonthlyRecordList isSold=true）
│       ├── data.tsx      # データ（DataView・グラフ分析）
│       └── help.tsx      # ヘルプ（HelpView）
├── src/
│   ├── db/               # DB 層
│   │   ├── schema.ts     # drizzle スキーマ（SPEC §1 SaleRecordEntities 対応）
│   │   └── client.ts     # expo-sqlite + drizzle クライアント・初期化
│   ├── logic/            # 純粋な計算ロジック（UI 非依存）
│   │   ├── profit.ts     # 純利益・経費・逆算・表示丸め（SPEC §2）
│   │   └── input.ts      # 数値入力のサニタイズ（SPEC §5.1）
│   ├── components/       # 共有 UI コンポーネント
│   │   └── PlaceholderScreen.tsx  # 仮画面（実装が進んだら削除）
│   └── store/            # zustand ストア
│       └── useRecordListStore.ts  # 一覧の検索・月フィルタ状態（SPEC §4.1）
├── assets/               # アイコン・スプラッシュ画像
└── app.json              # Expo 設定
```

パスエイリアス: `@/*` → `src/*`（例: `@/components/PlaceholderScreen`）。

## 開発

```bash
npm install
npx expo start
```

## 現状

画面はすべてプレースホルダ。タブ構成・DB スキーマ・計算ロジックの骨組みまで。
各画面の実装は SPEC.md §3〜§6 に沿って進める。
