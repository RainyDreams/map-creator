#!/usr/bin/env python3
"""镜像站手动刷新接口（cdn-beijing.linkbrain.top 配套）

访问  https://cdn-beijing.linkbrain.top/sync-mirror?token=<TOKEN>  立即触发一次
mirror-sync.sh 全量对账，返回同步日志末尾；不必等 5 分钟定时器。

只监听 127.0.0.1:8975，由 nginx 反代暴露；token 校验在本进程内完成。
并发保护：同一时刻只允许一个同步任务，重复触发返回 409。
"""

import subprocess
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

TOKEN = 'LNPxKZR47H3jm331YQg9LHjifi570TUM'
SYNC_SCRIPT = '/usr/local/bin/mirror-sync.sh'
LISTEN = ('127.0.0.1', 8975)
LOCK = threading.Lock()


class Handler(BaseHTTPRequestHandler):
    server_version = 'mirror-api/1.0'

    def do_GET(self):
        url = urlparse(self.path)
        if url.path != '/sync-mirror':
            self._reply(404, 'not found')
            return
        if parse_qs(url.query).get('token', [''])[0] != TOKEN:
            self._reply(403, 'forbidden')
            return
        if not LOCK.acquire(blocking=False):
            self._reply(409, 'sync already running, try again later')
            return
        try:
            proc = subprocess.run(
                [SYNC_SCRIPT], capture_output=True, text=True, timeout=280
            )
            out = (proc.stdout + proc.stderr).strip() or '(no output)'
            self._reply(200 if proc.returncode == 0 else 500, out[-8000:])
        except subprocess.TimeoutExpired:
            self._reply(504, 'sync timeout (>280s), check /var/log/mirror-sync.log')
        except Exception as exc:  # noqa: BLE001
            self._reply(500, 'error: %s' % exc)
        finally:
            LOCK.release()

    def _reply(self, code, text):
        body = text.encode('utf-8', 'replace')
        self.send_response(code)
        self.send_header('content-type', 'text/plain; charset=utf-8')
        self.send_header('content-length', str(len(body)))
        self.send_header('cache-control', 'no-store')
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):  # 静默，日志走 journalctl
        pass


if __name__ == '__main__':
    ThreadingHTTPServer(LISTEN, Handler).serve_forever()
