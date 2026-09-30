"""Optional UI smoke test; --network uses real HTTP/SSE for the main page.
Regression fixtures still replay in a separate page. Does NOT call a model.
"""
import argparse
import copy
import json
import os
import shutil
import urllib.request
import uuid
from datetime import datetime, timezone, timedelta
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect

parser = argparse.ArgumentParser()
parser.add_argument('--output-dir', default='test-results')
parser.add_argument('--network', action='store_true', help='Use the real server and verify live SSE comparison updates')
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
    if args.network:
        page.goto(config['url'] + '/#token=' + config['token'])
    else:
        replay(page, snapshot)
    expect(page.locator('#connection-label')).to_have_text('Dashboard bağlı')
    expect(page.locator('#project-overview')).to_be_visible()
    page.locator('#demo-mode').click()
    expect(page.locator('.project-card')).to_have_count(1)
    page.locator('.project-open').click()
    page.wait_for_selector('#run-content:not(.hidden)')
    assert page.locator('#demo-banner').is_visible()
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
        project = next(s for s in snapshot['sessions'] if s.get('demo'))
        for variant, task_set in [('variant-a', 'demo-streaming-buffer'), ('variant-b', 'another-task-set')]:
            def record(kind, data):
                return {'schemaVersion': 1, 'id': str(uuid.uuid4()), 'type': kind,
                        'time': datetime.now(timezone.utc).isoformat(), 'demo': True,
                        'sessionId': 'ui-comparison', 'runId': variant,
                        'projectId': project['projectId'], 'projectName': project['projectName'], 'data': data}
            batch = [record('prompt.received', {'prompt': 'Simulated comparison fixture'}),
                     record('workflow.configured', {'workflow': {'schemaVersion': 1, 'id': 'implement-review', 'version': '2', 'label': 'Alternatif workflow', 'taskSet': task_set, 'roles': [{'role': 'review', 'agent': 'reviewer'}]}}),
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
        expect(page.locator('.comparison-evidence').filter(has_text='1 kaldı')).to_have_count(1)
        expect(page.locator('.comparison-evidence').filter(has_text='1 belirsiz')).to_have_count(1)
        page.locator('.session-item').filter(has_text='ui-comp').click()
        page.locator('#run-select').select_option('variant-a')
        expect(page.locator('#test-evidence .badge')).to_have_text('Raporda başarısız')
        assert '1 başarısız' in page.locator('#test-evidence').inner_text()
        page.locator('#test-evidence summary').click()
        assert '2' * 64 in page.locator('#test-evidence').inner_text()
        page.locator('#test-evidence summary').click()
        page.locator('#run-select').select_option('variant-b')
        expect(page.locator('#test-evidence .badge')).to_have_text('Sonuç belirsiz')
        page.locator('#run-select').select_option('variant-a')
        page.screenshot(path=str(output / 'comparison.png'), full_page=True)
        # A returning user sees each project once, even across multiple tabs.
        # Old work uses its event time, not the recent ingestion time.
        old_time = (datetime.now(timezone.utc) - timedelta(days=8)).isoformat()
        # End the held demo signal before checking the new running fixtures.
        batch = [{'schemaVersion': 1, 'id': str(uuid.uuid4()), 'type': 'session.disconnected',
            'time': datetime.now(timezone.utc).isoformat(), 'demo': True,
            'sessionId': project['id'], 'projectId': project['projectId'],
            'projectName': project['projectName'], 'data': {}}]
        def project_event(project_id, name, session, kind, data, old=False):
            batch.append({'schemaVersion': 1, 'id': str(uuid.uuid4()), 'type': kind,
                'time': old_time if old else datetime.now(timezone.utc).isoformat(),
                'demo': True, 'recovered': old, 'sessionId': session, 'runId': 'overview-run',
                'projectId': project_id, 'projectName': name, 'data': data})
        project_event('ui-return', 'Mağaza', 'ui-return-tab', 'prompt.received', {'prompt': 'Ödeme ekranını tamamla'}, True)
        project_event('ui-return', 'Mağaza', 'ui-return-tab', 'workflow.updated', {'stages': [{'id': 'verify', 'title': 'Ödeme akışını doğrula', 'status': 'pending'}]}, True)
        project_event('ui-return', 'Mağaza', 'ui-return-tab', 'run.ended', {'outcome': 'idle', 'summary': 'Ekran hazır, doğrulama bekliyor.'}, True)
        for session in ['ui-active-one', 'ui-active-two']:
            project_event('ui-active', 'Not Defteri', session, 'prompt.received', {'prompt': 'Arama ekranını geliştir'})
        project_event('ui-cancelled', 'Takvim', 'ui-cancelled-tab', 'prompt.received', {'prompt': '<img src=x onerror=alert(1)> metnini güvenle göster'})
        project_event('ui-cancelled', 'Takvim', 'ui-cancelled-tab', 'run.ended', {'outcome': 'aborted'})
        req = urllib.request.Request(config['url'] + '/api/events', data=json.dumps(batch).encode(), headers={'Authorization': 'Bearer ' + config['token'], 'Content-Type': 'application/json'})
        with urllib.request.urlopen(req, timeout=3) as response:
            assert response.status == 200
        page.locator('#overview-button').click()
        expect(page.locator('.project-card')).to_have_count(4)
        expect(page.locator('#project-count')).to_have_text('4')
        expect(page.locator('.project-card[data-project="ui-active"]')).to_contain_text('2 çalışan oturum')
        expect(page.locator('.project-card[data-project="ui-return"]')).to_contain_text('8 gün önce')
        assert page.locator('#project-list img').count() == 0
        page.locator('#project-filter').select_option('stale')
        expect(page.locator('.project-card')).to_have_count(1)
        expect(page.locator('.project-card .badge')).to_have_text('Bekleyen iş')
        page.locator('.project-open').click()
        expect(page.locator('#workspace-details')).to_be_visible()
        expect(page.locator('#prompt')).to_have_text('Ödeme ekranını tamamla')
        page.locator('#overview-button').click()
        page.locator('#project-filter').select_option('running')
        expect(page.locator('.project-card')).to_have_count(1)
        expect(page.locator('.project-card h2')).to_have_text('Not Defteri')
        page.locator('#project-filter').select_option('cancelled')
        expect(page.locator('.project-card .badge')).to_have_text('İptal')
        page.locator('#project-filter').select_option('')
        page.locator('#project-search').fill('doğrula')
        expect(page.locator('.project-card h2')).to_have_text('Mağaza')
        page.locator('.project-saved summary').click()
        expect(page.locator('.project-saved')).to_have_attribute('open', '')
        page.locator('#project-search').fill('unmatchable-word')
        expect(page.locator('#project-list')).to_contain_text('Eşleşen proje yok.')
        page.locator('#project-search').fill('')
        page.locator('#live-mode').click()
        expect(page.locator('.project-card')).to_have_count(0)
        page.locator('#demo-mode').click()
        expect(page.locator('.project-card')).to_have_count(4)
        page.evaluate('() => window.scrollTo(0, 0)')
        page.screenshot(path=str(output / 'projects.png'), full_page=True)
    assert page.evaluate('() => getComputedStyle(document.documentElement).colorScheme') == 'light'
    assert page.locator('#theme').count() == 0
    assert page.evaluate('() => parseFloat(getComputedStyle(document.body).fontSize)') >= 16
    page.screenshot(path=str(output / 'light.png'), full_page=True)
    page.set_viewport_size({'width': 390, 'height': 844})
    assert page.evaluate('() => document.documentElement.scrollWidth <= window.innerWidth')
    assert page.evaluate('''() => [...document.querySelectorAll('body *')].filter(e =>
        e.getClientRects().length && [...e.childNodes].some(n => n.nodeType === Node.TEXT_NODE && n.textContent.trim())
        && parseFloat(getComputedStyle(e).fontSize) < 14).map(e => e.tagName)''') == []
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
    expect(regression.locator('#connection-label')).to_have_text('Dashboard bağlı')
    regression.locator('#demo-mode').click()
    regression.locator('.session-item').first.click()
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
    # No network snapshots are needed to expire a working badge. Archived
    # summaries remain readable even when their source sessions no longer exist.
    remembered = copy.deepcopy(snapshot)
    remembered['sessions'] = []
    base = next(p for p in remembered['projectOverview']['items'] if p.get('demo'))
    archived = copy.deepcopy(base)
    archived.update(projectId='archived-project', projectName='Arşiv Projesi',
        detailAvailable=False, status='waiting', idleStatus='waiting', activeUntil=[],
        nextStep={'id': 'next', 'title': 'Son kontrolü yap', 'status': 'pending'}, pendingCount=1)
    base.update(projectId='stale-project', projectName='Sinyali Kesilen Proje', detailAvailable=False,
        status='running', idleStatus='unknown', activeUntil=[datetime.now(timezone.utc).timestamp() * 1000 + 30000])
    remembered['projectOverview']['items'] = [base, archived]
    archive_page = browser.new_page()
    archive_page.on('pageerror', lambda error: errors.append(str(error)))
    archive_page.clock.install()
    replay(archive_page, remembered)
    expect(archive_page.locator('#connection-label')).to_have_text('Dashboard bağlı')
    archive_page.locator('#demo-mode').click()
    archived_card = archive_page.locator('[data-project="archived-project"]').filter(has=archive_page.locator('h2'))
    expect(archived_card).to_contain_text('ayrıntılı olay kaydı artık tutulmuyor')
    assert archived_card.locator('.project-open').count() == 0
    archived_card.locator('summary').click()
    expect(archived_card.locator('details')).to_contain_text(archived['latest']['prompt'])
    expect(archive_page.locator('.project-card[data-project="stale-project"] .badge')).to_have_text('Çalışıyor')
    archive_page.clock.fast_forward(31000)
    expect(archive_page.locator('.project-card[data-project="stale-project"] .badge')).to_have_text('Sonuç bilinmiyor')
    expect(archived_card.locator('details')).to_have_attribute('open', '')
    archive_page.close()
    assert not errors, errors
    browser.close()
print('UI passed: project overview, grouped tabs, archived summaries, stale work, signal expiry, models, stages, workflow comparisons, JUnit evidence, filters, light theme, readable fonts, mobile layout and terminal-literal regression. Main transport: ' + ('real HTTP/SSE including live comparison and project updates.' if args.network else 'stubbed replay.'))
