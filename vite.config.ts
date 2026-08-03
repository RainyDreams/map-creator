import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { inspectAttr } from 'kimi-plugin-inspect-react'

// https://vite.dev/config/
// code-path 调试属性（kimi-plugin-inspect-react 注入的源码位置标注）：
// 本地 dev 始终开启；生产构建默认关闭以减小体积，
// 仅 VITE_CODE_PATH=1 的调试构建（build:debug → debug.html）开启
export default defineConfig(({ command }) => ({
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
    ...(command === 'serve' || process.env.VITE_CODE_PATH === '1' ? [inspectAttr()] : []),
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
        // 避免个别浏览器/网关对带 - 或 _ 的静态资源名识别异常。
        // v2.0.2 起命名规则整体更换（index/chunk → app/ck）：
        // 个别用户曾踩到「旧 URL 被中间链路缓存成 HTML」的毒缓存，
        // 内容哈希不变 URL 就不变，无法自愈；改名规则后所有 URL 强制翻新
        hashCharacters: 'hex',
        entryFileNames: 'assets/app[hash].js',
        chunkFileNames: 'assets/ck[hash].js',
        assetFileNames: 'assets/[hash][extname]',
        // 分包策略：把「几乎不变的静态数据」和「框架/依赖代码」拆成独立 chunk。
        // 业务代码每次迭代都会变，但数据表和依赖库不变——拆开后它们的哈希稳定，
        // 版本更新时浏览器只需重新下载真正变化的业务主包，其余命中本地缓存。
        manualChunks(id) {
          // 静态地理/院校数据：内容极少变动，独立成块
          if (
            id.includes('src/assets/city-province.json') ||
            id.includes('src/utils/geo.ts') ||
            id.includes('src/utils/universities.ts')
          ) {
            return 'datastatic'
          }
          if (id.includes('node_modules')) {
            // 懒加载库（Excel 导出 / ZIP 导出 / 图像渲染）保持自然动态分包，
            // 绝不并入首屏 chunk，否则用户打开首页就要白下几百 KB
            if (
              id.includes('/xlsx/') ||
              id.includes('/fflate/') ||
              id.includes('/html-to-image/')
            ) {
              return undefined
            }
            // React 核心与路由：版本锁定，长期不变，且不依赖其他 vendor 包，
            // 单独成块无循环风险
            if (/[\\/]node_modules[\\/](react|react-dom|scheduler|react-router)[\\/]/.test(id)) {
              return 'reactcore'
            }
            // 其余首屏依赖（Radix、lucide、sonner、zod、clarity 等）统一归 vendor：
            // Radix 与 vaul/cmdk 等包互相引用，强行再拆会产生循环 chunk
            return 'vendor'
          }
        },
      },
    },
  },
}));
