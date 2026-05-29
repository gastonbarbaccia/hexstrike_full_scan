# HexStrike AI — Docker Security Platform

Imagen Docker basada en **Kali Linux** con el framework [HexStrike AI MCP](https://github.com/0x4m4/hexstrike-ai) y ~196 herramientas de seguridad ofensiva listas para usar.

**Novedades v7 (TLS Bypass Edition):**
- Proxy TLS bypass integrado y automático (bypassea TLS fingerprinting de CDNs como Hostinger, Cloudflare, etc.)
- Integración nativa con **Burp Suite Pro** via REST API
- Fix de autenticación de la API key de Burp (key en URL, no en header)
- Todas las herramientas Go/Ruby/Java ruteadas automáticamente por el proxy

> ⚠️ **Uso responsable.** Estas herramientas son para pentesting autorizado, CTFs, bug bounty e investigación. No las uses contra sistemas para los que no tengas permiso explícito.

---

## Inicio rápido

### 1. Levantar el container

```bash
docker run -d \
  -p 8888:8888 \
  --add-host=host.docker.internal:host-gateway \
  --name hexstrike \
  --cap-add=NET_RAW \
  --cap-add=NET_ADMIN \
  -e BURP_API_URL="http://host.docker.internal:1337" \
  -e BURP_API_KEY="TU_API_KEY_AQUI" \
  gastonbarbaccia/hexstrikeia:latest
```

### 2. Verificar que está funcionando

```bash
curl http://localhost:8888/health
```

### 3. Conectar con Claude Code (MCP)

```bash
claude mcp add --transport http --scope user hexstrike-ai http://localhost:8888/mcp
```

Verificar:

```bash
claude mcp list
```

---

## Integración con Burp Suite Pro

### Configurar Burp (una sola vez)

1. Abrir **Burp Suite Pro**
2. Ir a `Settings → Suite → REST API`
3. Configurar:

```
✅ Service running
Service URL:  http://0.0.0.0:1337
✅ API key (crear una nueva con nombre "hexstrike")
```

4. Copiar el API key generado

### Levantar el container con Burp

```bash
docker run -d \
  -p 8888:8888 \
  --add-host=host.docker.internal:host-gateway \
  --name hexstrike \
  --cap-add=NET_RAW \
  --cap-add=NET_ADMIN \
  -e BURP_API_URL="http://host.docker.internal:1337" \
  -e BURP_API_KEY="TU_API_KEY_AQUI" \
  gastonbarbaccia/hexstrikeia:latest
```

> `host.docker.internal` resuelve automáticamente a la IP del host donde corre Burp.  
> El flag `--add-host=host.docker.internal:host-gateway` es necesario en Linux (en macOS/Windows ya viene por defecto).

### Verificar conectividad Burp → Container

```bash
# Desde tu terminal (host):
curl http://127.0.0.1:1337/TU_API_KEY/v0.1/
# Debe responder con la documentación de la API de Burp ✅
```

### Por qué puede fallar Burp Scanner

El CDN de Hostinger (y otros) implementan **TLS fingerprinting** que bloquea el scanner de Burp (Java/Bouncy Castle). Para resolverlo:

```
Burp Suite Pro → Settings → Scanner → Scan details
→ Marcar: "Use embedded browser for all scanning"
```

Con esto Burp usa Chromium real y bypassea el fingerprinting.

---

## TLS Bypass Proxy (integrado)

El container incluye un proxy TLS standalone en el **puerto 8118** que arranca automáticamente. Bypassea el TLS fingerprinting usando `curl` como backend (OpenSSL), que no es detectado por los CDNs.

**Se activa solo al iniciar el container.** Logs en `/var/log/tls_bypass.log`.

### Herramientas que se benefician automáticamente

Las variables `http_proxy` y `https_proxy` ya están configuradas dentro del container, por lo que estas herramientas usan el bypass sin configuración extra:

| Herramienta | Estado sin proxy | Estado con proxy |
|---|---|---|
| Katana | ❌ TLS error | ✅ Funciona |
| Gobuster | ❌ TLS error | ✅ Funciona (ver nota) |
| Dalfox | ❌ TLS error | ✅ Funciona |
| SQLMap | ❌ SSL error | ✅ Funciona |
| Nikto | ❌ TLS error | ✅ con `-useproxy http://127.0.0.1:8118` |
| Metasploit (Ruby) | ❌ TLS error | `set PROXIES HTTP:127.0.0.1:8118` |

> **Nota Gobuster — CDNs que usan 403 como "no encontrado":** Algunos CDNs (ej. Hostinger hcdn) devuelven HTTP 403 tanto para rutas inexistentes como para acceso denegado. Gobuster detecta el 403 como baseline y filtra todos los resultados. Solución: usar `--exclude-length <N>` con el tamaño de la página 403 del CDN, o `-s 200,301,302` para mostrar solo respuestas válidas.
>
> ```bash
> gobuster dir -u https://objetivo.com --proxy http://127.0.0.1:8118 \
>   -k -s '200,301,302' --exclude-length 787
> ```

### Configurar el proxy manualmente en herramientas

Para herramientas que no respetan las env vars:

```bash
# Metasploit
msf> set PROXIES HTTP:127.0.0.1:8118

# curl explícito
curl -sk --proxy http://127.0.0.1:8118 https://objetivo.com

# Nuclei
nuclei -proxy http://127.0.0.1:8118 -u https://objetivo.com

# Gobuster (con filtro para CDNs)
gobuster dir -u https://objetivo.com --proxy http://127.0.0.1:8118 -k \
  -s '200,301,302' --exclude-length 787

# Nikto
nikto -h https://objetivo.com -ssl -useproxy http://127.0.0.1:8118
```

---

## Variables de entorno

| Variable | Default | Descripción |
|---|---|---|
| `HEXSTRIKE_HOST` | `0.0.0.0` | Host del servidor HexStrike |
| `HEXSTRIKE_PORT` | `8888` | Puerto del servidor HexStrike |
| `BURP_API_URL` | `http://127.0.0.1:1337` | URL base de la REST API de Burp Suite Pro |
| `BURP_API_KEY` | _(vacío)_ | API key de Burp Suite Pro |
| `TLS_BYPASS_PORT` | `8118` | Puerto del proxy TLS bypass |
| `http_proxy` / `https_proxy` | `http://127.0.0.1:8118` | Proxy automático para todas las herramientas |

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

Para actualizar solo las capas nuevas sobre la imagen existente (rápido, ~30 segundos):

```bash
# Build incremental sobre imagen ya existente
docker build -f Dockerfile.tls \
  -t gastonbarbaccia/hexstrikeia:latest \
  -t gastonbarbaccia/hexstrikeia:v7.1-ssl-fix \
  .
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

El scanner de Burp usa Java/Bouncy Castle y es bloqueado por TLS fingerprinting. Dos soluciones:

1. **Recomendado**: En Burp → `Settings → Scanner → Use embedded browser for all scanning`
2. En Burp → `Settings → Network → Upstream Proxy` → agregar `127.0.0.1:8118` *(requiere que el container esté en la misma red que el host)*

### Error 503 al usar `burpsuite_scan` en HexStrike

Verificar que Burp esté abierto y con la REST API activa en `0.0.0.0:1337`:

```bash
curl http://127.0.0.1:1337/TU_API_KEY/v0.1/
# Debe responder con JSON de la API ✅
```

### Herramienta X no conecta al objetivo

Probar usando el proxy explícitamente:

```bash
docker exec hexstrike curl -sk --proxy http://127.0.0.1:8118 https://objetivo.com
```

Si funciona, la herramienta no está leyendo las variables de entorno del proxy. Agregar el flag de proxy correspondiente.

---

## Archivos del repositorio

| Archivo | Descripción |
|---|---|
| `Dockerfile` | Build completa desde cero (Kali + 196 herramientas, ~15GB) |
| `Dockerfile.tls` | Build incremental: agrega TLS bypass sobre imagen existente |
| `tls_bypass_proxy.py` | Proxy TLS standalone (Python puro, sin dependencias externas) |
| `tls_bypass_addon.py` | Addon alternativo para mitmproxy (referencia) |
| `hexstrike_server.py` | Servidor HexStrike con fix de autenticación Burp API key |
| `install_hexstrike_tools.sh` | Instalador alternativo sobre Kali existente (sin Docker) |
| `PROMPT_MAESTRO_PENTEST.md` | Prompts maestros para pentesting con IA |

---

## Créditos

- **HexStrike AI** — [github.com/0x4m4/hexstrike-ai](https://github.com/0x4m4/hexstrike-ai) — todo el crédito del framework MCP es de sus autores.
- Las herramientas incluidas (nmap, nuclei, metasploit, sqlmap, etc.) pertenecen a sus respectivos autores y licencias.

## Licencia

El contenido propio de este repositorio (`Dockerfile`, `tls_bypass_proxy.py`, `README.md`, etc.) se publica bajo **MIT**.

> La licencia MIT aplica únicamente al código de empaquetado, no a HexStrike AI ni a las herramientas de terceros instaladas en la imagen.
