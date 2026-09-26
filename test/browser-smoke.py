"""Optional UI-only replay smoke test. HTTP/SSE integration lives in Node tests.
Requires Python Playwright and Chromium; does NOT call a model.
"""
import argparse
import copy
import json
import os
import shutil
import urllib.request
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright

parser = argparse.ArgumentParser()
parser.add_argument('--output-dir', default='test-results')
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
state = Path(os.environ.get('AGENT_DASHBOARD_HOME', Path.home() / '.agent-workflow-dashboard'))
config = json.loads((state / 'connection.json').read_text())
parsed = urlparse(config['url'])
assert parsed.scheme == 'http' and parsed.hostname in ('127.0.0.1', 'localhost'), 'Only loopback is allowed'
request = urllib.request.Request(config['url'] + '/api/state', headers={'Authorization': 'Bearer ' + config['token']})
with urllib.request.urlopen(request, timeout=3) as response:
    snapshot = json.load(response)
assert any(s['demo'] for s in snapshot['sessions']), 'Run npm run demo -- --hold first'
output = Path(args.output_dir).resolve()
output.mkdir(parents=True, exist_ok=True)
with sync_playwright() as pw:
    executable = os.environ.get('BROWSER_EXECUTABLE') or shutil.which('chromium')
    browser = pw.chromium.launch(headless=True, **({'executable_path': executable} if executable else {}))
    page = browser.new_page(viewport={'width': 1440, 'height': 1150})
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    html = (root / 'public/index.html').read_text().replace(
        '<link rel="stylesheet" href="/style.css">', '<style>' + (root / 'public/style.css').read_text() + '</style>'
    ).replace('<script type="module" src="/app.js"></script>', '')
    # Deliberately stub only browser transport. Never disguise this as network E2E.
    def replay(target, data):
        target.set_content(html)
        target.add_script_tag(content='const fixture=' + json.dumps(data) + ';'
            'window.fetch=async()=>new Response(JSON.stringify(fixture));'
            'window.EventSource=class{constructor(){setTimeout(()=>this.onopen?.(),10)}'
            'addEventListener(n,f){setTimeout(()=>f({data:JSON.stringify(fixture)}),20)}close(){}};')
        target.add_script_tag(content=(root / 'public/app.js').read_text())
    replay(page, snapshot)
    page.wait_for_function("document.querySelector('#connection-label').textContent === 'Dashboard bağlı'")
    page.locator('#demo-mode').click()
    page.wait_for_selector('#run-content:not(.hidden)')
    assert page.locator('#demo-banner').is_visible()
    assert page.locator('.model-card').count() == 3
    assert page.locator('.stage').count() == 4
    page.screenshot(path=str(output / 'preview.png'), full_page=True)
    page.locator('#event-search').fill('qwen')
    assert page.locator('.event').count() >= 1
    page.locator('#event-search').fill('unmatchable-word')
    assert page.locator('.event-empty').is_visible()
    page.locator('#event-search').fill('')
    page.locator('#theme').click()
    assert page.locator('html').get_attribute('data-theme') == 'light'
    page.screenshot(path=str(output / 'light.png'), full_page=True)
    page.locator('#theme').click()
    page.set_viewport_size({'width': 390, 'height': 844})
    assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
    page.screenshot(path=str(output / 'mobile.png'), full_page=True)
    # Targeted regression: src/store.mjs keeps an agent.progress status literal
    # verbatim with finished=False until an agent.finished mark arrives. The
    # model cards must never turn a progress-only terminal-looking literal into
    # a green 'Bitti'/red 'Hata' result; unknown/waiting is shown instead and the
    # main session keeps waiting on the unfinished agent. Genuine finished
    # records and live in-progress states keep their display.
    def agent_fixture(call_id, name, status, finished):
        return {'id': call_id, 'agent': name, 'model': 'demo/ui-fixture', 'modelSource': 'observed',
                'task': f'fixture: agent.progress status={status}', 'status': status, 'tools': [], 'finished': finished}
    regressed = copy.deepcopy(snapshot)
    run = next(s for s in regressed['sessions'] if s.get('demo') and s['runs'])['runs'][-1]
    for call_id, name, status, finished in (
        ('ui-progress-done', 'ui-literal-done', 'done', False),
        ('ui-progress-error', 'ui-literal-error', 'error', False),
        ('ui-progress-blocked', 'ui-literal-blocked', 'blocked', False),
        ('ui-progress-cancelled', 'ui-literal-cancelled', 'cancelled', False),
        ('ui-progress-running', 'ui-running', 'running', False),
        ('ui-finished-ok', 'ui-finished-done', 'done', True),
        ('ui-finished-fail', 'ui-finished-error', 'error', True),
    ):
        run['agents'][call_id] = agent_fixture(call_id, name, status, finished)
    regression = browser.new_page(viewport={'width': 1440, 'height': 1150})
    regression.on('pageerror', lambda error: errors.append(str(error)))
    replay(regression, regressed)
    regression.wait_for_function("document.querySelector('#connection-label').textContent === 'Dashboard bağlı'")
    regression.locator('#demo-mode').click()
    regression.wait_for_selector('#run-content:not(.hidden)')
    for name in ('ui-literal-done', 'ui-literal-error', 'ui-literal-blocked', 'ui-literal-cancelled'):
        waiting = regression.locator('.model-card').filter(has_text=name).locator('.badge')
        assert waiting.text_content().strip() == 'Sonuç bilinmiyor / bitiş bekleniyor', name
        assert 'done' not in waiting.get_attribute('class') and 'error' not in waiting.get_attribute('class'), name
    assert regression.locator('.model-card').filter(has_text='ui-running').locator('.badge').text_content().strip() == 'Çalışıyor'
    assert regression.locator('.model-card').filter(has_text='ui-finished-done').locator('.badge').text_content().strip() == 'Bitti'
    assert regression.locator('.model-card').filter(has_text='ui-finished-error').locator('.badge').text_content().strip() == 'Hata'
    main = regression.locator('.model-card').first
    assert main.locator('.model-role').text_content().strip() == 'Ana oturum'
    assert main.locator('.model-task').text_content().strip() == 'Alt agent sonuçlarını bekliyor.'
    regression.close()
    assert not errors, errors
    browser.close()
print('UI replay passed: models, stages, filters, light/dark, mobile layout and progress-only terminal-literal cards. Browser transport was stubbed.')
