#!/usr/bin/env python3
# Conversor MD->HTML focado (sem libs): headers, tabelas GFM, blockquotes (com listas),
# negrito, codigo inline, hr. Uso: python3 md_to_html.py entrada.md saida.html
import sys, re, html

def inline(t):
    t = html.escape(t)
    t = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', t)
    t = re.sub(r'`(.+?)`', r'<code>\1</code>', t)
    return t

def main():
    src, out = sys.argv[1], sys.argv[2]
    lines = open(src, encoding='utf-8').read().split('\n')
    htmlparts = []
    i = 0
    n = len(lines)
    while i < n:
        line = lines[i]
        s = line.strip()
        # Tabela: linha que começa e termina com |
        if s.startswith('|') and i + 1 < n and re.match(r'^\|[\s:-|]+\|$', lines[i+1].strip()):
            header = [c.strip() for c in s.strip('|').split('|')]
            i += 2  # pula header + separador
            rows = []
            while i < n and lines[i].strip().startswith('|'):
                rows.append([c.strip() for c in lines[i].strip().strip('|').split('|')])
                i += 1
            t = ['<table>', '<thead><tr>'] + [f'<th>{inline(c)}</th>' for c in header] + ['</tr></thead>', '<tbody>']
            for r in rows:
                t.append('<tr>' + ''.join(f'<td>{inline(c)}</td>' for c in r) + '</tr>')
            t.append('</tbody></table>')
            htmlparts.append(''.join(t))
            continue
        # Blockquote: linhas começando com >
        if s.startswith('>'):
            block = []
            while i < n and lines[i].strip().startswith('>'):
                block.append(lines[i].strip()[1:].strip())
                i += 1
            inner = []
            j = 0
            while j < len(block):
                if block[j].startswith('- '):
                    inner.append('<ul>')
                    while j < len(block) and block[j].startswith('- '):
                        inner.append(f'<li>{inline(block[j][2:])}</li>')
                        j += 1
                    inner.append('</ul>')
                else:
                    if block[j]:
                        inner.append(f'<p>{inline(block[j])}</p>')
                    j += 1
            htmlparts.append('<blockquote>' + ''.join(inner) + '</blockquote>')
            continue
        # Header
        if s.startswith('## '):
            htmlparts.append(f'<h2>{inline(s[3:])}</h2>'); i += 1; continue
        if s.startswith('# '):
            htmlparts.append(f'<h1>{inline(s[2:])}</h1>'); i += 1; continue
        # HR
        if s == '---':
            htmlparts.append('<hr>'); i += 1; continue
        # Lista solta
        if s.startswith('- '):
            items = []
            while i < n and lines[i].strip().startswith('- '):
                items.append(f'<li>{inline(lines[i].strip()[2:])}</li>')
                i += 1
            htmlparts.append('<ul>' + ''.join(items) + '</ul>')
            continue
        # Parágrafo / vazio
        if s:
            htmlparts.append(f'<p>{inline(s)}</p>')
        i += 1

    css = """
    @page { size: A4; margin: 18mm 16mm; }
    * { box-sizing: border-box; }
    body { font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif; color: #1a2233; line-height: 1.5; font-size: 12.5px; }
    h1 { color: #0d1b2a; font-size: 22px; margin: 0 0 4px; border-bottom: 3px solid #38bdf8; padding-bottom: 8px; }
    h2 { color: #0d1b2a; font-size: 15px; margin: 22px 0 8px; padding-left: 9px; border-left: 4px solid #22c55e; }
    p { margin: 6px 0; }
    code { background: #eef2f7; color: #b5179e; padding: 1px 5px; border-radius: 4px; font-size: 0.92em; }
    strong { color: #0d1b2a; }
    hr { border: none; border-top: 1px solid #e2e8f0; margin: 16px 0; }
    table { border-collapse: collapse; width: 100%; margin: 8px 0 14px; font-size: 11.5px; page-break-inside: avoid; }
    th { background: #0d1b2a; color: #fff; text-align: left; padding: 7px 10px; font-weight: 700; }
    td { padding: 6px 10px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
    tr:nth-child(even) td { background: #f7f9fc; }
    blockquote { background: #f0f9ff; border-left: 4px solid #38bdf8; margin: 10px 0; padding: 8px 14px; border-radius: 0 8px 8px 0; }
    blockquote p { margin: 4px 0; }
    ul { margin: 4px 0; padding-left: 22px; }
    li { margin: 3px 0; }
    """
    doc = f"<!DOCTYPE html><html lang='pt-br'><head><meta charset='utf-8'><style>{css}</style></head><body>{''.join(htmlparts)}</body></html>"
    open(out, 'w', encoding='utf-8').write(doc)
    print('HTML escrito:', out)

main()
