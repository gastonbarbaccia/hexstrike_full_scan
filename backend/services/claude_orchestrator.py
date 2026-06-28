import asyncio
import json
import os
from datetime import datetime
from typing import Any, Dict, List, Optional

import httpx
from sqlalchemy import update, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from services.ai_provider import get_provider, AI_PROVIDER, ANTHROPIC_MODEL, OPENAI_MODEL

HEXSTRIKE_URL = os.environ.get("HEXSTRIKE_URL", "http://localhost:8888")
MODEL = OPENAI_MODEL if AI_PROVIDER == "openai" else ANTHROPIC_MODEL
MAX_TOKENS = 8192
MAX_ITERATIONS = 60
TOOL_TIMEOUT = 300  # seconds per tool call


# ── SSE Event Manager ───────────────────────────────────────────────────────

class SSEManager:
    def __init__(self):
        self._queues: Dict[int, List[asyncio.Queue]] = {}

    def subscribe(self, scan_id: int) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue()
        self._queues.setdefault(scan_id, []).append(q)
        return q

    def unsubscribe(self, scan_id: int, q: asyncio.Queue):
        lst = self._queues.get(scan_id, [])
        if q in lst:
            lst.remove(q)

    async def push(self, scan_id: int, event: dict):
        for q in self._queues.get(scan_id, []):
            await q.put(event)

    async def close(self, scan_id: int):
        for q in self._queues.get(scan_id, []):
            await q.put(None)  # sentinel: end stream
        self._queues.pop(scan_id, None)


sse_manager = SSEManager()


# ── Claude Tool Definitions ─────────────────────────────────────────────────

PENTEST_TOOLS: List[Dict] = [
    {
        "name": "announce_phase",
        "description": "Announce the start of a new pentest phase. Call this before beginning each phase.",
        "input_schema": {
            "type": "object",
            "properties": {
                "phase": {"type": "string", "description": "Phase name: RECONOCIMIENTO | ESCANEO_PUERTOS | ANALISIS_WEB | DETECCION_VULNERABILIDADES | CREDENCIALES | EXPLOTACION | REPORTE"},
                "description": {"type": "string", "description": "Brief description of what you will do in this phase"}
            },
            "required": ["phase", "description"]
        }
    },
    {
        "name": "report_finding",
        "description": "Report a security vulnerability or finding. Call this immediately when you identify a vulnerability.",
        "input_schema": {
            "type": "object",
            "properties": {
                "severity": {"type": "string", "enum": ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"], "description": "Vulnerability severity"},
                "title": {"type": "string", "description": "Short descriptive title of the vulnerability"},
                "description": {"type": "string", "description": "Detailed description of the vulnerability and its impact"},
                "tool": {"type": "string", "description": "Tool that discovered this finding"},
                "phase": {"type": "string", "description": "Phase in which this was found"},
                "evidence": {"type": "string", "description": "Evidence: relevant output, payload, response that confirms the vulnerability"},
                "cve": {"type": "string", "description": "CVE identifier if applicable (e.g., CVE-2024-1234)"},
                "cvss": {"type": "number", "description": "CVSS score (0.0-10.0) if known"}
            },
            "required": ["severity", "title", "description", "tool", "phase"]
        }
    },
    {
        "name": "nmap_scan",
        "description": "Scan ports and services using nmap. Use for port discovery and service enumeration.",
        "input_schema": {
            "type": "object",
            "properties": {
                "target": {"type": "string", "description": "IP address, hostname, or CIDR range"},
                "ports": {"type": "string", "description": "Port range (e.g., '1-1000', '80,443,8080,8443'). Empty for top 1000 ports."},
                "scan_type": {"type": "string", "description": "Nmap flags (default: -sCV for service version + scripts)"},
                "additional_args": {"type": "string", "description": "Additional nmap arguments (default: -T4 -Pn)"}
            },
            "required": ["target"]
        }
    },
    {
        "name": "subfinder_scan",
        "description": "Discover subdomains using subfinder. Use during reconnaissance phase.",
        "input_schema": {
            "type": "object",
            "properties": {
                "target": {"type": "string", "description": "Domain to enumerate subdomains for (e.g., example.com)"},
                "additional_args": {"type": "string", "description": "Additional subfinder arguments"}
            },
            "required": ["target"]
        }
    },
    {
        "name": "amass_scan",
        "description": "OSINT subdomain enumeration using amass (passive mode). May fail if libpostal is not installed — in that case, rely on subfinder and dnsenum instead.",
        "input_schema": {
            "type": "object",
            "properties": {
                "target": {"type": "string", "description": "Domain to enumerate"},
                "passive": {"type": "boolean", "description": "Use passive mode only (default: true for stealth)"},
                "additional_args": {"type": "string", "description": "Additional amass arguments"}
            },
            "required": ["target"]
        }
    },
    {
        "name": "httpx_probe",
        "description": "Probe HTTP/HTTPS services to identify live web servers, technologies, status codes.",
        "input_schema": {
            "type": "object",
            "properties": {
                "target": {"type": "string", "description": "Target URL, IP, or newline-separated list of hosts"},
                "additional_args": {"type": "string", "description": "Additional httpx arguments (e.g., -title -tech-detect -status-code)"}
            },
            "required": ["target"]
        }
    },
    {
        "name": "nikto_scan",
        "description": "Web server vulnerability scanner. Finds misconfigurations, dangerous files, outdated software.",
        "input_schema": {
            "type": "object",
            "properties": {
                "url": {"type": "string", "description": "Target URL (e.g., http://example.com)"},
                "additional_args": {"type": "string", "description": "Additional nikto arguments"}
            },
            "required": ["url"]
        }
    },
    {
        "name": "gobuster_scan",
        "description": "Directory and file brute-forcing. Discovers hidden endpoints, admin panels, config files.",
        "input_schema": {
            "type": "object",
            "properties": {
                "url": {"type": "string", "description": "Target URL"},
                "mode": {"type": "string", "description": "Scan mode: dir | dns | vhost (default: dir)"},
                "wordlist": {"type": "string", "description": "Wordlist path (default: /usr/share/wordlists/dirb/common.txt)"},
                "additional_args": {"type": "string", "description": "Additional flags (e.g., -x php,txt,html -t 50)"}
            },
            "required": ["url"]
        }
    },
    {
        "name": "feroxbuster_scan",
        "description": "Fast, recursive content discovery. Better than gobuster for deep directory traversal.",
        "input_schema": {
            "type": "object",
            "properties": {
                "url": {"type": "string", "description": "Target URL"},
                "wordlist": {"type": "string", "description": "Wordlist path (default: /usr/share/wordlists/dirb/common.txt)"},
                "additional_args": {"type": "string", "description": "Additional feroxbuster arguments"}
            },
            "required": ["url"]
        }
    },
    {
        "name": "wafw00f_scan",
        "description": "Detect Web Application Firewalls (WAF). Identifies WAF type before further testing.",
        "input_schema": {
            "type": "object",
            "properties": {
                "url": {"type": "string", "description": "Target URL to check for WAF"},
                "additional_args": {"type": "string", "description": "Additional wafw00f arguments"}
            },
            "required": ["url"]
        }
    },
    {
        "name": "nuclei_scan",
        "description": "Template-based vulnerability scanner. Detects CVEs, misconfigurations, exposed panels.",
        "input_schema": {
            "type": "object",
            "properties": {
                "target": {"type": "string", "description": "Target URL or IP"},
                "severity": {"type": "string", "description": "Filter by severity: critical,high,medium,low,info"},
                "tags": {"type": "string", "description": "Template tags to use (e.g., cve,xss,sqli,rce,oast,misconfig)"},
                "additional_args": {"type": "string", "description": "Additional nuclei arguments"}
            },
            "required": ["target"]
        }
    },
    {
        "name": "dalfox_xss_scan",
        "description": "XSS vulnerability scanner. Finds reflected, stored, and DOM XSS vulnerabilities.",
        "input_schema": {
            "type": "object",
            "properties": {
                "url": {"type": "string", "description": "Target URL (may include parameters)"},
                "additional_args": {"type": "string", "description": "Additional dalfox arguments (e.g., --blind yourserver.com)"}
            },
            "required": ["url"]
        }
    },
    {
        "name": "sqlmap_scan",
        "description": "SQL injection detection and exploitation. Tests for SQLi vulnerabilities.",
        "input_schema": {
            "type": "object",
            "properties": {
                "url": {"type": "string", "description": "Target URL with parameters (e.g., http://example.com/page?id=1)"},
                "level": {"type": "integer", "description": "Test level 1-5 (default: 2)"},
                "risk": {"type": "integer", "description": "Risk level 1-3 (default: 1)"},
                "additional_args": {"type": "string", "description": "Additional sqlmap arguments (e.g., --forms --crawl=2)"}
            },
            "required": ["url"]
        }
    },
    {
        "name": "katana_crawl",
        "description": "Modern web crawler. Discovers JavaScript endpoints, API routes, hidden parameters.",
        "input_schema": {
            "type": "object",
            "properties": {
                "url": {"type": "string", "description": "Target URL to crawl"},
                "depth": {"type": "integer", "description": "Crawl depth (default: 3)"},
                "additional_args": {"type": "string", "description": "Additional katana arguments"}
            },
            "required": ["url"]
        }
    },
    {
        "name": "waybackurls_discovery",
        "description": "Fetch historical URLs from Wayback Machine and other sources. Finds old endpoints.",
        "input_schema": {
            "type": "object",
            "properties": {
                "target": {"type": "string", "description": "Domain or URL to look up"}
            },
            "required": ["target"]
        }
    },
    {
        "name": "ffuf_scan",
        "description": "Fast web fuzzer. Use for directory bruteforce, parameter fuzzing, vhost discovery.",
        "input_schema": {
            "type": "object",
            "properties": {
                "url": {"type": "string", "description": "Target URL with FUZZ keyword (e.g., http://example.com/FUZZ)"},
                "wordlist": {"type": "string", "description": "Wordlist path (default: /usr/share/wordlists/dirb/common.txt)"},
                "additional_args": {"type": "string", "description": "Additional ffuf arguments (e.g., -mc 200,302 -t 50)"}
            },
            "required": ["url"]
        }
    },
    {
        "name": "dnsenum_scan",
        "description": "DNS enumeration. Finds subdomains, MX records, zone transfers.",
        "input_schema": {
            "type": "object",
            "properties": {
                "target": {"type": "string", "description": "Domain to enumerate"},
                "additional_args": {"type": "string", "description": "Additional dnsenum arguments"}
            },
            "required": ["target"]
        }
    },
    {
        "name": "wpscan_analyze",
        "description": "WordPress vulnerability scanner. Finds plugin/theme vulns, user enumeration, config issues.",
        "input_schema": {
            "type": "object",
            "properties": {
                "url": {"type": "string", "description": "WordPress site URL"},
                "additional_args": {"type": "string", "description": "Additional wpscan arguments (e.g., --enumerate u,p,t)"}
            },
            "required": ["url"]
        }
    },
    {
        "name": "hydra_attack",
        "description": "Brute-force login credentials on network services (SSH, FTP, HTTP, SMB, etc.).",
        "input_schema": {
            "type": "object",
            "properties": {
                "target": {"type": "string", "description": "Target IP or hostname"},
                "service": {"type": "string", "description": "Service to attack: ssh, ftp, http-get, http-post-form, smb, rdp, telnet, mysql"},
                "username": {"type": "string", "description": "Single username or path to username list"},
                "password_list": {"type": "string", "description": "Password list path (default: /usr/share/wordlists/rockyou.txt)"},
                "additional_args": {"type": "string", "description": "Additional hydra arguments (e.g., -t 4 -V)"}
            },
            "required": ["target", "service"]
        }
    },
    {
        "name": "rustscan_fast_scan",
        "description": "Ultra-fast port scanner. Use first to quickly identify open ports before running nmap.",
        "input_schema": {
            "type": "object",
            "properties": {
                "target": {"type": "string", "description": "Target IP or hostname"},
                "ports": {"type": "string", "description": "Specific ports comma-separated (e.g., '80,443,8080'). Leave empty to scan all ports (default behavior)."},
                "additional_args": {"type": "string", "description": "Additional rustscan arguments"}
            },
            "required": ["target"]
        }
    }
]


# ── Tool → Hexstrike endpoint mapping ──────────────────────────────────────

TOOL_ENDPOINTS = {
    "nmap_scan": "/api/tools/nmap",
    "subfinder_scan": "/api/tools/subfinder",
    "amass_scan": "/api/tools/amass",
    "httpx_probe": "/api/tools/httpx",
    "nikto_scan": "/api/tools/nikto",
    "gobuster_scan": "/api/tools/gobuster",
    "feroxbuster_scan": "/api/tools/feroxbuster",
    "wafw00f_scan": "/api/tools/wafw00f",
    "nuclei_scan": "/api/tools/nuclei",
    "dalfox_xss_scan": "/api/tools/dalfox",
    "sqlmap_scan": "/api/tools/sqlmap",
    "katana_crawl": "/api/tools/katana",
    "waybackurls_discovery": "/api/tools/waybackurls",
    "ffuf_scan": "/api/tools/ffuf",
    "dnsenum_scan": "/api/tools/dnsenum",
    "wpscan_analyze": "/api/tools/wpscan",
    "hydra_attack": "/api/tools/hydra",
    "rustscan_fast_scan": "/api/tools/rustscan",
}


def _build_hexstrike_params(tool_name: str, tool_input: dict) -> dict:
    """Translate Claude tool input to hexstrike endpoint params."""
    # Most tools accept their input directly; we just normalize field names.
    param_map = {
        "nmap_scan":           lambda i: {"target": i.get("target"), "scan_type": i.get("scan_type", "-sCV"), "ports": i.get("ports", ""), "additional_args": i.get("additional_args", "-T4 -Pn")},
        "subfinder_scan":      lambda i: {"domain": i.get("target"), "additional_args": i.get("additional_args", "-silent")},
        "amass_scan":          lambda i: {"domain": i.get("target"), "passive": i.get("passive", True), "additional_args": i.get("additional_args", "")},
        "httpx_probe":         lambda i: {"target": i.get("target"), "tech_detect": True, "status_code": True, "title": True, "additional_args": i.get("additional_args", "")},
        "nikto_scan":          lambda i: {"target": i.get("url"), "additional_args": i.get("additional_args", "")},
        "gobuster_scan":       lambda i: {"url": i.get("url"), "mode": i.get("mode", "dir"), "wordlist": i.get("wordlist", "/usr/share/wordlists/dirb/common.txt"), "additional_args": i.get("additional_args", "-q -t 50")},
        "feroxbuster_scan":    lambda i: {"url": i.get("url"), "wordlist": i.get("wordlist", "/usr/share/wordlists/dirb/common.txt"), "additional_args": i.get("additional_args", "")},
        "wafw00f_scan":        lambda i: {"target": i.get("url"), "additional_args": i.get("additional_args", "")},
        "nuclei_scan":         lambda i: {"target": i.get("target"), "severity": i.get("severity", "critical,high,medium"), "tags": i.get("tags", ""), "additional_args": i.get("additional_args", "")},
        "dalfox_xss_scan":     lambda i: {"url": i.get("url"), "additional_args": i.get("additional_args", "")},
        "sqlmap_scan":         lambda i: {"url": i.get("url"), "level": i.get("level", 2), "risk": i.get("risk", 1), "additional_args": i.get("additional_args", "--batch --random-agent")},
        "katana_crawl":        lambda i: {"url": i.get("url"), "depth": i.get("depth", 3), "additional_args": i.get("additional_args", "")},
        "waybackurls_discovery": lambda i: {"domain": i.get("target")},
        "ffuf_scan":           lambda i: {"url": i.get("url"), "wordlist": i.get("wordlist", "/usr/share/wordlists/dirb/common.txt"), "additional_args": i.get("additional_args", "-mc 200,302,403 -t 50 -maxtime 180 -timeout 10")},
        "dnsenum_scan":        lambda i: {"domain": i.get("target"), "additional_args": i.get("additional_args", "")},
        "wpscan_analyze":      lambda i: {"url": i.get("url"), "additional_args": i.get("additional_args", "--enumerate u,p,t --no-update")},
        "hydra_attack":        lambda i: {"target": i.get("target"), "service": i.get("service"), "username": i.get("username", "admin"), "password_file": i.get("password_list", "/usr/share/wordlists/rockyou.txt"), "additional_args": i.get("additional_args", "-t 4 -V")},
        "rustscan_fast_scan":  lambda i: {"target": i.get("target"), "ports": "", "additional_args": i.get("additional_args", "")},
    }
    builder = param_map.get(tool_name)
    return builder(tool_input) if builder else tool_input


# ── System prompts by profile ───────────────────────────────────────────────

SYSTEM_PROMPTS = {
    "web": """You are HexStrike AI, an autonomous AI-powered penetration testing system specialized in web application security.

You will conduct a comprehensive web application security assessment. Execute ALL phases systematically:

PHASE 1 — RECONOCIMIENTO:
- Use subfinder to discover subdomains (primary tool)
- Try amass for additional subdomain coverage (may fail — continue if it does)
- Use dnsenum for DNS records
- Use waybackurls_discovery to find historical endpoints
- Use httpx_probe to identify live services

PHASE 2 — ESCANEO_PUERTOS:
- Use rustscan_fast_scan first for quick port discovery
- Then nmap_scan for detailed service enumeration on discovered ports
- Focus on web ports: 80, 443, 8080, 8443, 8888, 3000, etc.

PHASE 3 — ANALISIS_WEB:
- Use wafw00f_scan to detect WAF
- Use nikto_scan for basic web vulnerability checks
- Use gobuster_scan to discover directories and files
- Use katana_crawl to crawl the application and find endpoints
- If WordPress detected, use wpscan_analyze

PHASE 4 — DETECCION_VULNERABILIDADES:
- Use nuclei_scan with tags: cve,xss,sqli,rce,oast,misconfig,exposure
- Use dalfox_xss_scan on discovered endpoints with parameters
- Use sqlmap_scan on endpoints with parameters
- Use ffuf_scan for parameter fuzzing

PHASE 5 — CREDENCIALES:
- Use hydra_attack on exposed login panels or SSH/FTP services
- Test default credentials for identified services

PHASE 6 — EXPLOTACION:
- Validate critical findings found in previous phases
- Use nuclei_scan with specific CVE tags for confirmed vulnerabilities

PHASE 7 — REPORTE:
- Summarize all findings and provide the final assessment

RULES:
1. Call announce_phase BEFORE starting each phase
2. Call report_finding IMMEDIATELY when you identify ANY vulnerability
3. Be thorough — execute multiple tools per phase
4. Analyze all tool output carefully for vulnerabilities
5. Prioritize by severity: CRITICAL > HIGH > MEDIUM > LOW > INFO""",

    "network": """You are HexStrike AI, an autonomous AI-powered penetration testing system specialized in network security.

You will conduct a comprehensive network security assessment. Execute ALL phases systematically:

PHASE 1 — RECONOCIMIENTO:
- Use subfinder and amass for subdomain enumeration
- Use dnsenum for DNS enumeration
- Use httpx_probe to identify web services

PHASE 2 — ESCANEO_PUERTOS:
- Use rustscan_fast_scan for full port scan (all 65535 ports)
- Use nmap_scan with -sCV for service versions and default scripts
- Use nmap_scan with -sU for UDP services on key ports (53, 161, 500)
- Focus on: 21/FTP, 22/SSH, 23/Telnet, 25/SMTP, 53/DNS, 110/POP3, 139/445/SMB, 3389/RDP, 5900/VNC

PHASE 3 — ANALISIS_WEB:
- Use httpx_probe on discovered web ports
- Use nikto_scan on web services
- Use gobuster_scan on web services

PHASE 4 — DETECCION_VULNERABILIDADES:
- Use nuclei_scan with tags: network,misconfig,default-login,exposure
- Use nuclei_scan with severity: critical,high on discovered hosts

PHASE 5 — CREDENCIALES:
- Use hydra_attack on SSH, FTP, Telnet, RDP services
- Test default/common credentials

PHASE 6 — EXPLOTACION:
- Use nuclei_scan with CVE tags on specific services
- Validate critical network vulnerabilities

PHASE 7 — REPORTE:
- Summarize network security posture

RULES:
1. Call announce_phase BEFORE each phase
2. Call report_finding IMMEDIATELY on any finding
3. Be thorough on network service enumeration
4. Document all open ports and services""",

    "full": """You are HexStrike AI, an autonomous AI-powered penetration testing system.

You will conduct a FULL comprehensive penetration test combining web application and network security testing.

Execute ALL phases:
PHASE 1 — RECONOCIMIENTO: Full OSINT (subfinder, amass, dnsenum, waybackurls, httpx)
PHASE 2 — ESCANEO_PUERTOS: Full port scan (rustscan, nmap all ports, UDP scan)
PHASE 3 — ANALISIS_WEB: Complete web analysis (wafw00f, nikto, gobuster, feroxbuster, katana, wpscan if WordPress)
PHASE 4 — DETECCION_VULNERABILIDADES: Full vuln scan (nuclei with all severities, dalfox, sqlmap, ffuf)
PHASE 5 — CREDENCIALES: Credential attacks on all exposed services (hydra)
PHASE 6 — EXPLOTACION: Exploit validation of critical findings
PHASE 7 — REPORTE: Comprehensive findings summary

RULES:
1. Call announce_phase BEFORE each phase
2. Call report_finding IMMEDIATELY on any finding
3. Be extremely thorough — this is a full pentest
4. Analyze ALL output for vulnerabilities"""
}


# ── Report CSS template (provided to Claude so it doesn't waste tokens on CSS) ──

REPORT_CSS = """
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0a0f1e;color:#e2e8f0;font-family:'Segoe UI',system-ui,sans-serif;font-size:14px;line-height:1.6;padding:2rem}
h1{font-size:2rem;font-weight:800;color:#fff;margin-bottom:.25rem}
h2{font-size:1.1rem;font-weight:700;color:#00d4ff;text-transform:uppercase;letter-spacing:.12em;margin:2rem 0 1rem;padding-bottom:.5rem;border-bottom:1px solid #1e3a5f}
h3{font-size:.95rem;font-weight:600;color:#fff;margin:.75rem 0 .4rem}
p{margin:.4rem 0;color:#cbd5e1}
a{color:#00d4ff}
table{width:100%;border-collapse:collapse;margin:.75rem 0;font-size:13px}
th{background:#111827;color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:1px;padding:10px 14px;border:1px solid #1e3a5f;text-align:left}
td{padding:10px 14px;border:1px solid #1e3a5f;vertical-align:top;color:#cbd5e1}
tr:nth-child(even) td{background:#0d1525}
code,pre{font-family:'Courier New',monospace;background:#050a12;color:#7dd3fc;border:1px solid #1e3a5f;border-radius:4px;font-size:12px}
code{padding:1px 5px}
pre{padding:12px;overflow-x:auto;white-space:pre-wrap;word-break:break-all;margin:.5rem 0}
.badge{display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700;font-family:monospace}
.sev-CRITICAL,.badge-CRITICAL{background:rgba(239,68,68,.15);color:#ef4444;border:1px solid rgba(239,68,68,.4)}
.sev-HIGH,.badge-HIGH{background:rgba(249,115,22,.15);color:#f97316;border:1px solid rgba(249,115,22,.4)}
.sev-MEDIUM,.badge-MEDIUM{background:rgba(234,179,8,.15);color:#eab308;border:1px solid rgba(234,179,8,.4)}
.sev-LOW,.badge-LOW{background:rgba(34,197,94,.15);color:#22c55e;border:1px solid rgba(34,197,94,.4)}
.sev-INFO,.badge-INFO{background:rgba(0,212,255,.1);color:#00d4ff;border:1px solid rgba(0,212,255,.3)}
.card{background:#111827;border:1px solid #1e3a5f;border-radius:10px;padding:1.25rem;margin:.75rem 0}
.card-critical{border-left:3px solid #ef4444}
.card-high{border-left:3px solid #f97316}
.card-medium{border-left:3px solid #eab308}
.card-low{border-left:3px solid #22c55e}
.card-info{border-left:3px solid #00d4ff}
.meta{font-size:11px;color:#64748b;margin:.3rem 0}
.risk-red{background:rgba(239,68,68,.15);border:1px solid rgba(239,68,68,.4);border-radius:8px;padding:1rem;text-align:center;color:#ef4444;font-weight:700;font-size:1.5rem}
.risk-amber{background:rgba(249,115,22,.15);border:1px solid rgba(249,115,22,.4);border-radius:8px;padding:1rem;text-align:center;color:#f97316;font-weight:700;font-size:1.5rem}
.risk-green{background:rgba(34,197,94,.15);border:1px solid rgba(34,197,94,.4);border-radius:8px;padding:1rem;text-align:center;color:#22c55e;font-weight:700;font-size:1.5rem}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin:.75rem 0}
.stat-box{background:#111827;border:1px solid #1e3a5f;border-radius:8px;padding:1rem;text-align:center}
.stat-val{font-size:2rem;font-weight:800}
.stat-lbl{font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:1px;margin-top:.2rem}
hr{border:none;border-top:1px solid #1e3a5f;margin:1.5rem 0}
ul,ol{padding-left:1.5rem;margin:.5rem 0;color:#cbd5e1}
li{margin:.25rem 0}
"""

# ── Report generation prompts ───────────────────────────────────────────────

def _technical_report_prompt(target: str, findings: List[dict], phases: List[str]) -> str:
    counts = {"CRITICAL": 0, "HIGH": 0, "MEDIUM": 0, "LOW": 0, "INFO": 0}
    for f in findings:
        sev = f.get("severity", "INFO")
        counts[sev] = counts.get(sev, 0) + 1

    findings_text = json.dumps(findings, indent=2, ensure_ascii=False)
    return f"""Genera un REPORTE TÉCNICO DE SEGURIDAD completo en ESPAÑOL como contenido HTML.

OBJETIVO: {target}
FECHA: {datetime.utcnow().strftime('%d/%m/%Y')}
HALLAZGOS: {len(findings)} totales — {counts}

DATOS DE HALLAZGOS:
{findings_text}

REGLAS ESTRICTAS DE SALIDA:
- Escribe TODO el reporte en ESPAÑOL (castellano).
- Genera SOLO HTML puro. Empieza con <h2> — NUNCA con ```html, <style>, <html> o <h1>.
- Usa SOLO estas etiquetas: h2 h3 p ul ol li table thead tbody tr th td strong em code pre hr br
- NO agregues atributos style=, class= ni id= en ninguna etiqueta, EXCEPTO: en celdas de severidad puedes usar data-sev="CRITICAL|HIGH|MEDIUM|LOW|INFO" para colorear.
- Ejemplo de uso correcto: <td data-sev="CRITICAL">CRÍTICO</td> o <tr data-sev="HIGH"><td>...</td></tr>
- NO incluyas encabezado principal (el template ya lo tiene), NO incluyas sección de resumen estadístico ni lista de fases (el template ya los muestra).
- Sé exhaustivo: TODOS los hallazgos deben aparecer.

ESTRUCTURA DEL REPORTE (empieza directamente con la primera sección):

<h2>Resumen Ejecutivo</h2>
[2-3 párrafos describiendo el panorama de seguridad encontrado, metodología y alcance]

<h2>Tabla de Hallazgos</h2>
[tabla completa con TODOS los hallazgos: Severidad | Título | Herramienta | Fase | CVE | CVSS | Descripción breve]
[usa data-sev en la celda de severidad y en el <tr> para colorear]

<h2>Hallazgos Críticos y Altos — Detalle</h2>
[para cada hallazgo CRITICAL o HIGH: <h3>título</h3>, <p>descripción detallada</p>, <p>Evidencia: <code>evidencia técnica</code></p>, <p><strong>Remediación:</strong> pasos concretos</p>]

<h2>Otros Hallazgos</h2>
[tabla: Severidad | Título | Descripción | Herramienta]

<h2>Plan de Remediación Priorizado</h2>
[ol con acciones ordenadas por prioridad e impacto]

<h2>Conclusiones</h2>
[párrafo final con evaluación general del nivel de seguridad]

Genera el reporte completo ahora, comenzando con <h2>Resumen Ejecutivo</h2>:"""


def _executive_report_prompt(target: str, findings: List[dict], phases: List[str]) -> str:
    critical = [f for f in findings if f.get("severity") == "CRITICAL"]
    high = [f for f in findings if f.get("severity") == "HIGH"]

    if not findings:
        risk_word = "BAJO RIESGO"
    elif critical:
        risk_word = "RIESGO CRÍTICO"
    elif len(high) > 2:
        risk_word = "RIESGO ALTO"
    elif high:
        risk_word = "RIESGO MEDIO"
    else:
        risk_word = "RIESGO MEDIO"

    findings_summary = json.dumps(
        [{"severidad": f.get("severity"), "titulo": f.get("title"), "descripcion": f.get("description", "")[:200]}
         for f in findings],
        indent=2, ensure_ascii=False
    )
    return f"""Genera un REPORTE EJECUTIVO DE SEGURIDAD en ESPAÑOL para alta dirección (C-level).

OBJETIVO: {target}
FECHA: {datetime.utcnow().strftime('%d/%m/%Y')}
NIVEL DE RIESGO GENERAL: {risk_word}
HALLAZGOS TOTALES: {len(findings)} — Crítico: {len(critical)}, Alto: {len(high)}, Otros: {len(findings)-len(critical)-len(high)}

RESUMEN DE HALLAZGOS:
{findings_summary}

REGLAS ESTRICTAS DE SALIDA:
- Escribe TODO el reporte en ESPAÑOL (castellano).
- Genera SOLO HTML puro. Empieza con <h2> — NUNCA con ```html, <style>, <html> o <h1>.
- Usa SOLO estas etiquetas: h2 h3 p ul ol li table thead tbody tr th td strong em hr br
- NO agregues atributos style=, class= ni id= en ninguna etiqueta, EXCEPTO: en celdas de severidad puedes usar data-sev="CRITICAL|HIGH|MEDIUM|LOW|INFO".
- NO incluyas encabezado principal ni estadísticas de severidad (el template ya los muestra).
- Usa lenguaje NO técnico orientado a decisores de negocio. Enfócate en impacto comercial y riesgo.

ESTRUCTURA DEL REPORTE (empieza directamente con la primera sección):

<h2>Nivel de Riesgo General: {risk_word}</h2>
[2-3 oraciones no técnicas describiendo el estado de seguridad del sistema]

<h2>Resumen Ejecutivo</h2>
[párrafo de contexto: qué se evaluó, cuándo, cómo impacta al negocio]

<h2>Impacto en el Negocio</h2>
[tabla: Hallazgo | Nivel de Riesgo | Impacto Potencial | Urgencia — solo críticos y altos]
[usa data-sev en celda de nivel]

<h2>Exposición al Riesgo</h2>
[tabla: Severidad | Cantidad | Significado para el Negocio]

<h2>Hoja de Ruta de Remediación</h2>
[tabla: Prioridad | Acción Recomendada | Plazo | Área Responsable]

<h2>Implicancias de Cumplimiento</h2>
[párrafo sobre OWASP Top 10, NIST, ISO 27001, PCI-DSS según corresponda]

<h2>Métricas Clave</h2>
[ul: total hallazgos, nivel de riesgo, fases evaluadas, fecha del análisis]

<h2>Conclusión y Próximos Pasos</h2>
[recomendación ejecutiva concreta]

Genera el reporte ejecutivo completo ahora, comenzando con <h2>Nivel de Riesgo General</h2>:"""


# ── Main orchestration function ─────────────────────────────────────────────

async def run_pentest(
    scan_id: int,
    target: str,
    profile: str,
    session_maker: async_sessionmaker,
    scan_config: Optional[Dict] = None,
):
    """Main agentic loop. Runs Claude with tool_use to orchestrate the pentest."""

    provider = get_provider()
    system_prompt = SYSTEM_PROMPTS.get(profile, SYSTEM_PROMPTS["web"])

    log_buffer: List[str] = []
    _log_flush_count = 0

    async def push(event_type: str, data: Any):
        await sse_manager.push(scan_id, {"type": event_type, "data": data, "ts": datetime.utcnow().isoformat()})

    async def db_update(**kwargs):
        async with session_maker() as db:
            await db.execute(update(ScanSession).where(ScanSession.id == scan_id).values(**kwargs))
            await db.commit()

    async def log(msg: str):
        nonlocal _log_flush_count
        log_buffer.append(msg)
        await push("log", msg)
        _log_flush_count += 1
        # Save first few messages immediately so late SSE clients see history;
        # then every 5 lines to reduce DB writes.
        if _log_flush_count <= 3 or _log_flush_count % 5 == 0:
            await db_update(log="\n".join(log_buffer))

    # Import here to avoid circular
    from models import ScanSession, Finding

    try:
        await db_update(status="running")
        await push("status", {"status": "running"})
        await log(f"[HexStrike AI] Iniciando pentest sobre {target} | Perfil: {profile.upper()}")
        await log(f"[HexStrike AI] Modelo: {MODEL} | Herramientas disponibles: {len(PENTEST_TOOLS)}")

        # Build scope config section if provided
        scope_section = ""
        cfg = scan_config or {}
        if cfg:
            lines = ["", "SCOPE CONFIGURATION:"]
            if cfg.get("target_ports"):
                lines.append(f"- Target ports: {cfg['target_ports']}")
            if cfg.get("excluded_paths"):
                excluded = ", ".join(cfg["excluded_paths"])
                lines.append(f"- Excluded paths (DO NOT test these): {excluded}")
            if cfg.get("auth_headers"):
                for k, v in cfg["auth_headers"].items():
                    lines.append(f"- Auth header: {k}: {v}")
            if cfg.get("auth_cookies"):
                for k, v in cfg["auth_cookies"].items():
                    lines.append(f"- Auth cookie: {k}={v}")
            if cfg.get("notes"):
                lines.append(f"- Notes: {cfg['notes']}")
            if len(lines) > 2:
                scope_section = "\n".join(lines)

        messages = [
            {
                "role": "user",
                "content": (
                    f"Conduct a comprehensive penetration test on the following target:\n\n"
                    f"TARGET: {target}\n"
                    f"PROFILE: {profile.upper()}\n"
                    f"{scope_section}\n\n"
                    f"Execute all phases systematically. Use announce_phase before each phase "
                    f"and report_finding immediately when you find any vulnerability. Be thorough."
                )
            }
        ]

        completed_phases: List[str] = []
        current_phase = ""
        findings_data: List[dict] = []
        iterations = 0

        while iterations < MAX_ITERATIONS:
            async with session_maker() as db:
                check = await db.execute(select(ScanSession).where(ScanSession.id == scan_id))
                current_scan = check.scalar_one_or_none()
                if current_scan and current_scan.status == "cancelled":
                    await log("\n[HexStrike AI] Scan cancelado. Deteniendo análisis.")
                    return

            iterations += 1
            await log(f"\n[AI] Procesando... (iteración {iterations})")

            try:
                response = await asyncio.wait_for(
                    provider.chat(
                        system=system_prompt,
                        tools=PENTEST_TOOLS,
                        messages=messages,
                        max_tokens=MAX_TOKENS,
                    ),
                    timeout=180,
                )
            except asyncio.TimeoutError:
                await log("\n[ERROR] Claude API no respondió en 180s. Abortando scan.")
                break

            # Process text blocks
            for text in response.text_blocks:
                await log(f"\n[AI] {text}")

            if response.stop_reason == "end_turn":
                await log("\n[HexStrike AI] Análisis completado. Generando reportes...")
                break

            if response.stop_reason != "tool_use":
                await log(f"\n[HexStrike AI] Stop reason inesperado: {response.stop_reason}")
                break

            # Process tool calls
            tool_results = []
            for tc in response.tool_calls:
                tool_name   = tc["name"]
                tool_input  = tc["input"]
                tool_use_id = tc["id"]

                # ── Special: announce_phase ──────────────────────────────
                if tool_name == "announce_phase":
                    phase = tool_input.get("phase", "")
                    description = tool_input.get("description", "")
                    current_phase = phase
                    if phase not in completed_phases:
                        completed_phases.append(phase)

                    await push("phase", {"phase": phase, "description": description, "status": "started"})
                    await log(f"\n{'='*60}")
                    await log(f"[FASE] {phase}")
                    await log(f"[DESC] {description}")
                    await log(f"{'='*60}")

                    await db_update(current_phase=phase, completed_phases=completed_phases)

                    tool_results.append({
                        "tool_use_id": tool_use_id,
                        "content": f"Phase {phase} started. Proceed with the planned tools."
                    })
                    continue

                # ── Special: report_finding ──────────────────────────────
                if tool_name == "report_finding":
                    severity = tool_input.get("severity", "INFO").upper()
                    title = tool_input.get("title", "")
                    description = tool_input.get("description", "")
                    tool = tool_input.get("tool", "")
                    phase = tool_input.get("phase", current_phase)
                    evidence = tool_input.get("evidence", "")
                    cve = tool_input.get("cve", "")
                    cvss = tool_input.get("cvss")

                    async with session_maker() as db:
                        # Get target_id for this scan to detect cross-scan duplicates
                        sess_result = await db.execute(select(ScanSession).where(ScanSession.id == scan_id))
                        sess = sess_result.scalar_one_or_none()
                        target_id = sess.target_id if sess else None

                        existing = None
                        if target_id:
                            dup_result = await db.execute(
                                select(Finding)
                                .join(ScanSession, Finding.session_id == ScanSession.id)
                                .where(
                                    ScanSession.target_id == target_id,
                                    Finding.title == title,
                                    Finding.severity == severity,
                                )
                                .order_by(Finding.id.asc())
                                .limit(1)
                            )
                            existing = dup_result.scalar_one_or_none()

                        if existing:
                            # Create a new finding marked as duplicate so this scan's
                            # Hallazgos tab shows it with a "Confirmado" badge,
                            # while the original finding keeps its comments/assignments
                            finding = Finding(
                                session_id=scan_id,
                                severity=severity,
                                title=title,
                                description=description,
                                tool=tool,
                                phase=phase,
                                evidence=evidence,
                                cve=cve or None,
                                cvss=float(cvss) if cvss is not None else None,
                                is_duplicate=True,
                                duplicate_of=existing.id,
                            )
                            db.add(finding)
                            await db.commit()
                            await db.refresh(finding)
                            finding_id = finding.id
                            await log(f"\n[FINDING:DUPLICATE] {title} (original id={existing.id}, nuevo id={finding_id})")
                        else:
                            finding = Finding(
                                session_id=scan_id,
                                severity=severity,
                                title=title,
                                description=description,
                                tool=tool,
                                phase=phase,
                                evidence=evidence,
                                cve=cve or None,
                                cvss=float(cvss) if cvss is not None else None,
                            )
                            db.add(finding)
                            await db.commit()
                            await db.refresh(finding)
                            finding_id = finding.id

                    findings_data.append({
                        "id": finding_id,
                        "severity": severity,
                        "title": title,
                        "description": description,
                        "tool": tool,
                        "phase": phase,
                        "evidence": evidence,
                        "cve": cve,
                        "cvss": cvss,
                    })

                    # Update findings count
                    async with session_maker() as db:
                        from sqlalchemy import func
                        result = await db.execute(
                            select(Finding.severity, func.count(Finding.id))
                            .where(Finding.session_id == scan_id)
                            .group_by(Finding.severity)
                        )
                        counts = {"critical": 0, "high": 0, "medium": 0, "low": 0, "info": 0}
                        for sev, cnt in result:
                            counts[sev.lower()] = cnt
                        await db.execute(
                            update(ScanSession)
                            .where(ScanSession.id == scan_id)
                            .values(findings_count=counts)
                        )
                        await db.commit()

                    await push("finding", {
                        "id": finding_id,
                        "severity": severity,
                        "title": title,
                        "description": description,
                        "tool": tool,
                        "phase": phase,
                        "evidence": evidence,
                        "cve": cve,
                        "cvss": cvss,
                        "created_at": datetime.utcnow().isoformat(),
                    })
                    await log(f"\n[FINDING:{severity}] {title}")

                    tool_results.append({
                        "tool_use_id": tool_use_id,
                        "content": f"Finding recorded with ID {finding_id}. Severity: {severity}. Continue scanning."
                    })
                    continue

                # ── Hexstrike tool call ──────────────────────────────────
                endpoint = TOOL_ENDPOINTS.get(tool_name)
                if not endpoint:
                    tool_results.append({
                        "tool_use_id": tool_use_id,
                        "content": f"Tool {tool_name} not found."
                    })
                    continue

                params = _build_hexstrike_params(tool_name, tool_input)
                await log(f"\n[TOOL] {tool_name} → {params}")

                try:
                    async with httpx.AsyncClient(timeout=TOOL_TIMEOUT) as http:
                        resp = await http.post(
                            f"{HEXSTRIKE_URL}{endpoint}",
                            json=params,
                            headers={"Content-Type": "application/json"}
                        )
                        result = resp.json()
                except httpx.TimeoutException:
                    result = {"error": f"Tool {tool_name} timed out after {TOOL_TIMEOUT}s", "status": "timeout"}
                except Exception as exc:
                    result = {"error": str(exc), "status": "error"}

                output = result.get("output", result.get("result", ""))
                error = result.get("error", "")
                summary = output[:2000] if output else (error[:500] if error else str(result)[:500])

                await log(f"[RESULT:{tool_name}]\n{summary}")

                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": tool_use_id,
                    "content": json.dumps(result)[:8000],  # cap at 8KB
                })

            provider.append_assistant_turn(messages, response)
            provider.append_tool_results(messages, tool_results)

        # ── Generate reports ─────────────────────────────────────────────
        await log("\n[HexStrike AI] Generando reporte técnico...")
        report_technical = await _generate_report(provider, _technical_report_prompt(target, findings_data, completed_phases))

        await log("[HexStrike AI] Generando reporte ejecutivo...")
        report_executive = await _generate_report(provider, _executive_report_prompt(target, findings_data, completed_phases))

        await log("\n[HexStrike AI] ✓ Pentest completado. Reportes disponibles.")

        # Persist reports and finalize
        async with session_maker() as db:
            await db.execute(
                update(ScanSession)
                .where(ScanSession.id == scan_id)
                .values(
                    status="completed",
                    report_technical=report_technical,
                    report_executive=report_executive,
                    current_phase="COMPLETADO",
                    completed_phases=completed_phases,
                    finished_at=datetime.utcnow(),
                    log="\n".join(log_buffer),
                )
            )
            await db.commit()

        await push("status", {"status": "completed"})
        await _fire_webhook(scan_id, "completed", findings_data, session_maker)

    except Exception as exc:
        import traceback
        tb = traceback.format_exc()
        await log(f"\n[ERROR] {exc}\n{tb}")
        try:
            await db_update(status="failed", log="\n".join(log_buffer), finished_at=datetime.utcnow())
        except Exception:
            pass
        await push("status", {"status": "failed"})

    finally:
        await sse_manager.close(scan_id)


async def _fire_webhook(scan_id: int, final_status: str, findings: List[dict], session_maker: async_sessionmaker):
    """POST scan summary to the configured webhook URL, if any."""
    try:
        from database import AsyncSessionLocal
        from models import AppSettings, ScanSession, Target
        from sqlalchemy import select

        async with session_maker() as db:
            settings_result = await db.execute(select(AppSettings).where(AppSettings.id == 1))
            settings = settings_result.scalar_one_or_none()
            if not settings or not settings.webhook_url:
                return

            if final_status == "completed" and not settings.webhook_on_complete:
                return

            has_critical = any(f.get("severity") == "CRITICAL" for f in findings)
            if has_critical and not settings.webhook_on_critical:
                return

            scan_result = await db.execute(select(ScanSession).where(ScanSession.id == scan_id))
            scan = scan_result.scalar_one_or_none()
            target_name = ""
            if scan:
                t_result = await db.execute(select(Target).where(Target.id == scan.target_id))
                t = t_result.scalar_one_or_none()
                target_name = t.name if t else ""

            payload = {
                "event": "scan_completed",
                "scan_id": scan_id,
                "status": final_status,
                "target": target_name,
                "profile": scan.profile if scan else "",
                "findings_count": scan.findings_count if scan else {},
                "total_findings": len(findings),
                "critical_count": sum(1 for f in findings if f.get("severity") == "CRITICAL"),
                "timestamp": datetime.utcnow().isoformat(),
            }

            async with httpx.AsyncClient(timeout=10) as http:
                await http.post(settings.webhook_url, json=payload)

    except Exception as exc:
        print(f"[Webhook] Failed to fire webhook: {exc}")


async def _generate_report(provider, prompt: str) -> str:
    try:
        text = await provider.generate(prompt, max_tokens=16000)
        return _strip_markdown_fences(text)
    except Exception as exc:
        return f"<p>Error generating report: {exc}</p>"


def _strip_markdown_fences(text: str) -> str:
    """Remove ```html ... ``` or ``` ... ``` wrappers Claude sometimes adds."""
    import re
    text = text.strip()
    # Remove leading ```html or ``` fence
    text = re.sub(r'^```(?:html)?\s*\n?', '', text, flags=re.IGNORECASE)
    # Remove trailing ``` fence
    text = re.sub(r'\n?```\s*$', '', text)
    return text.strip()
