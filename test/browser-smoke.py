"""Isolated UI smoke test; --network uses real HTTP/SSE for the main page.
Regression fixtures replay separately. No models or user dashboard data are used.
"""
import atexit
import argparse
import base64
import copy
import json
import os
import shutil
import subprocess
import urllib.request
import uuid
from datetime import datetime, timezone, timedelta
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect

parser = argparse.ArgumentParser()
parser.add_argument('--output-dir', default='test-results')
parser.add_argument('--network', action='store_true', help='Use the real server and verify live SSE comparison updates')
parser.add_argument('--tailscale', action='store_true', help='Simulate Tailscale Serve with a local HTTPS proxy (requires openssl)')
args = parser.parse_args()
if args.tailscale:
    args.network = True
root = Path(__file__).resolve().parents[1]
collector = subprocess.Popen(['node', 'test/browser-fixture.mjs'] + (['--tailscale'] if args.tailscale else []), cwd=root,
                             stdout=subprocess.PIPE, text=True)
def stop_collector():
    if collector.poll() is None:
        collector.terminate()
        try:
            collector.wait(timeout=5)
        except subprocess.TimeoutExpired:
            collector.kill()
            collector.wait()
atexit.register(stop_collector)
config = json.loads(collector.stdout.readline())
parsed = urlparse(config['url'])
assert parsed.scheme == 'http' and parsed.hostname in ('127.0.0.1', 'localhost'), 'Only loopback is allowed'
request = urllib.request.Request(config['url'] + '/api/state', headers={'Authorization': 'Bearer ' + config['token']})
with urllib.request.urlopen(request, timeout=3) as response:
    snapshot = json.load(response)
assert any(s['demo'] for s in snapshot['sessions']), 'Fixture must include hidden demo records'
assert any(not s['demo'] for s in snapshot['sessions']), 'Fixture must include live records'
output = Path(args.output_dir).resolve()
output.mkdir(parents=True, exist_ok=True)
long_prompt = 'Display <img src=x onerror=alert(1)> safely as text. ' + 'Check the calendar workflow. ' * 10
long_summary = 'First line of the saved response.\n' + 'The next step is waiting for a check. ' * 9

def assert_readable(target):
    assert target.evaluate('() => document.documentElement.scrollWidth <= window.innerWidth'), 'Page overflow'
    assert target.evaluate('() => parseFloat(getComputedStyle(document.body).fontSize)') >= 18
    problems = target.evaluate('''() => {
        const rgb = color => (color.match(/[\\d.]+/g) || []).map(Number);
        const luminance = color => color.slice(0, 3).map(n => {
            const v = n / 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4;
        }).reduce((sum, n, i) => sum + n * [.2126, .7152, .0722][i], 0);
        return [...document.querySelectorAll('body *')].flatMap(e => {
            if (!e.getClientRects().length || ![...e.childNodes].some(n =>
                n.nodeType === Node.TEXT_NODE && n.textContent.trim())) return [];
            const style = getComputedStyle(e), issues = [];
            if (parseFloat(style.fontSize) < 16) issues.push('font < 16px');
            let parent = e, bg;
            while (parent) {
                bg = rgb(getComputedStyle(parent).backgroundColor);
                if (bg.length === 3 || bg[3] === 1) break;
                parent = parent.parentElement;
            }
            const fg = luminance(rgb(style.color)), back = luminance(parent ? bg : [255, 255, 255]);
            const contrast = (Math.max(fg, back) + .05) / (Math.min(fg, back) + .05);
            if (contrast < 4.5) issues.push(`contrast ${contrast.toFixed(2)}`);
            return issues.length ? [`${e.tagName}.${e.className}: ${issues.join(', ')}`] : [];
        });
    }''')
    assert not problems, problems

def assert_equal_project_rows(target):
    cards = target.locator('.project-card').evaluate_all('''cards => cards.map(card => {
        const rect = card.getBoundingClientRect();
        return { top: rect.top, height: rect.height, clipped: card.scrollHeight > card.clientHeight + 1 };
    })''')
    rows = {}
    for card in cards:
        rows.setdefault(round(card['top']), []).append(card['height'])
        assert not card['clipped'], 'Project content must not be clipped'
    paired = [heights for heights in rows.values() if len(heights) > 1]
    assert paired, 'Fixture must exercise multi-column project rows'
    assert all(max(heights) - min(heights) <= 1 for heights in paired), rows

with sync_playwright() as pw:
    executable = os.environ.get('BROWSER_EXECUTABLE') or shutil.which('chromium')
    browser = pw.chromium.launch(headless=True,
        args=['--host-resolver-rules=MAP dashboard.test-tailnet.ts.net 127.0.0.1', '--no-proxy-server'] if args.tailscale else [],
        **({'executable_path': executable} if executable else {}))
    page = browser.new_page(viewport={'width': 1440, 'height': 1150}, ignore_https_errors=args.tailscale)
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    html = (root / 'public/index.html').read_text().replace(
        '<link rel="stylesheet" href="/style.css">', '<style>' + (root / 'public/style.css').read_text() + '</style>'
    ).replace('<script type="module" src="/app.js"></script>', '').replace(
        'src="/icon-64.png"', 'src="data:image/png;base64,' + base64.b64encode((root / 'public/icon-64.png').read_bytes()).decode() + '"'
    )
    # Deliberately stub only browser transport. Never disguise this as network E2E.
    def replay(target, data):
        target.set_content(html)
        target.add_script_tag(content='const fixture=' + json.dumps(data) + ';'
            'window.fetch=async()=>new Response(JSON.stringify(fixture));'
            'window.EventSource=class{constructor(){setTimeout(()=>this.onopen?.(),10)}'
            'addEventListener(n,f){setTimeout(()=>f({data:JSON.stringify(fixture)}),20)}close(){}};')
        target.add_script_tag(content=(root / 'public/control.js').read_text().replace('export ', ''))
        target.add_script_tag(content=(root / 'public/report.js').read_text().replace('export ', ''))
        target.add_script_tag(content=(root / 'public/app.js').read_text().replace("import { initializeControls, renderControls, modelError, controlAvailability } from './control.js';", '').replace("import { initializeDailyReport, renderDailyReport, refreshDailyReport } from './report.js';", ''))
    if args.network:
        browser_url = config['tailscaleUrl'] if args.tailscale else config['url']
        if args.tailscale:
            page.goto(browser_url)
            expect(page.locator('#connection-label')).to_have_text('Pairing required')
            page.goto('about:blank')  # Pairing link is opened as a fresh document, not just a hash change.
        page.goto(browser_url + '/#token=' + config['token'])
    else:
        replay(page, snapshot)
    expect(page.locator('#connection-label')).to_have_text('Dashboard connected')
    expect(page.locator('#project-overview')).to_be_visible()
    assert page.locator('html').get_attribute('lang') == 'en'
    expect(page).to_have_title('PiScope · Pi Workflow Dashboard')
    expect(page.get_by_role('link', name='PiScope home')).to_be_visible()
    expect(page.locator('.brand-icon')).to_be_visible()
    expect(page.locator('.brand-icon')).to_have_js_property('naturalWidth', 64)
    expect(page.locator('.brand-icon')).to_have_js_property('naturalHeight', 64)
    expect(page.locator('.brand-icon')).to_have_attribute('alt', '')
    expect(page.locator('link[rel="icon"]')).to_have_attribute('href', '/favicon.ico')
    expect(page.locator('link[rel="apple-touch-icon"]')).to_have_attribute('href', '/apple-touch-icon.png')
    expect(page.locator('#overview-heading')).to_have_text('Where did I leave off?')
    expect(page.locator('#project-filter option[value="running"]')).to_have_text('Running')
    # Built-in UI copy is English; recorded user text is never translated.
    assert not any(c in (root / 'public/app.js').read_text() + (root / 'public/index.html').read_text()
                   for c in 'çğıöşüÇĞİÖŞÜ')
    if args.tailscale:
        cookie = next(c for c in page.context.cookies() if c['name'] == 'agentdesk')
        assert cookie['secure'] and cookie['httpOnly'] and cookie['sameSite'] == 'Strict'
        assert not cookie['domain'].startswith('.')
        assert '#token' not in page.url
        page.reload()
        expect(page.locator('#connection-label')).to_have_text('Dashboard connected')
    assert page.locator('#demo-mode, #live-mode, #overview-button, #demo-banner').count() == 0
    expect(page.locator('.project-card')).to_have_count(1)
    # Short saved text is already visible; no duplicate summary or expand action.
    expect(page.locator('.project-saved, .project-expand')).to_have_count(0)
    expect(page.locator('#project-count')).to_have_text('1')
    expect(page.locator('#project-list')).not_to_contain_text('Swift Playground')
    expect(page.locator('#sessions')).not_to_contain_text('Swift Playground')
    expect(page.locator('#back-to-projects')).to_be_hidden()
    page.locator('#project-search').fill('Fixture')
    page.locator('.project-open').click()
    page.wait_for_selector('#run-content:not(.hidden)')
    expect(page.locator('#back-to-projects')).to_be_visible()
    expect(page.locator('#back-to-projects')).to_have_text('← Back to projects')
    page.locator('#back-to-projects').focus()
    page.keyboard.press('Enter')
    expect(page.locator('#project-overview')).to_be_visible()
    expect(page.locator('#project-search')).to_have_value('Fixture')
    expect(page.locator('.project-open')).to_be_focused()
    page.locator('#project-search').fill('')
    page.locator('.project-open').click()
    assert page.locator('.model-card').count() == 3
    assert page.locator('.stage').count() == 4
    assert page.locator('#workflow-comparison tbody tr').count() >= 1
    assert not page.locator('#perf').is_visible()
    page.locator('.execution-details > summary').click()
    expect(page.locator('#perf')).to_be_visible()
    page.locator('.execution-details > summary').click()
    page.evaluate('() => window.scrollTo(0, 0)')
    page.screenshot(path=str(output / 'preview.png'))
    assert page.locator('.model-card').filter(has_text='DeepSeek').count() == 1
    page.locator('#event-search').fill('deepseek')
    assert page.locator('.event').count() >= 1
    page.locator('#event-search').fill('unmatchable-word')
    assert page.locator('.event-empty').is_visible()
    page.locator('#event-search').fill('')
    if args.network:
        # Add explicitly simulated variants through real ingestion; the open
        # browser must receive them over SSE without a reload or manual fetch.
        project = next(s for s in snapshot['sessions'] if not s.get('demo'))
        for variant, task_set in [('variant-a', 'demo-streaming-buffer'), ('variant-b', 'another-task-set')]:
            def record(kind, data):
                return {'schemaVersion': 1, 'id': str(uuid.uuid4()), 'type': kind,
                        'time': datetime.now(timezone.utc).isoformat(), 'demo': False,
                        'sessionId': 'ui-comparison', 'runId': variant,
                        'projectId': project['projectId'], 'projectName': project['projectName'], 'data': data}
            batch = [record('prompt.received', {'prompt': 'Simulated comparison fixture'}),
                     record('workflow.configured', {'workflow': {'schemaVersion': 1, 'id': 'implement-review', 'version': '2', 'label': 'Alternative workflow', 'taskSet': task_set, 'roles': [{'role': 'review', 'agent': 'reviewer'}]}}),
                     record('run.started', {'model': 'arbitrary-provider/primary'}),
                     record('agent.started', {'agentCallId': 'review', 'agent': 'reviewer'}),
                     record('agent.finished', {'agentCallId': 'review', 'agent': 'reviewer', 'model': 'arbitrary-provider/reviewer', 'source': 'observed', 'isError': False, 'usage': {'input': 10}}),
                     record('run.ended', {'outcome': 'idle'}),
                     record('tests.recorded', {'evidence': {
                         'format': 'junit', 'source': 'imported-report', 'file': 'reports/junit.xml',
                         'reportKey': '1' * 64, 'sha256': '2' * 64,
                         'suiteHash': ('3' if variant == 'variant-a' else '4') * 64,
                         'bytes': 120, 'modifiedAt': datetime.now(timezone.utc).isoformat(),
                         'tests': 1 if variant == 'variant-a' else 0, 'passed': 0,
                         'failures': 1 if variant == 'variant-a' else 0, 'errors': 0, 'skipped': 0}})]
            req = urllib.request.Request(config['url'] + '/api/events', data=json.dumps(batch).encode(), headers={'Authorization': 'Bearer ' + config['token'], 'Content-Type': 'application/json'})
            with urllib.request.urlopen(req, timeout=3) as response:
                assert response.status == 200
        expect(page.locator('#workflow-comparison tbody tr')).to_have_count(3)
        page.locator('#workflow-task-set').select_option('demo-streaming-buffer')
        assert page.locator('#workflow-comparison tbody tr').count() == 2
        page.locator('#workflow-task-set').select_option('another-task-set')
        assert page.locator('#workflow-comparison tbody tr').count() == 1
        assert 'arbitrary-provider/reviewer' in page.locator('#workflow-comparison').inner_text()
        page.locator('#workflow-task-set').select_option('')
        expect(page.locator('.comparison-evidence').filter(has_text='1 failed')).to_have_count(1)
        expect(page.locator('.comparison-evidence').filter(has_text='1 inconclusive')).to_have_count(1)
        page.locator('.session-item').filter(has_text='ui-comp').click()
        page.locator('#run-select').select_option('variant-a')
        expect(page.locator('#test-evidence .badge')).to_have_text('Failed in report')
        assert '1 failed' in page.locator('#test-evidence').inner_text()
        page.locator('#test-evidence summary').click()
        assert '2' * 64 in page.locator('#test-evidence').inner_text()
        page.locator('#test-evidence summary').click()
        page.locator('#run-select').select_option('variant-b')
        expect(page.locator('#test-evidence .badge')).to_have_text('Inconclusive')
        page.locator('#run-select').select_option('variant-a')
        page.screenshot(path=str(output / 'comparison.png'), full_page=True)
        # A returning user sees each project once, even across multiple tabs.
        # Old work uses its event time, not the recent ingestion time.
        old_time = (datetime.now(timezone.utc) - timedelta(days=8)).isoformat()
        # End the held live fixture signal before checking the new running fixtures.
        batch = [{'schemaVersion': 1, 'id': str(uuid.uuid4()), 'type': 'session.disconnected',
            'time': datetime.now(timezone.utc).isoformat(), 'demo': False,
            'sessionId': project['id'], 'projectId': project['projectId'],
            'projectName': project['projectName'], 'data': {}}]
        def project_event(project_id, name, session, kind, data, old=False):
            batch.append({'schemaVersion': 1, 'id': str(uuid.uuid4()), 'type': kind,
                'time': old_time if old else datetime.now(timezone.utc).isoformat(),
                'demo': False, 'recovered': old, 'sessionId': session, 'runId': 'overview-run',
                'projectId': project_id, 'projectName': name, 'data': data})
        project_event('ui-return', 'Marketplace', 'ui-return-tab', 'prompt.received', {'prompt': 'Finish the checkout screen'}, True)
        project_event('ui-return', 'Marketplace', 'ui-return-tab', 'workflow.updated', {'stages': [{'id': 'verify', 'title': 'Verify the checkout flow', 'status': 'pending'}]}, True)
        project_event('ui-return', 'Marketplace', 'ui-return-tab', 'run.ended', {'outcome': 'idle', 'summary': 'Screen ready; verification is pending.'}, True)
        for session in ['ui-active-one', 'ui-active-two']:
            project_event('ui-active', 'Notebook', session, 'prompt.received', {'prompt': 'Improve the search screen'})
        project_event('ui-cancelled', 'Planner', 'ui-cancelled-tab', 'prompt.received', {'prompt': long_prompt})
        project_event('ui-cancelled', 'Planner', 'ui-cancelled-tab', 'run.ended', {'outcome': 'aborted', 'summary': long_summary})
        req = urllib.request.Request(config['url'] + '/api/events', data=json.dumps(batch).encode(), headers={'Authorization': 'Bearer ' + config['token'], 'Content-Type': 'application/json'})
        with urllib.request.urlopen(req, timeout=3) as response:
            assert response.status == 200
        page.locator('#back-to-projects').click()
        expect(page.locator('.project-card')).to_have_count(4)
        expect(page.locator('#project-count')).to_have_text('4')
        assert_equal_project_rows(page)
        expect(page.locator('.project-card[data-project="ui-active"]')).to_contain_text('2 active sessions')
        expect(page.locator('.project-card[data-project="ui-return"]')).to_contain_text('8 days ago')
        assert page.locator('#project-list img').count() == 0
        page.locator('#project-filter').select_option('stale')
        expect(page.locator('.project-card')).to_have_count(1)
        expect(page.locator('.project-card .badge')).to_have_text('Unfinished work')
        page.locator('.project-open').click()
        expect(page.locator('#workspace-details')).to_be_visible()
        expect(page.locator('#prompt')).to_have_text('Finish the checkout screen')
        page.locator('#back-to-projects').click()
        expect(page.locator('#project-filter')).to_have_value('stale')
        expect(page.locator('.project-open')).to_be_focused()
        page.locator('#project-filter').select_option('running')
        expect(page.locator('.project-card')).to_have_count(1)
        expect(page.locator('.project-card h2')).to_have_text('Notebook')
        page.locator('#project-filter').select_option('cancelled')
        expect(page.locator('.project-card .badge')).to_have_text('Cancelled')
        page.locator('#project-filter').select_option('')
        page.locator('#project-search').fill('verify')
        expect(page.locator('.project-card h2')).to_have_text('Marketplace')
        expect(page.locator('.project-saved, .project-expand')).to_have_count(0)
        page.locator('#project-search').fill('unmatchable-word')
        expect(page.locator('#project-list')).to_contain_text('No matching projects.')
        page.locator('#project-search').fill('')
        expect(page.locator('.project-card')).to_have_count(4)
        # Fresh work must update the existing card, not move it to the front.
        project_order = page.locator('.project-card').evaluate_all('(cards) => cards.map(c => c.dataset.project)')
        session_order = page.locator('.session-item').all_text_contents()
        assert page.locator('.project-card h2').all_text_contents() == ['Fixture Playground', 'Marketplace', 'Notebook', 'Planner']
        last = page.locator('.project-card[data-project="ui-cancelled"]')
        summary_toggle = last.locator('.project-expand[data-field="summary"]')
        summary_toggle.click()
        expect(summary_toggle).to_have_attribute('aria-expanded', 'true')
        expect(last.locator('.project-expand[data-field="prompt"]')).to_have_attribute('aria-expanded', 'false')
        expect(last.locator('.project-answer')).to_have_text(long_summary)
        assert_equal_project_rows(page)
        summary_toggle.focus()
        batch = []
        updated_summary = 'Response updated over SSE. ' + long_summary
        project_event('ui-cancelled', 'Planner', 'ui-cancelled-tab', 'message.completed', {'summary': updated_summary})
        req = urllib.request.Request(config['url'] + '/api/events', data=json.dumps(batch).encode(), headers={'Authorization': 'Bearer ' + config['token'], 'Content-Type': 'application/json'})
        with urllib.request.urlopen(req, timeout=3) as response:
            assert response.status == 200
        expect(last.locator('.project-answer')).to_have_text(updated_summary)
        assert_equal_project_rows(page)
        assert page.locator('.project-card').evaluate_all('(cards) => cards.map(c => c.dataset.project)') == project_order
        assert page.locator('.session-item').all_text_contents() == session_order
        expect(summary_toggle).to_have_attribute('aria-expanded', 'true')
        expect(summary_toggle).to_be_focused()
        expect(last.locator('.project-expand[data-field="prompt"]')).to_have_attribute('aria-expanded', 'false')
        # Returning from a lower card restores scroll, focus and expanded summaries.
        last.locator('.project-open').scroll_into_view_if_needed()
        scroll_before = page.evaluate('window.scrollY')
        last.locator('.project-open').click()
        page.locator('#back-to-projects').click()
        expect(last.locator('.project-open')).to_be_focused()
        expect(summary_toggle).to_have_attribute('aria-expanded', 'true')
        assert abs(page.evaluate('window.scrollY') - scroll_before) <= 2
        # A shorter replacement no longer needs a toggle; keep focus on its text.
        summary_toggle.focus()
        batch = []
        project_event('ui-cancelled', 'Planner', 'ui-cancelled-tab', 'message.completed', {'summary': 'Short updated response.'})
        req = urllib.request.Request(config['url'] + '/api/events', data=json.dumps(batch).encode(), headers={'Authorization': 'Bearer ' + config['token'], 'Content-Type': 'application/json'})
        with urllib.request.urlopen(req, timeout=3) as response:
            assert response.status == 200
        expect(last.locator('.project-answer')).to_have_text('Short updated response.')
        expect(summary_toggle).to_have_count(0)
        expect(last.locator('.project-answer')).to_be_focused()
        assert_equal_project_rows(page)
        page.evaluate("() => document.documentElement.style.fontSize='200%'")
        assert_equal_project_rows(page); assert_readable(page)
        page.evaluate("() => document.documentElement.style.fontSize=''")
        page.evaluate('() => window.scrollTo(0, 0)')
        page.screenshot(path=str(output / 'projects.png'), full_page=True)
    assert page.evaluate('() => getComputedStyle(document.documentElement).colorScheme') == 'light'
    assert page.locator('#theme').count() == 0
    assert_readable(page)
    page.screenshot(path=str(output / 'light.png'), full_page=True)
    page.set_viewport_size({'width': 390, 'height': 844})
    assert_readable(page)
    page.screenshot(path=str(output / 'mobile.png'), full_page=True)
    # Daily generation setup remains readable; merely opening it sends no work.
    page.locator('#nav-report').click()
    expect(page.locator('#report-generate')).to_be_disabled()
    for width in (1440, 1024, 768, 390, 320):
        page.set_viewport_size({'width': width, 'height': 900}); assert_readable(page)
    page.evaluate("() => document.documentElement.style.fontSize='200%'"); assert_readable(page)
    page.evaluate("() => document.documentElement.style.fontSize=''")
    page.locator('#nav-projects').click()
    # Reflow and contrast also apply to the deeper execution UI, not just overview.
    page.locator('.session-item').first.click()
    page.locator('.execution-details > summary').click()
    for width in (1440, 1024, 768, 390, 320):
        page.set_viewport_size({'width': width, 'height': 900})
        assert_readable(page)
    page.set_viewport_size({'width': 390, 'height': 844})
    page.screenshot(path=str(output / 'mobile-details.png'), full_page=True)
    # The return action stays reachable even at the bottom of a long mobile detail.
    page.evaluate('window.scrollTo(0, document.body.scrollHeight)')
    expect(page.locator('#back-to-projects')).to_be_in_viewport()
    page.screenshot(path=str(output / 'mobile-back.png'))
    page.locator('#back-to-projects').click()
    expect(page.locator('#project-overview')).to_be_visible()
    expect(page.locator('#back-to-projects')).to_be_hidden()
    # Targeted regression: src/store.mjs keeps an agent.progress status literal
    # verbatim with finished=False until an agent.finished mark arrives. The
    # model cards must never turn a progress-only terminal-looking literal into
    # a green 'Done'/red 'Error' result; unknown/waiting is shown instead and the
    # main session keeps waiting on the unfinished agent. Genuine finished
    # records and live in-progress states keep their display.
    def agent_fixture(call_id, name, status, finished):
        return {'id': call_id, 'agent': name, 'model': 'demo/ui-fixture', 'modelSource': 'observed',
                'task': f'fixture: agent.progress status={status}', 'status': status, 'tools': [], 'finished': finished}
    regressed = copy.deepcopy(snapshot)
    run = next(s for s in regressed['sessions'] if not s.get('demo') and s['runs'])['runs'][-1]
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
    expect(regression.locator('#connection-label')).to_have_text('Dashboard connected')
    regression.locator('.session-item').first.click()
    regression.wait_for_selector('#run-content:not(.hidden)')
    for name in ('ui-literal-done', 'ui-literal-error', 'ui-literal-blocked', 'ui-literal-cancelled'):
        waiting = regression.locator('.model-card').filter(has_text=name).locator('.badge')
        assert waiting.text_content().strip() == 'Outcome unknown / awaiting completion', name
        assert 'done' not in waiting.get_attribute('class') and 'error' not in waiting.get_attribute('class'), name
    assert regression.locator('.model-card').filter(has_text='ui-running').locator('.badge').text_content().strip() == 'Running'
    assert regression.locator('.model-card').filter(has_text='ui-finished-done').locator('.badge').text_content().strip() == 'Done'
    assert regression.locator('.model-card').filter(has_text='ui-finished-error').locator('.badge').text_content().strip() == 'Error'
    main = regression.locator('.model-card').first
    assert main.locator('.model-role').text_content().strip() == 'Main session'
    assert main.locator('.model-task').text_content().strip() == 'Waiting for subagent results.'
    regression.close()
    # No network snapshots are needed to expire a working badge. Archived
    # summaries remain readable even when their source sessions no longer exist.
    remembered = copy.deepcopy(snapshot)
    remembered['sessions'] = []
    base = next(p for p in remembered['projectOverview']['items'] if not p.get('demo'))
    archived = copy.deepcopy(base)
    archived.update(projectId='archived-project', projectName='Archived Project',
        detailAvailable=False, status='waiting', idleStatus='waiting', activeUntil=[],
        nextStep={'id': 'next', 'title': 'Run the final check', 'status': 'pending'}, pendingCount=1)
    archived['latest'].update(prompt=long_prompt, summary=long_summary)
    base.update(projectId='stale-project', projectName='Disconnected Project', detailAvailable=False,
        status='running', idleStatus='unknown', activeUntil=[datetime.now(timezone.utc).timestamp() * 1000 + 30000])
    remembered['projectOverview']['items'] = [base, archived]
    archive_page = browser.new_page()
    archive_page.on('pageerror', lambda error: errors.append(str(error)))
    archive_page.clock.install()
    replay(archive_page, remembered)
    expect(archive_page.locator('#connection-label')).to_have_text('Dashboard connected')
    archived_card = archive_page.locator('[data-project="archived-project"]').filter(has=archive_page.locator('h2'))
    expect(archived_card).to_contain_text('detailed event history is no longer retained')
    assert archived_card.locator('.project-open').count() == 0
    archived_toggle = archived_card.locator('.project-expand[data-field="prompt"]')
    archived_toggle.focus()
    archive_page.keyboard.press('Enter')
    expect(archived_card.locator('.project-prompt')).to_have_text(long_prompt)
    expect(archived_card.locator('.project-expand[data-field="summary"]')).to_have_attribute('aria-expanded', 'false')
    assert archived_card.locator('img').count() == 0
    expect(archive_page.locator('.project-card[data-project="stale-project"] .badge')).to_have_text('Running')
    expect(archive_page.locator('.project-card[data-project="stale-project"]')).to_have_attribute('data-status', 'running')
    archive_page.clock.fast_forward(31000)
    expect(archive_page.locator('.project-card[data-project="stale-project"] .badge')).to_have_text('Outcome unknown')
    expect(archive_page.locator('.project-card[data-project="stale-project"]')).to_have_attribute('data-status', 'unknown')
    expect(archived_toggle).to_have_attribute('aria-expanded', 'true')
    expect(archived_toggle).to_be_focused()
    archive_page.close()
    # Thresholds are per field; opening replaces the excerpt instead of repeating it.
    excerpts = copy.deepcopy(remembered)
    excerpts['projectOverview']['items'] = []
    # Non-English user content must still be preserved verbatim in the English UI.
    text_cases = [('empty', '', ''), ('short', 'Kısa istek', 'Kısa yanıt'),
                  ('limit', 'a' * 220, 'b' * 220), ('prompt-only', 'a' * 221, 'Kısa yanıt'),
                  ('summary-only', 'Kısa istek', 'b' * 221), ('both', long_prompt, long_summary)]
    for name, prompt, summary in text_cases:
        item = copy.deepcopy(archived)
        item.update(projectId=name, projectName=name)
        item['latest'].update(prompt=prompt, summary=summary)
        excerpts['projectOverview']['items'].append(item)
    text_page = browser.new_page(viewport={'width': 1440, 'height': 1100})
    text_page.on('pageerror', lambda error: errors.append(str(error)))
    replay(text_page, excerpts)
    expect(text_page.locator('#connection-label')).to_have_text('Dashboard connected')
    expect(text_page.locator('.project-saved')).to_have_count(0)
    for name, prompt, summary in text_cases:
        card = text_page.locator(f'.project-card[data-project="{name}"]')
        for field, css_class, label, text, fallback in (
            ('prompt', 'project-prompt', 'Last request', prompt, 'Request text not recorded.'),
            ('summary', 'project-answer', 'Last response', summary, 'Response summary not recorded.')
        ):
            paragraph = card.locator('.' + css_class)
            toggle = card.locator(f'.project-expand[data-field="{field}"]')
            expect(card.get_by_text(label, exact=True)).to_have_count(1)
            expect(paragraph).to_have_count(1)
            if len(text) <= 220:
                expect(toggle).to_have_count(0)
                expect(paragraph).to_have_text(text or fallback)
                continue
            expect(toggle).to_have_text('Show more')
            expect(toggle).to_have_attribute('aria-expanded', 'false')
            expect(paragraph).to_have_text(text[:220].rstrip() + '…')
            assert toggle.get_attribute('aria-controls') == paragraph.get_attribute('id')
            assert toggle.evaluate('(e) => e.previousElementSibling.id === e.getAttribute("aria-controls")')
            toggle.focus()
            text_page.keyboard.press('Enter')
            expect(toggle).to_have_text('Show less')
            expect(toggle).to_have_attribute('aria-expanded', 'true')
            assert paragraph.text_content() == text
            text_page.keyboard.press('Space')
            expect(toggle).to_have_text('Show more')
            expect(toggle).to_have_attribute('aria-expanded', 'false')
            expect(paragraph).to_have_text(text[:220].rstrip() + '…')
    both = text_page.locator('.project-card[data-project="both"]')
    both.locator('.project-expand[data-field="prompt"]').click()
    both.locator('.project-expand[data-field="summary"]').click()
    assert text_page.locator('#project-list img').count() == 0
    for width in (1440, 390, 320):
        text_page.set_viewport_size({'width': width, 'height': 900})
        assert_readable(text_page)
    both.screenshot(path=str(output / 'expanded-project.png'))
    text_page.close()
    # A reported running step is different from a future or blocked step.
    plan_labels = [('pending', 'Plan: Next step'), ('running', 'Plan: Step in progress'),
                   ('blocked', 'Plan: Blocked step'), ('error', 'Plan: Step with a reported error')]
    planned = copy.deepcopy(remembered)
    planned['projectOverview']['items'] = []
    for status, label in plan_labels:
        item = copy.deepcopy(archived)
        item.update(projectId=status, projectName=status, nextStep={'title': 'Example plan step', 'status': status})
        planned['projectOverview']['items'].append(item)
    plan_page = browser.new_page()
    plan_page.on('pageerror', lambda error: errors.append(str(error)))
    replay(plan_page, planned)
    expect(plan_page.locator('#connection-label')).to_have_text('Dashboard connected')
    for status, label in plan_labels:
        expect(plan_page.locator(f'[data-project="{status}"] .project-next .project-field-label')).to_have_text(label)
    plan_page.close()
    # Every project state has a readable text label and a consistent semantic tone.
    palette = copy.deepcopy(remembered)
    palette['projectOverview']['items'] = []
    states = [('running', 'Running', 'Search Service'), ('waiting', 'Unfinished work', 'Marketplace'),
              ('attention', 'Needs attention', 'Payments API'), ('finished', 'Last request finished', 'Notebook'),
              ('cancelled', 'Cancelled', 'Planner'), ('unknown', 'Outcome unknown', 'Archived Project')]
    for status, label, name in states:
        item = copy.deepcopy(archived)
        item.update(projectId=status, projectName=name, idleStatus=status,
            activeUntil=[datetime.now(timezone.utc).timestamp() * 1000 + 3600000] if status == 'running' else [],
            nextStep={'title': 'Verify the checkout flow', 'status': 'pending'} if status == 'waiting' else None,
            pendingCount=1 if status == 'waiting' else 0)
        item['latest'].update(prompt='Review the latest changes and identify the next step.',
                              summary='Work recorded. The latest state is shown in the status label above.')
        palette['projectOverview']['items'].append(item)
    design = browser.new_page(viewport={'width': 1440, 'height': 1100})
    design.on('pageerror', lambda error: errors.append(str(error)))
    replay(design, palette)
    expect(design.locator('#connection-label')).to_have_text('Dashboard connected')
    colors = []
    for status, label, name in states:
        card = design.locator(f'.project-card[data-status="{status}"]')
        expect(card.locator('.badge')).to_have_text(label)
        assert card.locator('h2').evaluate('(e) => parseFloat(getComputedStyle(e).fontSize)') >= 24
        if status in ('running', 'waiting', 'attention', 'finished'):
            border = card.evaluate('(e) => getComputedStyle(e).borderTopColor')
            assert border == card.locator('.badge').evaluate('(e) => getComputedStyle(e).color')
            colors.append(border)
    assert len(set(colors)) == 4, 'Running, waiting, attention and finished must be distinct'
    expect(design.locator('.project-next.has-next')).to_have_count(1)
    expect(design.locator('.project-next.has-next')).to_contain_text('Verify the checkout flow')
    # The palette must supplement labels without changing filters or navigation.
    for status, label, name in states:
        design.locator('#project-filter').select_option(status)
        expect(design.locator('.project-card')).to_have_count(1)
        expect(design.locator('.project-card h2')).to_have_text(name)
    design.locator('#project-filter').select_option('')
    assert_readable(design)
    design.screenshot(path=str(output / 'status-palette.png'), full_page=True)
    design.locator('#project-search').focus()
    design.keyboard.press('Tab')
    expect(design.locator('#project-filter')).to_be_focused()
    assert design.locator('#project-filter').evaluate('(e) => getComputedStyle(e).outlineStyle') != 'none'
    for width in (1024, 768, 390, 320):
        design.set_viewport_size({'width': width, 'height': 900})
        assert_readable(design)
    # A long real-world repository name and 200% text size must not break reflow.
    design.locator('.project-card h2').first.evaluate('(e) => e.textContent = "LongRepositoryName".repeat(8)')
    design.set_viewport_size({'width': 390, 'height': 844})
    assert_readable(design)
    design.screenshot(path=str(output / 'mobile-projects.png'), full_page=True)
    design.set_viewport_size({'width': 720, 'height': 900})
    design.add_style_tag(content='html { font-size: 200%; }')
    assert_readable(design)
    design.close()
    assert not errors, errors
    browser.close()
print('UI passed: English PiScope UI, unchanged non-English user text, live-only overview, back navigation with filters/focus/scroll restored, stable project/session ordering under SSE, grouped tabs, conditional per-field text expansion, 220-character boundaries, archived summaries, stale work, signal expiry, models, stages, workflow comparisons, JUnit evidence, filters, semantic status colors, light theme, 18px body / 16px secondary text, text contrast, keyboard focus, responsive layout, 200% text sizing and terminal-literal regression. Main transport: ' + ('simulated Tailscale Serve HTTPS proxy, Secure cookie and live SSE.' if args.tailscale else 'real HTTP/SSE including live comparison and project updates.' if args.network else 'stubbed replay.'))
