// 生成阿里云镜像站内容包：把 dist 原样复制到 mirror-pack/，
// 并附带 nginx 配置示例与上传说明。用户只需把 mirror-pack 上传到服务器站点目录。
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'

if (!existsSync('dist/index.html')) {
  console.error('[mirror-pack] 未找到 dist，请先运行 npm run build:all')
  process.exit(1)
}

rmSync('mirror-pack', { recursive: true, force: true })
mkdirSync('mirror-pack', { recursive: true })
cpSync('dist', 'mirror-pack', { recursive: true })

writeFileSync(
  'mirror-pack/nginx.conf.example',
  `# 蹭饭图生成器 · 静态资源镜像站 nginx 配置示例
# 把本文件内容并入你的站点配置（例如 /etc/nginx/conf.d/map-mirror.conf），
# 修改 server_name 与 root 后执行：nginx -t && nginx -s reload

server {
    listen 443 ssl;
    server_name mirror.example.com;   # ← 改成你的镜像域名

    # SSL 证书（阿里云免费证书或 acme.sh 申请），路径按实际修改
    ssl_certificate     /etc/nginx/ssl/mirror.example.com.pem;
    ssl_certificate_key /etc/nginx/ssl/mirror.example.com.key;

    root /www/wwwroot/map-mirror;     # ← mirror-pack 上传到的目录
    index index.html;

    # 关键：跨域许可。主站 https://map.linkbrain.top 会以跨域方式加载这里的 JS，
    # module script 与字体强制走 CORS，必须带这个头，否则浏览器拦截
    add_header Access-Control-Allow-Origin "https://map.linkbrain.top" always;

    # 带哈希的静态资源永久缓存（文件名变了就是新内容，不怕缓存）
    location /assets/ {
        add_header Access-Control-Allow-Origin "https://map.linkbrain.top" always;
        add_header Cache-Control "public, max-age=31536000, immutable" always;
    }

    # HTML 不缓存，保证主站拿到的永远是最新入口
    location ~* \\.html$ {
        add_header Access-Control-Allow-Origin "https://map.linkbrain.top" always;
        add_header Cache-Control "no-store" always;
    }

    gzip on;
    gzip_types text/css application/javascript application/json image/svg+xml;
    gzip_min_length 1k;
}
`,
)

writeFileSync(
  'mirror-pack/上传说明.txt',
  `蹭饭图生成器 · 镜像站内容包

这个目录里的文件就是镜像站的全部内容（纯静态，无后端）。

上传步骤（Xshell）：
1. 连接你的阿里云服务器；
2. 把本目录里的【所有文件】上传到站点目录，例如 /www/wwwroot/map-mirror/
   （用 Xftp 拖拽整个 mirror-pack 目录内容即可；nginx.conf.example 和本说明文件可传可不传）；
3. 按 nginx.conf.example 配好站点，nginx -t && nginx -s reload；
4. 浏览器访问 https://你的镜像域名/index.html 能打开即成功；
5. 最后回到主项目 index.html，把 window.__CF_MIRROR_ORIGIN__ 改成你的镜像域名，
   重新 npm run build:all 并部署主站，兜底立即生效。

注意：每次主站发新版，都要重新执行 npm run build:mirror 并重新上传，
否则镜像里的旧版 JS 与主站入口哈希对不上，兜底会加载不到文件。
`,
)

console.log('[mirror-pack] 已生成 mirror-pack/（含 nginx 配置示例与上传说明）')
