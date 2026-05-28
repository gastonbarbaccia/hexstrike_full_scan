# ============================================================
#  HexStrike AI — Dockerfile COMPLETO (v4 - IPv4 fix)
#  Base: kalilinux/kali-rolling
#
#  BUILD:
#    docker build -t kali-hexstrike:full . 2>&1 | tee build.log
#
#  RUN:
#    docker run -d -p 8888:8888 --name hexstrike \
#      --cap-add=NET_RAW --cap-add=NET_ADMIN \
#      kali-hexstrike:full
#
#  VERIFICAR:
#    curl http://localhost:8888/health
# ============================================================

FROM kalilinux/kali-rolling

LABEL maintainer="hexstrike-ai"
LABEL description="Kali Linux + HexStrike AI MCP v6.0 — 196 herramientas de seguridad"
LABEL version="6.0"

ENV DEBIAN_FRONTEND=noninteractive \
    GOPATH=/root/go \
    GOROOT=/usr/local/go \
    PATH="/root/go/bin:/usr/local/go/bin:/root/.cargo/bin:/usr/local/bin:$PATH" \
    HEXSTRIKE_HOST=0.0.0.0 \
    HEXSTRIKE_PORT=8888 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# ============================================================
# CAPA 0 — Forzar IPv4 en apt
#           Docker Desktop en Windows no tiene IPv6 funcional.
#           Sin esto apt resuelve http.kali.org como IPv6 y falla.
# ============================================================
RUN printf 'Acquire::ForceIPv4 "true";\n' > /etc/apt/apt.conf.d/99force-ipv4

# ============================================================
# CAPA 1 — ca-certificates para habilitar HTTPS
# ============================================================
RUN apt-get update -o Acquire::https::Verify-Peer=false -qq 2>/dev/null; \
    apt-get install -y --no-install-recommends --fix-missing \
        ca-certificates \
    && update-ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# ============================================================
# CAPA 2 — Paquetes base del sistema
# ============================================================
RUN apt-get update -qq && \
    apt-get install -y --no-install-recommends --fix-missing \
        curl wget git sudo \
        vim nano \
        python3 python3-pip python3-venv python3-dev \
        build-essential libssl-dev libffi-dev \
        libpcap-dev libpq-dev libsqlite3-dev \
        unzip tar jq gnupg lsb-release \
        default-jdk ruby ruby-dev \
        perl \
        socat ncat dnsutils \
        proxychains4 \
        tmux screen \
        openssl gpg \
    && rm -rf /var/lib/apt/lists/*

# ============================================================
# CAPA 3 — Reconocimiento de red
# ============================================================
RUN apt-get update -qq && \
    apt-get install -y --no-install-recommends --fix-missing \
        nmap masscan arp-scan nbtscan \
        smbclient enum4linux \
        amass fierce dnsenum theharvester \
    && rm -rf /var/lib/apt/lists/*

# ============================================================
# CAPA 4 — Web + Passwords
# ============================================================
RUN apt-get update -qq && \
    apt-get install -y --no-install-recommends --fix-missing \
        gobuster dirb nikto sqlmap wfuzz \
        whatweb wafw00f wpscan sslscan commix \
        hydra john hashcat medusa ophcrack \
    && rm -rf /var/lib/apt/lists/*

# ============================================================
# CAPA 5 — Reversing + Forense
# ============================================================
RUN apt-get update -qq && \
    apt-get install -y --no-install-recommends --fix-missing \
        gdb radare2 binwalk upx-ucl \
        elfutils binutils xxd \
        foremost testdisk steghide \
        libimage-exiftool-perl scalpel \
    && rm -rf /var/lib/apt/lists/*

# ============================================================
# CAPA 6 — Red + Wireless + Misc
# ============================================================
RUN apt-get update -qq && \
    apt-get install -y --no-install-recommends --fix-missing \
        metasploit-framework exploitdb \
        wireshark tcpdump tshark \
        ettercap-text-only \
        aircrack-ng reaver bully pixiewps wifite \
        apktool \
        recon-ng \
        wordlists seclists \
        set \
        tor \
    && rm -rf /var/lib/apt/lists/*

# Descomprimir rockyou
RUN gunzip /usr/share/wordlists/rockyou.txt.gz 2>/dev/null || true

# ============================================================
# CAPA 7 — Node.js via NodeSource (evita dependencias rotas de Kali)
# ============================================================
RUN curl -fsSL https://deb.nodesource.com/setup_20.x -o /tmp/nodesource_setup.sh && \
    bash /tmp/nodesource_setup.sh && \
    apt-get install -y --no-install-recommends nodejs && \
    rm /tmp/nodesource_setup.sh && \
    rm -rf /var/lib/apt/lists/*

# ============================================================
# CAPA 8 — Go (binario oficial, versión fija)
# ============================================================
RUN curl -fsSL https://go.dev/dl/go1.22.3.linux-amd64.tar.gz \
        -o /tmp/go.tar.gz && \
    tar -C /usr/local -xzf /tmp/go.tar.gz && \
    rm /tmp/go.tar.gz

# ============================================================
# CAPA 9 — Rust/Cargo
# ============================================================
RUN curl -fsSL https://sh.rustup.rs -o /tmp/rustup.sh && \
    bash /tmp/rustup.sh -y --default-toolchain stable --profile minimal && \
    rm /tmp/rustup.sh

# ============================================================
# CAPA 10 — HexStrike AI (framework principal)
# ============================================================
RUN git clone --depth=1 https://github.com/0x4m4/hexstrike-ai.git /opt/hexstrike-ai

WORKDIR /opt/hexstrike-ai

RUN python3 -m venv hexstrike-env && \
    hexstrike-env/bin/pip install --quiet --upgrade pip && \
    hexstrike-env/bin/pip install --quiet -r requirements.txt

RUN ln -sf /opt/hexstrike-ai/hexstrike-env/bin/python3 /usr/local/bin/hexstrike-python

# ============================================================
# CAPA 11 — Herramientas Go (una por RUN para cache granular)
# ============================================================
RUN go install github.com/projectdiscovery/subfinder/v2/cmd/subfinder@latest 2>/dev/null || true
RUN go install github.com/projectdiscovery/nuclei/v3/cmd/nuclei@latest       2>/dev/null || true
RUN go install github.com/projectdiscovery/httpx/cmd/httpx@latest             2>/dev/null || true
RUN go install github.com/projectdiscovery/katana/cmd/katana@latest           2>/dev/null || true
RUN go install github.com/projectdiscovery/naabu/v2/cmd/naabu@latest          2>/dev/null || true
RUN go install github.com/ffuf/ffuf/v2@latest                                 2>/dev/null || true
RUN go install github.com/hakluke/hakrawler@latest                            2>/dev/null || true
RUN go install github.com/lc/gau/v2/cmd/gau@latest                           2>/dev/null || true
RUN go install github.com/tomnomnom/waybackurls@latest                        2>/dev/null || true
RUN go install github.com/tomnomnom/anew@latest                               2>/dev/null || true
RUN go install github.com/tomnomnom/qsreplace@latest                          2>/dev/null || true
RUN go install github.com/hahwul/dalfox/v2@latest                            2>/dev/null || true
RUN go install github.com/jaeles-project/jaeles@latest                        2>/dev/null || true
RUN go install github.com/assetnote/kiterunner/cmd/kr@latest                  2>/dev/null || true

# Nuclei templates
RUN /root/go/bin/nuclei -update-templates -silent 2>/dev/null || true

# ============================================================
# CAPA 12 — Python pip (global)
# ============================================================
RUN pip3 install --break-system-packages --quiet \
        smbmap netexec impacket \
        patator hashid \
        arjun uro sslyze autorecon \
        prowler scoutsuite kube-hunter checkov \
        pwntools ropgadget ropper \
        volatility3 \
        sherlock holehe \
        scapy \
        pycryptodome cryptography \
        reportlab jinja2 weasyprint \
        pymisp stix2 taxii2-client \
        requests beautifulsoup4 lxml httpx \
        mobsf \
    2>/dev/null || true

# ============================================================
# CAPA 13 — Ruby gems
# ============================================================
RUN gem install evil-winrm one_gadget zsteg --quiet 2>/dev/null || true

# ============================================================
# CAPA 14 — Clones de GitHub
# ============================================================

RUN git clone --quiet --depth=1 \
        https://github.com/lgandx/Responder /opt/Responder && \
    ln -sf /opt/Responder/Responder.py /usr/local/bin/responder && \
    chmod +x /opt/Responder/Responder.py

RUN git clone --quiet --depth=1 \
        https://github.com/drwetter/testssl.sh /opt/testssl && \
    ln -sf /opt/testssl/testssl.sh /usr/local/bin/testssl

RUN git clone --quiet --depth=1 \
        https://github.com/maurosoria/dirsearch /opt/dirsearch && \
    pip3 install --break-system-packages \
        -r /opt/dirsearch/requirements.txt --quiet 2>/dev/null || true && \
    ln -sf /opt/dirsearch/dirsearch.py /usr/local/bin/dirsearch && \
    chmod +x /opt/dirsearch/dirsearch.py

RUN git clone --quiet --depth=1 \
        https://github.com/ticarpi/jwt_tool /opt/jwt_tool && \
    pip3 install --break-system-packages --quiet \
        termcolor cprint pycryptodomex 2>/dev/null || true && \
    ln -sf /opt/jwt_tool/jwt_tool.py /usr/local/bin/jwt_tool && \
    chmod +x /opt/jwt_tool/jwt_tool.py

RUN git clone --quiet --depth=1 \
        https://github.com/epinna/tplmap /opt/tplmap && \
    pip3 install --break-system-packages \
        -r /opt/tplmap/requirements.txt --quiet 2>/dev/null || true && \
    ln -sf /opt/tplmap/tplmap.py /usr/local/bin/tplmap && \
    chmod +x /opt/tplmap/tplmap.py

RUN git clone --quiet --depth=1 \
        https://github.com/codingo/NoSQLMap /opt/NoSQLMap && \
    pip3 install --break-system-packages \
        -r /opt/NoSQLMap/requirements.txt --quiet 2>/dev/null || true && \
    ln -sf /opt/NoSQLMap/nosqlmap.py /usr/local/bin/nosqlmap && \
    chmod +x /opt/NoSQLMap/nosqlmap.py

RUN git clone --quiet --depth=1 \
        https://github.com/devanshbatham/ParamSpider /opt/ParamSpider && \
    pip3 install --break-system-packages \
        -r /opt/ParamSpider/requirements.txt --quiet 2>/dev/null || true && \
    ln -sf /opt/ParamSpider/paramspider.py /usr/local/bin/paramspider && \
    chmod +x /opt/ParamSpider/paramspider.py

RUN git clone --quiet --depth=1 \
        https://github.com/blackploit/hash-identifier /opt/hash-identifier && \
    ln -sf /opt/hash-identifier/hash-id.py /usr/local/bin/hash-identifier && \
    chmod +x /opt/hash-identifier/hash-id.py

RUN git clone --quiet --depth=1 \
        https://github.com/longld/peda /opt/peda && \
    echo "source /opt/peda/peda.py" >> /root/.gdbinit

RUN git clone --quiet --depth=1 \
        https://github.com/volatilityfoundation/volatility3 /opt/volatility3 && \
    pip3 install --break-system-packages \
        -r /opt/volatility3/requirements.txt --quiet 2>/dev/null || true && \
    ln -sf /opt/volatility3/vol.py /usr/local/bin/vol3 && \
    chmod +x /opt/volatility3/vol.py

RUN git clone --quiet --depth=1 \
        https://github.com/smicallef/spiderfoot /opt/spiderfoot && \
    pip3 install --break-system-packages \
        -r /opt/spiderfoot/requirements.txt --quiet 2>/dev/null || true && \
    ln -sf /opt/spiderfoot/sf.py /usr/local/bin/spiderfoot && \
    chmod +x /opt/spiderfoot/sf.py

RUN git clone --quiet --depth=1 \
        https://github.com/RhinoSecurityLabs/pacu /opt/pacu && \
    pip3 install --break-system-packages \
        -r /opt/pacu/requirements.txt --quiet 2>/dev/null || true && \
    ln -sf /opt/pacu/cli.py /usr/local/bin/pacu && \
    chmod +x /opt/pacu/cli.py

RUN git clone --quiet --depth=1 \
        https://github.com/duo-labs/cloudmapper /opt/cloudmapper && \
    pip3 install --break-system-packages \
        -r /opt/cloudmapper/requirements.txt --quiet 2>/dev/null || true && \
    ln -sf /opt/cloudmapper/cloudmapper.py /usr/local/bin/cloudmapper && \
    chmod +x /opt/cloudmapper/cloudmapper.py

RUN git clone --quiet --depth=1 \
        https://github.com/niklasb/libc-database /opt/libc-database 2>/dev/null || true

# ============================================================
# CAPA 15 — Binarios standalone
# ============================================================

# Feroxbuster
RUN FEROX_URL=$(curl -sf \
        https://api.github.com/repos/epi052/feroxbuster/releases/latest \
        | grep -o '"browser_download_url":"[^"]*linux-x86_64[^"]*\.zip"' \
        | head -1 | cut -d'"' -f4) && \
    if [ -n "$FEROX_URL" ]; then \
        curl -fsSL "$FEROX_URL" -o /tmp/ferox.zip && \
        unzip -qo /tmp/ferox.zip feroxbuster -d /usr/local/bin/ && \
        chmod +x /usr/local/bin/feroxbuster && \
        rm /tmp/ferox.zip; \
    fi

# Rustscan
RUN /root/.cargo/bin/cargo install rustscan 2>/dev/null && \
    ln -sf /root/.cargo/bin/rustscan /usr/local/bin/rustscan || true

# Trivy
RUN curl -fsSL \
        https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh \
        -o /tmp/trivy_install.sh && \
    bash /tmp/trivy_install.sh -b /usr/local/bin 2>/dev/null && \
    rm /tmp/trivy_install.sh || true

# AWS CLI v2
RUN curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" \
        -o /tmp/awscliv2.zip && \
    unzip -qo /tmp/awscliv2.zip -d /tmp/aws_install && \
    /tmp/aws_install/aws/install --bin-dir /usr/local/bin && \
    rm -rf /tmp/awscliv2.zip /tmp/aws_install || true

# kubectl
RUN KUBECTL_VER=$(curl -fsSL https://dl.k8s.io/release/stable.txt) && \
    curl -fsSL \
        "https://dl.k8s.io/release/${KUBECTL_VER}/bin/linux/amd64/kubectl" \
        -o /usr/local/bin/kubectl && \
    chmod +x /usr/local/bin/kubectl || true

# Helm
RUN curl -fsSL \
        https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 \
        -o /tmp/get_helm.sh && \
    bash /tmp/get_helm.sh 2>/dev/null && \
    rm /tmp/get_helm.sh || true

# ============================================================
# CAPA 16 — Script de startup con health check de herramientas
# ============================================================
RUN printf '#!/bin/bash\n\
echo "============================================"\n\
echo " HexStrike AI MCP v6.0 — Kali Linux"\n\
echo "============================================"\n\
echo ""\n\
TOOLS="nmap nuclei sqlmap gobuster feroxbuster ffuf httpx subfinder nikto hydra john"\n\
echo "Verificando herramientas principales:"\n\
for t in $TOOLS; do\n\
    if command -v "$t" &>/dev/null || [ -f "/root/go/bin/$t" ]; then\n\
        echo "  OK $t"\n\
    else\n\
        echo "  MISSING $t"\n\
    fi\n\
done\n\
echo ""\n\
echo "Iniciando HexStrike server en 0.0.0.0:8888..."\n\
echo ""\n\
cd /opt/hexstrike-ai\n\
exec hexstrike-env/bin/python3 hexstrike_server.py\n\
' > /usr/local/bin/hexstrike-start.sh && \
    chmod +x /usr/local/bin/hexstrike-start.sh

# ============================================================
# LIMPIEZA FINAL
# ============================================================
RUN apt-get clean && \
    rm -rf \
        /var/lib/apt/lists/* \
        /tmp/* \
        /root/.cache/pip \
        /root/go/pkg/mod/cache

EXPOSE 8888

HEALTHCHECK --interval=30s --timeout=10s --start-period=90s --retries=5 \
    CMD curl -f http://localhost:8888/health || exit 1

WORKDIR /opt/hexstrike-ai

CMD ["/usr/local/bin/hexstrike-start.sh"]