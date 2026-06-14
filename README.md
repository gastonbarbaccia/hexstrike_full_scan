# HexStrike AI — Docker Security Platform

Imagen Docker basada en **Kali Linux** con el framework [HexStrike AI MCP](https://github.com/0x4m4/hexstrike-ai) y ~196 herramientas de seguridad ofensiva. Se integra con **Claude Code** como orquestador inteligente para ejecutar análisis de seguridad completos de forma automatizada y periódica.

**Novedades v7 (TLS Bypass Edition):**
- Proxy TLS bypass integrado y automático (bypassea TLS fingerprinting de CDNs como Hostinger, Cloudflare, etc.)
- Integración nativa con **Burp Suite Pro** via REST API
- Fix de autenticación de la API key de Burp (key en URL, no en header)
- Todas las herramientas Go/Ruby/Java ruteadas automáticamente por el proxy

> ⚠️ **Uso responsable.** Estas herramientas son para pentesting autorizado, CTFs, bug bounty e investigación. No las uses contra sistemas para los que no tengas permiso explícito.

---

## Tabla de contenidos

1. [Prerequisitos](#prerequisitos)
2. [Inicio rápido](#inicio-rápido)
3. [Integración con Burp Suite Pro](#integración-con-burp-suite-pro)
4. [TLS Bypass Proxy](#tls-bypass-proxy-integrado)
5. [Variables de entorno](#variables-de-entorno)
6. [Pentest Automatizado con Claude Code](#pentest-automatizado-con-claude-code)
7. [Herramientas incluidas](#herramientas-incluidas)
8. [Build desde cero](#build-desde-cero)
9. [Solución de problemas](#solución-de-problemas)
10. [Archivos del repositorio](#archivos-del-repositorio)

---

## Prerequisitos

Antes de empezar, asegurate de tener instalado:

| Requisito | Versión mínima | Link |
|---|---|---|
| **Docker** | 24.x | [docs.docker.com](https://docs.docker.com/engine/install/) |
| **Claude Code** (CLI) | última | [claude.ai/code](https://claude.ai/code) |
| **Python 3 + PyYAML** | Python 3.8+ | `pip3 install pyyaml` |
| **Burp Suite Pro** | cualquiera | Opcional — solo para módulo `headers`/`msf_validate` |

Verificar que Claude Code esté instalado y autenticado:

```bash
claude --version
claude auth status
```

---

## Inicio rápido

### 1. Levantar el container

```bash
docker run -d \
  -p 8888:8888 \
  -p 8118:8118 \
  --add-host=host.docker.internal:host-gateway \
  --name hexstrike \
  --cap-add=NET_RAW \
  --cap-add=NET_ADMIN \
  -e BURP_API_URL="http://host.docker.internal:1337" \
  -e BURP_API_KEY="TU_API_KEY_AQUI" \
  gastonbarbaccia/hexstrikeia:latest
```

> `-p 8118:8118` expone el proxy TLS bypass al host — necesario para que las tools locales (dalfox, nuclei, nikto, etc.) bypaseen el fingerprinting de WAFs como Cloudflare y Hostinger hcdn. Sin esto, las tools se cuelgan esperando respuestas bloqueadas silenciosamente.  
> Si no usas Burp Suite Pro, podés omitir las variables `-e BURP_API_URL` y `-e BURP_API_KEY`.  
> `--add-host=host.docker.internal:host-gateway` es necesario en Linux. En macOS/Windows ya viene por defecto.

### 2. Verificar que está funcionando

```bash
curl http://localhost:8888/health
# Respuesta esperada: {"status":"healthy", ...}
```

### 3. Conectar con Claude Code (MCP)

```bash
claude mcp add --transport http --scope user hexstrike-ai http://localhost:8888/mcp
```

Verificar que el servidor MCP aparece en la lista:

```bash
claude mcp list
```

Desde este punto, Claude Code tiene acceso a todas las herramientas HexStrike vía MCP.

---

## Integración con Burp Suite Pro

### Configurar Burp (una sola vez)

1. Abrir **Burp Suite Pro**
2. Ir a `Settings → Suite → REST API`
3. Configurar:

```
✅ Service running
Service URL:  http://0.0.0.0:1337
✅ API key → crear una nueva con nombre "hexstrike" → copiar el key generado
```

### Verificar conectividad

```bash
# Desde el host:
curl http://127.0.0.1:1337/TU_API_KEY/v0.1/
# Debe responder con la documentación de la API de Burp ✅
```

### Por qué puede fallar Burp Scanner

El CDN de algunos hosts (Hostinger, Cloudflare, etc.) implementan **TLS fingerprinting** que bloquea el scanner de Burp (Java/Bouncy Castle). Para resolverlo:

```
Burp Suite Pro → Settings → Scanner → Scan details
→ Marcar: "Use embedded browser for all scanning"
```

Con esto Burp usa Chromium real y bypassea el fingerprinting. Alternativamente, el proxy TLS integrado en el container (puerto 8118) también lo resuelve desde dentro del Docker.

---

## TLS Bypass Proxy (integrado)

El container incluye un proxy TLS standalone en el **puerto 8118** que arranca automáticamente al iniciar el container. Bypassea el TLS fingerprinting usando `curl` como backend (OpenSSL), que no es detectado por los CDNs.

Logs en `/var/log/tls_bypass.log` (dentro del container).

### Herramientas que lo usan automáticamente

Las variables `http_proxy` y `https_proxy` están configuradas dentro del container:

| Herramienta | Sin proxy | Con proxy 8118 |
|---|---|---|
| Katana | ❌ TLS error | ✅ Funciona |
| Gobuster | ❌ TLS error | ✅ Funciona (ver nota) |
| Dalfox | ❌ TLS error | ✅ Funciona |
| SQLMap | ❌ SSL error | ✅ Funciona |
| Nikto | ❌ TLS error | ✅ con `-useproxy http://127.0.0.1:8118` |
| Metasploit | ❌ TLS error | `set PROXIES HTTP:127.0.0.1:8118` |

> **Nota sobre Gobuster y CDNs con 403 como "no encontrado":** Algunos CDNs devuelven HTTP 403 tanto para rutas inexistentes como para acceso denegado. Solución:
> ```bash
> gobuster dir -u https://objetivo.com --proxy http://127.0.0.1:8118 \
>   -k -s '200,301,302' --exclude-length 787
> ```

### Configurar el proxy en herramientas manualmente

```bash
# Metasploit (dentro del container)
msf> set PROXIES HTTP:127.0.0.1:8118

# curl
curl -sk --proxy http://127.0.0.1:8118 https://objetivo.com

# Nuclei
nuclei -proxy http://127.0.0.1:8118 -u https://objetivo.com

# Nikto
nikto -h https://objetivo.com -ssl -useproxy http://127.0.0.1:8118
```

> **Nota importante:** el proxy 8118 es **interno al container Docker**. Las herramientas que corren en el **host** (fuera de Docker) no pueden acceder a él directamente. Para herramientas locales, se usa `-k`/`--insecure` en su lugar.

---

## Variables de entorno

| Variable | Default | Descripción |
|---|---|---|
| `HEXSTRIKE_HOST` | `0.0.0.0` | Host del servidor HexStrike |
| `HEXSTRIKE_PORT` | `8888` | Puerto del servidor HexStrike |
| `BURP_API_URL` | `http://127.0.0.1:1337` | URL base de la REST API de Burp Suite Pro |
| `BURP_API_KEY` | _(vacío)_ | API key de Burp Suite Pro |
| `TLS_BYPASS_PORT` | `8118` | Puerto del proxy TLS bypass (interno) |
| `http_proxy` / `https_proxy` | `http://127.0.0.1:8118` | Proxy automático para herramientas dentro del container |

Variables de entorno del host para la automatización:

| Variable | Default | Descripción |
|---|---|---|
| `HEXSTRIKE_SCAN_DIR` | `~/hexstrikeai_scan` | Directorio de salida de reportes |
| `PENTEST_TARGETS` | `~/.claude/pentest-targets.yaml` | Ruta al archivo de configuración de targets |
| `GOPATH` | `~/go` | Ruta de instalación de herramientas Go |

---

## Pentest Automatizado con Claude Code

El sistema de automatización ejecuta análisis de seguridad completos usando Claude Code como orquestador. Lee los targets desde un archivo YAML, ejecuta cada fase con las herramientas correctas y genera reportes HTML detallados.

### Arquitectura

```
~/.claude/pentest-targets.yaml    ← define qué analizar, cuándo y con qué módulos
              │
              ▼
  schedule_pentest.sh             ← instala cron jobs, gestiona el scheduler
              │
              ▼
    run_pentest.sh                ← llama a claude CLI con el prompt del análisis
              │
              ├── MCP tools (Docker interno, proxy 8118 automático)
              │     subfinder · waybackurls · gau · wafw00f
              │     metasploit_run · burpsuite_scan · burpsuite_alternative_scan
              │     hakrawler · katana · paramspider · wpscan
              │     http_intruder · http_repeater · http_framework_test
              │
              └── Bash local (host, TLS bypass via -k/--insecure)
                    nmap · nikto · nuclei · gobuster · feroxbuster
                    ffuf · sqlmap · dalfox · httpx · naabu · amass
```

**Por qué dos rutas de ejecución:**
- Las herramientas **MCP** corren dentro del container y tienen acceso al proxy TLS 8118 → bypasean fingerprinting automáticamente.
- Las herramientas **Bash** corren en el host donde el proxy 8118 no es accesible → usan flags `-k`/`--insecure` para ignorar errores TLS.

---

### Paso 1 — Configurar targets

El archivo de configuración vive en `~/.claude/pentest-targets.yaml`. Editalo con tus targets:

```bash
nano ~/.claude/pentest-targets.yaml
```

Estructura completa del archivo:

```yaml
settings:
  output_dir: ~/hexstrikeai_scan   # donde se guardan los reportes
  scan_intensity: aggressive       # light | medium | aggressive
  threads: 10
  timeout_per_site: 7200           # segundos máximos por sitio (2h)

  schedule:
    enabled: true
    cron: "0 2 * * 1"             # schedule global: lunes 2AM
    keep_reports: 10              # cuántas sesiones conservar (0 = todas)
    notify_email: ""              # ej: admin@empresa.com
    notify_desktop: true          # notify-send al terminar

targets:

  - name: "MiSitio"               # nombre único (sin espacios recomendado)
    url:  "https://ejemplo.com"
    ip:   "1.2.3.4"
    scope:
      - "ejemplo.com"
    authorization: "/ruta/al/documento-de-autorizacion.pdf"
    notes: "PHP + MySQL. WAF: Cloudflare. CMS: WordPress 6.x"
    schedule: "0 3 * * *"         # override: diario 3AM (opcional, usa global si se omite)
    modules:
      - recon          # subfinder, amass, httpx, wafw00f, gau, waybackurls
      - ports          # naabu + nmap -sV -sC -A
      - web            # nikto, feroxbuster, ffuf
      - crawl          # gau, waybackurls, katana, hakrawler, paramspider
      - headers        # httpx probe, security headers, burp passive
      - sqli           # sqlmap (forms + params)
      - xss            # dalfox
      - vulns          # nuclei (CVEs, exposures, misconfigs)
      - msf_validate   # metasploit auxiliares + burp pro (sin explotar)
      - auth           # hydra, jwt decoder, análisis de cookies

  # Podés agregar más targets:
  # - name: "OtroSitio"
  #   url: "https://otro.com"
  #   schedule: "0 1 1 * *"   # mensual
  #   modules: [recon, vulns]
```

**Módulos disponibles:**

| Módulo | Herramientas |
|---|---|
| `recon` | subfinder · amass · nmap dns-brute · httpx · wafw00f · gau · waybackurls |
| `ports` | naabu (descubrimiento rápido) + nmap -sV -sC -A (detalle completo) |
| `web` | nikto · feroxbuster · ffuf |
| `crawl` | gau · waybackurls · katana · hakrawler · paramspider |
| `headers` | httpx probe · curl · burp passive scan |
| `sqli` | sqlmap --forms --crawl --level=3 --risk=2 |
| `xss` | dalfox url + dalfox pipe |
| `vulns` | nuclei (7460+ templates: CVEs · exposures · misconfigs) |
| `msf_validate` | 13+ módulos auxiliares MSF + burp pro (ver detalle abajo) |
| `auth` | hydra · jwt decoder · análisis de cookies de sesión |

---

### Paso 2 — Ejecutar o programar

#### Ejecutar ahora mismo

```bash
# Todos los targets del YAML
./run_pentest.sh

# Con un YAML específico
./run_pentest.sh /ruta/a/otro-targets.yaml
```

#### Programar con cron (scheduler)

```bash
# Instalar cron jobs según los schedules del YAML
./schedule_pentest.sh install

# Ver qué está instalado y cuándo corre
./schedule_pentest.sh list
./schedule_pentest.sh next

# Ejecutar ahora sin esperar el cron
./schedule_pentest.sh run-now

# Ejecutar un solo target
./schedule_pentest.sh run-target MiSitio

# ── Monitoreo del scan activo ─────────────────────────

# Snapshot: fase actual, módulos ✓/●/○ y hallazgos
./schedule_pentest.sh progress

# Modo live: se refresca cada 3s (Ctrl+C para salir)
./schedule_pentest.sh progress -f

# Output crudo de Claude en tiempo real — cada tool call,
# resultado y error. Ideal para debug o ver qué hace Claude
./schedule_pentest.sh tail

# ─────────────────────────────────────────────────────

# Ver historial de sesiones anteriores
./schedule_pentest.sh status

# Ver logs (últimas N líneas)
./schedule_pentest.sh logs 100

# Rotar sesiones antiguas (según keep_reports en el YAML)
./schedule_pentest.sh rotate

# Eliminar cron jobs
./schedule_pentest.sh remove
```

Usar un YAML en otra ruta:

```bash
PENTEST_TARGETS=/ruta/custom.yaml ./schedule_pentest.sh install
```

**Cron expressions de referencia:**

| Expression | Frecuencia |
|---|---|
| `0 2 * * 1` | Lunes a las 02:00 (semanal) |
| `0 3 * * *` | Todos los días a las 03:00 (diario) |
| `0 1 1 * *` | Primer día del mes a la 01:00 (mensual) |
| `0 */6 * * *` | Cada 6 horas |
| `0 2 * * 1,4` | Lunes y jueves a las 02:00 |

---

### Paso 3 — Ver los reportes

Cada ejecución crea una sesión con timestamp en `~/hexstrikeai_scan/`:

```
~/hexstrikeai_scan/
├── scheduler.log                    ← log del cron
├── 2026-05-29_02-00/                ← sesión del lunes 2AM
│   ├── index.html                   ← dashboard con links a todos los reportes
│   ├── master.log                   ← log completo del scan
│   └── MiSitio/
│       ├── report.html              ← reporte HTML completo ★
│       ├── subdomains.txt           ← subdominios encontrados
│       ├── nmap_detailed.{nmap,xml} ← scan de puertos
│       ├── nuclei_all.txt           ← vulnerabilidades Nuclei
│       ├── nuclei_cves.txt          ← CVEs específicos
│       ├── nuclei_exposures.txt     ← exposures
│       ├── feroxbuster_common.txt   ← directorios encontrados
│       ├── ffuf_big.json            ← fuzzing de paths
│       ├── dalfox.txt               ← XSS encontrados
│       ├── sqlmap/                  ← resultados SQLMap
│       ├── httpx_probe.txt          ← tecnologías detectadas
│       ├── all_urls.txt             ← URLs deduplicadas de todos los crawlers
│       └── claude_output.log        ← output completo de Claude
└── 2026-05-22_02-00/                ← sesión anterior (rotada según keep_reports)
```

Abrir el reporte en el navegador:

```bash
xdg-open ~/hexstrikeai_scan/$(ls -t ~/hexstrikeai_scan | head -1)/index.html
```

**Contenido de cada `report.html`:**
- Executive summary con score de riesgo (0–100) y conteo por severidad
- Tabla de vulnerabilidades: ID · Nombre · Severidad · CVSS · Evidencia · Remediación
- Detalle técnico por hallazgo: comando ejecutado · output raw · CVSS v3 · POC · remediación
- Sección MSF Validation: CVE · Módulo MSF · Ranking · Check Result · badge `CONFIRMADO/PROBABLE/SIN MÓDULO`
- Gráfico de severidades (CSS puro)
- Timeline del ataque con timestamps
- Apéndice con todos los outputs raw

---

### Módulos Metasploit ejecutados (msf_validate)

Solo se usan auxiliares de tipo `scanner`. **Nunca se ejecutan `run`/`exploit`.**

| Categoría | Módulos auxiliares |
|---|---|
| **HTTP** | `http_version` · `http_header` · `robots_txt` · `options` · `backup_file` · `git_scanner` · `phpinfo` |
| **SSL/TLS** | `openssl_heartbleed` (CVE-2014-0160) · `ssl_version` |
| **CVEs** | `log4shell_scanner` (CVE-2021-44228) · `shellshock_scan` (CVE-2014-6271) · `apache_normalize_path` (CVE-2021-41773) |
| **Servicios** | `ssh_version` · `smb_ms17_010` (EternalBlue) · `mysql_version` (si los puertos están abiertos) |
| **Burp Pro** | `burpsuite_scan` (activo) · `burpsuite_alternative_scan` · `http_intruder` · `http_framework_test` |

Resultado clasificado: `✅ CONFIRMADO` / `⚠️ PROBABLE` / `❌ FALSO POSITIVO` / `ℹ️ SIN MÓDULO MSF`

---

### Rutas de herramientas en el host

El script `run_pentest.sh` usa rutas absolutas. Si tu sistema tiene una instalación diferente, ajustá las variables de entorno `GOPATH` y `PATH`:

| Herramienta | Ruta default |
|---|---|
| `nmap`, `nikto`, `gobuster`, `ffuf`, `sqlmap` | `/usr/bin/<tool>` |
| `nuclei`, `httpx`, `dalfox`, `katana`, `subfinder`, `gau`, `naabu`, `amass` | `~/go/bin/<tool>` |
| `feroxbuster` | `~/.cargo/bin/feroxbuster` |
| Wordlist common | `/usr/share/dirb/wordlists/common.txt` |
| Wordlist big | `/usr/share/dirb/wordlists/big.txt` |

```bash
# Instalar herramientas Go que falten:
go install github.com/projectdiscovery/nuclei/v3/cmd/nuclei@latest
go install github.com/projectdiscovery/subfinder/v2/cmd/subfinder@latest
go install github.com/projectdiscovery/httpx/cmd/httpx@latest
go install github.com/hahwul/dalfox/v2@latest
go install github.com/projectdiscovery/katana/cmd/katana@latest
go install github.com/lc/gau/v2/cmd/gau@latest
go install github.com/projectdiscovery/naabu/v2/cmd/naabu@latest

# Instalar feroxbuster:
cargo install feroxbuster
```

---

## Herramientas incluidas

| Categoría | Herramientas |
|---|---|
| **Reconocimiento** | nmap, masscan, rustscan, naabu, arp-scan, subfinder, amass, fierce, dnsenum, theHarvester |
| **Web** | gobuster, ffuf, feroxbuster, dirsearch, nikto, sqlmap, wfuzz, nuclei, httpx, katana, hakrawler, dalfox, wafw00f, wpscan, whatweb, testssl.sh |
| **Burp Suite Pro** | Integración REST API (scan activo, crawl, audit) |
| **Parámetros / API** | arjun, paramspider, x8 |
| **Passwords** | hydra, john, hashcat, medusa, patator |
| **Reversing / Forense** | gdb (peda), radare2, binwalk, volatility3, exiftool, foremost |
| **Explotación** | metasploit-framework, exploitdb, pwntools, ropgadget |
| **Cloud** | prowler, scoutsuite, pacu, trivy, checkov, kube-hunter, aws-cli, kubectl |
| **OSINT** | spiderfoot, recon-ng, sherlock, holehe |
| **AD / SMB** | impacket, netexec, smbmap, enum4linux, responder, evil-winrm |
| **TLS Bypass** | Proxy standalone Python (puerto 8118, auto-start) |

Runtimes: Python 3, Node.js 20, Go 1.22, Rust, Ruby, Java JDK.  
Wordlists: `seclists`, `rockyou` (descomprimido), plantillas Nuclei.

---

## Build desde cero

Si querés reconstruir la imagen completa (tarda ~30–40 min):

```bash
# Build completa (16 capas, imagen ~15GB)
docker build -t gastonbarbaccia/hexstrikeia:latest . 2>&1 | tee build.log
```

Push a Docker Hub:

```bash
docker push gastonbarbaccia/hexstrikeia:latest
```

---

## Solución de problemas

### El container no arranca

```bash
docker logs hexstrike
```

El healthcheck tiene 30s de gracia. Si falla, revisar el log del proxy:

```bash
docker exec hexstrike cat /var/log/tls_bypass.log
```

### Burp Scanner no puede conectar al objetivo

El scanner de Burp usa Java/Bouncy Castle, bloqueado por TLS fingerprinting. Dos soluciones:

1. **Recomendado**: En Burp → `Settings → Scanner → Use embedded browser for all scanning`
2. En Burp → `Settings → Network → Upstream Proxy` → agregar `127.0.0.1:8118`

### Error 503 al usar `burpsuite_scan`

Verificar que Burp esté abierto con la REST API activa:

```bash
curl http://127.0.0.1:1337/TU_API_KEY/v0.1/
```

### Herramienta X no conecta al objetivo (desde el container)

```bash
docker exec hexstrike curl -sk --proxy http://127.0.0.1:8118 https://objetivo.com
```

Si funciona con proxy pero no sin él, agregar el flag de proxy correspondiente a la herramienta.

### run_pentest.sh falla al iniciar

```bash
# Verificar dependencias
python3 -c "import yaml; print('OK')" || pip3 install pyyaml
claude --version
cat ~/.claude/pentest-targets.yaml   # verificar que el YAML es válido
```

### schedule_pentest.sh: "ya hay un scan en ejecución"

```bash
# Verificar si el proceso realmente existe
cat /tmp/hexstrike_pentest.lock   # muestra el PID
kill -0 $(cat /tmp/hexstrike_pentest.lock) && echo "corriendo" || rm /tmp/hexstrike_pentest.lock
```

### Errores 502 en herramientas MCP

El servidor hexstrike puede estar bajo carga. El `run_pentest.sh` tiene fallback automático a Bash local para las herramientas con 502. Si el problema persiste:

```bash
docker restart hexstrike
curl http://localhost:8888/health
```

---

## Archivos del repositorio

| Archivo | Descripción |
|---|---|
| `Dockerfile` | Build completa desde cero (Kali + 196 herramientas, ~15GB) — incluye TLS bypass integrado |
| `tls_bypass_proxy.py` | Proxy TLS standalone (Python puro, sin dependencias externas) |
| `tls_bypass_addon.py` | Addon alternativo para mitmproxy (referencia) |
| `hexstrike_server.py` | Servidor HexStrike con fix de autenticación Burp API key |
| `install_hexstrike_tools.sh` | Instalador de herramientas sobre Kali existente (sin Docker) |
| `run_pentest.sh` | Orquestador principal: llama a Claude Code con el prompt del análisis |
| `schedule_pentest.sh` | Gestor de scheduling: instala/gestiona/ejecuta cron jobs por target |
| `~/.claude/pentest-targets.yaml` | Configuración de targets, módulos y schedules _(fuera del repo — no commitear)_ |

> **Seguridad:** el archivo `pentest-targets.yaml` contiene rutas a documentos de autorización y configuración de targets. Se guarda intencionalmente en `~/.claude/` (fuera del repositorio) para no exponer esta información.

---

## Créditos

- **HexStrike AI** — [github.com/0x4m4/hexstrike-ai](https://github.com/0x4m4/hexstrike-ai) — todo el crédito del framework MCP es de sus autores.
- Las herramientas incluidas (nmap, nuclei, metasploit, sqlmap, etc.) pertenecen a sus respectivos autores y licencias.

## Licencia

El contenido propio de este repositorio (`Dockerfile`, `tls_bypass_proxy.py`, `README.md`, `run_pentest.sh`, `schedule_pentest.sh`) se publica bajo **MIT**.

> La licencia MIT aplica únicamente al código de empaquetado, no a HexStrike AI ni a las herramientas de terceros instaladas en la imagen.
