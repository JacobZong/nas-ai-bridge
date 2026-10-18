#!/usr/bin/env python3
"""Mail a digest when the NAS MCP gate sees logins, new clients or grants.

Runs from nas-mcp-alert.timer on the Vultr gate. Reads mcp-auth-proxy's
journal since the saved cursor; the first run only records the cursor.
Config: /etc/nas-mcp-alert/env (RESEND_ALERT_API_KEY, ALERT_FROM, ALERT_TO;
optional ALERT_QUIET_IPS = comma-separated home IPs whose agent self-tests are not mailed).
"""
import collections, html, json, os, subprocess, sys, urllib.request

STATE = "/var/lib/nas-mcp-alert"
CURSOR = os.path.join(STATE, "cursor")
UNIT = "mcp-auth-proxy"

# (method, path prefix, status predicate) -> label; order matters
RULES = [
    ("POST", "/.auth/login", lambda s: s == 302, "密碼登入成功"),
    ("POST", "/.auth/login", lambda s: s != 302, "密碼登入失敗"),
    ("POST", "/.idp/register", lambda s: s == 201, "新客戶端註冊"),
    ("POST", "/.idp/auth/", lambda s: s == 303, "授權允許（客戶端取得存取權）"),
]

SELF_TEST_UA = "nas-mcp-check"  # scripts/nas_mcp_check.py sets this on every request
QUIET_IPS = {ip.strip() for ip in os.environ.get("ALERT_QUIET_IPS", "").split(",") if ip.strip()}


def is_noise(ev):
    # A self-test needs both the checker's UA and a home IP: a forged UA alone still mails.
    if (ev.get("user-agent") or "").startswith(SELF_TEST_UA) and ev.get("ip") in QUIET_IPS:
        return True
    # Go's ReverseProxy raises this when a streaming client or the NAS drops mid-response.
    return ev.get("error") == "net/http: abort Handler"


def classify(ev):
    for method, prefix, ok, label in RULES:
        p = ev.get("path") or ""
        if ev.get("method") == method and (p == prefix or (prefix.endswith("/") and p.startswith(prefix))) and ok(ev.get("status")):
            return label
    if (ev.get("message") or "").startswith("[Recovery from panic]"):
        return "閘門程式錯誤（panic，已自動恢復）"
    return None


def read_journal(first_run):
    if first_run:
        # Start from the newest entry: history before installation is not mailed.
        last = subprocess.run(["journalctl", "-u", UNIT, "-n", "1", "-o", "json", "--no-pager"],
                              check=True, capture_output=True, text=True).stdout.strip()
        with open(CURSOR, "w") as f:
            f.write(json.loads(last)["__CURSOR"] if last else "")
        return []
    args = ["journalctl", "-u", UNIT, "-o", "cat", "--no-pager", "--cursor-file", CURSOR]
    out = subprocess.run(args, check=True, capture_output=True, text=True).stdout
    events = []
    for line in out.splitlines():
        if not line.startswith("{"):
            continue
        try:
            ev = json.loads(line)
        except ValueError:
            continue
        label = classify(ev)
        if label and not is_noise(ev):
            events.append((label, ev))
    return events


def send(events, env):
    counts = collections.Counter(label for label, _ in events)
    subject = "NAS Files 閘門活動：" + "、".join(f"{k} {v}" for k, v in counts.items())
    rows = "".join(
        "<tr><td>{}</td><td>{}</td><td>{}</td><td>{}</td></tr>".format(
            html.escape((ev.get("timestamp") or "")[:19].replace("T", " ") + " UTC"),
            html.escape(label), html.escape(ev.get("ip") or "-"), html.escape(ev.get("user-agent") or "-"))
        for label, ev in events[-50:])
    body = (
        "<p>mcp.nas.hisamori.app 的登入閘門剛記錄到以下活動。</p>"
        "<p>如果不是你或你的 AI 應用做的，立刻在 Mac 執行：<br>"
        "<code>python3 ~/.ai/skills/nas-mcp-remote-access/scripts/nas_mcp_revoke.py --apply</code><br>"
        "它會換掉登入密碼並讓所有已連線的客戶端失效。</p>"
        "<table border='1' cellpadding='6' cellspacing='0' style='border-collapse:collapse;font-size:13px'>"
        "<tr><th>時間</th><th>事件</th><th>IP</th><th>User-Agent</th></tr>" + rows + "</table>"
        + ("<p>（只列最後 50 筆，共 {} 筆）</p>".format(len(events)) if len(events) > 50 else ""))
    req = urllib.request.Request(
        "https://api.resend.com/emails", method="POST",
        data=json.dumps({"from": env["ALERT_FROM"], "to": [env["ALERT_TO"]], "subject": subject, "html": body}).encode(),
        headers={"Authorization": "Bearer " + env["RESEND_ALERT_API_KEY"], "Content-Type": "application/json",
                 "User-Agent": "nas-mcp-alert/1"})
    with urllib.request.urlopen(req, timeout=30) as r:
        if r.status >= 300:
            raise RuntimeError(f"Resend HTTP {r.status}")


def main():
    env = {k: os.environ.get(k, "") for k in ("RESEND_ALERT_API_KEY", "ALERT_FROM", "ALERT_TO")}
    if not all(env.values()):
        sys.exit("missing RESEND_ALERT_API_KEY / ALERT_FROM / ALERT_TO")
    os.makedirs(STATE, mode=0o700, exist_ok=True)
    first_run = not os.path.exists(CURSOR)
    if "--test" in sys.argv:
        send([("測試通知（設定驗證）", {"timestamp": "", "ip": "-", "user-agent": "nas-mcp-alert --test"})], env)
        print("test mail sent")
        return
    # Snapshot the cursor so a failed send is retried on the next run instead of lost.
    old = open(CURSOR).read() if not first_run else None
    events = read_journal(first_run)
    if not events:
        return
    try:
        send(events, env)
    except Exception:
        if old is not None:
            with open(CURSOR, "w") as f:
                f.write(old)
        raise
    print(f"mailed {len(events)} events")


if __name__ == "__main__":
    main()
