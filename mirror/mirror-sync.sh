#!/usr/bin/env bash
# ============================================================
# 蹭饭图生成器 · 镜像同步脚本（cdn-beijing.linkbrain.top）
#
# 功能：从主站（Cloudflare Pages，map.linkbrain.top）抓取最新
#       构建产物到本机站点目录，作为静态资源加速/兜底镜像。
#       文件名带内容哈希——新版发布即产生新文件，旧文件自动清理。
#
# 用法：bash mirror-sync.sh          # 立即同步一次
# 定时：推荐 systemd timer（见 mirror-sync.service / .timer），
#       或 crontab：*/5 * * * * /usr/local/bin/mirror-sync.sh
#
# 依赖：curl、grep（Ubuntu 22.04 自带）
# 可配环境变量：
#   MIRROR_ORIGIN  源站（默认 https://map.linkbrain.top）
#   MIRROR_ROOT    本机站点目录（默认 /www/wwwroot/cdn-beijing）
#   MIRROR_LOG     日志文件（默认 /var/log/mirror-sync.log）
# ============================================================
set -euo pipefail

ORIGIN="${MIRROR_ORIGIN:-https://map.linkbrain.top}"
ROOT="${MIRROR_ROOT:-/www/wwwroot/cdn-beijing}"
LOG_FILE="${MIRROR_LOG:-/var/log/mirror-sync.log}"
LOCK_FILE=/tmp/mirror-sync.lock
UA="cdn-beijing-mirror-sync/1.0"

# 防止定时任务与手动执行并发（优先 flock；无 flock 的环境退化为 mkdir 原子锁）
WORK="$(mktemp -d)"
if command -v flock >/dev/null 2>&1; then
  exec 9>"$LOCK_FILE"
  if ! flock -n 9; then
    echo "另一个同步进程正在运行，本次跳过"
    exit 0
  fi
  trap 'rm -rf "$WORK"' EXIT
else
  if ! mkdir "$LOCK_FILE.d" 2>/dev/null; then
    echo "另一个同步进程正在运行，本次跳过"
    exit 0
  fi
  trap 'rm -rf "$WORK"; rmdir "$LOCK_FILE.d" 2>/dev/null || true' EXIT
fi

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"; }

mkdir -p "$ROOT/assets" "$(dirname "$LOG_FILE")"

fetch() {
  # $1=URL $2=输出文件；先下临时文件再 mv，保证站点目录里永远没有半截文件
  curl -fsSL --retry 3 --retry-all-errors --retry-delay 2 \
       --connect-timeout 8 --max-time 120 -A "$UA" "$1" -o "$2"
}

log "开始同步：$ORIGIN → $ROOT"

# ---------- 1. 抓入口 HTML（加时间戳参数，防任何中间缓存给旧版） ----------
if ! fetch "$ORIGIN/index.html?_sync=$(date +%s)" "$WORK/index.html"; then
  log "错误：index.html 获取失败，本次同步中止（站点现有文件不受影响）"
  exit 1
fi

# ---------- 2. 从 HTML 提取资源路径（/assets /data /fonts /images） ----------
grep -oE '/(assets|data|fonts|images)/[A-Za-z0-9._-]+' "$WORK/index.html" | sort -u > "$WORK/queue.txt" || true
if [[ ! -s "$WORK/queue.txt" ]]; then
  log "错误：index.html 中未发现资源引用（主站结构可能变了），中止"
  exit 1
fi

# ---------- 3. 下载缺失资源；扫描 JS 内部的懒加载 chunk 引用，迭代到不动点 ----------
# 内容哈希文件名：本机已存在即内容一致，不重复下载；
# 但已存在的 JS 也要扫描内部引用——否则仅靠 HTML 清单发现不了懒加载 chunk，
# 第 4 步清理时会把它们当旧版本误删
scan_js_refs() {
  {
    grep -oE 'ck[0-9a-f]{8}\.js' "$1" | sed 's#^#/assets/#' || true
    grep -oE 'assets/[A-Za-z0-9._-]+\.(js|css)' "$1" | sed 's#^#/#' || true
    grep -oE '[0-9a-f]{8}\.css' "$1" | sed 's#^#/assets/#' || true
  } >> "$WORK/queue.txt"
}

: > "$WORK/seen.txt"
: > "$WORK/downloaded.txt"
pass=0
while true; do
  pass=$((pass + 1))
  before=$(wc -l < "$WORK/seen.txt" | tr -d ' ')
  while IFS= read -r path; do
    # 跳过空行与已处理项
    [ -z "$path" ] && continue
    grep -qxF "$path" "$WORK/seen.txt" && continue
    echo "$path" >> "$WORK/seen.txt"
    dest="$ROOT$path"
    if [ -f "$dest" ]; then
      [[ "$path" == *.js ]] && scan_js_refs "$dest"
      continue
    fi
    mkdir -p "$(dirname "$dest")"
    if fetch "$ORIGIN$path" "$WORK/dl.tmp"; then
      mv "$WORK/dl.tmp" "$dest"
      echo "$path" >> "$WORK/downloaded.txt"
      [[ "$path" == *.js ]] && scan_js_refs "$dest"
    else
      log "警告：$path 下载失败（本轮跳过，下轮定时同步自动重试）"
    fi
  done < <(sort -u "$WORK/queue.txt")
  after=$(wc -l < "$WORK/seen.txt" | tr -d ' ')
  # seen 清单不再增长（引用发现完毕）或达到迭代上限即结束
  if [ "$after" -le "$before" ] || [ "$pass" -ge 5 ]; then
    break
  fi
done

dl_count=$(wc -l < "$WORK/downloaded.txt" | tr -d ' ')
log "资源检查完成：新下载 ${dl_count} 个文件"

# ---------- 4. 清理过期哈希文件（assets 里不在本次清单中的都是旧版本） ----------
pruned=0
for f in "$ROOT"/assets/*; do
  [ -f "$f" ] || continue
  rel="/assets/$(basename "$f")"
  if ! grep -qxF "$rel" "$WORK/seen.txt"; then
    rm -f "$f"
    pruned=$((pruned + 1))
  fi
done
[ "$pruned" -gt 0 ] && log "清理旧版本文件 ${pruned} 个" || true

# ---------- 5. 最后替换入口 HTML（资源先就位，入口永远指向已存在的文件） ----------
mv "$WORK/index.html" "$ROOT/index.html"
log "同步完成：入口已更新，站点目录 $ROOT"
