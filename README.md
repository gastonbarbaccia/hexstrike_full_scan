# HexStrike Full Scan

Imagen Docker basada en **Kali Linux** que empaqueta el framework [HexStrike AI MCP](https://github.com/0x4m4/hexstrike-ai) (v6.0) junto a ~196 herramientas de seguridad ofensiva listas para usar.

El contenedor expone el servidor de HexStrike en el puerto `8888`, pensado para ser consumido vía MCP (Model Context Protocol) por un agente de IA o directamente por su API HTTP.

> ⚠️ **Uso responsable.** Estas herramientas son para pentesting autorizado, CTFs, investigación y entornos de laboratorio propios. No las uses contra sistemas para los que no tengas permiso explícito.

---

## ¿Qué incluye?

La imagen se construye por capas (ver [Dockerfile](Dockerfile)) e instala, entre otras:

| Categoría | Herramientas |
|---|---|
| **Reconocimiento de red** | nmap, masscan, rustscan, naabu, arp-scan, nbtscan, amass, subfinder, fierce, dnsenum, theHarvester |
| **Web** | gobuster, feroxbuster, ffuf, dirb, dirsearch, nikto, sqlmap, wfuzz, whatweb, wafw00f, wpscan, sslscan, testssl.sh, nuclei, httpx, katana, hakrawler, dalfox, commix |
| **Passwords / fuerza bruta** | hydra, john, hashcat, medusa, ophcrack, patator, hash-identifier, hashid |
| **Reversing / forense** | gdb (peda), radare2, binwalk, upx, foremost, scalpel, testdisk, steghide, volatility3, exiftool |
| **Explotación** | metasploit-framework, exploitdb, pwntools, ropgadget, ropper |
| **Wireless** | aircrack-ng, reaver, bully, pixiewps, wifite |
| **Cloud / contenedores** | prowler, scoutsuite, pacu, cloudmapper, trivy, checkov, kube-hunter, aws-cli, kubectl, helm |
| **OSINT** | spiderfoot, recon-ng, sherlock, holehe |
| **Active Directory / SMB** | impacket, netexec, smbmap, smbclient, enum4linux, responder, evil-winrm |
| **Misc** | jwt_tool, tplmap, NoSQLMap, ParamSpider, arjun, sslyze, autorecon |

Runtimes incluidos: **Python 3** (con venv propio para HexStrike), **Node.js 20**, **Go 1.22**, **Rust/Cargo**, **Ruby**, **Java JDK**.

También trae wordlists (`seclists`, `rockyou` ya descomprimido) y las plantillas de `nuclei`.

---

## Requisitos

- Docker (en Windows: Docker Desktop)
- ~15–20 GB de espacio libre en disco para la imagen final
- La primera build puede tardar **20–40 minutos**

---

## Build

```bash
docker build -t kali-hexstrike:full . 2>&1 | tee build.log
```

> En Docker Desktop sobre Windows el `Dockerfile` fuerza IPv4 en `apt` (capa 0), porque la resolución IPv6 no funciona y haría fallar la descarga de paquetes.

## Run

```bash
docker run -d \
  -p 8888:8888 \
  --name hexstrike \
  --cap-add=NET_RAW \
  --cap-add=NET_ADMIN \
   gastonbarbaccia/hexstrikeia
```

Las capabilities `NET_RAW` y `NET_ADMIN` son necesarias para herramientas que generan paquetes raw (nmap SYN scan, masscan, etc.).

## Verificar

```bash
curl http://localhost:8888/health
```

Al arrancar, el contenedor ejecuta un health check de las herramientas principales y luego levanta el servidor de HexStrike en `0.0.0.0:8888`.

---

## Conectar con Claude Code (MCP)

Una vez que el contenedor está corriendo, registrá HexStrike como servidor MCP en Claude Code:

```bash
claude mcp add --transport stdio --scope user hexstrike-ai -- \
  docker exec -i hexstrike \
  /opt/hexstrike-ai/hexstrike-env/bin/python3 \
  /opt/hexstrike-ai/hexstrike_mcp.py
```

- `--transport stdio` — el MCP se comunica por stdin/stdout a través de `docker exec`
- `--scope user` — disponible en todos tus proyectos
- `-i` — mantiene stdin abierto, necesario para el protocolo MCP
- No se necesita `--server` porque el default `http://127.0.0.1:8888` ya apunta al servidor dentro del contenedor

Verificar que quedó registrado:

```bash
claude mcp list
```

> Si usás la imagen desde Docker Hub (`gastonbarbaccia/hexstrikeia`) el nombre del contenedor debe ser `hexstrike` (tal como lo levanta el comando `docker run` de la sección Run). Si usás otro nombre, ajustá el `docker exec -i <nombre>` en consecuencia.

---

## Variables de entorno

| Variable | Default | Descripción |
|---|---|---|
| `HEXSTRIKE_HOST` | `0.0.0.0` | Host de escucha del servidor |
| `HEXSTRIKE_PORT` | `8888` | Puerto del servidor |

---

## Archivos del repo

| Archivo | Descripción |
|---|---|
| [Dockerfile](Dockerfile) | Definición de la imagen completa (16 capas) |
| [install_hexstrike_tools.sh](install_hexstrike_tools.sh) | Instalador alternativo de las 196 herramientas sobre una imagen Kali ya existente (21 categorías) |
| `build.log` | Log de la última build (generado por `tee`) |

---

## Notas

- El servidor de HexStrike corre dentro de un virtualenv en `/opt/hexstrike-ai/hexstrike-env`.
- Algunas instalaciones del `Dockerfile` usan `|| true` para que la build no falle si una herramienta puntual no instala; revisá `build.log` si echás en falta alguna.
- El `HEALTHCHECK` de Docker reintenta contra `/health` con un período de gracia de 90s al inicio.

---

## Créditos y atribución

Este repositorio es un **empaquetado en Docker**: no reimplementa el framework, sino que descarga e instala el proyecto original junto con herramientas de terceros.

- **HexStrike AI** — [github.com/0x4m4/hexstrike-ai](https://github.com/0x4m4/hexstrike-ai). Todo el crédito del framework MCP es de sus autores.
- El resto de las herramientas (nmap, nuclei, metasploit, sqlmap, etc.) pertenecen a sus respectivos autores y mantienen sus propias licencias.

Antes de redistribuir la imagen revisá las licencias de cada componente, ya que algunas tienen restricciones (p. ej. Metasploit Framework usa la licencia BSD de 3 cláusulas con condiciones particulares para su versión community).

## Licencia

El contenido propio de este repositorio (`Dockerfile`, `install_hexstrike_tools.sh` y este README) se publica bajo la licencia **MIT**.

```
MIT License

Copyright (c) 2026 Gastón Barbaccia

Se concede permiso, de forma gratuita, a cualquier persona que obtenga una copia
de este software y los archivos de documentación asociados, para usarlos sin
restricción, incluyendo los derechos de usar, copiar, modificar, fusionar,
publicar, distribuir, sublicenciar y/o vender copias del software.

EL SOFTWARE SE PROPORCIONA "TAL CUAL", SIN GARANTÍA DE NINGÚN TIPO.
```

> La licencia MIT aplica **únicamente** al código de empaquetado de este repo, no a HexStrike AI ni a las herramientas de terceros que se instalan dentro de la imagen.
