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
    expect(page.locator('#control-response-text')).to_have_text('Synthetic response; no model called.')
    expect(page.locator('#control-error')).to_be_hidden()
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
    # R6: a model change over SSE invalidates consent, never retargets it silently.
    import uuid
    from datetime import datetime, timezone
    def model_event(model):
        request = urllib.request.Request(config['url'] + '/api/state', headers={'Authorization': 'Bearer ' + config['token']})
        with urllib.request.urlopen(request) as response: active = json.load(response)['sessions'][0]
        payload = {'schemaVersion': 1, 'id': str(uuid.uuid4()), 'type': 'model.selected', 'time': datetime.now(timezone.utc).isoformat(),
            'sessionId': active['id'], 'projectId': active['projectId'], 'projectName': active['projectName'], 'data': {'model': model}}
        request = urllib.request.Request(config['url'] + '/api/events', data=json.dumps(payload).encode(), headers={'Authorization': 'Bearer ' + config['token'], 'Content-Type': 'application/json'})
        with urllib.request.urlopen(request) as response: assert response.status == 200
    model_event('synthetic/changed-model')
    expect(page.locator('#control-review')).to_be_hidden()
    expect(page.locator('#control-confirm')).to_be_disabled()
    expect(page.locator('#control-receipt')).to_contain_text('model changed'); expect(page.locator('#control-receipt')).to_be_focused()
    model_event('synthetic/current-model')
    expect(page.locator('.control-start')).to_be_enabled()
    other_draft = 'Unsent exact draft must survive a model change.'
    page.locator('#control-other-prompt').fill(other_draft); page.locator('#control-other-review').click()
    model_event('synthetic/changed-model')
    expect(page.locator('#control-review')).to_be_hidden(); expect(page.locator('#control-other-prompt')).to_have_value(other_draft)
    model_event('synthetic/current-model'); expect(page.locator('#control-other-review')).to_be_enabled()
    page.locator('#control-other-review').click(); expect(page.locator('#control-review-prompt')).to_have_text(other_draft)
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
    latest_run_id = page.locator('#run-select').input_value()
    page.locator('#run-select').select_option(session['runs'][0]['id'])
    expect(page.locator('#control-status')).to_contain_text('older request')
    expect(page.locator('#control-other-prompt')).to_be_disabled()
    expect(page.locator('#control-response-text')).to_have_text('Synthetic response; no model called.')
    def emit(kind, data, run_id=latest_run_id):
        payload = {**update, 'id': str(uuid.uuid4()), 'time': datetime.now(timezone.utc).isoformat(), 'type': kind, 'data': data, 'runId': run_id}
        request = urllib.request.Request(config['url'] + '/api/events', data=json.dumps(payload).encode(), headers={'Authorization': 'Bearer ' + config['token'], 'Content-Type': 'application/json'})
        with urllib.request.urlopen(request) as response:
            assert response.status == 200
    reply = 'Final reply:\nLiteral <img src=x onerror=alert(1)> output.\n' + 'The reported result is ready for your next instruction.\n' * 45
    emit('message.completed', {'summary': reply, 'errorMessage': ''})
    # An older selected request must not borrow the latest request's response.
    page.wait_for_timeout(400)
    expect(page.locator('#control-response-text')).to_have_text('Synthetic response; no model called.')
    page.locator('#run-select').select_option(latest_run_id)
    region = page.locator('#control-response-text')
    expect(region).to_have_text(reply)
    expect(page.locator('#summary')).to_have_text(reply)
    assert page.locator('#control-panel img').count() == 0
    page.locator('#control-other-prompt').fill('Keep this unsent draft while reading the reply.')
    region.focus()
    page.evaluate('''() => {
      const box = document.getElementById('control-response-text'), range = document.createRange();
      range.setStart(box.firstChild, 0); range.setEnd(box.firstChild, 11);
      const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
      box.scrollTop = 120; window.replyScroll = box.scrollTop; window.replyUpdates = 0;
      new MutationObserver(() => replyUpdates++).observe(document.getElementById('last-update'), {childList:true});
    }''')
    emit('session.heartbeat', {})
    page.wait_for_function('() => window.replyUpdates > 0')
    expect(region).to_be_focused()
    assert page.evaluate("getSelection().toString()") == 'Final reply'
    assert region.evaluate('(box) => box.scrollTop === window.replyScroll && box.scrollTop > 0')
    expect(page.locator('#control-other-prompt')).to_have_value('Keep this unsent draft while reading the reply.')
    # Provider details are visible as errors, not invented successful output.
    overload = 'Codex error: Our servers are currently overloaded. Please try again later.'
    emit('message.completed', {'errorMessage': overload})
    emit('run.ended', {'outcome': 'error', 'errorMessage': overload})
    expect(page.locator('#control-error')).to_be_visible()
    expect(page.locator('#control-error-text')).to_have_text(overload)
    expect(region).to_have_text(reply)
    page.locator('#back-to-projects').click()
    card = page.locator('.project-card').first
    expect(card.locator('.badge')).to_have_text('Error')
    expect(card.locator('.project-error')).to_have_text(overload)
    page.evaluate('() => window.scrollTo(0, 0)')
    page.screenshot(path=str(output / ('https-error-card.png' if args.tailscale else 'error-card.png')), full_page=True)
    card.locator('.project-open').click()
    expect(page.locator('#control-error-text')).to_have_text(overload)
    page.locator('#control-panel').screenshot(path=str(output / ('https-provider-error.png' if args.tailscale else 'provider-error.png')))
    # A successful subsequent reply removes the current warning and Error badge.
    emit('message.completed', {'summary': 'Recovered response.', 'errorMessage': ''})
    expect(page.locator('#control-error')).to_be_hidden()
    expect(region).to_have_text('Recovered response.')
    emit('run.ended', {'outcome': 'idle', 'errorMessage': ''})
    expect(page.locator('#control-error')).to_be_hidden()
    expect(region).to_have_text('Recovered response.')
    page.locator('#back-to-projects').click()
    expect(card.locator('.badge')).to_have_text('Last request finished')
    expect(card.locator('.project-error')).to_have_count(0)
    card.locator('.project-open').click()
    pending_run = 'pending-' + str(uuid.uuid4())
    emit('prompt.received', {'prompt': 'Synthetic pending work; no model is called.'}, pending_run)
    expect(page.locator('#run-select option')).to_have_count(4)
    page.locator('#run-select').select_option(pending_run)
    expect(region).to_have_text('Pi is working. Its response will appear here.')
    expect(page.locator('#control-error')).to_be_hidden()
    emit('run.ended', {'outcome': 'error'}, pending_run)
    expect(page.locator('#control-error-text')).to_contain_text('No error details were recorded')
    expect(region).to_have_text('No model response recorded for this request.')
    page.screenshot(path=str(output / ('https-error.png' if args.tailscale else 'error.png')), full_page=True)
    assert page.evaluate('() => document.documentElement.scrollWidth <= innerWidth')
    assert not errors, errors
    browser.close()
print('Approval UI passed: read/control separation, mobile confirmation/cancel, Recommended + Other, preserved draft under SSE, selected-request response/selection/scroll preservation, literal reply text, provider Error card/alert/recovery, exact prompt/model/session, stale-model approval invalidation with draft/focus preserved, duplicate-click protection, current-run targeting and ' + ('simulated Serve HTTPS Secure cookies.' if args.tailscale else 'real HTTP/SSE.'))
