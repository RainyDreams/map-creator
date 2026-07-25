// 把 debug 构建（dist-debug）合并进正式产物目录 dist：
// - dist-debug/index.html → dist/debug.html
// - dist-debug/assets/* → dist/assets/（文件名带内容哈希，与正式产物不冲突）
// 其余文件（public 拷贝等）与正式构建一致，无需重复拷贝
import { copyFileSync, cpSync, existsSync, mkdirSync } from 'node:fs'

if (!existsSync('dist-debug/index.html')) {
  console.error('[merge-debug] 未找到 dist-debug/index.html，请先运行 debug 构建')
  process.exit(1)
}
mkdirSync('dist/assets', { recursive: true })
copyFileSync('dist-debug/index.html', 'dist/debug.html')
cpSync('dist-debug/assets', 'dist/assets', { recursive: true })
console.log('[merge-debug] dist/debug.html 与调试资源已并入 dist/')
