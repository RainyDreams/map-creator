import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { inspectAttr } from 'kimi-plugin-inspect-react'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [inspectAttr(), react()],
  server: {
    port: 3000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // 产物文件名只保留「名称+哈希」的纯字母数字形式：
        // 不用连字符/下划线分隔，且哈希强制为 hex，
        // 避免个别浏览器/网关对带 - 或 _ 的静态资源名识别异常
        hashCharacters: 'hex',
        entryFileNames: 'assets/[name][hash].js',
        chunkFileNames: 'assets/chunk[hash].js',
        assetFileNames: 'assets/[hash][extname]',
      },
    },
  },
});
