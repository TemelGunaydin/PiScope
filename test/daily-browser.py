"""Daily reports with disposable synthetic history and real HTTP/SSE; no models called."""
import argparse
import atexit
import json
import os
import shutil
import subprocess
import urllib.request
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo
from playwright.sync_api import sync_playwright, expect

parser = argparse.ArgumentParser()
parser.add_argument('--tailscale', action='store_true')
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
output = root / 'test-results/daily'
output.mkdir(parents=True, exist_ok=True)
collector = subprocess.Popen(['node', 'test/browser-fixture.mjs'] + (['--tailscale'] if args.tailscale else []), cwd=root, stdout=subprocess.PIPE, text=True)
def stop():
    if collector.poll() is None:
        collector.terminate()
        try: collector.wait(timeout=5)
        except subprocess.TimeoutExpired: collector.kill(); collector.wait()
atexit.register(stop)
config = json.loads(collector.stdout.readline())
def state():
    req = urllib.request.Request(config['url'] + '/api/state', headers={'Authorization': 'Bearer ' + config['token']})
    with urllib.request.urlopen(req) as response: return json.load(response)
zone = ZoneInfo(state()['dailyReport']['timeZone'])
noon = datetime.now(zone).replace(hour=12, minute=0, second=0, microsecond=0)
today, yesterday = noon.date().isoformat(), (noon - timedelta(days=1)).date().isoformat()
def post(project, session, run, kind, data, when=noon):
    payload = {'schemaVersion': 1, 'id': str(uuid.uuid4()), 'type': kind, 'time': when.astimezone(timezone.utc).isoformat(), 'projectId': project, 'projectName': {'atlas': 'Atlas Dashboard', 'notes': 'Notebook'}[project], 'sessionId': session, 'runId': run, 'data': data}
    req = urllib.request.Request(config['url'] + '/api/events', data=json.dumps(payload).encode(), headers={'Authorization': 'Bearer ' + config['token'], 'Content-Type': 'application/json'})
    with urllib.request.urlopen(req) as response: assert response.status == 200
post('atlas', 'atlas-one', 'calendar', 'prompt.received', {'prompt': 'Add a calendar screen.'})
post('atlas', 'atlas-one', 'calendar', 'workflow.updated', {'stages': [{'id': 'build', 'title': 'Build', 'status': 'done'}], 'accomplishments': ['Added calendar navigation.', 'Kept existing reminders unchanged.']})
post('atlas', 'atlas-one', 'calendar', 'run.ended', {'outcome': 'idle', 'summary': 'Calendar added. Tests were not independently verified.'})
post('atlas', 'atlas-two', 'provider', 'prompt.received', {'prompt': 'Build the export flow.'})
post('atlas', 'atlas-two', 'provider', 'run.ended', {'outcome': 'error', 'errorMessage': 'Codex error: Our servers are currently overloaded. Please try again later.'})
long_reply = 'Search updated. Literal <img src=x onerror=alert(1)> stays text.\n' + 'Arama iyilestirildi; existing notes are preserved.\n' * 14
post('notes', 'notes-one', 'search', 'prompt.received', {'prompt': 'Improve search.'})
post('notes', 'notes-one', 'search', 'run.ended', {'outcome': 'idle', 'summary': long_reply})
post('atlas', 'atlas-one', 'old', 'prompt.received', {'prompt': 'Yesterday request.'}, noon - timedelta(days=1))
post('atlas', 'atlas-one', 'old', 'run.ended', {'outcome': 'idle', 'summary': 'Yesterday result only.'}, noon - timedelta(days=1))

with sync_playwright() as pw:
    executable = os.environ.get('BROWSER_EXECUTABLE') or shutil.which('chromium')
    browser = pw.chromium.launch(headless=True, args=['--host-resolver-rules=MAP dashboard.test-tailnet.ts.net 127.0.0.1', '--no-proxy-server'] if args.tailscale else [], **({'executable_path': executable} if executable else {}))
    page = browser.new_page(viewport={'width': 1440, 'height': 1150}, ignore_https_errors=args.tailscale)
    errors, writes = [], []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('request', lambda req: writes.append(req.url) if '/api/control/requests' in req.url else None)
    url = config['tailscaleUrl'] if args.tailscale else config['url']
    page.goto(url + '/#token=' + config['token'])
    expect(page.locator('#connection-label')).to_have_text('Dashboard connected')
    page.locator('#nav-report').focus(); page.keyboard.press('Enter')
    expect(page.locator('#daily-report')).to_be_visible()
    expect(page.locator('#report-date')).to_have_value(today)
    expect(page.locator('#nav-report')).to_have_attribute('aria-pressed', 'true')
    expect(page.locator('#project-overview')).to_be_hidden()
    expect(page.locator('.report-project')).to_have_count(3)
    assert page.locator('.report-project-name h2').all_text_contents() == ['Atlas Dashboard', 'Fixture Playground', 'Notebook']
    atlas = page.locator('.report-project[data-project="atlas"]')
    expect(atlas.locator('.report-entry')).to_have_count(2)
    expect(atlas.locator('.report-outcomes')).to_contain_text('Added calendar navigation.')
    expect(atlas.locator('.badge.error')).to_have_text('Error')
    expect(atlas.locator('.report-error')).to_contain_text('servers are currently overloaded')
    assert atlas.locator('.report-project-name').bounding_box()['x'] < atlas.locator('.report-work').bounding_box()['x']
    expect(page.locator('#report-list')).not_to_contain_text('Yesterday result only.')
    assert page.locator('#report-list img').count() == 0
    notes = page.locator('.report-project[data-project="notes"]')
    notes.locator('.report-expand').click(); expect(notes.locator('.report-response')).to_have_text(long_reply)
    notes.locator('.report-expand').focus()
    page.evaluate('''() => { window.reportUpdates = 0; new MutationObserver(() => reportUpdates++).observe(document.getElementById('last-update'), {childList:true}); }''')
    post('atlas', 'atlas-one', 'calendar', 'session.heartbeat', {})
    page.wait_for_function('() => window.reportUpdates > 0')
    expect(notes.locator('.report-expand')).to_be_focused()
    expect(notes.locator('.report-expand')).to_have_attribute('aria-expanded', 'true')
    atlas.locator('.report-recorded-response').evaluate('(e) => e.open = true')
    page.evaluate('''() => {window.savedReportResponse = document.querySelector('.report-project[data-project="notes"] .report-response'); const range = document.createRange(); range.setStart(savedReportResponse.firstChild, 0); range.setEnd(savedReportResponse.firstChild, 15); const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range); window.savedReportSelection = selection.toString();}''')
    post('atlas', 'atlas-two', 'unrelated', 'prompt.received', {'prompt': 'Another request today.'})
    expect(atlas.locator('.report-entry')).to_have_count(3)
    assert page.evaluate('() => savedReportResponse === document.querySelector(\'.report-project[data-project="notes"] .report-response\') && getSelection().toString() === savedReportSelection')
    assert atlas.locator('.report-recorded-response').evaluate('(e) => e.open')
    expect(notes.locator('.report-expand')).to_be_focused()
    page.evaluate('''() => Object.defineProperty(navigator, 'clipboard', {configurable:true, value:{writeText: async text => {window.copiedReport = text;}}})''')
    page.locator('#report-copy').click()
    expect(page.locator('#report-copy-status')).to_contain_text('Report copied')
    copied = page.evaluate('window.copiedReport')
    assert 'Added calendar navigation.' in copied and 'Notebook' in copied and 'Error:' in copied
    assert 'not independent verification' in copied and 'Yesterday result only.' not in copied
    page.evaluate('() => window.scrollTo(0, 0)')
    page.screenshot(path=str(output / ('https-desktop.png' if args.tailscale else 'desktop.png')), full_page=True)
    page.evaluate('() => window.scrollTo(0, 400)')
    page.locator('#nav-projects').click(); expect(page.locator('#project-overview')).to_be_visible()
    page.locator('#nav-report').click(); assert page.evaluate('window.scrollY') == 400
    page.locator('#report-previous').click()
    expect(page.locator('#report-date')).to_have_value(yesterday)
    expect(page.locator('.report-project')).to_have_count(1)
    expect(page.locator('#report-list')).to_contain_text('Yesterday result only.')
    page.evaluate('''() => {window.reportChanges=0; new MutationObserver(() => reportChanges++).observe(document.getElementById('report-list'), {subtree:true,childList:true});}''')
    post('notes', 'notes-one', 'current', 'prompt.received', {'prompt': 'Still working today.'})
    expect(page.locator('.session-item').filter(has_text='Notebook')).to_contain_text('2 requests')
    assert page.evaluate('window.reportChanges') == 0
    expect(page.locator('#report-date')).to_have_value(yesterday)
    page.locator('.report-open').click()
    expect(page.locator('#prompt')).to_have_text('Yesterday request.')
    expect(page.locator('#back-to-projects')).to_have_text('← Back to daily report')
    page.locator('#back-to-projects').click()
    expect(page.locator('#report-date')).to_have_value(yesterday)
    expect(page.locator('.report-open')).to_be_focused()
    page.locator('#report-date').fill((noon - timedelta(days=100)).date().isoformat())
    expect(page.locator('#report-list')).to_contain_text('No recorded work for this day.')
    expect(page.locator('#report-copy')).to_be_disabled()
    page.locator('#report-today').click()
    expect(page.locator('#report-date')).to_have_value(today)
    expect(page.locator('#report-next')).to_be_disabled()
    expect(notes.locator('.badge.unknown')).to_contain_text('outcome unknown')
    page.set_viewport_size({'width': 390, 'height': 844})
    assert page.evaluate('() => document.documentElement.scrollWidth <= innerWidth')
    assert atlas.locator('.report-work').bounding_box()['y'] > atlas.locator('.report-project-name').bounding_box()['y']
    page.evaluate('() => window.scrollTo(0, 0)')
    page.screenshot(path=str(output / ('https-mobile.png' if args.tailscale else 'mobile.png')), full_page=True)
    page.evaluate("() => document.documentElement.style.fontSize = '200%'")
    assert page.evaluate('() => document.documentElement.scrollWidth <= innerWidth'), page.evaluate("() => [...document.querySelectorAll('body *')].filter(e => e.getBoundingClientRect().right > innerWidth).map(e => ({id:e.id, class:e.className, width:e.getBoundingClientRect().width})).slice(0, 12)")
    page.reload(); expect(page.locator('#connection-label')).to_have_text('Dashboard connected')
    page.locator('#nav-report').click(); expect(atlas.locator('.report-outcomes')).to_contain_text('Added calendar navigation.')
    if args.tailscale:
        cookie = next(c for c in page.context.cookies() if c['name'] == 'agentdesk')
        assert cookie['secure'] and cookie['httpOnly'] and cookie['sameSite'] == 'Strict'
    stop(); expect(page.locator('#connection-label')).to_have_text('Reconnecting')
    page.clock.install(time=noon.astimezone(timezone.utc))
    page.clock.fast_forward(24 * 60 * 60 * 1000)
    tomorrow = (noon + timedelta(days=1)).date().isoformat()
    expect(page.locator('#report-date')).to_have_value(tomorrow)
    expect(page.locator('#report-list')).to_contain_text('No recorded work for this day.')
    page.locator('#report-date').fill(today)
    page.clock.fast_forward(24 * 60 * 60 * 1000)
    expect(page.locator('#report-date')).to_have_value(today)
    expect(atlas.locator('.report-outcomes')).to_contain_text('Added calendar navigation.')
    assert not writes, writes
    assert not errors, errors
    browser.close()
print('Daily report passed: grouped outcomes, legacy replies, errors/unknown states, local dates, copy, literal text, stable reading under SSE, navigation/focus, mobile/200% and read-only access over ' + ('simulated Serve HTTPS.' if args.tailscale else 'real HTTP/SSE.'))
