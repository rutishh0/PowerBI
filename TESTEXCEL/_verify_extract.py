"""Extract the embedded JSON payload from each HTML file in TESTEXCEL.
Writes _payloads/{name}.json for inspection. Independent of builders."""
import re, json, os, sys

OUT_DIR = os.path.join(os.path.dirname(__file__), '_payloads')
os.makedirs(OUT_DIR, exist_ok=True)

def extract_brace_object(text, start_idx):
    """Find the JSON object starting at first '{' after start_idx. Brace-count."""
    start = text.find('{', start_idx)
    if start < 0:
        return None
    depth = 0
    in_str = False
    esc = False
    i = start
    while i < len(text):
        c = text[i]
        if esc:
            esc = False
        elif c == '\\':
            esc = True
        elif c == '"':
            in_str = not in_str
        elif not in_str:
            if c == '{':
                depth += 1
            elif c == '}':
                depth -= 1
                if depth == 0:
                    return text[start:i+1]
        i += 1
    return None


def extract_payload(html, fname):
    # Pattern 1: <script id="...data..."> ... </script>  (pure JSON inside)
    m = re.search(r'<script[^>]*id=["\']([^"\']*(data|payload)[^"\']*)["\'][^>]*>(.*?)</script>',
                  html, re.DOTALL | re.IGNORECASE)
    if m:
        inner = m.group(3).strip()
        try:
            return json.loads(inner), f'script#{m.group(1)}'
        except Exception as e:
            return None, f'script-tag-json-fail:{e}'

    # Pattern 2: const DATA = {...};
    for varname in ('DATA', 'D', 'HOPPER', 'SVRG', 'MEA', 'SOA'):
        idx = html.find(f'const {varname} = ')
        if idx < 0:
            idx = html.find(f'const {varname}=')
        if idx >= 0:
            obj_txt = extract_brace_object(html, idx)
            if obj_txt:
                try:
                    return json.loads(obj_txt), f'const-{varname}'
                except Exception as e:
                    return None, f'const-{varname}-parse-fail:{e}'
    return None, 'no-pattern-matched'


def main():
    here = os.path.dirname(__file__)
    for f in sorted(os.listdir(here)):
        if not f.endswith('.html'):
            continue
        path = os.path.join(here, f)
        sz = os.path.getsize(path)
        with open(path, encoding='utf-8', errors='replace') as fp:
            html = fp.read()
        d, how = extract_payload(html, f)
        if d is None:
            print(f'FAIL {f} size={sz} how={how}')
            continue
        out = os.path.join(OUT_DIR, f.replace('.html', '.json'))
        with open(out, 'w', encoding='utf-8') as fp:
            json.dump(d, fp)
        print(f'OK   {f} size={sz} how={how} top_keys={list(d.keys())[:15]}')

if __name__ == '__main__':
    main()
