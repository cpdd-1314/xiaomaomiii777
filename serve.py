#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
带 COOP/COEP 头的本地静态服务器。
用途：让 ffmpeg.wasm 的多线程核心可用（需要 cross-origin isolation），
从而在本站「导出格式」选择 MP4 时能正常转换。

使用方法：
    python3 serve.py            # 默认 http://localhost:8000，服务当前目录
    python3 serve.py 8126       # 指定端口
    python3 serve.py 8126 /path # 指定端口与目录

然后用浏览器打开提示的 http://localhost:端口 地址，再点「生成并下载视频」选 MP4 即可。
（直接双击 index.html（file://）打开时，浏览器无跨源隔离，MP4 转换会失败并自动回退 WEBM。）
"""
import sys, os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class COOPCOEP(SimpleHTTPRequestHandler):
    def end_headers(self):
        # 启用跨源隔离，使 SharedArrayBuffer / 多线程 ffmpeg 核心可用
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        self.send_header("Cross-Origin-Embedder-Policy", "require-corp")
        super().end_headers()


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    directory = sys.argv[2] if len(sys.argv) > 2 else os.getcwd()
    os.chdir(directory)
    srv = ThreadingHTTPServer(("0.0.0.0", port), COOPCOEP)
    print(f"✅ 本地服务器已启动： http://localhost:{port}")
    print(f"   目录：{os.path.abspath('.')}")
    print(f"   在浏览器打开上面的地址，选择 MP4 即可导出（已启用跨源隔离）。Ctrl+C 停止。")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\n已停止。")


if __name__ == "__main__":
    main()
