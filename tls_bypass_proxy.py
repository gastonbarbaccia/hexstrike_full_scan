#!/usr/bin/env python3
"""
HexStrike TLS Bypass Proxy — Standalone
========================================
Proxy HTTP/HTTPS que usa curl como backend para bypasear:
  - TLS Fingerprinting (JA3/JA4) de CDNs como Hostinger hcdn
  - Bot challenges HTTP

No requiere mitmproxy. Maneja CONNECT con SSL MITM via ssl.SSLContext.

Puerto por defecto: 8118
"""

import socket
import ssl
import threading
import subprocess
import sys
import os
import tempfile
import select
from urllib.parse import urlparse

PORT    = int(os.environ.get("TLS_BYPASS_PORT", 8118))
UA      = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
TIMEOUT = 30

SKIP_REQ  = {"host", "content-length", "transfer-encoding", "connection",
             "user-agent", "accept-encoding", "proxy-connection", "te", "trailers"}
SKIP_RESP = {"transfer-encoding", "connection", "keep-alive", "content-encoding",
             "proxy-connection", "upgrade", "te"}


def gen_cert(hostname: str):
    """Genera cert auto-firmado para MITM SSL en /tmp"""
    key_file  = f"/tmp/hs_{hostname}.key"
    cert_file = f"/tmp/hs_{hostname}.crt"
    if not os.path.exists(cert_file):
        os.system(
            f"openssl req -x509 -newkey rsa:2048 -keyout {key_file} "
            f"-out {cert_file} -days 365 -nodes "
            f"-subj '/CN={hostname}' "
            f"-addext 'subjectAltName=DNS:{hostname}' "
            f">/dev/null 2>&1"
        )
    return cert_file, key_file


def curl_request(url: str, method: str = "GET",
                 headers: dict = None, body: bytes = None) -> tuple:
    """Ejecuta la petición real via curl y devuelve (status, headers, body)"""
    cmd = [
        "curl", "-sk", "--max-time", str(TIMEOUT),
        "--noproxy", "*",   # ← evita el loop: curl no usa el proxy para llamadas internas
        "-A", UA, "-X", method, "-D", "-", "--compressed",
    ]
    for k, v in (headers or {}).items():
        if k.lower() not in SKIP_REQ:
            cmd += ["-H", f"{k}: {v}"]
    if body:
        cmd += ["--data-binary", "@-"]
    cmd.append(url)

    # Eliminar vars de proxy del entorno del subprocess
    env = os.environ.copy()
    for var in ("http_proxy", "https_proxy", "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "all_proxy"):
        env.pop(var, None)

    try:
        proc = subprocess.run(cmd, input=body, capture_output=True, timeout=TIMEOUT + 5, env=env)
        raw  = proc.stdout
        sep  = b"\r\n\r\n"
        idx  = raw.rfind(sep)
        if idx == -1:
            return 200, {}, raw

        hdr_raw   = raw[:idx]
        resp_body = raw[idx + 4:]

        # Último bloque de headers (tras posibles redirects)
        blocks   = hdr_raw.split(b"\r\n\r\n")
        hdr_text = blocks[-1].decode("utf-8", errors="replace")
        lines    = hdr_text.splitlines()

        status = 200
        if lines and lines[0].startswith("HTTP/"):
            try:
                status = int(lines[0].split(" ")[1])
            except:
                pass

        resp_hdrs = {}
        for line in lines[1:]:
            if ":" in line:
                k, _, v = line.partition(":")
                kl = k.strip().lower()
                if kl not in SKIP_RESP:
                    resp_hdrs[k.strip()] = v.strip()

        return status, resp_hdrs, resp_body

    except subprocess.TimeoutExpired:
        return 504, {}, b"Gateway Timeout"
    except Exception as e:
        return 502, {}, f"Proxy error: {e}".encode()


def build_response(status: int, headers: dict, body: bytes) -> bytes:
    lines = [f"HTTP/1.1 {status} OK\r\n"]
    for k, v in headers.items():
        lines.append(f"{k}: {v}\r\n")
    lines.append(f"Content-Length: {len(body)}\r\n")
    lines.append("Connection: close\r\n")
    lines.append("\r\n")
    return "".join(lines).encode() + body


def recv_all(sock, timeout=5.0) -> bytes:
    """Lee hasta encontrar \r\n\r\n (fin de headers)"""
    sock.settimeout(timeout)
    data = b""
    try:
        while True:
            chunk = sock.recv(4096)
            if not chunk:
                break
            data += chunk
            if b"\r\n\r\n" in data:
                break
    except (socket.timeout, ssl.SSLError):
        pass
    return data


def parse_request(raw: bytes):
    """Parsea HTTP request raw → (method, path, version, headers, body)"""
    sep = raw.find(b"\r\n\r\n")
    hdr_raw = raw[:sep] if sep != -1 else raw
    body    = raw[sep + 4:] if sep != -1 else b""

    lines = hdr_raw.decode("utf-8", errors="replace").splitlines()
    if not lines:
        return None, None, None, {}, b""

    parts  = lines[0].split(" ", 2)
    method = parts[0] if len(parts) > 0 else "GET"
    path   = parts[1] if len(parts) > 1 else "/"

    hdrs = {}
    for line in lines[1:]:
        if ":" in line:
            k, _, v = line.partition(":")
            hdrs[k.strip()] = v.strip()

    return method, path, "HTTP/1.1", hdrs, body


def handle_direct_http(sock, raw: bytes, host: str):
    """HTTP plano (no CONNECT)"""
    method, path, _, hdrs, body = parse_request(raw)
    if not method:
        return

    scheme = "http"
    if not path.startswith("http"):
        port_str = f":{hdrs.get('Host','').split(':')[-1]}" if ":" in hdrs.get("Host", "") else ""
        url = f"http://{host}{path}"
    else:
        url = path

    status, resp_hdrs, resp_body = curl_request(url, method, hdrs, body or None)
    try:
        sock.sendall(build_response(status, resp_hdrs, resp_body))
    except:
        pass


def handle_connect(sock, connect_host: str, connect_port: int):
    """HTTPS CONNECT: MITM con cert auto-firmado, luego curl"""
    # 1. Confirmar el tunnel
    sock.sendall(b"HTTP/1.1 200 Connection Established\r\n\r\n")

    # 2. Generar cert para el host
    cert_file, key_file = gen_cert(connect_host)

    # 3. Envolver en SSL
    ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    try:
        ctx.load_cert_chain(cert_file, key_file)
    except Exception:
        return

    try:
        ssl_sock = ctx.wrap_socket(sock, server_side=True)
    except (ssl.SSLError, OSError):
        return

    # 4. Leer el HTTP request dentro del tunnel TLS
    raw = recv_all(ssl_sock, timeout=10)
    if not raw:
        ssl_sock.close()
        return

    method, path, _, hdrs, body = parse_request(raw)
    if not method:
        ssl_sock.close()
        return

    url = f"https://{connect_host}:{connect_port}{path}"

    status, resp_hdrs, resp_body = curl_request(url, method, hdrs, body or None)
    try:
        ssl_sock.sendall(build_response(status, resp_hdrs, resp_body))
    except:
        pass
    finally:
        ssl_sock.close()


def handle_client(conn, addr):
    try:
        raw = recv_all(conn, timeout=10)
        if not raw:
            return

        first_line = raw.split(b"\r\n")[0].decode("utf-8", errors="replace")
        parts = first_line.split(" ", 2)
        if len(parts) < 2:
            return

        method = parts[0].upper()
        target = parts[1]

        if method == "CONNECT":
            # HTTPS
            host_port = target.split(":", 1)
            host = host_port[0]
            port = int(host_port[1]) if len(host_port) > 1 else 443
            handle_connect(conn, host, port)
        else:
            # HTTP
            parsed = urlparse(target)
            host   = parsed.netloc or raw.split(b"Host: ")[1].split(b"\r\n")[0].decode() if b"Host: " in raw else "localhost"
            handle_direct_http(conn, raw, host)
    except Exception:
        pass
    finally:
        try:
            conn.close()
        except:
            pass


def main():
    print(f"[HexStrike TLS Bypass Proxy] Escuchando en 0.0.0.0:{PORT}")
    sys.stdout.flush()

    srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    srv.bind(("0.0.0.0", PORT))
    srv.listen(50)

    while True:
        try:
            conn, addr = srv.accept()
            t = threading.Thread(target=handle_client, args=(conn, addr), daemon=True)
            t.start()
        except KeyboardInterrupt:
            break
        except Exception:
            pass

    srv.close()


if __name__ == "__main__":
    main()
