"""Disposable, model-free approval E2E. Never touches personal sessions or Serve routes."""
import argparse
import atexit
import json
import os
import subprocess
import urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

parser = argparse.ArgumentParser()
parser.add_argument('--tailscale', action='store_true')
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
child = subprocess.Popen(['node', 'test/browser-fixture.mjs', '--control'] + (['--tailscale'] if args.tailscale else []), cwd=root, stdout=subprocess.PIPE, text=True)
def close():
    child.terminate()
    try:
        child.wait(timeout=5)
    except subprocess.TimeoutExpired:
        child.kill()
        child.wait()
atexit.register(close)
config = json.loads(child.stdout.readline())
origin = config['tailscaleUrl'] if args.tailscale else config['url']
output = root / 'test-results/control'
output.mkdir(parents=True, exist_ok=True)
with sync_playwright() as pw:
    browser = pw.chromium.launch(headless=True, executable_path=os.environ.get('BROWSER_EXECUTABLE', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'),
        args=['--host-resolver-rules=MAP dashboard.test-tailnet.ts.net 127.0.0.1', '--no-proxy-server'] if args.tailscale else [])
    page = browser.new_page(viewport={'width': 390, 'height': 844}, ignore_https_errors=args.tailscale)
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(origin + '/#token=' + config['token'])
    expect(page.locator('#connection-label')).to_have_text('Dashboard connected')
    page.locator('.project-open').click()
    expect(page.locator('#control-status')).to_contain_text('Viewing only')
    expect(page.locator('.control-start')).to_be_disabled()
    expect(page.locator('#control-other-prompt')).to_be_disabled()
    page.goto('about:blank')
    page.goto(origin + '/#control-token=' + config['controlToken'])
    expect(page.locator('#connection-label')).to_have_text('Dashboard connected')
    assert '#control-token' not in page.url
    if args.tailscale:
        cookie = next(c for c in page.context.cookies() if c['name'] == 'piscope-control')
        assert cookie['secure'] and cookie['httpOnly'] and cookie['sameSite'] == 'Strict'
        assert cookie['path'] == '/api/control'
    page.locator('.project-open').click()
    expect(page.locator('.control-start')).to_be_enabled()
    page.locator('.control-start').click()
    expect(page.locator('#control-review')).to_be_visible()
    expect(page.locator('#control-review-prompt')).to_have_text('Run the relevant tests.')
    expect(page.locator('#control-review-target')).to_contain_text('Control-Fixture')
    expect(page.locator('#control-review-target')).to_contain_text('synthetic/current-model')
    page.locator('#control-cancel').click()
    expect(page.locator('#control-review')).to_be_hidden()
    expect(page.locator('#run-select option')).to_have_count(1)
    page.locator('.control-start').click()
    expect(page.locator('#control-confirm')).to_be_enabled()
    # Rapid repeat confirmation must not deliver another Pi message.
    page.locator('#control-confirm').evaluate('(e) => { e.click(); e.click(); }')
    expect(page.locator('#run-select option')).to_have_count(2)
    expect(page.locator('#prompt')).to_have_text('Run the relevant tests.')
    expect(page.locator('.control-start')).to_be_enabled(timeout=10000)
    custom = 'Display <img src=x onerror=alert(1)> as literal text. Then inspect the next task.'
    page.locator('#control-other-prompt').fill(custom)
    # A reported update over real SSE must not erase a typed Other prompt.
    state_req = urllib.request.Request(config['url'] + '/api/state', headers={'Authorization': 'Bearer ' + config['token']})
    with urllib.request.urlopen(state_req) as response:
        state = json.load(response)
    session = state['sessions'][0]
    run = session['runs'][-1]
    import uuid
    from datetime import datetime, timezone
    update = {'schemaVersion': 1, 'id': str(uuid.uuid4()), 'type': 'workflow.updated', 'time': datetime.now(timezone.utc).isoformat(),
        'sessionId': session['id'], 'projectId': session['projectId'], 'projectName': session['projectName'], 'runId': run['id'],
        'data': {'stages': [{'id': 'respond', 'title': 'Respond', 'status': 'done'}], 'recommendations': [{'id': 'check', 'title': 'Updated recommendation', 'prompt': 'Run the relevant tests.'}]}}
    post = urllib.request.Request(config['url'] + '/api/events', data=json.dumps(update).encode(), headers={'Authorization': 'Bearer ' + config['token'], 'Content-Type': 'application/json'})
    with urllib.request.urlopen(post) as response:
        assert response.status == 200
    expect(page.locator('.control-recommendation h3')).to_have_text('Updated recommendation')
    expect(page.locator('#control-other-prompt')).to_have_value(custom)
    page.locator('#control-other-review').click()
    expect(page.locator('#control-review-prompt')).to_have_text(custom)
    assert page.locator('#control-panel img').count() == 0
    page.screenshot(path=str(output / ('https-review.png' if args.tailscale else 'review.png')), full_page=True)
    page.locator('#control-confirm').click()
    expect(page.locator('#run-select option')).to_have_count(3)
    expect(page.locator('#prompt')).to_have_text(custom)
    expect(page.locator('.control-start')).to_be_enabled(timeout=10000)
    page.locator('#run-select').select_option(session['runs'][0]['id'])
    expect(page.locator('#control-status')).to_contain_text('older request')
    expect(page.locator('#control-other-prompt')).to_be_disabled()
    assert page.evaluate('() => document.documentElement.scrollWidth <= innerWidth')
    assert not errors, errors
    browser.close()
print('Approval UI passed: read/control separation, mobile confirmation/cancel, Recommended + Other, preserved draft under SSE, exact prompt/model/session, duplicate-click protection, current-run targeting and ' + ('simulated Serve HTTPS Secure cookies.' if args.tailscale else 'real HTTP/SSE.'))
