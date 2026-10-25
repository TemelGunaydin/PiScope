"""Workspace features over real HTTP/SSE, synthetic records, no model calls."""
import argparse
import atexit
import json
import os
import shutil
import subprocess
import urllib.request
import uuid
from datetime import datetime, timezone, timedelta
from pathlib import Path
from urllib.parse import parse_qs, urlparse
from playwright.sync_api import sync_playwright, expect

parser = argparse.ArgumentParser()
parser.add_argument('--tailscale', action='store_true')
parser.add_argument('--output-dir', default='test-results/workspace')
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
output = Path(args.output_dir).resolve(); output.mkdir(parents=True, exist_ok=True)
child = subprocess.Popen(['node', 'test/browser-fixture.mjs'] + (['--tailscale'] if args.tailscale else []), cwd=root, stdout=subprocess.PIPE, text=True)
def close():
    child.terminate()
    try: child.wait(timeout=5)
    except subprocess.TimeoutExpired: child.kill(); child.wait()
atexit.register(close)
config = json.loads(child.stdout.readline())
origin = config['tailscaleUrl'] if args.tailscale else config['url']
now = datetime.now(timezone.utc)
old_time = (now - timedelta(days=2)).isoformat()
markdown = '''## Result
**Buffer fixed** with `safeRead()` and [documentation](https://example.com/docs).

```js
const value = "<tag>";
console.log(value);
```

- First item
- Second item

| Check | Result |
| --- | --- |
| Buffer | Ready |

<img src="https://example.com/tracker.png" onerror="alert(1)">
<script>window.markdownExecuted = true</script>
<svg onload="window.markdownExecuted = true"></svg>

[bad](javascript:alert%281%29) ![tracker](https://example.com/image.png)
[data](data:text/html,unsafe) [relative](/api/export)
'''
def post(kind, data=None, project='workspace-alpha', session='workspace-session', run='old-request', stamp=None, name='Workspace Alpha'):
    payload = {'schemaVersion': 1, 'id': str(uuid.uuid4()), 'type': kind, 'time': stamp or datetime.now(timezone.utc).isoformat(), 'projectId': project, 'projectName': name, 'sessionId': session, 'runId': run, 'data': data or {}}
    req = urllib.request.Request(config['url'] + '/api/events', data=json.dumps(payload).encode(), headers={'Authorization': 'Bearer ' + config['token'], 'Content-Type': 'application/json'})
    with urllib.request.urlopen(req) as response: assert response.status == 200
def completed(run, prompt, summary, stamp=None, **identity):
    post('prompt.received', {'prompt': prompt}, run=run, stamp=stamp, **identity)
    post('run.started', {'model': 'synthetic/old-model'}, run=run, stamp=stamp, **identity)
    post('model.selected', {'model': 'synthetic/observed-model'}, run=run, stamp=stamp, **identity)
    post('run.ended', {'outcome': 'idle', 'summary': summary}, run=run, stamp=stamp, **identity)
    post('run.settled', run=run, stamp=stamp, **identity)
completed('old-request', 'Find the needle before migration', markdown, old_time)
completed('latest-request', 'An unrelated later request', 'The current reply.')
completed('same-name-request', 'Different project identity', 'Must never open instead of Alpha.', project='workspace-other', session='workspace-other-session')

with sync_playwright() as pw:
    executable = os.environ.get('BROWSER_EXECUTABLE') or shutil.which('chromium')
    launch = {'executable_path': executable} if executable else {}
    browser = pw.chromium.launch(headless=True, args=['--host-resolver-rules=MAP dashboard.test-tailnet.ts.net 127.0.0.1', '--no-proxy-server'] if args.tailscale else [], **launch)
    context = browser.new_context(viewport={'width': 1440, 'height': 1100}, ignore_https_errors=args.tailscale)
    context.grant_permissions(['clipboard-read', 'clipboard-write'], origin=origin)
    page = context.new_page(); errors, unexpected = [], []
    page.on('pageerror', lambda error: errors.append(str(error)))
    context.on('request', lambda req: unexpected.append(req.url) if urlparse(req.url).hostname not in (urlparse(origin).hostname, '127.0.0.1') and req.url.startswith('http') else None)
    page.goto(origin + '/#token=' + config['token']); expect(page.locator('#connection-label')).to_have_text('Dashboard connected')

    # Pins and compact layout survive reload and unrelated live events.
    alpha = page.locator('.project-card[data-project="workspace-alpha"]')
    alpha.locator('.project-pin').click(); expect(alpha.locator('.project-pin')).to_have_attribute('aria-pressed', 'true')
    expect(page.locator('.project-card').first).to_have_attribute('data-project', 'workspace-alpha')
    page.locator('#layout-list').click(); expect(page.locator('#project-list')).to_have_class('project-list compact')
    page.reload(); expect(page.locator('#layout-list')).to_have_attribute('aria-pressed', 'true')
    expect(page.locator('.project-card').first).to_have_attribute('data-project', 'workspace-alpha')
    pin_node = alpha.locator('.project-pin').element_handle()
    post('session.heartbeat', project='workspace-other', session='workspace-other-session', run=None)
    expect(alpha.locator('.project-pin')).to_have_attribute('aria-pressed', 'true')
    assert pin_node.evaluate('(node) => node.isConnected')
    page.screenshot(path=str(output / 'compact.png'), full_page=True)

    # Search finds an older request, uses exact project identity and model history.
    page.locator('#nav-history').click(); expect(page.locator('#history-heading')).to_be_focused()
    page.locator('#history-query').fill('needle')
    expect(page.locator('#history-list .request-card')).to_have_count(1)
    page.locator('#history-project').select_option('workspace-alpha')
    page.locator('#history-model').select_option('synthetic/old-model')
    expect(page.locator('#history-list .request-card')).to_have_count(1)
    page.locator('#history-verdict').select_option('completed')
    expect(page.locator('#history-list .request-card')).to_have_count(1)
    page.locator('#history-from').fill('2099-02-02'); page.locator('#history-to').fill('2099-01-01')
    expect(page.locator('#history-date-error')).to_be_visible(); expect(page.locator('#history-list .request-card')).to_have_count(0)
    page.locator('#history-from').fill(''); page.locator('#history-to').fill('')
    page.screenshot(path=str(output / 'history.png'), full_page=True)
    page.locator('#history-list a').click()
    expect(page.locator('#run-select')).to_have_value('old-request')
    query = parse_qs(urlparse(page.url).query)
    assert query['project'] == ['workspace-alpha'] and query['request'] == ['old-request']
    permalink = page.url
    page.locator('#copy-request-link').click(); expect(page.locator('#request-link-status')).to_contain_text('Link copied')
    assert page.evaluate('navigator.clipboard.readText()') == permalink
    assert 'token' not in permalink
    unpaired = browser.new_context(ignore_https_errors=args.tailscale)
    unpaired_page = unpaired.new_page(); unpaired_page.goto(permalink)
    expect(unpaired_page.locator('#connection-label')).to_have_text('Pairing required')
    expect(unpaired_page.locator('#control-response-text')).to_be_hidden()
    unpaired.close()
    page.reload(); expect(page.locator('#run-select')).to_have_value('old-request')
    page.go_back(); expect(page.locator('#history-view')).to_be_visible()
    expect(page.locator('#history-query')).to_have_value('needle')
    page.go_forward(); expect(page.locator('#run-select')).to_have_value('old-request')

    # Markdown uses semantic DOM, exact code copying and zero remote media loads.
    response = page.locator('#control-response-text')
    expect(response.locator('h4')).to_have_text('Result')
    expect(response.locator('strong')).to_have_text('Buffer fixed')
    expect(response.locator('li')).to_have_count(2); expect(response.locator('table')).to_have_count(1)
    expect(response.locator('img, script, iframe')).to_have_count(0)
    expect(response.locator('svg')).to_have_count(0)
    assert page.evaluate('window.markdownExecuted === undefined')
    expect(response.locator('a')).to_have_count(1)
    expect(response.locator('a')).to_have_attribute('rel', 'noopener noreferrer')
    code = 'const value = "<tag>";\nconsole.log(value);'
    expect(response.locator('pre code')).to_have_text(code)
    response.locator('.copy-code').click(); expect(response.locator('.copy-code')).to_have_text('Copied')
    assert page.evaluate('navigator.clipboard.readText()') == code
    # SSE updates must preserve the code node, selection and reading position.
    response.locator('pre code').evaluate('(node) => { window.codeNode = node; const range = document.createRange(); range.selectNodeContents(node); const s = getSelection(); s.removeAllRanges(); s.addRange(range); }')
    response.evaluate('(node) => { node.scrollTop = 30; window.responseScroll = node.scrollTop; }')
    post('session.heartbeat', project='workspace-other', session='workspace-other-session', run=None)
    expect(response.locator('pre code')).to_have_text(code)
    assert page.evaluate('codeNode === document.querySelector("#control-response-text pre code")')
    assert page.evaluate('getSelection().toString()') == code
    assert response.evaluate('(node) => node.scrollTop === window.responseScroll')
    page.screenshot(path=str(output / 'markdown.png'), full_page=True)
    # Copy denial leaves the code available with clear feedback.
    page.evaluate('() => { window.clipboardWrite = navigator.clipboard.writeText.bind(navigator.clipboard); navigator.clipboard.writeText = async () => { throw Error("denied"); }; }')
    response.locator('.copy-code').click(); expect(response.locator('.copy-code')).to_have_text('Copy failed - select text')
    page.evaluate('() => { navigator.clipboard.writeText = window.clipboardWrite; }')

    # Expired or mismatched permalinks fail closed without opening another run.
    bad = permalink.replace('project=workspace-alpha', 'project=workspace-other')
    page.goto(bad); expect(page.locator('#request-unavailable')).to_be_visible(); expect(page.locator('#run-content')).to_be_hidden()
    page.goto(permalink.replace('request=old-request', 'request=expired-request'))
    expect(page.locator('#request-unavailable')).to_be_visible()
    expect(page.locator('#run-select')).to_have_value('expired-request')
    page.goto(origin + '/?view=request'); expect(page.locator('#navigation-notice')).to_be_visible()

    # Unread replies and current blockers arrive live and link to their own runs.
    page.locator('#nav-attention').click()
    completed('new-reply', 'A fresh response needs reading', 'New answer for you.', project='workspace-beta', session='workspace-beta-session', name='Workspace Beta')
    beta = page.locator('#attention-list [data-project="workspace-beta"]')
    expect(beta).to_be_visible(); expect(beta).to_contain_text('New reply')
    post('prompt.received', {'prompt': 'Investigate provider failure'}, run='failed-request')
    post('run.started', {'model': 'synthetic/observed-model'}, run='failed-request')
    post('workflow.updated', {'stages': [{'id': 'blocked', 'title': 'Waiting for the provider', 'status': 'blocked'}]}, run='failed-request')
    post('run.ended', {'outcome': 'error', 'errorMessage': 'Synthetic provider unavailable'}, run='failed-request')
    post('run.settled', run='failed-request')
    failure = page.locator('#attention-list [data-project="workspace-alpha"]')
    expect(failure).to_contain_text('Model/provider error'); expect(failure).to_contain_text('Blocked plan')
    beta.locator('a').click(); expect(page.locator('#run-select')).to_have_value('new-reply')
    page.locator('#back-to-projects').click(); expect(page.locator('#attention-view')).to_be_visible()
    expect(page.locator('#attention-list [data-project="workspace-beta"]')).to_have_count(0)
    expect(failure).to_be_visible()
    page.screenshot(path=str(output / 'attention.png'), full_page=True)

    # New views and rich replies remain usable on mobile and at 200% text size.
    for view in ['attention', 'history', 'projects']:
        page.locator('#nav-' + view).click(); page.set_viewport_size({'width': 390, 'height': 844})
        page.evaluate('document.documentElement.style.fontSize = "200%"')
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), view + ' overflows'
        page.screenshot(path=str(output / (view + '-mobile-200.png')), full_page=True)
        page.evaluate('document.documentElement.style.fontSize = ""')
    page.goto(permalink); expect(page.locator('#run-select')).to_have_value('old-request')
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'Markdown overflows mobile'
    page.screenshot(path=str(output / 'markdown-mobile.png'), full_page=True)
    page.evaluate('document.documentElement.style.fontSize = "200%"')
    page.screenshot(path=str(output / 'markdown-mobile-200.png'), full_page=True)
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), page.evaluate('''() => [...document.querySelectorAll('body *')].filter(e => e.getClientRects().length && e.getBoundingClientRect().right > innerWidth + 1).map(e => [e.tagName, e.className, Math.round(e.getBoundingClientRect().width), e.textContent.slice(0, 90)]).slice(0, 30)''')
    assert not errors, errors
    assert not unexpected, unexpected
    browser.close()
print('Workspace UI passed: persistent pins/layout, old-request search and filters, exact permalinks/reload/back/forward, clipboard, safe Markdown, live attention/read clearing, mobile and 200% text. Real HTTP/SSE; no model calls.')
