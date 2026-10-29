import { defineConfig } from 'vite';

// 使用相对路径 base: './'，完美兼容 GitHub Pages 子路径部署（如 https://username.github.io/repo-name/）与本地预览
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    assetsDir: 'assets'
  }
});
