"""Parse a MySQL dump from the Bluehost marketing4u DB into Python structures.

Handles multi-row INSERTs, quoted strings with escapes, NULLs and numbers.
Used by the migration generator; safe to run repeatedly (read-only).
"""
import re
import sys


def split_tuples(vals: str):
    """Split `(...),(...)` at top level, respecting quotes and escapes."""
    out, buf, depth, in_str, esc = [], [], 0, False, False
    for ch in vals:
        if in_str:
            buf.append(ch)
            if esc:
                esc = False
            elif ch == '\\':
                esc = True
            elif ch == "'":
                in_str = False
            continue
        if ch == "'":
            in_str = True
            buf.append(ch)
        elif ch == '(':
            depth += 1
            if depth == 1:
                buf = []
            else:
                buf.append(ch)
        elif ch == ')':
            depth -= 1
            if depth == 0:
                out.append(''.join(buf))
            else:
                buf.append(ch)
        elif depth > 0:
            buf.append(ch)
    return out


def split_values(tup: str):
    """Split one tuple's comma-separated values, respecting quotes."""
    out, buf, in_str, esc = [], [], False, False
    for ch in tup:
        if in_str:
            if esc:
                buf.append(ch); esc = False
            elif ch == '\\':
                buf.append(ch); esc = True
            elif ch == "'":
                in_str = False
            else:
                buf.append(ch)
            continue
        if ch == "'":
            in_str = True
        elif ch == ',':
            out.append(''.join(buf).strip()); buf = []
        else:
            buf.append(ch)
    out.append(''.join(buf).strip())
    return [None if v == 'NULL' else v for v in out]


def parse(path: str):
    """-> {table: {'cols': [...], 'rows': [[...], ...]}}"""
    sql = open(path, encoding='utf8', errors='replace').read()
    data = {}
    for m in re.finditer(r"INSERT INTO `([a-z_]+)` \(([^)]*)\) VALUES\s*(.*?);\s*\n", sql, re.S):
        table, colspec, vals = m.group(1), m.group(2), m.group(3)
        cols = [c.strip().strip('`') for c in colspec.split(',')]
        entry = data.setdefault(table, {'cols': cols, 'rows': []})
        for tup in split_tuples(vals):
            entry['rows'].append(split_values(tup))
    return data


if __name__ == '__main__':
    d = parse(sys.argv[1])
    for t in sorted(d):
        bad = [r for r in d[t]['rows'] if len(r) != len(d[t]['cols'])]
        print(f"{t:18} rows={len(d[t]['rows']):5}  cols={len(d[t]['cols'])}  malformed={len(bad)}")
