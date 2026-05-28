#!/bin/bash
# ============================================================
#  HexStrike AI — Instalador Completo de Herramientas
#  Para: Kali Linux (imagen Docker existente)
#  Autor: generado para hexstrike-ai (196 tools / 21 categorías)
# ============================================================

set -euo pipefail

# ── COLORES ──────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# ── CONTADORES ───────────────────────────────────────────────
OK=0
FAIL=0
SKIP=0
FAIL_LIST=()

log_ok()   { echo -e "${GREEN}  ✔ $1${NC}";   ((OK++));   }
log_fail() { echo -e "${RED}  ✘ $1${NC}";    ((FAIL++)); FAIL_LIST+=("$1"); }
log_skip() { echo -e "${YELLOW}  ↷ $1 (ya instalado)${NC}"; ((SKIP++)); }
log_info() { echo -e "${CYAN}${BOLD}▶ $1${NC}"; }

check_cmd() { command -v "$1" &>/dev/null; }

# ── HELPERS ──────────────────────────────────────────────────
apt_install() {
    local pkg="$1"
    if dpkg -s "$pkg" &>/dev/null 2>&1; then
        log_skip "apt: $pkg"
    else
        if apt-get install -y --no-install-recommends "$pkg" &>/dev/null 2>&1; then
            log_ok "apt: $pkg"
        else
            log_fail "apt: $pkg"
        fi
    fi
}

pip_install() {
    local pkg="$1"
    if pip3 show "$pkg" &>/dev/null 2>&1; then
        log_skip "pip: $pkg"
    else
        if pip3 install --quiet "$pkg" 2>/dev/null; then
            log_ok "pip: $pkg"
        else
            log_fail "pip: $pkg"
        fi
    fi
}

go_install() {
    local name="$1"
    local pkg="$2"
    if check_cmd "$name"; then
        log_skip "go: $name"
    else
        if go install "$pkg" &>/dev/null 2>&1; then
            log_ok "go: $name"
        else
            log_fail "go: $name"
        fi
    fi
}

github_release() {
    # github_release <nombre> <repo> <pattern> <dest>
    local name="$1" repo="$2" pattern="$3" dest="${4:-/usr/local/bin/$name}"
    if check_cmd "$name" || [ -f "$dest" ]; then
        log_skip "gh: $name"
        return
    fi
    local url
    url=$(curl -sf "https://api.github.com/repos/${repo}/releases/latest" \
        | grep -o "\"browser_download_url\": *\"[^\"]*${pattern}[^\"]*\"" \
        | head -1 | cut -d'"' -f4) || true
    if [ -z "$url" ]; then
        log_fail "gh: $name (no se encontró release)"
        return
    fi
    if curl -fsSL "$url" -o "/tmp/${name}_dl" 2>/dev/null; then
        # Detectar si es tar.gz
        if echo "$url" | grep -q "\.tar\.gz\|\.tgz"; then
            mkdir -p "/tmp/${name}_ext"
            tar -xzf "/tmp/${name}_dl" -C "/tmp/${name}_ext" 2>/dev/null || true
            local bin
            bin=$(find "/tmp/${name}_ext" -type f -name "$name" | head -1)
            [ -n "$bin" ] && install -m755 "$bin" "$dest" && log_ok "gh: $name" && return
        elif echo "$url" | grep -q "\.zip"; then
            mkdir -p "/tmp/${name}_ext"
            unzip -qo "/tmp/${name}_dl" -d "/tmp/${name}_ext" 2>/dev/null || true
            local bin
            bin=$(find "/tmp/${name}_ext" -type f -name "$name" | head -1)
            [ -n "$bin" ] && install -m755 "$bin" "$dest" && log_ok "gh: $name" && return
        else
            install -m755 "/tmp/${name}_dl" "$dest" && log_ok "gh: $name" && return
        fi
    fi
    log_fail "gh: $name"
}

# ============================================================
echo -e "\n${BOLD}${CYAN}╔══════════════════════════════════════════════════╗"
echo -e "║   HexStrike AI — Instalador de Herramientas      ║"
echo -e "║   196 tools · 21 categorías · Kali Linux         ║"
echo -e "╚══════════════════════════════════════════════════╝${NC}\n"

# ── VALIDAR ROOT ─────────────────────────────────────────────
if [ "$(id -u)" -ne 0 ]; then
    echo -e "${RED}Error: ejecutar como root (sudo o dentro del contenedor)${NC}"
    exit 1
fi

# ── 0. ACTUALIZAR APT ────────────────────────────────────────
log_info "0/21 — Actualizando repositorios APT"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq 2>/dev/null

# ── DEPENDENCIAS BASE ────────────────────────────────────────
log_info "Instalando dependencias base"
for pkg in \
    curl wget git python3 python3-pip python3-venv \
    golang-go cargo rustup default-jdk \
    build-essential libssl-dev libffi-dev \
    unzip tar jq netcat-openbsd dnsutils \
    libpcap-dev libpq-dev libsqlite3-dev \
    chromium-driver chromium xvfb \
    ruby ruby-dev gem \
    perl cpanminus \
    libnet-ssleay-perl libio-socket-ssl-perl; do
    apt_install "$pkg"
done

# Configurar Go path
export GOPATH=/root/go
export PATH="$PATH:/root/go/bin:/usr/local/go/bin"
echo 'export GOPATH=/root/go' >> /etc/profile.d/hexstrike.sh
echo 'export PATH="$PATH:/root/go/bin:/usr/local/go/bin"' >> /etc/profile.d/hexstrike.sh

# ============================================================
# CATEGORÍA 1 — Network Reconnaissance & Scanning
# ============================================================
log_info "1/21 — Network Reconnaissance & Scanning (25+ tools)"

apt_install nmap
apt_install masscan
apt_install arp-scan
apt_install nbtscan
apt_install smbclient
apt_install enum4linux
apt_install amass
apt_install fierce
apt_install dnsenum
apt_install theharvester

# Rustscan
if check_cmd rustscan; then
    log_skip "rustscan"
else
    if cargo install rustscan &>/dev/null 2>&1; then
        log_ok "rustscan"
    else
        # fallback: descarga binario
        github_release "rustscan" "RustScan/RustScan" "linux" "/usr/local/bin/rustscan"
    fi
fi

# AutoRecon
if check_cmd autorecon; then
    log_skip "autorecon"
else
    if pip3 install --quiet autorecon 2>/dev/null; then
        log_ok "autorecon"
    else
        log_fail "autorecon"
    fi
fi

# Subfinder (Go)
go_install subfinder "github.com/projectdiscovery/subfinder/v2/cmd/subfinder@latest"

# Enum4linux-ng
if check_cmd enum4linux-ng; then
    log_skip "enum4linux-ng"
else
    pip_install enum4linux-ng
fi

# SMBMap
pip_install smbmap

# Responder
if [ -d /opt/Responder ]; then
    log_skip "Responder"
else
    if git clone --quiet https://github.com/lgandx/Responder /opt/Responder 2>/dev/null; then
        ln -sf /opt/Responder/Responder.py /usr/local/bin/responder
        log_ok "Responder"
    else
        log_fail "Responder"
    fi
fi

# NetExec (reemplaza CrackMapExec)
pip_install netexec

# RPCClient ya viene con smbclient
check_cmd rpcclient && log_skip "rpcclient" || log_fail "rpcclient (incluido en smbclient)"

# ============================================================
# CATEGORÍA 2 — Web Application Security Testing
# ============================================================
log_info "2/21 — Web Application Security Testing (40+ tools)"

apt_install gobuster
apt_install dirb
apt_install nikto
apt_install sqlmap
apt_install wfuzz
apt_install whatweb
apt_install wafw00f
apt_install wpscan

# Dirsearch
if check_cmd dirsearch; then
    log_skip "dirsearch"
else
    if git clone --quiet https://github.com/maurosoria/dirsearch /opt/dirsearch 2>/dev/null; then
        pip3 install --quiet -r /opt/dirsearch/requirements.txt 2>/dev/null || true
        ln -sf /opt/dirsearch/dirsearch.py /usr/local/bin/dirsearch
        chmod +x /opt/dirsearch/dirsearch.py
        log_ok "dirsearch"
    else
        log_fail "dirsearch"
    fi
fi

# Feroxbuster
github_release "feroxbuster" "epi052/feroxbuster" "linux-x86_64.zip"

# FFuf
go_install ffuf "github.com/ffuf/ffuf/v2@latest"

# HTTPx
go_install httpx "github.com/projectdiscovery/httpx/cmd/httpx@latest"

# Katana
go_install katana "github.com/projectdiscovery/katana/cmd/katana@latest"

# Hakrawler
go_install hakrawler "github.com/hakluke/hakrawler@latest"

# Gau
go_install gau "github.com/lc/gau/v2/cmd/gau@latest"

# Waybackurls
go_install waybackurls "github.com/tomnomnom/waybackurls@latest"

# Nuclei
go_install nuclei "github.com/projectdiscovery/nuclei/v3/cmd/nuclei@latest"
# Descargar templates
if check_cmd nuclei; then
    nuclei -update-templates &>/dev/null 2>&1 || true
fi

# Arjun
pip_install arjun

# ParamSpider
if check_cmd paramspider; then
    log_skip "paramspider"
else
    if git clone --quiet https://github.com/devanshbatham/ParamSpider /opt/ParamSpider 2>/dev/null; then
        pip3 install --quiet -r /opt/ParamSpider/requirements.txt 2>/dev/null || true
        ln -sf /opt/ParamSpider/paramspider.py /usr/local/bin/paramspider
        chmod +x /opt/ParamSpider/paramspider.py
        log_ok "paramspider"
    else
        log_fail "paramspider"
    fi
fi

# X8 (parameter discovery)
go_install x8 "github.com/Sh1Yo/x8@latest"

# Jaeles
go_install jaeles "github.com/jaeles-project/jaeles@latest"

# Dalfox (XSS)
go_install dalfox "github.com/hahwul/dalfox/v2@latest"

# TestSSL
if check_cmd testssl.sh || check_cmd testssl; then
    log_skip "testssl"
else
    if git clone --quiet --depth=1 https://github.com/drwetter/testssl.sh /opt/testssl 2>/dev/null; then
        ln -sf /opt/testssl/testssl.sh /usr/local/bin/testssl
        log_ok "testssl"
    else
        log_fail "testssl"
    fi
fi

# SSLScan
apt_install sslscan

# SSLyze
pip_install sslyze

# Anew
go_install anew "github.com/tomnomnom/anew@latest"

# QSReplace
go_install qsreplace "github.com/tomnomnom/qsreplace@latest"

# Uro
pip_install uro

# JWT-Tool
if check_cmd jwt_tool; then
    log_skip "jwt_tool"
else
    if git clone --quiet https://github.com/ticarpi/jwt_tool /opt/jwt_tool 2>/dev/null; then
        pip3 install --quiet termcolor cprint pycryptodomex requests 2>/dev/null || true
        ln -sf /opt/jwt_tool/jwt_tool.py /usr/local/bin/jwt_tool
        chmod +x /opt/jwt_tool/jwt_tool.py
        log_ok "jwt_tool"
    else
        log_fail "jwt_tool"
    fi
fi

# Commix
apt_install commix

# NoSQLMap
if check_cmd nosqlmap; then
    log_skip "nosqlmap"
else
    if git clone --quiet https://github.com/codingo/NoSQLMap /opt/NoSQLMap 2>/dev/null; then
        pip3 install --quiet -r /opt/NoSQLMap/requirements.txt 2>/dev/null || true
        ln -sf /opt/NoSQLMap/nosqlmap.py /usr/local/bin/nosqlmap
        chmod +x /opt/NoSQLMap/nosqlmap.py
        log_ok "nosqlmap"
    else
        log_fail "nosqlmap"
    fi
fi

# Tplmap
if check_cmd tplmap; then
    log_skip "tplmap"
else
    if git clone --quiet https://github.com/epinna/tplmap /opt/tplmap 2>/dev/null; then
        pip3 install --quiet -r /opt/tplmap/requirements.txt 2>/dev/null || true
        ln -sf /opt/tplmap/tplmap.py /usr/local/bin/tplmap
        chmod +x /opt/tplmap/tplmap.py
        log_ok "tplmap"
    else
        log_fail "tplmap"
    fi
fi

# GraphQL-Voyager (herramienta de análisis, se instala via npm)
if check_cmd npm; then
    npm install -g graphql-voyager &>/dev/null 2>&1 && log_ok "graphql-voyager" || log_fail "graphql-voyager"
else
    apt_install nodejs
    apt_install npm
    npm install -g graphql-voyager &>/dev/null 2>&1 && log_ok "graphql-voyager" || log_fail "graphql-voyager"
fi

# ZAP Proxy
if check_cmd zap.sh || [ -f /opt/zaproxy/zap.sh ]; then
    log_skip "ZAP Proxy"
else
    log_info "Descargando OWASP ZAP..."
    ZAP_URL=$(curl -sf https://api.github.com/repos/zaproxy/zaproxy/releases/latest \
        | grep -o '"browser_download_url": *"[^"]*linux[^"]*\.tar\.gz"' \
        | head -1 | cut -d'"' -f4) || true
    if [ -n "$ZAP_URL" ]; then
        curl -fsSL "$ZAP_URL" -o /tmp/zap.tar.gz 2>/dev/null \
            && mkdir -p /opt/zaproxy \
            && tar -xzf /tmp/zap.tar.gz -C /opt/zaproxy --strip-components=1 2>/dev/null \
            && ln -sf /opt/zaproxy/zap.sh /usr/local/bin/zap \
            && log_ok "ZAP Proxy" || log_fail "ZAP Proxy"
    else
        log_fail "ZAP Proxy (no se encontró URL)"
    fi
fi

# ============================================================
# CATEGORÍA 3 — Authentication & Password Security
# ============================================================
log_info "3/21 — Authentication & Password Security (12+ tools)"

apt_install hydra
apt_install john
apt_install hashcat
apt_install medusa

# Patator
pip_install patator

# Evil-WinRM
if check_cmd evil-winrm; then
    log_skip "evil-winrm"
else
    gem install evil-winrm --quiet 2>/dev/null && log_ok "evil-winrm" || log_fail "evil-winrm"
fi

# Hash-Identifier
if check_cmd hash-identifier; then
    log_skip "hash-identifier"
else
    if git clone --quiet https://github.com/blackploit/hash-identifier /opt/hash-identifier 2>/dev/null; then
        ln -sf /opt/hash-identifier/hash-id.py /usr/local/bin/hash-identifier
        chmod +x /opt/hash-identifier/hash-id.py
        log_ok "hash-identifier"
    else
        log_fail "hash-identifier"
    fi
fi

# HashID
pip_install hashid

# Ophcrack
apt_install ophcrack

# ============================================================
# CATEGORÍA 4 — Binary Analysis & Reverse Engineering
# ============================================================
log_info "4/21 — Binary Analysis & Reverse Engineering (25+ tools)"

apt_install gdb
apt_install radare2
apt_install binwalk
apt_install upx-ucl
apt_install elfutils    # readelf, objdump, strings, xxd
apt_install binutils
apt_install hexdump

# GDB-PEDA
if [ -d ~/.gdbinit ] || grep -q "peda" ~/.gdbinit 2>/dev/null; then
    log_skip "gdb-peda"
else
    git clone --quiet https://github.com/longld/peda /opt/peda 2>/dev/null \
        && echo "source /opt/peda/peda.py" >> ~/.gdbinit \
        && log_ok "gdb-peda" || log_fail "gdb-peda"
fi

# GDB-GEF
if grep -q "gef" ~/.gdbinit 2>/dev/null; then
    log_skip "gdb-gef"
else
    curl -fsSL https://gef.blah.cat/sh -o /tmp/gef_install.sh 2>/dev/null \
        && bash /tmp/gef_install.sh &>/dev/null \
        && log_ok "gdb-gef" || log_fail "gdb-gef"
fi

# Ghidra
if check_cmd ghidra || [ -d /opt/ghidra ]; then
    log_skip "ghidra"
else
    GHIDRA_URL=$(curl -sf https://api.github.com/repos/NationalSecurityAgency/ghidra/releases/latest \
        | grep -o '"browser_download_url": *"[^"]*\.zip"' | head -1 | cut -d'"' -f4) || true
    if [ -n "$GHIDRA_URL" ]; then
        curl -fsSL "$GHIDRA_URL" -o /tmp/ghidra.zip 2>/dev/null \
            && unzip -qo /tmp/ghidra.zip -d /opt 2>/dev/null \
            && mv /opt/ghidra_* /opt/ghidra 2>/dev/null || true \
            && ln -sf /opt/ghidra/ghidraRun /usr/local/bin/ghidra \
            && log_ok "ghidra" || log_fail "ghidra"
    else
        log_fail "ghidra (no se encontró release)"
    fi
fi

# ROPgadget
pip_install ropgadget

# Ropper
pip_install ropper

# One-Gadget
if check_cmd one_gadget; then
    log_skip "one_gadget"
else
    gem install one_gadget --quiet 2>/dev/null && log_ok "one_gadget" || log_fail "one_gadget"
fi

# Checksec
if check_cmd checksec; then
    log_skip "checksec"
else
    pip_install checksec.py
fi

# Pwntools
pip_install pwntools

# Angr
pip_install angr

# MSFVenom (viene con metasploit)
if check_cmd msfvenom; then
    log_skip "msfvenom"
else
    apt_install metasploit-framework
fi

# Volatility3
if check_cmd vol3 || check_cmd volatility3; then
    log_skip "volatility3"
else
    if git clone --quiet https://github.com/volatilityfoundation/volatility3 /opt/volatility3 2>/dev/null; then
        pip3 install --quiet -r /opt/volatility3/requirements.txt 2>/dev/null || true
        ln -sf /opt/volatility3/vol.py /usr/local/bin/vol3
        chmod +x /opt/volatility3/vol.py
        log_ok "volatility3"
    else
        log_fail "volatility3"
    fi
fi

# Pwninit
if check_cmd pwninit; then
    log_skip "pwninit"
else
    cargo install pwninit &>/dev/null 2>&1 && log_ok "pwninit" || log_fail "pwninit"
fi

# Libc-Database
if [ -d /opt/libc-database ]; then
    log_skip "libc-database"
else
    git clone --quiet https://github.com/niklasb/libc-database /opt/libc-database 2>/dev/null \
        && log_ok "libc-database" || log_fail "libc-database"
fi

# ============================================================
# CATEGORÍA 5 — Cloud & Container Security
# ============================================================
log_info "5/21 — Cloud & Container Security (20+ tools)"

# Prowler
pip_install prowler

# Scout Suite
pip_install scoutsuite

# Trivy
if check_cmd trivy; then
    log_skip "trivy"
else
    curl -fsSL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh \
        -o /tmp/trivy_install.sh 2>/dev/null \
        && bash /tmp/trivy_install.sh -b /usr/local/bin &>/dev/null \
        && log_ok "trivy" || log_fail "trivy"
fi

# Kube-Hunter
pip_install kube-hunter

# Kube-Bench
github_release "kube-bench" "aquasecurity/kube-bench" "linux_amd64.tar.gz"

# Checkov
pip_install checkov

# Terrascan
go_install terrascan "github.com/tenable/terrascan@latest"

# CloudSploit
if check_cmd cloudsploit || [ -d /opt/cloudsploit ]; then
    log_skip "cloudsploit"
else
    if check_cmd npm; then
        git clone --quiet https://github.com/aquasecurity/cloudsploit /opt/cloudsploit 2>/dev/null \
            && cd /opt/cloudsploit && npm install --quiet &>/dev/null \
            && ln -sf /opt/cloudsploit/index.js /usr/local/bin/cloudsploit \
            && chmod +x /opt/cloudsploit/index.js \
            && log_ok "cloudsploit" || log_fail "cloudsploit"
    else
        log_fail "cloudsploit (requiere npm)"
    fi
fi

# AWS CLI
if check_cmd aws; then
    log_skip "aws-cli"
else
    curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o /tmp/awscliv2.zip 2>/dev/null \
        && unzip -qo /tmp/awscliv2.zip -d /tmp/aws_install 2>/dev/null \
        && /tmp/aws_install/aws/install --bin-dir /usr/local/bin &>/dev/null \
        && log_ok "aws-cli" || log_fail "aws-cli"
fi

# Azure CLI
if check_cmd az; then
    log_skip "azure-cli"
else
    pip_install azure-cli
fi

# kubectl
if check_cmd kubectl; then
    log_skip "kubectl"
else
    curl -fsSL "https://dl.k8s.io/release/$(curl -fsSL https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl" \
        -o /usr/local/bin/kubectl 2>/dev/null \
        && chmod +x /usr/local/bin/kubectl \
        && log_ok "kubectl" || log_fail "kubectl"
fi

# Helm
if check_cmd helm; then
    log_skip "helm"
else
    curl -fsSL https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 \
        -o /tmp/get_helm.sh 2>/dev/null \
        && bash /tmp/get_helm.sh &>/dev/null \
        && log_ok "helm" || log_fail "helm"
fi

# Pacu (AWS exploitation)
if check_cmd pacu || [ -d /opt/pacu ]; then
    log_skip "pacu"
else
    if git clone --quiet https://github.com/RhinoSecurityLabs/pacu /opt/pacu 2>/dev/null; then
        pip3 install --quiet -r /opt/pacu/requirements.txt 2>/dev/null || true
        ln -sf /opt/pacu/cli.py /usr/local/bin/pacu
        chmod +x /opt/pacu/cli.py
        log_ok "pacu"
    else
        log_fail "pacu"
    fi
fi

# CloudMapper
if check_cmd cloudmapper || [ -d /opt/cloudmapper ]; then
    log_skip "cloudmapper"
else
    if git clone --quiet https://github.com/duo-labs/cloudmapper /opt/cloudmapper 2>/dev/null; then
        pip3 install --quiet -r /opt/cloudmapper/requirements.txt 2>/dev/null || true
        ln -sf /opt/cloudmapper/cloudmapper.py /usr/local/bin/cloudmapper
        chmod +x /opt/cloudmapper/cloudmapper.py
        log_ok "cloudmapper"
    else
        log_fail "cloudmapper"
    fi
fi

# ============================================================
# CATEGORÍA 6 — CTF & Forensics
# ============================================================
log_info "6/21 — CTF & Forensics (20+ tools)"

apt_install foremost
apt_install testdisk
apt_install photorec
apt_install steghide
apt_install outguess
apt_install exiftool
apt_install bulk-extractor
apt_install scalpel

# Stegsolve
if [ -f /opt/stegsolve/stegsolve.jar ] || check_cmd stegsolve; then
    log_skip "stegsolve"
else
    mkdir -p /opt/stegsolve
    curl -fsSL "http://www.caesum.com/handbook/Stegsolve.jar" \
        -o /opt/stegsolve/stegsolve.jar 2>/dev/null \
        && printf '#!/bin/bash\njava -jar /opt/stegsolve/stegsolve.jar "$@"' \
            > /usr/local/bin/stegsolve \
        && chmod +x /usr/local/bin/stegsolve \
        && log_ok "stegsolve" || log_fail "stegsolve"
fi

# Zsteg
if check_cmd zsteg; then
    log_skip "zsteg"
else
    gem install zsteg --quiet 2>/dev/null && log_ok "zsteg" || log_fail "zsteg"
fi

# Volatility (versión 2)
if check_cmd volatility || check_cmd vol; then
    log_skip "volatility2"
else
    pip_install volatility3  # ya instalado arriba, pero verificamos
fi

# ============================================================
# CATEGORÍA 7 — Exploitation & Post-Exploitation
# ============================================================
log_info "7/21 — Exploitation & Post-Exploitation"

apt_install metasploit-framework
apt_install exploitdb

# Impacket
pip_install impacket

# BeEF (Browser Exploitation Framework)
if check_cmd beef-xss || [ -d /opt/beef ]; then
    log_skip "beef-xss"
else
    apt_install beef-xss
fi

# ============================================================
# CATEGORÍA 8 — OSINT
# ============================================================
log_info "8/21 — OSINT"

apt_install maltego
pip_install sherlock
pip_install holehe

# Spiderfoot
if check_cmd spiderfoot || [ -d /opt/spiderfoot ]; then
    log_skip "spiderfoot"
else
    if git clone --quiet https://github.com/smicallef/spiderfoot /opt/spiderfoot 2>/dev/null; then
        pip3 install --quiet -r /opt/spiderfoot/requirements.txt 2>/dev/null || true
        ln -sf /opt/spiderfoot/sf.py /usr/local/bin/spiderfoot
        chmod +x /opt/spiderfoot/sf.py
        log_ok "spiderfoot"
    else
        log_fail "spiderfoot"
    fi
fi

# Recon-ng
apt_install recon-ng

# ============================================================
# CATEGORÍA 9 — Network Analysis & Sniffing
# ============================================================
log_info "9/21 — Network Analysis & Sniffing"

apt_install wireshark
apt_install tcpdump
apt_install tshark
apt_install ettercap-text-only
apt_install mitmproxy
apt_install scapy

# ============================================================
# CATEGORÍA 10 — Wireless Security
# ============================================================
log_info "10/21 — Wireless Security"

apt_install aircrack-ng
apt_install reaver
apt_install bully
apt_install pixiewps
apt_install kismet
apt_install wifite

# ============================================================
# CATEGORÍA 11 — Exploitation Frameworks
# ============================================================
log_info "11/21 — Exploitation Frameworks"

# Empire (PowerShell)
if check_cmd empire || [ -d /opt/Empire ]; then
    log_skip "empire"
else
    pip_install empire-bc-security-fork
fi

# Sliver C2
if check_cmd sliver; then
    log_skip "sliver"
else
    curl -fsSL https://sliver.sh/install -o /tmp/sliver_install.sh 2>/dev/null \
        && bash /tmp/sliver_install.sh &>/dev/null \
        && log_ok "sliver" || log_fail "sliver"
fi

# ============================================================
# CATEGORÍA 12 — Vulnerability Scanners
# ============================================================
log_info "12/21 — Vulnerability Scanners"

apt_install openvas
apt_install lynis

# ============================================================
# CATEGORÍA 13 — Password Lists & Wordlists
# ============================================================
log_info "13/21 — Wordlists"

apt_install wordlists
apt_install seclists

# Rockyou
if [ -f /usr/share/wordlists/rockyou.txt ]; then
    log_skip "rockyou.txt"
else
    if [ -f /usr/share/wordlists/rockyou.txt.gz ]; then
        gunzip /usr/share/wordlists/rockyou.txt.gz && log_ok "rockyou.txt (descomprimido)"
    else
        log_fail "rockyou.txt (instalar wordlists)"
    fi
fi

# ============================================================
# CATEGORÍA 14 — Web Proxies & Interception
# ============================================================
log_info "14/21 — Web Proxies & Interception"

# Burp Suite Community
if check_cmd burpsuite || [ -f /opt/BurpSuiteCommunity/burpsuite_community.jar ]; then
    log_skip "burpsuite"
else
    mkdir -p /opt/BurpSuiteCommunity
    BURP_URL="https://portswigger.net/burp/releases/download?product=community&type=Linux"
    curl -fsSL -L "$BURP_URL" -o /tmp/burpsuite.sh 2>/dev/null \
        && bash /tmp/burpsuite.sh -q --prefix /opt/BurpSuiteCommunity &>/dev/null \
        && log_ok "burpsuite" || log_fail "burpsuite (instalación manual recomendada)"
fi

# MITMProxy ya instalado arriba

# ============================================================
# CATEGORÍA 15 — Social Engineering
# ============================================================
log_info "15/21 — Social Engineering"

apt_install set  # Social Engineering Toolkit

# ============================================================
# CATEGORÍA 16 — API Security Testing
# ============================================================
log_info "16/21 — API Security Testing"

# kiterunner
go_install kr "github.com/assetnote/kiterunner/cmd/kr@latest"

# Postman CLI (newman)
if check_cmd npm; then
    npm install -g newman &>/dev/null 2>&1 && log_ok "newman (postman cli)" || log_fail "newman"
fi

# ============================================================
# CATEGORÍA 17 — Mobile Security
# ============================================================
log_info "17/21 — Mobile Security"

# apktool
if check_cmd apktool; then
    log_skip "apktool"
else
    apt_install apktool
fi

# jadx
if check_cmd jadx || [ -d /opt/jadx ]; then
    log_skip "jadx"
else
    github_release "jadx" "skylot/jadx" "no-jre-linux.zip" /opt/jadx.zip
    if [ -f /opt/jadx.zip ]; then
        mkdir -p /opt/jadx
        unzip -qo /opt/jadx.zip -d /opt/jadx 2>/dev/null || true
        ln -sf /opt/jadx/bin/jadx /usr/local/bin/jadx
        log_ok "jadx"
    fi
fi

# MobSF
pip_install mobsf

# ============================================================
# CATEGORÍA 18 — Crypto & Encoding
# ============================================================
log_info "18/21 — Crypto & Encoding"

pip_install pycryptodome
pip_install cryptography
apt_install openssl
apt_install gpg

# CyberChef (local)
if [ -d /opt/cyberchef ]; then
    log_skip "cyberchef"
else
    github_release "cyberchef" "gchq/CyberChef" "CyberChef_v" /opt/cyberchef.zip
    if [ -f /opt/cyberchef.zip ]; then
        mkdir -p /opt/cyberchef
        unzip -qo /opt/cyberchef.zip -d /opt/cyberchef 2>/dev/null || true
        log_ok "cyberchef"
    fi
fi

# ============================================================
# CATEGORÍA 19 — Reporting & Documentation
# ============================================================
log_info "19/21 — Reporting & Documentation"

pip_install reportlab
pip_install jinja2
apt_install pandoc
pip_install weasyprint

# ============================================================
# CATEGORÍA 20 — Threat Intelligence
# ============================================================
log_info "20/21 — Threat Intelligence"

pip_install pymisp
pip_install stix2
pip_install taxii2-client

# ============================================================
# CATEGORÍA 21 — Misc & Utilities
# ============================================================
log_info "21/21 — Misc & Utilities"

apt_install proxychains4
apt_install tor
apt_install ncat
apt_install socat
apt_install screen
apt_install tmux
pip_install requests
pip_install beautifulsoup4
pip_install lxml
pip_install httpx

# ============================================================
# POST-INSTALACIÓN
# ============================================================
log_info "Post-instalación — Verificación final"

echo ""
echo -e "${BOLD}Verificando herramientas clave en PATH:${NC}"
KEY_TOOLS=(
    nmap masscan rustscan subfinder amass
    nuclei nikto sqlmap gobuster feroxbuster ffuf
    httpx katana waybackurls dalfox
    hydra john hashcat medusa netexec
    gdb radare2 binwalk ghidra
    metasploit msfvenom
    prowler trivy kubectl helm aws
    wireshark tcpdump mitmproxy
    aircrack-ng
)

for tool in "${KEY_TOOLS[@]}"; do
    if check_cmd "$tool"; then
        echo -e "  ${GREEN}✔ $tool${NC}"
    else
        echo -e "  ${RED}✘ $tool (no encontrado en PATH)${NC}"
    fi
done

# ============================================================
# RESUMEN FINAL
# ============================================================
echo ""
echo -e "${BOLD}${CYAN}╔══════════════════════════════════════════════╗"
echo -e "║              RESUMEN DE INSTALACIÓN          ║"
echo -e "╠══════════════════════════════════════════════╣"
echo -e "║  ${GREEN}✔ Instaladas correctamente: ${OK}${CYAN}               ║"
echo -e "║  ${YELLOW}↷ Ya presentes (skip):      ${SKIP}${CYAN}               ║"
echo -e "║  ${RED}✘ Fallidas:                 ${FAIL}${CYAN}               ║"
echo -e "╚══════════════════════════════════════════════╝${NC}"

if [ ${#FAIL_LIST[@]} -gt 0 ]; then
    echo -e "\n${RED}${BOLD}Herramientas que fallaron:${NC}"
    for t in "${FAIL_LIST[@]}"; do
        echo -e "  ${RED}• $t${NC}"
    done
    echo ""
    echo -e "${YELLOW}Tip: algunas herramientas requieren instalación manual"
    echo -e "o repositorios adicionales (ej: Burp Suite, IDA Free).${NC}"
fi

echo ""
echo -e "${GREEN}${BOLD}¡Instalación completada! Reiniciá el servidor HexStrike.${NC}"
echo -e "${CYAN}  source /etc/profile.d/hexstrike.sh"
echo -e "  python3 hexstrike_server.py${NC}"
echo ""
