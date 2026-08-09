import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

// tsconfig.json の paths（"@/*" → "./src/*"）は vitest には自動で伝わらないため、
// ここで同じ別名を張る。src/logic のテストが '@/db/...' を import できるようにするのが目的。
// 拡張子が .mts なのは、ESM で書いた設定ファイルを Vite に CJS として読ませないため。
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
