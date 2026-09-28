// Mini markdown-renderer (geen externe afhankelijkheden).
// Ondersteunt: koppen, vet/cursief/doorhalen, `code`, codeblokken, links, kale URL's,
// (geneste) lijsten, genummerde lijsten, citaten, horizontale lijnen, tabellen,
// harde regeleinden (2 spaties of backslash aan regeleinde).
(function () {
  function esc(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function safeUrl(u) {
    u = u.trim();
    return /^(https?:|mailto:|tel:|#|\/|\.)/i.test(u) ? u : "#";
  }
  function inline(src) {
    var codes = [];
    var s = src.replace(/`([^`]+)`/g, function (_, c) { codes.push(c); return "\u0000" + (codes.length - 1) + "\u0000"; });
    s = esc(s);
    var links = [];
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+&quot;[^&]*&quot;)?\)/g, function (_, t, u) {
      links.push('<a href="' + safeUrl(u.replace(/&amp;/g, "&")).replace(/&(?!amp;)/g, "&amp;") + '" target="_blank" rel="noopener">' + t + "</a>");
      return "\u0001" + (links.length - 1) + "\u0001";
    });
    s = s.replace(/(^|[\s(])((?:https?:\/\/)[^\s<)]+[^\s<).,;:!?'])/g, function (_, pre, u) {
      links.push('<a href="' + u + '" target="_blank" rel="noopener">' + u + "</a>");
      return pre + "\u0001" + (links.length - 1) + "\u0001";
    });
    s = s.replace(/(^|[\s(])([\w.+-]+@[\w-]+\.[\w.-]*\w)/g, function (_, pre, m) {
      links.push('<a href="mailto:' + m + '">' + m + "</a>");
      return pre + "\u0001" + (links.length - 1) + "\u0001";
    });
    s = s.replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>")
         .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
         .replace(/(^|[^\w])__(.+?)__(?!\w)/g, "$1<strong>$2</strong>")
         .replace(/(^|[^*\w])\*(?!\s)(.+?)\*(?!\w)/g, "$1<em>$2</em>")
         .replace(/(^|[^\w])_(?!\s)(.+?)_(?!\w)/g, "$1<em>$2</em>")
         .replace(/~~(.+?)~~/g, "<del>$1</del>");
    s = s.replace(/\u0001(\d+)\u0001/g, function (_, i) { return links[+i]; });
    s = s.replace(/\u0000(\d+)\u0000/g, function (_, i) { return "<code>" + esc(codes[+i]) + "</code>"; });
    return s;
  }
  function lines2para(buf) {
    var html = buf.map(function (l, i) {
      var hard = /( {2,}|\\)$/.test(l) && i < buf.length - 1;
      return inline(l.replace(/( {2,}|\\)$/, "").trim()) + (hard ? "<br>" : "");
    }).join("\n");
    return "<p>" + html + "</p>";
  }
  function splitRow(r) {
    return r.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map(function (c) { return c.trim(); });
  }
  function renderList(lines, start) {
    // lines: array of {indent, ordered, text}
    var out = "", i = start, base = lines[start].indent, ordered = lines[start].ordered;
    out += ordered ? (lines[start].num > 1 ? '<ol start="' + lines[start].num + '">' : "<ol>") : "<ul>";
    while (i < lines.length && lines[i].indent >= base) {
      if (lines[i].indent > base) {
        var r = renderList(lines, i); out = out.replace(/<\/li>$/, "") + r.html + "</li>"; i = r.next; continue;
      }
      out += "<li>" + inline(lines[i].text) + "</li>"; i++;
    }
    out += ordered ? "</ol>" : "</ul>";
    return { html: out, next: i };
  }
  function render(md) {
    var L = String(md || "").replace(/\r\n?/g, "\n").split("\n");
    var out = [], i = 0, para = [];
    function flush() { if (para.length) { out.push(lines2para(para)); para = []; } }
    while (i < L.length) {
      var line = L[i], m;
      if (/^\s*```/.test(line)) {
        flush(); var code = []; i++;
        while (i < L.length && !/^\s*```/.test(L[i])) code.push(L[i++]);
        i++; out.push("<pre><code>" + esc(code.join("\n")) + "</code></pre>"); continue;
      }
      if (!line.trim()) { flush(); i++; continue; }
      if ((m = line.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/))) {
        flush(); var lv = Math.min(6, m[1].length + 1); // # -> h2 (h1 is de paginatitel)
        out.push("<h" + lv + ">" + inline(m[2]) + "</h" + lv + ">"); i++; continue;
      }
      if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { flush(); out.push("<hr>"); i++; continue; }
      if (/^\s*>/.test(line)) {
        flush(); var q = [];
        while (i < L.length && /^\s*>/.test(L[i])) q.push(L[i++].replace(/^\s*>\s?/, ""));
        out.push("<blockquote>" + render(q.join("\n")) + "</blockquote>"); continue;
      }
      if (/\|/.test(line) && i + 1 < L.length && /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(L[i + 1])) {
        flush(); var head = splitRow(line); i += 2; var rows = [];
        while (i < L.length && /\|/.test(L[i]) && L[i].trim()) rows.push(splitRow(L[i++]));
        var t = '<div class="table-wrap"><table><thead><tr>' + head.map(function (c) { return "<th>" + inline(c) + "</th>"; }).join("") + "</tr></thead><tbody>";
        rows.forEach(function (r) { t += "<tr>" + r.map(function (c) { return "<td>" + inline(c) + "</td>"; }).join("") + "</tr>"; });
        out.push(t + "</tbody></table></div>"); continue;
      }
      if (/^\s*([-*+]|\d+[.)])\s+/.test(line)) {
        flush(); var items = [];
        while (i < L.length) {
          var lm = L[i].match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
          if (lm) { items.push({ indent: lm[1].replace(/\t/g, "    ").length, ordered: /\d/.test(lm[2]), num: parseInt(lm[2], 10) || 1, text: lm[3].replace(/( {2,}|\\)$/, "") }); i++; continue; }
          if (L[i].trim() && /^\s+/.test(L[i]) && items.length) { // vervolgregel
            items[items.length - 1].text += "\n" + L[i].trim().replace(/( {2,}|\\)$/, ""); i++; continue;
          }
          break;
        }
        items.forEach(function (it) { it.text = it.text.split("\n").join("  \u2028"); });
        var html = renderList(items, 0).html.replace(/ {2}\u2028/g, "<br>");
        out.push(html); continue;
      }
      para.push(line); i++;
    }
    flush();
    return out.join("\n");
  }
  window.renderMarkdown = render;
})();
