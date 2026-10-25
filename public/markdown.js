import './vendor/marked.js';

const markdownSources = new WeakMap();
const markdownNode = (tag, className, text) => {
  const node = document.createElement(tag); if (className) node.className = className;
  if (text !== undefined) node.textContent = text; return node;
};

export async function copyText(text, button, label = 'Copy code') {
  try {
    await navigator.clipboard.writeText(text);
    button.textContent = 'Copied';
  } catch { button.textContent = 'Copy failed - select text'; }
  setTimeout(() => { if (button.isConnected) button.textContent = label; }, 2000);
}

// Parse Markdown with Marked, but build every element ourselves. Raw HTML stays
// literal; no response can introduce attributes, executable URLs or image loads.
function appendMarkdown(parent, tokens, depth = 0) {
  if (depth > 40) { parent.append(document.createTextNode(tokens.map(t => t.raw || t.text || '').join(''))); return; }
  for (const token of tokens) {
    let node;
    switch (token.type) {
      case 'space': continue;
      case 'heading': node = markdownNode(`h${Math.min(6, token.depth + 2)}`); break;
      case 'paragraph': node = markdownNode('p'); break;
      case 'strong': node = markdownNode('strong'); break;
      case 'em': node = markdownNode('em'); break;
      case 'del': node = markdownNode('del'); break;
      case 'blockquote': node = markdownNode('blockquote'); break;
      case 'codespan': parent.append(markdownNode('code', '', token.text)); continue;
      case 'br': parent.append(markdownNode('br'), '\n'); continue;
      case 'hr': parent.append(markdownNode('hr')); continue;
      case 'code': {
        node = markdownNode('div', 'code-block');
        const header = markdownNode('div', 'code-header'), button = markdownNode('button', 'button copy-code', 'Copy code');
        button.type = 'button'; button.onclick = () => copyText(token.text, button);
        button.setAttribute('aria-live', 'polite');
        header.append(markdownNode('span', '', token.lang?.split(/\s/)[0] || 'Code'), button);
        const pre = markdownNode('pre'); pre.tabIndex = 0; pre.setAttribute('aria-label', 'Code block');
        pre.append(markdownNode('code', '', token.text)); node.append(header, pre); parent.append(node); continue;
      }
      case 'list': {
        node = markdownNode(token.ordered ? 'ol' : 'ul');
        if (token.ordered && token.start !== 1) node.start = token.start;
        for (const item of token.items) {
          const li = markdownNode('li');
          if (item.task) {
            const box = markdownNode('input'); box.type = 'checkbox'; box.checked = item.checked; box.disabled = true;
            box.setAttribute('aria-label', item.checked ? 'Reported checked item' : 'Reported unchecked item'); li.append(box, ' ');
          }
          appendMarkdown(li, item.tokens, depth + 1); node.append(li);
        }
        parent.append(node); continue;
      }
      case 'table': {
        node = markdownNode('div', 'markdown-table'); node.tabIndex = 0;
        node.setAttribute('role', 'region'); node.setAttribute('aria-label', 'Response table; scroll horizontally');
        const table = markdownNode('table'), head = markdownNode('thead'), body = markdownNode('tbody');
        for (const [index, cells] of [token.header, ...token.rows].entries()) {
          const row = markdownNode('tr');
          for (const cell of cells) { const td = markdownNode(index ? 'td' : 'th'); appendMarkdown(td, cell.tokens, depth + 1); row.append(td); }
          (index ? body : head).append(row);
        }
        table.append(head, body); node.append(table); parent.append(node); continue;
      }
      case 'link': {
        try {
          // Only explicit external web/mail links are navigable. Relative and
          // custom-protocol references remain text, with no dashboard actions.
          const url = new URL(token.href);
          if (!['https:', 'http:', 'mailto:'].includes(url.protocol)) throw Error('Unsupported link');
          node = markdownNode('a'); node.href = url.href; node.target = '_blank'; node.rel = 'noopener noreferrer';
        } catch { node = markdownNode('span'); }
        break;
      }
      case 'image': parent.append(document.createTextNode(token.raw)); continue;
      case 'html': parent.append(document.createTextNode(token.raw)); continue;
      default:
        if (token.tokens) appendMarkdown(parent, token.tokens, depth + 1);
        else parent.append(document.createTextNode(token.text || token.raw || ''));
        continue;
    }
    appendMarkdown(node, token.tokens || [], depth + 1); parent.append(node);
  }
}

export function renderMarkdown(target, source = '') {
  if (markdownSources.get(target) === source) return;
  const fragment = document.createDocumentFragment();
  let plain = false;
  try {
    const tokens = globalThis.marked.lexer(source, { gfm: true, breaks: true }), blocks = tokens.filter(t => t.type !== 'space');
    plain = !blocks.length || blocks.length === 1 && (blocks[0].type === 'html' || blocks[0].type === 'paragraph' && blocks[0].tokens.every(t => ['text', 'br', 'html'].includes(t.type) && !t.tokens));
    if (plain) fragment.append(document.createTextNode(source)); else appendMarkdown(fragment, tokens);
  } catch { plain = true; fragment.append(document.createTextNode(source)); }
  target.replaceChildren(fragment); target.classList.add('markdown'); target.classList.toggle('markdown-plain', plain); markdownSources.set(target, source);
}
