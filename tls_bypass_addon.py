"""
HexStrike TLS Bypass Addon para mitmproxy
==========================================
Intercepta cada request y lo re-ejecuta con curl (que bypasea el TLS fingerprinting
y la bot challenge del CDN de Hostinger).

Uso:
  mitmdump -p 8118 --ssl-insecure -s tls_bypass_addon.py

Luego configurar en cada herramienta:
  --proxy http://127.0.0.1:8118   (la mayoría de tools)
  set PROXIES HTTP:127.0.0.1:8118  (Metasploit)
"""

import subprocess
import shlex
from mitmproxy import http

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

SKIP_HEADERS = {
    "host", "content-length", "transfer-encoding", "connection",
    "user-agent", "accept-encoding", "proxy-connection",
}


def request(flow: http.HTTPFlow) -> None:
    url    = flow.request.pretty_url
    method = flow.request.method
    body   = flow.request.content or b""

    # Construir comando curl
    cmd = [
        "curl", "-sk",
        "--max-time", "30",
        "-A", UA,
        "-X", method,
        "-D", "-",        # headers en stdout
        "--compressed",
        # NO seguir redirects — devolver la respuesta tal cual
    ]

    # Agregar headers del request original
    for k, v in flow.request.headers.items():
        if k.lower() not in SKIP_HEADERS:
            cmd += ["-H", f"{k}: {v}"]

    # Body
    if body:
        cmd += ["--data-binary", "@-"]

    cmd.append(url)

    try:
        proc = subprocess.run(
            cmd,
            input=body if body else None,
            capture_output=True,
            timeout=35,
        )
        raw = proc.stdout

        # Separar headers de body (el último bloque después de CRLFCRLF)
        sep = b"\r\n\r\n"
        idx = raw.rfind(sep)
        if idx == -1:
            sep = b"\n\n"
            idx = raw.rfind(sep)

        if idx == -1:
            # Sin headers separados — todo body
            flow.response = http.Response.make(200, raw, {"content-type": "text/html"})
            return

        hdr_part  = raw[:idx]
        body_part = raw[idx + len(sep):]

        # Tomar el último bloque de headers (por si hubo redirects)
        hdr_blocks = hdr_part.split(b"\r\n\r\n")
        if len(hdr_blocks) == 1:
            hdr_blocks = hdr_part.split(b"\n\n")
        last_hdr = hdr_blocks[-1]

        lines = last_hdr.decode("utf-8", errors="replace").splitlines()

        # Status
        status_code = 200
        if lines and lines[0].startswith("HTTP/"):
            try:
                status_code = int(lines[0].split(" ")[1])
            except:
                pass

        # Headers
        headers = {}
        skip_resp = {
            "transfer-encoding", "connection", "keep-alive",
            "content-encoding", "proxy-connection",
        }
        for line in lines[1:]:
            if ":" in line:
                k, _, v = line.partition(":")
                kk = k.strip().lower()
                if kk not in skip_resp:
                    headers[k.strip()] = v.strip()

        headers["Content-Length"] = str(len(body_part))

        flow.response = http.Response.make(status_code, body_part, headers)

    except subprocess.TimeoutExpired:
        flow.response = http.Response.make(504, b"Gateway Timeout via curl", {"content-type": "text/plain"})
    except Exception as e:
        flow.response = http.Response.make(502, f"Proxy error: {e}".encode(), {"content-type": "text/plain"})
