import base64
import json
import logging
import os
import urllib.error
import urllib.request
import uuid
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

_PRIO_MAP = {"low": "Low", "medium": "Medium", "high": "High"}
_TYPE_MAP = {"support": "Soporte / Bug", "feature": "Nueva funcionalidad"}
_ISSUETYPE_MAP = {"support": "Solicitud", "feature": "Idea"}

_APP_TO_JIRA_STATUS = {
    "open":        "Por hacer",
    "in_progress": "En curso",
    "resolved":    "Listo",
    "closed":      "Listo",
}

_JIRA_TO_APP_STATUS = {
    "por hacer": "open",
    "en curso":  "in_progress",
    "listo":     "resolved",
    "done":      "resolved",
    "closed":    "closed",
}


def _enabled() -> bool:
    return all([
        os.getenv("JIRA_BASE_URL"),
        os.getenv("JIRA_EMAIL"),
        os.getenv("JIRA_API_TOKEN"),
        os.getenv("JIRA_PROJECT_KEY"),
    ])


def is_configured() -> bool:
    return _enabled()


def _auth_header() -> str:
    token = base64.b64encode(
        f"{os.getenv('JIRA_EMAIL')}:{os.getenv('JIRA_API_TOKEN')}".encode()
    ).decode()
    return f"Basic {token}"


def _base_headers() -> dict:
    return {
        "Authorization": _auth_header(),
        "Accept": "application/json",
        "Content-Type": "application/json",
    }


def _jira_get(path: str) -> dict | list | None:
    url = f"{os.getenv('JIRA_BASE_URL', '').rstrip('/')}{path}"
    req = urllib.request.Request(url, headers=_base_headers())
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return json.loads(r.read())
    except Exception as e:
        logger.warning("Jira GET %s error: %s", path, e)
        return None


def _upload_attachment(jira_key: str, filepath: str, filename: str, content_type: str) -> bool:
    boundary = uuid.uuid4().hex
    try:
        with open(filepath, "rb") as f:
            file_bytes = f.read()
    except OSError as e:
        logger.warning("Cannot read attachment %s: %s", filepath, e)
        return False

    body = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="file"; filename="{filename}"\r\n'
        f"Content-Type: {content_type}\r\n\r\n"
    ).encode() + file_bytes + f"\r\n--{boundary}--\r\n".encode()

    url = f"{os.getenv('JIRA_BASE_URL', '').rstrip('/')}/rest/api/3/issue/{jira_key}/attachments"
    headers = {
        "Authorization": _auth_header(),
        "X-Atlassian-Token": "no-check",
        "Content-Type": f"multipart/form-data; boundary={boundary}",
    }
    req = urllib.request.Request(url, data=body, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status in (200, 201)
    except urllib.error.HTTPError as e:
        logger.warning("Jira attachment upload %s error %s: %s", filename, e.code, e.read().decode())
    except Exception as e:
        logger.warning("Jira attachment upload %s error: %s", filename, e)
    return False


_UPLOAD_DIR = "/app/uploads"


def upload_attachments(jira_key: str, attachments: list) -> None:
    """Upload locally stored files to a Jira issue as attachments."""
    if not _enabled() or not jira_key or not attachments:
        return
    for att in attachments:
        url = att.get("url", "")
        stored_name = url.rsplit("/", 1)[-1] if "/" in url else url
        filepath = os.path.join(_UPLOAD_DIR, stored_name)
        original_name = att.get("name", stored_name)
        content_type = att.get("content_type", "application/octet-stream")
        ok = _upload_attachment(jira_key, filepath, original_name, content_type)
        if ok:
            logger.info("Uploaded attachment '%s' to Jira issue %s", original_name, jira_key)
        else:
            logger.warning("Failed to upload attachment '%s' to Jira issue %s", original_name, jira_key)


def _jira_post(path: str, payload: dict) -> dict | None:
    url = f"{os.getenv('JIRA_BASE_URL', '').rstrip('/')}{path}"
    req = urllib.request.Request(
        url, data=json.dumps(payload).encode(), headers=_base_headers(), method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return json.loads(r.read()) if r.length != 0 else {}
    except urllib.error.HTTPError as e:
        logger.warning("Jira POST %s error %s: %s", path, e.code, e.read().decode())
    except Exception as e:
        logger.warning("Jira POST %s error: %s", path, e)
    return None


def create_jira_issue(req) -> str | None:
    if not _enabled():
        return None

    client_name = os.getenv("JIRA_CLIENT_NAME", "")
    client = f"[{client_name}] " if client_name else ""
    user_name = getattr(req, "username", None) or "—"
    summary = f"{client}{req.subject}"

    description = {
        "type": "doc", "version": 1,
        "content": [
            {"type": "paragraph", "content": [{"type": "text", "text": f"Tipo: {_TYPE_MAP.get(req.type, req.type)}"}]},
            {"type": "paragraph", "content": [{"type": "text", "text": f"Prioridad: {_PRIO_MAP.get(req.priority, req.priority)}"}]},
            {"type": "paragraph", "content": [{"type": "text", "text": f"Solicitante: {user_name}"}]},
            {"type": "rule"},
            {"type": "paragraph", "content": [{"type": "text", "text": req.description}]},
        ],
    }

    labels = [req.type]
    if client_name:
        labels.append(client_name)

    body = _jira_post("/rest/api/3/issue", {
        "fields": {
            "project":     {"key": os.getenv("JIRA_PROJECT_KEY", "")},
            "summary":     summary,
            "description": description,
            "issuetype":   {"name": _ISSUETYPE_MAP.get(req.type, "Solicitud")},
            "priority":    {"name": _PRIO_MAP.get(req.priority, "Medium")},
            "labels":      labels,
        }
    })
    if body:
        key = body.get("key")
        logger.info("Jira issue created: %s", key)
        attachments = getattr(req, "attachments", None) or []
        if attachments:
            upload_attachments(key, attachments)
        return key
    return None


def transition_issue(jira_key: str, app_status: str) -> bool:
    if not _enabled() or not jira_key:
        return False

    target = _APP_TO_JIRA_STATUS.get(app_status)
    if not target:
        return False

    data = _jira_get(f"/rest/api/3/issue/{jira_key}/transitions")
    if not data:
        return False

    transition_id = None
    for t in data.get("transitions", []):
        if t.get("to", {}).get("name", "").lower() == target.lower():
            transition_id = t["id"]
            break

    if not transition_id:
        logger.warning("No Jira transition found for status '%s' on %s", target, jira_key)
        return False

    result = _jira_post(f"/rest/api/3/issue/{jira_key}/transitions", {"transition": {"id": transition_id}})
    if result is not None:
        logger.info("Transitioned %s → %s", jira_key, target)
        return True
    return False


def add_comment(jira_key: str, body_text: str, author: str, attachments: list | None = None) -> str | None:
    if not _enabled() or not jira_key:
        return None

    payload = {
        "body": {
            "type": "doc", "version": 1,
            "content": [
                {"type": "paragraph", "content": [
                    {"type": "text", "text": f"[{author}] ", "marks": [{"type": "strong"}]},
                    {"type": "text", "text": body_text},
                ]},
            ],
        }
    }
    result = _jira_post(f"/rest/api/3/issue/{jira_key}/comment", payload)
    if result:
        jira_id = result.get("id")
        logger.info("Added comment %s to %s", jira_id, jira_key)
        if attachments:
            upload_attachments(jira_key, attachments)
        return jira_id
    return None


def _parse_jira_ts(ts: str | None) -> datetime | None:
    if not ts:
        return None
    for fmt in ("%Y-%m-%dT%H:%M:%S.%f%z", "%Y-%m-%dT%H:%M:%S%z"):
        try:
            dt = datetime.strptime(ts, fmt)
            return dt.astimezone(timezone.utc).replace(tzinfo=None)
        except ValueError:
            continue
    return None


def fetch_comments(jira_key: str) -> list[dict]:
    if not _enabled() or not jira_key:
        return []
    data = _jira_get(f"/rest/api/3/issue/{jira_key}/comment?maxResults=100")
    if not data:
        return []
    result = []
    for c in data.get("comments", []):
        body_text = _extract_text(c.get("body", {}))
        result.append({
            "jira_comment_id": c["id"],
            "author": c.get("author", {}).get("displayName", "Jira"),
            "body": body_text,
            "created_at_dt": _parse_jira_ts(c.get("created")),
        })
    return result


def _extract_text(adf_node: dict) -> str:
    if adf_node.get("type") == "text":
        return adf_node.get("text", "")
    return "".join(_extract_text(child) for child in adf_node.get("content", []))


def fetch_issue_status(jira_key: str) -> str | None:
    if not _enabled() or not jira_key:
        return None
    data = _jira_get(f"/rest/api/3/issue/{jira_key}?fields=status")
    if not data:
        return None
    status_name = data.get("fields", {}).get("status", {}).get("name", "").lower()
    return _JIRA_TO_APP_STATUS.get(status_name)
