# 镜像加速站部署教程（cdn-beijing.linkbrain.top）

用途：Cloudflare 在国内偶尔很慢（HTML 尚可，JS/CSS 尤其慢）。把构建产物自动同步到
你自己的阿里云服务器，主站加载静态资源失败或过慢时，自动改从你的服务器获取。

原理一句话：服务器上的 `mirror-sync.sh` 每 5 分钟访问一次真实主站地址，发现新版
（哈希文件名变了）就下载到站点目录；主站 `index.html` 里的镜像兜底加载器检测到
主站资源加载失败/超时，会自动从 `cdn-beijing.linkbrain.top` 拉同样的文件。

本教程涉及 4 个文件（都在项目 `app/mirror/` 目录）：

| 文件 | 放到服务器的位置 |
|---|---|
| `mirror-sync.sh` | `/usr/local/bin/mirror-sync.sh` |
| `mirror-sync.service` | `/etc/systemd/system/mirror-sync.service` |
| `mirror-sync.timer` | `/etc/systemd/system/mirror-sync.timer` |
| `nginx.cdn-beijing.conf.example` | 参考它写 `/etc/nginx/conf.d/cdn-beijing.conf` |

---

## 第一步：Cloudflare DNS 设置（重要）

`cdn-beijing.linkbrain.top` 这条 A 记录必须设为**仅 DNS（灰云）**，不要开橙色代理云。
开了代理流量还是走 Cloudflare，就失去了自建加速的意义。

## 第二步：准备目录与 nginx

```bash
# 站点目录（同步脚本的默认 MIRROR_ROOT）
mkdir -p /www/wwwroot/cdn-beijing

# SSL 证书：阿里云控制台可申请免费证书，下载 nginx 格式，
# 放到 /etc/nginx/ssl/ 下并按 nginx 配置里的文件名命名
```

把 `nginx.cdn-beijing.conf.example` 的内容复制为 `/etc/nginx/conf.d/cdn-beijing.conf`，
改好证书路径后：

```bash
nginx -t && systemctl reload nginx
```

配置要点（已写好，不用动）：
- `Access-Control-Allow-Origin: https://map.linkbrain.top`——主站跨域加载 module JS 必须；
- `/assets/` 一年强缓存（哈希文件名）；`*.html` 不缓存。

## 第三步：安装同步脚本与定时器

用 Xftp 把 `mirror/` 目录 4 个文件上传到服务器，然后：

```bash
# 1. 脚本就位并加执行权限
cp mirror-sync.sh /usr/local/bin/mirror-sync.sh
chmod +x /usr/local/bin/mirror-sync.sh

# 2. 先手动跑一次，确认能同步（看到「同步完成」即成功）
bash /usr/local/bin/mirror-sync.sh

# 3. 装 systemd 定时器（每 5 分钟自动同步）
cp mirror-sync.service /etc/systemd/system/
cp mirror-sync.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now mirror-sync.timer

# 4. 确认定时器已激活
systemctl list-timers mirror-sync.timer
```

不习惯 systemd 也可以用 crontab（二选一，不要同时用）：

```bash
crontab -e
# 加一行：
*/5 * * * * /usr/local/bin/mirror-sync.sh >/dev/null 2>&1
```

## 第四步：验证镜像站可用

```bash
# 服务器上或本地浏览器都行
curl -I https://cdn-beijing.linkbrain.top/index.html
curl -I https://cdn-beijing.linkbrain.top/assets/$(curl -s https://cdn-beijing.linkbrain.top/index.html | grep -oE 'assets/app[0-9a-f]{8}\.js' | head -1 | sed 's#assets/##')
```

两条都返回 200，且第二条带 `Access-Control-Allow-Origin` 和 immutable 缓存头即成功。

## 第五步：告诉我一声，我来开主站兜底开关

主站 `index.html` 里的 `window.__CF_MIRROR_ORIGIN__` 目前故意留空（兜底关闭）。
镜像站验证可用后告诉我，我把它改成 `https://cdn-beijing.linkbrain.top`，重新构建
部署主站，兜底立即生效：主站 JS/CSS 加载失败或 12 秒未启动时，自动改从
cdn-beijing 加载。

---

## 运维说明

- **日志**：`/var/log/mirror-sync.log`（每次同步一行摘要；下载失败有警告，下轮自动重试）。
- **磁盘**：旧哈希文件每次同步自动清理，目录体积 ≈ 当前版本产物（约 10MB）。
- **同步频率**：默认 5 分钟，改 `mirror-sync.timer` 里的 `OnUnitActiveSec` 即可。
- **手动同步**：发新版后不想等 5 分钟，SSH 上跑 `mirror-sync.sh` 立即对账。
- **脚本不依赖任何安装**：只要 curl 和 grep（Ubuntu 22.04 自带）。
