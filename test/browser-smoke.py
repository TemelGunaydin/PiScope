"""Optional UI-only replay smoke test. HTTP/SSE integration lives in Node tests.
Requires Python Playwright and Chromium; does NOT call a model.
"""
import argparse
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
    page.set_content(html)
    # Deliberately stub only browser transport. Never disguise this as network E2E.
    page.add_script_tag(content='const fixture=' + json.dumps(snapshot) + ';'
        'window.fetch=async()=>new Response(JSON.stringify(fixture));'
        'window.EventSource=class{constructor(){setTimeout(()=>this.onopen?.(),10)}'
        'addEventListener(n,f){setTimeout(()=>f({data:JSON.stringify(fixture)}),20)}close(){}};')
    page.add_script_tag(content=(root / 'public/app.js').read_text())
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
    assert not errors, errors
    browser.close()
print('UI replay passed: models, stages, filters, light/dark, mobile layout. Browser transport was stubbed.')
