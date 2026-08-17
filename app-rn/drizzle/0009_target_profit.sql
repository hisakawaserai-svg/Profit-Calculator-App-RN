-- 手で書いたマイグレーション（drizzle-kit の生成物ではない。0007 / 0008 と同じ扱い）。
-- 目標利益（SPEC-V9 §1）の 2 列を **1 つのマイグレーションで**足す。
--
-- **どちらも NULL 許容で、既定値を置かない。**
-- `target_profit` の NULL は「目標を決めていない」で、0（＝目標は 0 円）とは別のものとして扱う
-- （DEFAULT 0 を置くと、既存の行が全部「目標 0 円」になってしまい区別が消える）。
-- 他の金額列（postage など）が NOT NULL DEFAULT 0 なのは「未入力＝0 円」で意味が通るためで、
-- 目標だけは 0 が意味を持つ値なのでその方針に乗せられない。photo_file_name と同じ扱い。
--
-- `listed_at` は**将来の出品日のために列だけ確保する**（§1）。今回のアプリは読み書きしない ──
-- ALTER TABLE を 1 回で済ませられるうちに足しておくためだけの列で、
-- UI も CSV の読み書き以外の経路も無い。
ALTER TABLE `sale_records` ADD `target_profit` integer;--> statement-breakpoint
ALTER TABLE `sale_records` ADD `listed_at` text;
