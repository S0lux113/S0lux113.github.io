/*!
 * BlogMarkdown — 轻量 Markdown 渲染器（无依赖）
 * 支持：标题、段落、粗体/斜体/删除线、行内代码、围栏代码块、引用、有序/无序列表（一层嵌套）、
 *      链接、图片、分割线、表格、硬换行；生成标题锚点与目录数据。
 * 所有文本先做 HTML 转义，链接协议做白名单，避免注入。
 */
(function (global) {
  'use strict';

  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function safeUrl(url) {
    var value = String(url == null ? '' : url).trim();
    if (!value) return '#';
    if (/^(javascript|vbscript|data):/i.test(value)) return '#';
    if (/^(https?:|mailto:|tel:|#|\/|\.\/|\.\.\/)/i.test(value)) return value;
    return '#' + value;
  }

  function slugify(text) {
    var slug = String(text || '')
      .replace(/<[^>]*>/g, '')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/[*_~`]/g, '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^\w\u4e00-\u9fa5-]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '');
    return slug || 'section';
  }

  function uniqueSlug(base, used) {
    var slug = base;
    var n = 2;
    while (used[slug]) {
      slug = base + '-' + n;
      n++;
    }
    used[slug] = true;
    return slug;
  }

  function plainInline(text) {
    return String(text || '')
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/[*_~`]/g, '')
      .trim();
  }

  var CODE_TOKEN = '\u0001';

  function inline(text) {
    var out = escapeHtml(text);
    var codes = [];

    out = out.replace(/`([^`\n]+)`/g, function (m, code) {
      codes.push(code);
      return CODE_TOKEN + (codes.length - 1) + CODE_TOKEN;
    });

    out = out.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, function (m, alt, url) {
      return '<img src="' + safeUrl(url) + '" alt="' + alt + '" loading="lazy">';
    });

    out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function (m, label, url) {
      var href = safeUrl(url);
      var external = /^https?:/i.test(href);
      return '<a href="' + href + '"' + (external ? ' target="_blank" rel="noopener noreferrer"' : '') + '>' + label + '</a>';
    });

    out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    out = out.replace(/__([^_]+)__/g, '<strong>$1</strong>');
    out = out.replace(/~~([^~]+)~~/g, '<del>$1</del>');
    out = out.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
    out = out.replace(/(^|[\s(（])_([^_\n]+)_/g, '$1<em>$2</em>');

    out = out.replace(new RegExp(CODE_TOKEN + '(\\d+)' + CODE_TOKEN, 'g'), function (m, i) {
      return '<code>' + codes[Number(i)] + '</code>';
    });

    return out;
  }

  function codeBlock(code, lang) {
    var label = lang || 'code';
    return '<figure class="codeblock">' +
      '<figcaption><span>' + escapeHtml(label) + '</span>' +
      '<button class="codeblock__copy" type="button" data-copy-code aria-label="复制代码">复制</button></figcaption>' +
      '<pre><code class="language-' + escapeHtml(label) + '">' + escapeHtml(code) + '</code></pre>' +
      '</figure>';
  }

  function listHtml(items) {
    var ordered = items[0] && items[0].ordered;
    var tag = ordered ? 'ol' : 'ul';
    var body = items.map(function (item) {
      var inner = inline(item.text).replace(/\n/g, '<br>');
      var children = item.children.length ? listHtml(item.children) : '';
      return '<li>' + inner + children + '</li>';
    }).join('');
    return '<' + tag + '>' + body + '</' + tag + '>';
  }

  function parseList(lines, start) {
    var roots = [];
    var last = null;
    var rootOrdered = null;
    var i = start;

    while (i < lines.length) {
      var line = lines[i];
      var match = line.match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
      if (match) {
        var indent = match[1].replace(/\t/g, '    ').length;
        var item = { indent: indent, ordered: /\d/.test(match[2]), text: match[3], children: [] };
        if (indent >= 2 && roots.length) {
          roots[roots.length - 1].children.push(item);
        } else {
          if (rootOrdered === null) rootOrdered = item.ordered;
          else if (item.ordered !== rootOrdered) break;
          roots.push(item);
        }
        last = item;
        i++;
        continue;
      }
      if (!line.trim()) {
        if (i + 1 < lines.length && /^\s*([-*+]|\d+[.)])\s+/.test(lines[i + 1])) {
          i++;
          continue;
        }
        break;
      }
      if (/^\s{2,}\S/.test(line) && last) {
        last.text += '\n' + line.trim();
        i++;
        continue;
      }
      break;
    }

    return { html: listHtml(roots), next: i };
  }

  function splitRow(line) {
    return line.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map(function (cell) {
      return cell.trim();
    });
  }

  function parseTable(lines, start) {
    var aligns = splitRow(lines[start + 1]).map(function (cell) {
      if (/^:-+:$/.test(cell)) return 'center';
      if (/^:-+$/.test(cell)) return 'left';
      if (/^-+:$/.test(cell)) return 'right';
      return '';
    });

    var head = splitRow(lines[start]);
    var rows = [];
    var i = start + 2;
    while (i < lines.length && lines[i].trim() && lines[i].indexOf('|') !== -1) {
      rows.push(splitRow(lines[i]));
      i++;
    }

    function cell(tag, text, index) {
      var align = aligns[index];
      return '<' + tag + (align ? ' style="text-align:' + align + '"' : '') + '>' + inline(text) + '</' + tag + '>';
    }

    var html = '<div class="table-wrap"><table><thead><tr>';
    head.forEach(function (text, index) { html += cell('th', text, index); });
    html += '</tr></thead><tbody>';
    rows.forEach(function (row) {
      html += '<tr>';
      for (var c = 0; c < head.length; c++) html += cell('td', row[c] || '', c);
      html += '</tr>';
    });
    html += '</tbody></table></div>';

    return { html: html, next: i };
  }

  function isBlockStart(line) {
    return /^(```|~~~)/.test(line) ||
      /^#{1,6}\s+/.test(line) ||
      /^>\s?/.test(line) ||
      /^(\s*)([-*+]|\d+[.)])\s+/.test(line) ||
      /^(\*\s*){3,}$|^(-\s*){3,}$|^(_\s*){3,}$/.test(line.trim());
  }

  function parseBlocks(lines, headings, used, topLevel) {
    var out = [];
    var i = 0;

    while (i < lines.length) {
      var line = lines[i];
      if (!line.trim()) { i++; continue; }

      var fence = line.match(/^(```|~~~)\s*([\w+#-]*)\s*$/);
      if (fence) {
        var marker = fence[1];
        var lang = fence[2] || '';
        var buf = [];
        i++;
        while (i < lines.length && lines[i].trim() !== marker) { buf.push(lines[i]); i++; }
        if (i < lines.length) i++;
        out.push(codeBlock(buf.join('\n'), lang));
        continue;
      }

      var heading = line.match(/^(#{1,6})\s+(.*)$/);
      if (heading) {
        var level = heading[1].length;
        var raw = heading[2].replace(/\s+#+\s*$/, '');
        var plain = plainInline(raw);
        var id = uniqueSlug(slugify(plain), used);
        if (topLevel && (level === 2 || level === 3)) {
          headings.push({ level: level, text: plain, id: id });
        }
        out.push('<h' + level + ' id="' + id + '">' + inline(raw) + '</h' + level + '>');
        i++;
        continue;
      }

      if (/^(\*\s*){3,}$|^(-\s*){3,}$|^(_\s*){3,}$/.test(line.trim())) {
        out.push('<hr>');
        i++;
        continue;
      }

      if (/^>\s?/.test(line)) {
        var quote = [];
        while (i < lines.length && /^>/.test(lines[i])) {
          quote.push(lines[i].replace(/^>\s?/, ''));
          i++;
        }
        out.push('<blockquote>' + parseBlocks(quote, [], Object.create(null), false) + '</blockquote>');
        continue;
      }

      if (line.indexOf('|') !== -1 && i + 1 < lines.length &&
        /^\s*\|?[\s:|-]*-[\s:|-]*\|[\s:|-]*$/.test(lines[i + 1])) {
        var table = parseTable(lines, i);
        out.push(table.html);
        i = table.next;
        continue;
      }

      if (/^\s*([-*+]|\d+[.)])\s+/.test(line)) {
        var list = parseList(lines, i);
        out.push(list.html);
        i = list.next;
        continue;
      }

      var para = [];
      while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i])) {
        para.push(lines[i]);
        i++;
      }
      out.push('<p>' + inline(para.join('\n')).replace(/\n/g, '<br>') + '</p>');
    }

    return out.join('\n');
  }

  function render(source) {
    var lines = String(source == null ? '' : source).replace(/\r\n?/g, '\n').split('\n');
    var headings = [];
    var html = parseBlocks(lines, headings, Object.create(null), true);
    return { html: html, headings: headings };
  }

  global.BlogMarkdown = { render: render, escapeHtml: escapeHtml, slugify: slugify };
})(window);
