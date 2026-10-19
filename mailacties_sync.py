#!/usr/bin/env python3
"""Mailacties-API (Email Reageren openstaand-lijst).

  python3 mailacties_sync.py sync <items.json>   # volledige lijst van NU openstaande mails (upsert;
                                                 #  open items die ontbreken -> 'weg')
  python3 mailacties_sync.py list                # alle items (open/done/weg) als JSON
  python3 mailacties_sync.py set-link <id> <url>   # alleen de mail-link van één item zetten (Outlook webLink / Gmail)
  python3 mailacties_sync.py set-body <id> <file>  # mailtekst (preview, max 2000 tekens) van één item zetten
  python3 mailacties_sync.py pending-delete        # items die in de app 'Afgerond' kregen en in Outlook naar
                                                   #  Verwijderde items moeten (outlookDelete == 'pending')
  python3 mailacties_sync.py mark-deleted <id>     # melden dat de mail in Outlook verplaatst is
  python3 mailacties_sync.py seed-md <update.md>  # parse '- Sender (mailbox): actie [id:slug]' regels -> sync
items.json: {"items":[{"id":"slug","text":"...","sender":"...","mailbox":"Outlook",
             "received":"2026-10-11T13:05","deadline":null,
             "body":"<bodyPreview of platte tekst, max 2000 tekens>",
             "link":"<Outlook webLink uit Graph | https://mail.google.com/mail/u/0/#all/<threadId>>"}]}  (of direct een lijst)
  'link' is optioneel; zonder link blijft een eerder opgeslagen link staan. Alleen https-links naar
  outlook.live.com / outlook.office(365).com / mail.google.com worden bewaard (tikken op de tekst in de app opent die mail).
Config: .reminders-api (MIJNBOTS_API=.../api/reminders, MIJNBOTS_KEY=...).
"""
import json, os, re, sys, unicodedata, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
cfg = {}
for line in open(os.path.join(HERE, '.reminders-api')):
    if '=' in line:
        k, v = line.strip().split('=', 1); cfg[k] = v
API = cfg.get('MAILACTIES_API') or cfg['MIJNBOTS_API'].rsplit('/', 1)[0] + '/mailacties'
KEY = cfg['MIJNBOTS_KEY']

def call(method, path='', body=None):
    req = urllib.request.Request(API + path, method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={'X-Mijnbots-Key': KEY, 'Content-Type': 'application/json', 'User-Agent': 'mijnbots-sync'})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)

def slug(s):
    s = unicodedata.normalize('NFD', s); s = ''.join(c for c in s if not unicodedata.combining(c))
    return re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')[:80] or 'item'

LINE = re.compile(r'^\s*-\s+(.+)$'); TAG = re.compile(r'\s*\[id:\s*([^\]]+?)\s*\]\s*', re.I)
def parse_md(md):
    items = []
    for line in md.splitlines():
        m = LINE.match(line)
        if not m: continue
        raw = re.sub(r'\s+', ' ', m.group(1)).strip()
        t = TAG.search(raw); text = TAG.sub(' ', raw).strip() if t else raw
        cut = len(text)
        for sep in (' (', ':'):
            i = text.find(sep)
            if 0 <= i < cut: cut = i
        sender = text[:cut].strip(); rest = text[cut:]
        mb = re.match(r'^\s*\(([^)]*)\)', rest)
        mailbox = mb.group(1) if mb else ''
        action = re.sub(r'^\s*(\([^)]*\))?\s*:?\s*', '', rest).strip() or text
        iid = slug(t.group(1)) if t else slug(sender)
        items.append({'id': iid, 'text': action, 'sender': sender, 'mailbox': mailbox})
    return items

def main(a):
    if a[:1] == ['list']:
        print(json.dumps(call('GET'), indent=2, ensure_ascii=False))
    elif a[:1] == ['sync'] and len(a) == 2:
        d = json.load(open(a[1])); items = d['items'] if isinstance(d, dict) else d
        print(json.dumps(call('POST', '/sync', {'items': items}), ensure_ascii=False))
    elif a[:1] == ['set-link'] and len(a) == 3:
        print(json.dumps(call('PATCH', '/' + a[1], {'link': a[2]}), ensure_ascii=False))
    elif a[:1] == ['set-body'] and len(a) == 3:
        print(json.dumps(call('PATCH', '/' + a[1], {'body': open(a[2]).read()}), ensure_ascii=False))
    elif a[:1] == ['pending-delete']:
        print(json.dumps([i for i in call('GET') if i.get('outlookDelete') == 'pending'], indent=2, ensure_ascii=False))
    elif a[:1] == ['mark-deleted'] and len(a) == 2:
        print(json.dumps(call('PATCH', '/' + a[1], {'outlookDeleted': True}), ensure_ascii=False))
    elif a[:1] == ['seed-md'] and len(a) == 2:
        items = parse_md(open(a[1]).read())
        print(json.dumps(items, indent=1, ensure_ascii=False))
        print(json.dumps(call('POST', '/sync', {'items': items}), ensure_ascii=False))
    else:
        print(__doc__); sys.exit(2)

if __name__ == '__main__':
    main(sys.argv[1:])
