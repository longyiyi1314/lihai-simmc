import { defineConfig } from 'astro/config';

// 项目站部署在 https://<用户名>.github.io/<仓库名>/
// 若以后改仓库名，只需改这里的 base 和 site 两行。
export default defineConfig({
  site: 'https://longyiyi1314.github.io',
  base: '/lihai-simmc',
  output: 'static',
  build: {
    format: 'directory',
  },
  compressHTML: true,
});
