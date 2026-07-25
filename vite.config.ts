import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { inspectAttr } from 'kimi-plugin-inspect-react'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [
    // 依赖库（Radix 等）的开发态警告在生产构建中剔除：
    // 给 node_modules 里的 console.error/warn 打上 @__PURE__ 标记，
    // minify 阶段整段调用连同警告文案一起被移除，产物不再暴露第三方库信息；
    // 只作用于依赖代码，src 里我们自己的诊断日志不受影响
    {
      name: 'strip-lib-console-warnings',
      enforce: 'pre',
      transform(code, id) {
        if (!id.includes('node_modules')) return null
        let out = code
        if (out.includes('console.')) {
          out = out.replace(
            /console\.(error|warn)\(/g,
            '/* @__PURE__ */ console.$1(',
          )
        }
        // 警告文案被挂到 useEffect 依赖数组上，console 调用删除后字符串仍残留，
        // 直接把依赖库里的 MESSAGE 模板常量清空（仅限 Warning 相关文件，不影响其他逻辑）
        if (out.includes('Warning') && out.includes('const MESSAGE')) {
          out = out.replace(
            /const MESSAGE = `(?:\\.|[^`\\])*`;/gs,
            'const MESSAGE = "";',
          )
        }
        return out === code ? null : out
      },
    },
    inspectAttr(),
    react(),
  ],
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
