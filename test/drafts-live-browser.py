"""Draft and live-list regressions using a disposable HTTP/SSE collector and mock Pi."""
import argparse
import atexit
import json
import os
import shutil
import subprocess
import urllib.request
import uuid
from datetime import datetime, timezone
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

parser = argparse.ArgumentParser()
parser.add_argument('--tailscale', action='store_true')
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
output = root / 'test-results/drafts-live' / ('https' if args.tailscale else 'http'); output.mkdir(parents=True, exist_ok=True)
child = subprocess.Popen(['node', 'test/browser-fixture.mjs', '--control', '--todos'] + (['--tailscale'] if args.tailscale else []), cwd=root, stdout=subprocess.PIPE, text=True)
def close():
    child.terminate()
    try: child.wait(timeout=5)
    except subprocess.TimeoutExpired: child.kill(); child.wait()
atexit.register(close)
config = json.loads(child.stdout.readline())
origin = config['tailscaleUrl'] if args.tailscale else config['url']
def state():
    req = urllib.request.Request(config['url'] + '/api/state', headers={'Authorization': 'Bearer ' + config['token']})
    with urllib.request.urlopen(req) as response: return json.load(response)
primary = state()['sessions'][0]
other = {'id': 'same-name-other-session', 'projectId': 'same-name-other-project', 'projectName': primary['projectName']}
def emit(kind, data, target=other, run='other-request'):
    payload = {'schemaVersion': 1, 'id': str(uuid.uuid4()), 'type': kind, 'time': datetime.now(timezone.utc).isoformat(),
               'sessionId': target['id'], 'projectId': target['projectId'], 'projectName': target['projectName'], 'runId': run, 'data': data}
    req = urllib.request.Request(config['url'] + '/api/events', data=json.dumps(payload).encode(), headers={'Authorization': 'Bearer ' + config['token'], 'Content-Type': 'application/json'})
    with urllib.request.urlopen(req) as response: assert response.status == 200
emit('prompt.received', {'prompt': 'Other project with the same name'})
emit('run.ended', {'outcome': 'idle', 'summary': 'Other project response'})
emit('run.settled', {})

with sync_playwright() as pw:
    executable = os.environ.get('BROWSER_EXECUTABLE') or shutil.which('chromium')
    browser = pw.chromium.launch(headless=True, args=['--host-resolver-rules=MAP dashboard.test-tailnet.ts.net 127.0.0.1', '--no-proxy-server'] if args.tailscale else [], **({'executable_path': executable} if executable else {}))
    context = browser.new_context(viewport={'width': 1440, 'height': 1050}, ignore_https_errors=args.tailscale)
    page = context.new_page(); errors, sends = [], []
    context.on('page', lambda p: p.on('pageerror', lambda error: errors.append(str(error))))
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('request', lambda req: sends.append(req.post_data_json) if req.method == 'POST' and req.url.endswith('/api/control/requests') else None)
    page.goto(origin + '/#control-token=' + config['controlToken']); expect(page.locator('#connection-label')).to_have_text('Dashboard connected')
    own_session = page.locator(f'.session-item[data-session="{primary["id"]}"]')
    other_session = page.locator(f'.session-item[data-session="{other["id"]}"]')
    own_session.click()
    prompt = page.locator('#control-other-prompt')
    expect(prompt).to_be_enabled()
    draft_text = 'Keep this exact project draft.\nLiteral <img src=x onerror=alert(1)> stays text.'
    prompt.fill(draft_text)
    other_session.click(); expect(prompt).to_have_value('')
    own_session.click()
    draft_retained = prompt.input_value() == draft_text

    def watch_card(view):
        page.locator('#nav-' + view).click()
        card = page.locator(f'#{view}-list .request-card[data-session="{primary["id"]}"]')
        expect(card).to_be_visible()
        if card.locator('details').get_attribute('open') is None: card.locator('summary').click()
        card.evaluate('''card => {
            window.watchedCard = card;
            card.querySelector('a').focus({preventScroll:true});
            const range = document.createRange(); range.selectNodeContents(card.querySelector('.request-prompt'));
            getSelection().removeAllRanges(); getSelection().addRange(range);
            window.watchedSelection = getSelection().toString(); window.watchedFocus = document.activeElement;
        }''')
        return card
    def reading_retained():
        return page.evaluate('''() => watchedCard.isConnected && watchedCard.querySelector('details').open &&
            document.activeElement === watchedFocus && getSelection().toString() === watchedSelection''')

    watch_card('history')
    emit('message.completed', {'summary': 'Unrelated response changed in history'})
    expect(page.locator('#history-list [data-session="same-name-other-session"] .request-excerpt')).to_have_text('Unrelated response changed in history')
    history_retained = reading_retained()
    emit('workflow.updated', {'stages': [{'id': 'blocked', 'title': 'Reported blocker', 'status': 'blocked'}]}, primary, primary['runs'][-1]['id'])
    emit('run.ended', {'outcome': 'error', 'errorMessage': 'Other project error'})
    watch_card('attention')
    emit('message.completed', {'errorMessage': 'Unrelated provider warning changed'})
    expect(page.locator('#attention-list [data-session="same-name-other-session"] .request-excerpt')).to_have_text('Unrelated provider warning changed')
    attention_retained = reading_retained()
    result = {'project_draft_retained': draft_retained, 'history_reading_retained': history_retained, 'attention_reading_retained': attention_retained}
    print(json.dumps(result), flush=True)
    assert all(result.values()), result
    assert not sends, sends

    # Same-card content changes and insertion above the reader retain identity,
    # open details, selection, focus and viewport position in both live lists.
    for view in ['history', 'attention']:
        page.set_viewport_size({'width': 390 if view == 'attention' else 1440, 'height': 1050})
        card = watch_card(view)
        before_top = card.evaluate('card => card.getBoundingClientRect().top')
        emit('message.completed', {'summary': 'Own response changed in ' + view}, primary, primary['runs'][-1]['id'])
        expect(card.locator('.request-excerpt')).to_have_text('Own response changed in ' + view)
        assert reading_retained(), 'Own update lost ' + view + ' reading'
        assert abs(card.evaluate('card => card.getBoundingClientRect().top') - before_top) <= 2
        inserted = {'id': 'inserted-' + view, 'projectId': 'inserted-project-' + view, 'projectName': 'AAA inserted project'}
        emit('prompt.received', {'prompt': 'New entry before the selected reader'}, inserted)
        emit('run.ended', {'outcome': 'error', 'errorMessage': 'Synthetic insertion'}, inserted)
        expect(page.locator(f'#{view}-list [data-session="{inserted["id"]}"]')).to_be_visible()
        assert reading_retained(), 'Insertion lost ' + view + ' reading'
        assert abs(card.evaluate('card => card.getBoundingClientRect().top') - before_top) <= 2, view + ' insertion moved the reader'
        emit('prompt.received', {'prompt': 'Changed source text in ' + view}, primary, primary['runs'][-1]['id'])
        expect(card.locator('.request-prompt')).to_have_text('Changed source text in ' + view)
        assert page.evaluate('getSelection().toString()') == '', 'Changed text must not remain selected'
        assert card.locator('details').get_attribute('open') is not None
        page.locator('#' + view + '-view').screenshot(path=str(output / (view + '-live.png')))

    # Removing the focused attention item never jumps to a different request.
    watch_card('attention')
    emit('workflow.updated', {'stages': [{'id': 'blocked', 'title': 'No blocker now', 'status': 'done'}]}, primary, primary['runs'][-1]['id'])
    expect(page.locator(f'#attention-list [data-session="{primary["id"]}"]')).to_have_count(0)
    expect(page.locator('#attention-heading')).to_be_focused()
    page.set_viewport_size({'width': 1440, 'height': 1050})

    # Reload restores editable text only. Approval is always reviewed again.
    own_session.click(); expect(prompt).to_have_value(draft_text)
    page.locator('#control-other-review').click(); expect(page.locator('#control-review')).to_be_visible()
    page.reload(); expect(prompt).to_have_value(draft_text)
    expect(page.locator('#control-review')).to_be_hidden(); expect(page.locator('#control-confirm')).to_be_disabled()
    expect(page.locator('#control-draft-status')).to_contain_text('this tab')
    page.locator('#control-panel').screenshot(path=str(output / 'restored-draft.png'))
    assert not sends
    page.locator('#control-other-review').click()
    prompt.fill('Changed text needs a fresh review')
    expect(page.locator('#control-review')).to_be_hidden(); expect(page.locator('#control-confirm')).to_be_disabled()

    # Copying a note keeps its result identity across reload, without storing
    # consent or sending anything until the new preview is confirmed.
    page.locator('#nav-notes').click()
    note = page.locator('[data-note="1"]'); note.locator('select').select_option(primary['projectId'])
    note.get_by_role('button', name='Use as prompt', exact=True).click()
    note_text = 'Keep the note association after refresh.\n' + prompt.input_value()
    prompt.fill(note_text); page.locator('#control-other-review').click()
    first_preview = page.locator('#control-review-prompt').inner_text()
    page.reload(); expect(prompt).to_have_value(note_text); expect(page.locator('#control-review')).to_be_hidden()
    page.locator('#control-other-review').click()
    expect(page.locator('#control-review-note')).to_be_visible()
    assert page.locator('#control-review-prompt').inner_text() != first_preview
    assert not sends
    page.locator('#control-confirm').click()
    expect(page.locator('#run-select')).not_to_have_value(primary['runs'][-1]['id'])
    expect(page.locator('.control-start')).to_be_enabled(timeout=10000)
    expect(prompt).to_have_value('')
    assert len(sends) == 1 and sends[0]['projectId'] == primary['projectId'] and sends[0]['todoRef']

    # Recommended work must not erase an independent Other draft. A shared
    # project draft also survives switching between its older/current requests.
    independent = 'Unsent Other draft survives a recommendation'
    prompt.fill(independent)
    before_recommendation = page.locator('#run-select').input_value()
    page.locator('.control-start').click(); page.locator('#control-confirm').click()
    expect(page.locator('#run-select')).not_to_have_value(before_recommendation)
    expect(page.locator('.control-start')).to_be_enabled(timeout=10000)
    expect(prompt).to_have_value(independent)
    latest = page.locator('#run-select').input_value()
    page.locator('#run-select').select_option(primary['runs'][-1]['id'])
    expect(prompt).to_have_value(independent); expect(prompt).to_be_disabled()
    page.locator('#run-select').select_option(latest); expect(prompt).to_have_value(independent)
    prompt.fill(''); page.reload(); expect(page.locator('#connection-label')).to_have_text('Dashboard connected')
    expect(prompt).to_have_value(''); expect(prompt).to_be_enabled()
    assert len(sends) == 2

    # Storage denial still preserves project drafts within the page and clearly
    # explains why they cannot survive a reload.
    blocked = browser.new_context(ignore_https_errors=args.tailscale)
    blocked.add_cookies(context.cookies())
    blocked.add_init_script('Object.defineProperty(window, "sessionStorage", { get() { throw new DOMException("blocked", "SecurityError"); } });')
    fallback = blocked.new_page(); fallback.on('pageerror', lambda error: errors.append(str(error)))
    fallback.goto(page.url); expect(fallback.locator('#control-other-prompt')).to_be_enabled()
    fallback.locator('#control-other-prompt').fill('Page-local fallback draft')
    expect(fallback.locator('#control-draft-status')).to_contain_text('page only')
    fallback.locator(f'.session-item[data-session="{other["id"]}"]').click()
    fallback.locator(f'.session-item[data-session="{primary["id"]}"]').click()
    expect(fallback.locator('#control-other-prompt')).to_have_value('Page-local fallback draft')
    fallback.reload(); expect(fallback.locator('#control-other-prompt')).to_have_value('')
    blocked.close()
    assert not errors, errors
    browser.close()
print('Draft/live UI passed: exact project drafts and unchanged list reading survive real HTTP/SSE updates; no model calls.')
