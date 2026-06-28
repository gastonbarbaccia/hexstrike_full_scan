# HexStrike AI

Imagen Docker (Kali Linux) con ~196 herramientas de seguridad ofensiva integradas como servidor MCP para Claude Code.

> ⚠️ Solo para pentesting autorizado, CTFs y bug bounty.

---

## Inicio rápido

```bash
# Sin Burp Suite
docker run -d \
  -p 8888:8888 \
  --name hexstrike \
  --cap-add=NET_RAW \
  --cap-add=NET_ADMIN \
  --add-host=host.docker.internal:host-gateway \
  gastonbarbaccia/hexstrikeia:latest

# Con Burp Suite Pro
docker run -d \
  -p 8888:8888 \
  --name hexstrike \
  --cap-add=NET_RAW \
  --cap-add=NET_ADMIN \
  --add-host=host.docker.internal:host-gateway \
  -e BURP_API_URL=http://host.docker.internal:1337 \
  -e BURP_API_KEY=tu_api_key \
  gastonbarbaccia/hexstrikeia:latest
```

> Agregar `-p 8118:8118` solo si necesitás que herramientas del host (fuera de Docker) usen el proxy TLS bypass.

Verificar:
```bash
curl http://localhost:8888/health
```

Conectar a Claude Code:
```bash
claude mcp add --transport http --scope user hexstrike-ai http://localhost:8888/mcp
```

---

## TLS Bypass Proxy (puerto 8118)

Al arrancar, el container levanta automáticamente un proxy en `127.0.0.1:8118` que bypasea el TLS fingerprinting de WAFs (Hostinger, Cloudflare, etc.) usando `curl` como backend.

Todas las herramientas dentro del container lo usan automáticamente via `http_proxy`/`https_proxy`. La DB de wpscan se actualiza al arrancar el container.

```bash
# Ver logs del proxy
docker exec hexstrike cat /var/log/tls_bypass.log

# Testear conectividad
docker exec hexstrike curl -sk --proxy http://127.0.0.1:8118 https://objetivo.com
```

---

## Burp Suite Pro (opcional)

1. Burp → `Settings → Suite → REST API` → activar en puerto `1337`
2. **Importante**: en `Listen mode` seleccionar **All interfaces** (no solo `localhost`) para que el container pueda alcanzarlo vía `host.docker.internal`
3. Crear una API key y pasarla al container:

```bash
docker run -d \
  -p 8888:8888 \
  --name hexstrike \
  --cap-add=NET_RAW \
  --cap-add=NET_ADMIN \
  --add-host=host.docker.internal:host-gateway \
  -e BURP_API_URL=http://host.docker.internal:1337 \
  -e BURP_API_KEY=tu_api_key \
  gastonbarbaccia/hexstrikeia:latest
```

> Alternativamente: `--env-file .env` si tenés las variables en un archivo local.

Si Burp Scanner falla por TLS fingerprinting: `Settings → Scanner → Use embedded browser for all scanning`.

---

## Pentest automatizado

```bash
# Ejecutar scan contra todos los targets del YAML
./run_pentest.sh

# Programar con cron
./schedule_pentest.sh install
./schedule_pentest.sh list
./schedule_pentest.sh progress -f   # monitoreo live
```

Configurar targets en `~/.claude/pentest-targets.yaml`:

```yaml
settings:
  schedule:
    cron: "0 2 * * 1"
    keep_reports: 10

targets:
  - name: "MiSitio"
    url: "https://ejemplo.com"
    modules: [recon, ports, web, crawl, sqli, xss, vulns]
```

| Módulo | Herramientas |
|---|---|
| `recon` | subfinder · amass · httpx · wafw00f · gau · waybackurls |
| `ports` | naabu + nmap -sV -sC -A |
| `web` | nikto · feroxbuster · ffuf |
| `crawl` | katana · hakrawler · paramspider |
| `sqli` | sqlmap |
| `xss` | dalfox |
| `vulns` | nuclei |
| `auth` | hydra · jwt decoder |
| `msf_validate` | metasploit auxiliares (sin exploit) |

Reportes en `reports/<timestamp>/<target>/report.html`.

---

## Herramientas incluidas

| Categoría | Herramientas |
|---|---|
| **Reconocimiento** | nmap, masscan, rustscan, subfinder, amass, fierce, dnsenum, theHarvester |
| **Web** | gobuster, ffuf, feroxbuster, nikto, sqlmap, nuclei, httpx, katana, dalfox, wafw00f, wpscan |
| **Parámetros** | arjun, paramspider |
| **Passwords** | hydra, john, hashcat, medusa |
| **Reversing** | gdb+peda, radare2, binwalk, volatility3 |
| **Explotación** | metasploit, pwntools, ropgadget |
| **Cloud** | prowler, pacu, trivy, checkov, kube-hunter, aws-cli |
| **AD / SMB** | impacket, netexec, enum4linux, responder, evil-winrm |
| **OSINT** | spiderfoot, recon-ng, sherlock |

Runtimes: Python 3, Go 1.22, Node.js 20, Rust, Ruby, Java.
Wordlists: seclists, rockyou, templates Nuclei.

---

## Build

```bash
# 1. Clonar / ubicarse en el directorio del proyecto
cd hexstrike_v2

# 2. Buildear la imagen (~30-40 min, imagen ~15GB)
docker build -t gastonbarbaccia/hexstrikeia:latest . 2>&1 | tee build.log

# 3. Publicar en Docker Hub
docker push gastonbarbaccia/hexstrikeia:latest
```

Para reemplazar un container existente:

```bash
# Bajar y eliminar el container anterior
docker stop hexstrike && docker rm hexstrike

# Levantar con la imagen nueva
docker run -d \
  -p 8888:8888 \
  --name hexstrike \
  --cap-add=NET_RAW \
  --cap-add=NET_ADMIN \
  --add-host=host.docker.internal:host-gateway \
  gastonbarbaccia/hexstrikeia:latest
```

---

## Solución de problemas

**Container no arranca**
```bash
docker logs hexstrike
docker exec hexstrike cat /var/log/tls_bypass.log
```

**403 del WAF** — el proxy está funcionando, el 403 es real. Agregar `--random-user-agent` a la herramienta.

**Herramienta no conecta al objetivo**
```bash
docker exec hexstrike curl -sk --proxy http://127.0.0.1:8118 https://objetivo.com
```

**`BURP_PRO_ERROR: curl fallo o timeout`**
- Verificar que Burp esté abierto y la REST API activa en el puerto `1337`
- En Burp: `Settings → Suite → REST API → Listen mode: All interfaces` (si solo escucha en `localhost`, el container no puede alcanzarlo)
- Confirmar que la URL no usa `127.0.0.1` sino `host.docker.internal`: `docker exec hexstrike env | grep BURP`
- Testear directamente: `docker exec hexstrike curl -sk http://host.docker.internal:1337/tu_api_key/v0.1/scan`

**Burp 503** — verificar que Burp esté abierto con la REST API activa.

**Lock de scan activo**
```bash
cat /tmp/hexstrike_pentest.lock
kill -0 $(cat /tmp/hexstrike_pentest.lock) || rm /tmp/hexstrike_pentest.lock
```

---

## Créditos

- [HexStrike AI](https://github.com/0x4m4/hexstrike-ai) — framework MCP base
- Herramientas de terceros pertenecen a sus respectivos autores

Licencia MIT (aplica al código de empaquetado, no a las herramientas instaladas).
