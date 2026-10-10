"""One approved all-project daily report; mock Pi, real HTTP/SSE, no model calls."""
import argparse
import atexit
import copy
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
parser = argparse.ArgumentParser(); parser.add_argument('--tailscale', action='store_true'); args = parser.parse_args()
root = Path(__file__).resolve().parents[1]; output = root / 'test-results/daily-generated'; output.mkdir(parents=True, exist_ok=True)
collector = subprocess.Popen(['node', 'test/browser-fixture.mjs', '--control'] + (['--tailscale'] if args.tailscale else []), cwd=root, stdout=subprocess.PIPE, text=True)
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
initial = state(); session = initial['sessions'][0]; project_id = session['projectId']
zone = ZoneInfo(initial['dailyReport']['timeZone']); noon = datetime.now(zone).replace(hour=12, minute=0, second=0, microsecond=0)
today, yesterday = noon.date().isoformat(), (noon - timedelta(days=1)).date().isoformat()
def post(kind, data, when=noon, project=project_id, name='Control-Fixture', run='calendar', session_id='extra-session', demo=False):
    payload = {'schemaVersion': 1, 'id': str(uuid.uuid4()), 'type': kind, 'time': when.astimezone(timezone.utc).isoformat(), 'projectId': project, 'projectName': name, 'sessionId': session_id, 'runId': run, 'demo': demo, 'data': data}
    req = urllib.request.Request(config['url'] + '/api/events', data=json.dumps(payload).encode(), headers={'Authorization': 'Bearer ' + config['token'], 'Content-Type': 'application/json'})
    with urllib.request.urlopen(req) as response: assert response.status == 200
post('prompt.received', {'prompt': 'ORIGINAL_CALENDAR_PROMPT: Add a calendar screen.'})
post('run.ended', {'outcome': 'idle', 'summary': 'ORIGINAL_MODEL_RESPONSE: Navigation improved.'})
post('prompt.received', {'prompt': 'Build export.'}, run='export')
post('run.ended', {'outcome': 'error', 'errorMessage': 'Provider export failure.'}, run='export')
post('prompt.received', {'prompt': 'Yesterday request.'}, noon-timedelta(days=1), run='yesterday')
post('run.ended', {'outcome': 'idle', 'summary': 'Yesterday response.'}, noon-timedelta(days=1), run='yesterday')
post('prompt.received', {'prompt': 'OTHER_PROJECT_CONTEXT'}, project='other-project', name='Other Project', session_id='other-session')
post('prompt.received', {'prompt': 'DEMO_CONTEXT'}, project='demo', name='Demo', session_id='demo', demo=True)
post('session.connected', {}, project='inactive-project', name='Inactive Project', session_id='inactive-session')

def snapshot_route(value):
    body = json.dumps(value)
    return lambda route: route.fulfill(status=200, content_type='application/json', body=body)

with sync_playwright() as pw:
    executable = os.environ.get('BROWSER_EXECUTABLE') or shutil.which('chromium')
    browser = pw.chromium.launch(headless=True, args=['--host-resolver-rules=MAP dashboard.test-tailnet.ts.net 127.0.0.1', '--no-proxy-server'] if args.tailscale else [], **({'executable_path': executable} if executable else {}))
    context = browser.new_context(viewport={'width':1440,'height':1150}, ignore_https_errors=args.tailscale)
    page = context.new_page()
    errors, writes = [], []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('request', lambda req: writes.append(req.post_data_json) if '/api/control/requests' in req.url and req.method == 'POST' else None)
    url = config['tailscaleUrl'] if args.tailscale else config['url']
    page.goto(url + '/#token=' + config['token']); expect(page.locator('#connection-label')).to_have_text('Dashboard connected')
    page.locator('#nav-report').click(); expect(page.locator('#report-date')).to_have_value(today)
    expect(page.get_by_role('button', name='Generate report', exact=True)).to_have_count(1)
    expect(page.locator('.report-project')).to_have_count(0)
    row = page.locator('.report-generated')
    expect(row).to_contain_text('No daily report generated')
    expect(page.locator('#report-generate')).to_be_disabled(); expect(page.locator('#report-availability')).to_contain_text('Viewing only')
    expect(page.locator('#report-copy')).to_be_disabled(); expect(page.locator('#report-list')).not_to_contain_text('ORIGINAL_'); assert not writes
    page.goto('about:blank')  # Pair on a fresh document, not same-page hash navigation.
    page.goto(url + '/#control-token=' + config['controlToken']); expect(page.locator('#connection-label')).to_have_text('Dashboard connected')
    page.locator('#nav-report').click(); expect(page.locator('#report-generate')).to_be_enabled()
    expect(page.locator('#report-model')).to_have_text('synthetic/current-model')
    expect(page.locator('#report-engine-hint')).to_contain_text('not a project filter')
    expect(page.locator('#report-engine-context')).to_contain_text('automatically selected')
    expect(page.locator('#report-ready-badge')).to_have_text('Ready')
    # UI-only snapshots exercise setup states; no work is submitted from these pages.
    base = state(); sdk = next(s for s in base['sessions'] if s['id'] == session['id'])
    for case, title, command in [
        ('extension', 'Enable daily reporting', 'npm run install:pi'),
        ('offline', 'Enable control in the selected', '/dashboard-control on'),
        ('busy', 'Wait for the selected', None),
        ('collector', 'Enable report generation', 'AGENT_DASHBOARD_CONTROL=1'),
        ('viewer', 'Pair this browser', None),
        ('no_context', 'Choose a day with captured work', None),
        ('no_session', 'Choose a Pi session with a finished request', None),
    ]:
        fake = copy.deepcopy(base); fake['sessions'] = [copy.deepcopy(sdk)]
        fake['sessions'][0]['lastSeen'] = datetime.now(timezone.utc).isoformat()
        fake['control']['agents'] = [a for a in fake['control']['agents'] if a['sessionId'] == session['id']]
        for agent in fake['control']['agents']: agent['until'] += 60000
        if case == 'extension':
            fake['control']['agents'][0]['canReport'] = False
            archived = copy.deepcopy(sdk); archived['id'] = 'archived-session'; archived['connected'] = False; fake['sessions'].append(archived)
        elif case == 'offline': fake['control']['agents'] = []
        elif case == 'busy': fake['control']['agents'][0]['idle'] = False
        elif case == 'collector': fake['control'] = {'enabled': False, 'agents': []}
        elif case == 'no_context': fake['dailyReport']['records'] = []; fake['dailyReport']['summaries'] = []
        elif case == 'no_session': fake['sessions'] = []; fake['control']['agents'] = []
        check = page.context.new_page(); check.set_viewport_size({'width':390, 'height':844})
        check.on('pageerror', lambda error: errors.append(str(error)))
        check.route('**/api/state', snapshot_route(fake))
        check.route('**/api/control', snapshot_route({'canSubmit': case != 'viewer'}))
        check.route('**/api/events', lambda route: route.fulfill(status=200, content_type='text/event-stream', body='retry: 60000\n\n'))
        check.on('request', lambda req: writes.append(req.post_data_json) if '/api/control/requests' in req.url and req.method == 'POST' else None)
        check.goto(url + '/'); check.locator('#nav-report').click()
        expect(check.locator('#report-readiness-title')).to_contain_text(title)
        expect(check.locator('#report-generate')).to_be_disabled()
        assert check.locator('#report-generate').get_attribute('aria-describedby') == 'report-availability report-quota'
        if command: expect(check.locator('#report-setup-steps')).to_contain_text(command)
        if case == 'extension':
            expect(check.locator('#report-ready-badge')).to_have_text('Update needed'); expect(check.locator('#report-setup-steps')).to_contain_text('Other projects do not need')
            assert check.locator('#report-session option[value="archived-session"]').count() == 0
            check.screenshot(path=str(output / ('https-setup-mobile.png' if args.tailscale else 'setup-mobile.png')),full_page=True)
        assert check.evaluate('() => document.documentElement.scrollWidth <= innerWidth')
        check.evaluate("() => document.documentElement.style.fontSize='200%'")
        assert check.evaluate('() => document.documentElement.scrollWidth <= innerWidth'), (case, check.evaluate("() => [...document.querySelectorAll('body *')].filter(e => e.getClientRects().length && e.getBoundingClientRect().right > innerWidth).map(e => [e.tagName, e.className, e.textContent.slice(0, 70)])"))
        check.close()
    assert not writes
    page.locator('#report-session').focus(); page.keyboard.press('Tab')
    expect(page.locator('#report-generate')).to_be_focused()
    page.locator('#report-generate').click(); expect(page.locator('#report-review')).to_be_visible()
    expect(page.locator('#report-review-heading')).to_be_focused()
    expect(page.locator('#report-review-target')).to_have_text('All tracked projects (3)')
    expect(page.locator('#report-review-model')).to_have_text('synthetic/current-model')
    expect(page.locator('#report-review-date')).to_contain_text(initial['dailyReport']['timeZone'])
    expect(page.locator('#report-review-session')).to_contain_text('Control-Fixture')
    expect(page.locator('#report-review-session')).to_contain_text(session['id'][:7])
    expect(page.locator('#report-review-scope')).to_contain_text('3 of 3 tracked projects')
    expect(page.locator('#report-review-scope')).to_contain_text('4 of 4 retained work records')
    expect(page.locator('#report-review-cost')).to_contain_text('ONE request')
    expect(page.locator('#report-review-cost')).to_contain_text('existing model quota')
    expect(page.locator('#report-review-permissions')).to_be_visible()
    expect(page.locator('#report-review-permissions')).to_contain_text('not a sandbox')
    expect(page.locator('#report-review-prompt')).to_be_hidden(); assert not writes
    page.locator('#report-review').screenshot(path=str(output / ('https-confirm-desktop.png' if args.tailscale else 'confirm-desktop.png')))
    page.set_viewport_size({'width':390,'height':844}); assert page.evaluate('() => document.documentElement.scrollWidth <= innerWidth')
    page.locator('#report-review').screenshot(path=str(output / ('https-confirm-mobile.png' if args.tailscale else 'confirm-mobile.png')))
    page.evaluate("() => document.documentElement.style.fontSize='200%'"); assert page.evaluate('() => document.documentElement.scrollWidth <= innerWidth')
    page.evaluate("() => document.documentElement.style.fontSize=''"); page.set_viewport_size({'width':1440,'height':1150})
    page.locator('#report-review-details > summary').focus(); page.keyboard.press('Enter')
    expect(page.locator('#report-review-prompt')).to_be_visible()
    preview = page.locator('#report-review-prompt').inner_text()
    assert 'ORIGINAL_CALENDAR_PROMPT' in preview and 'ORIGINAL_MODEL_RESPONSE' in preview
    assert 'Provider export failure' in preview and 'OTHER_PROJECT_CONTEXT' in preview and 'DEMO_CONTEXT' not in preview and 'Yesterday response' not in preview
    assert 'Inactive Project' in preview and '3 of 3 tracked projects' in preview and '4 of 4 retained records' in preview and 'not independent verification' in preview
    assert page.locator('#report-review-prompt').evaluate('e => e.scrollHeight > e.clientHeight && e.clientHeight <= 320')
    page.locator('#report-review-prompt').focus()
    page.evaluate('''() => {
        window.savedPrompt = document.querySelector('#report-review-prompt');
        const range = document.createRange(); range.setStart(savedPrompt.firstChild, 0); range.setEnd(savedPrompt.firstChild, 15);
        getSelection().removeAllRanges(); getSelection().addRange(range); window.savedPromptSelection = getSelection().toString();
        window.previewUpdates = 0; window.previewObserver = new EventSource('/api/events');
        previewObserver.addEventListener('snapshot', () => previewUpdates++);
    }''')
    page.wait_for_function('() => previewUpdates >= 2', timeout=10000); page.evaluate('previewObserver.close()')
    assert page.evaluate('''() => savedPrompt === document.querySelector('#report-review-prompt') && getSelection().toString() === savedPromptSelection && document.querySelector('#report-review-details').open''')
    expect(page.locator('#report-review-prompt')).to_be_focused(); assert not writes
    # R6: daily confirmation must also discard stale model consent without work.
    post('model.selected', {'model': 'synthetic/report-model-changed'}, run=None, session_id=session['id'])
    expect(page.locator('#report-review')).to_be_hidden(); expect(page.locator('#report-confirm')).to_be_disabled()
    expect(page.locator('#report-copy-status')).to_contain_text('model changed'); expect(page.locator('#report-copy-status')).to_be_focused(); assert not writes
    post('model.selected', {'model': 'synthetic/current-model'}, run=None, session_id=session['id'])
    expect(page.locator('#report-generate')).to_be_enabled()
    page.locator('#report-generate').click(); expect(page.locator('#report-review')).to_be_visible()
    page.locator('#report-cancel').click(); expect(page.locator('#report-review')).to_be_hidden(); expect(page.locator('#report-generate')).to_be_focused(); assert not writes
    page.locator('#report-generate').click(); expect(page.locator('#report-review')).to_be_visible()
    expect(page.locator('#report-review-prompt')).to_be_hidden()
    page.locator('#report-confirm').evaluate('(e) => {e.click(); e.click();}')
    expect(row).to_contain_text('Waiting for Pi'); expect(row).to_contain_text('Calendar navigation and reminder handling', timeout=15000)
    expect(row).to_contain_text('Other Project'); expect(page.locator('#report-copy-status')).to_have_text('Generated daily report is ready.')
    assert len(writes) == 1 and writes[0]['expectedPrompt'] == preview.replace(preview.split('Request ID: ')[1].split('\n')[0], writes[0]['id'])
    assert len(state()['dailyReport']['summaries']) == 1 and state()['dailyReport']['summaries'][0]['scope'] == 'all'
    expect(row).to_contain_text('Remaining / blocked'); expect(row).not_to_contain_text('ORIGINAL_'); assert page.locator('#report-list img').count() == 0
    assert len([r for r in state()['dailyReport']['records'] if r['projectId'] == project_id and r['day'] == today]) == 3
    page.evaluate('''() => {window.savedGenerated = document.querySelector('.report-generated .report-response'); const range=document.createRange(); range.setStart(savedGenerated.firstChild,0); range.setEnd(savedGenerated.firstChild,15); getSelection().removeAllRanges(); getSelection().addRange(range); window.savedSelection=getSelection().toString();}''')
    page.locator('#report-session').focus()
    post('prompt.received', {'prompt':'OTHER_PROJECT_NEW_WORK'}, project='other-project', name='Other Project', session_id='other-session', run='new')
    expect(page.locator('.session-item').filter(has_text='Other Project')).to_contain_text('2 requests')
    assert page.evaluate('() => savedGenerated === document.querySelector(\'.report-generated .report-response\') && getSelection().toString() === savedSelection')
    expect(page.locator('#report-session')).to_be_focused(); expect(page.locator('#report-stale')).to_be_visible()
    page.evaluate('''() => Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.copiedReport=text;}}})''')
    page.locator('#report-copy').click(); expect(page.locator('#report-copy-status')).to_contain_text('Report copied')
    copied = page.evaluate('window.copiedReport'); assert 'Calendar navigation' in copied and 'Remaining / blocked' in copied and 'ORIGINAL_' not in copied and 'Other Project' in copied
    page.evaluate('() => window.scrollTo(0,0)'); page.screenshot(path=str(output / ('https-desktop.png' if args.tailscale else 'desktop.png')),full_page=True)
    # Changes in any project's day invalidate the exact preview, not just the target's.
    expect(page.locator('#report-generate')).to_be_enabled(timeout=15000)
    page.locator('#report-generate').click(); expect(page.locator('#report-review')).to_be_visible()
    post('prompt.received', {'prompt':'REPORT_PROVIDER_FAILURE_FIXTURE'}, project='other-project', name='Other Project', session_id='other-session', run='later')
    page.locator('#report-confirm').click(); expect(page.locator('#report-copy-status')).to_contain_text('Recorded work changed')
    assert len(writes) == 2 and len(state()['dailyReport']['summaries']) == 1
    page.locator('#report-cancel').click(); page.locator('#report-generate').click(); expect(page.locator('#report-review')).to_be_visible(); page.locator('#report-confirm').click()
    expect(row).to_contain_text('Synthetic provider overload',timeout=15000); expect(row).to_contain_text('Previous generated daily report')
    expect(page.locator('#report-copy-status')).to_contain_text('Generation did not finish successfully')
    page.locator('#report-copy').click(); assert 'latest generation status: failed' in page.evaluate('window.copiedReport'); expect(row).to_contain_text('Calendar navigation')
    page.set_viewport_size({'width':390,'height':844}); assert page.evaluate('() => document.documentElement.scrollWidth <= innerWidth')
    expect(page.get_by_role('button', name='Generate report', exact=True)).to_have_count(1)
    page.evaluate('() => window.scrollTo(0,0)'); page.screenshot(path=str(output / ('https-mobile.png' if args.tailscale else 'mobile.png')),full_page=True)
    page.evaluate("() => document.documentElement.style.fontSize='200%'"); assert page.evaluate('() => document.documentElement.scrollWidth <= innerWidth')
    page.reload(); expect(page.locator('#connection-label')).to_have_text('Dashboard connected'); page.locator('#nav-report').click(); expect(row).to_contain_text('Calendar navigation')
    page.locator('#report-previous').click(); expect(page.locator('#report-date')).to_have_value(yesterday); expect(row).to_contain_text('No daily report generated')
    expect(page.locator('#report-generate')).to_be_enabled(timeout=15000)
    page.locator('#report-generate').click(); expect(page.locator('#report-review-prompt')).to_contain_text('Yesterday response'); expect(page.locator('#report-review-prompt')).not_to_contain_text('ORIGINAL_CALENDAR_PROMPT'); page.locator('#report-confirm').click()
    expect(row).to_contain_text('Daily '+yesterday,timeout=15000)
    page.locator('#report-today').click(); expect(row).to_contain_text('Daily '+today); expect(row).not_to_contain_text('Daily '+yesterday)
    if args.tailscale:
        cookie=next(c for c in page.context.cookies() if c['name']=='piscope-control'); assert cookie['secure'] and cookie['httpOnly'] and cookie['sameSite']=='Strict'
    stop(); expect(page.locator('#connection-label')).to_have_text('Reconnecting')
    page.clock.install(time=noon.astimezone(timezone.utc)); page.clock.fast_forward(24*60*60*1000)
    expect(page.locator('#report-date')).to_have_value((noon+timedelta(days=1)).date().isoformat())
    page.locator('#report-date').fill(today); page.clock.fast_forward(24*60*60*1000); expect(page.locator('#report-date')).to_have_value(today)
    assert not errors, errors
    browser.close()
print('Daily report passed: ONE Generate button and ONE approved request for all tracked projects, closed/inactive context, read/control separation, preview/cancel/confirm, stale-model consent invalidation without a write, duplicate prevention, typed output, cross-project stale protection, retained report on failure, copy, dates, stable reading, mobile/200% and '+('simulated Serve HTTPS.' if args.tailscale else 'HTTP/SSE.'))
