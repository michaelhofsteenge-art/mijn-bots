#!/usr/bin/env python3
"""Herinneringen-API <-> reminders.json.

  python3 reminders_sync.py                 # pull API -> reminders.json (print lijst)
  python3 reminders_sync.py list            # idem, alleen tonen (JSON naar stdout)
  python3 reminders_sync.py mark <id> herinnerd|afgerond|gepland
  python3 reminders_sync.py seed            # POST alle items uit reminders.json (dedupe due+text)
Config: .reminders-api (MIJNBOTS_API=..., MIJNBOTS_KEY=...), niet in git.
"""
import json, os, sys, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
cfg = {}
for line in open(os.path.join(HERE, '.reminders-api')):
    if '=' in line:
        k, v = line.strip().split('=', 1); cfg[k] = v
API, KEY = cfg['MIJNBOTS_API'], cfg['MIJNBOTS_KEY']
JSON_PATH = os.path.join(HERE, 'reminders.json')

def call(method, path='', body=None):
    req = urllib.request.Request(API + path, method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={'X-Mijnbots-Key': KEY, 'Content-Type': 'application/json', 'User-Agent': 'mijnbots-sync'})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)

def pull():
    items = call('GET')
    with open(JSON_PATH, 'w') as f:
        json.dump(items, f, indent=2, ensure_ascii=False)
    return items

def main(a):
    cmd = a[0] if a else 'pull'
    if cmd == 'pull':
        print(json.dumps(pull(), indent=2, ensure_ascii=False))
    elif cmd == 'list':
        print(json.dumps(call('GET'), indent=2, ensure_ascii=False))
    elif cmd == 'mark' and len(a) == 3:
        print(json.dumps(call('PATCH', '/' + a[1], {'status': a[2]}), ensure_ascii=False)); pull()
    elif cmd == 'seed':
        for r in json.load(open(JSON_PATH)):
            print(call('POST', '', {k: r.get(k) for k in ('id', 'text', 'due', 'created', 'status', 'remindedAt')}))
        pull()
    else:
        print(__doc__); sys.exit(2)

if __name__ == '__main__':
    main(sys.argv[1:])
