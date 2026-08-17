-- 手で書いたマイグレーション（drizzle-kit の生成物ではない。0007〜0009 と同じ扱い）。
-- SPEC-V10 §1: 梱包材プリセットの単価計算方式（個数 / 面積 / 使用回数）の 5 列を足す。
--
-- **既存の行は 1 行も書き換えない**（バックフィルなし。0003 がまとめ買いの 2 列を足したときと
-- 同じ形）。DEFAULT がそのまま「今までどおり」を意味するように選んである:
--
--   - `calc_method` の既定は 'individual' ＝ 既存方式（購入価格 ÷ 購入数量）。
--     既に登録されている梱包材はすべてこの方式の行なので、既定値のまま読める。
--   - サイズの 4 列は 0 ＝ 未設定。面積方式かどうかは calc_method が言うので、
--     0 のまま残っていても個数方式の行の読み方は変わらない。
--
-- **想定使用回数の列は足さない**（§1.2）── 購入価格を割る数は既存の `pack_quantity` が持つ。
-- 個数方式では入数、使用回数方式では想定使用回数で、どちらの意味かは calc_method が決める。
ALTER TABLE `presets` ADD `calc_method` text DEFAULT 'individual' NOT NULL;--> statement-breakpoint
ALTER TABLE `presets` ADD `pack_height` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `presets` ADD `pack_width` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `presets` ADD `use_height` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `presets` ADD `use_width` real DEFAULT 0 NOT NULL;
