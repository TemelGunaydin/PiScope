"""Synthetic Terminal Todos + mock Pi, real HTTP/SSE; never reads personal notes."""
import argparse
import atexit
import copy
import json
import os
import subprocess
import urllib.request
import uuid
from datetime import datetime, timezone
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

parser = argparse.ArgumentParser(); parser.add_argument('--tailscale', action='store_true'); args = parser.parse_args()
root = Path(__file__).resolve().parents[1]; output = root / 'test-results/notes'; output.mkdir(parents=True, exist_ok=True)
child = subprocess.Popen(['node', 'test/browser-fixture.mjs', '--control', '--todos'] + (['--tailscale'] if args.tailscale else []), cwd=root, stdout=subprocess.PIPE, text=True)
def close():
    child.terminate()
    try: child.wait(timeout=5)
    except subprocess.TimeoutExpired: child.kill(); child.wait()
atexit.register(close)
config = json.loads(child.stdout.readline()); source = Path(config['todosFile']); raw = json.loads(source.read_text()); source_mode = source.stat().st_mode
url = config['tailscaleUrl'] if args.tailscale else config['url']
def state():
    req = urllib.request.Request(config['url'] + '/api/state', headers={'Authorization': 'Bearer ' + config['token']})
    with urllib.request.urlopen(req) as response: return json.load(response)
session = state()['sessions'][0]; project = session['projectId']
def post(kind, data):
    payload = {'schemaVersion': 1, 'id': str(uuid.uuid4()), 'type': kind, 'time': datetime.now(timezone.utc).isoformat(), 'projectId': 'same-name-other', 'projectName': 'Control-Fixture', 'sessionId': 'offline-other-session', 'runId': 'other-run', 'data': data}
    req = urllib.request.Request(config['url'] + '/api/events', data=json.dumps(payload).encode(), headers={'Authorization': 'Bearer ' + config['token'], 'Content-Type': 'application/json'})
    with urllib.request.urlopen(req) as response: assert response.status == 200
for kind, data in [('prompt.received', {'prompt': 'Other project work'}), ('run.ended', {'outcome': 'idle'}), ('run.settled', {})]: post(kind, data)
def pulse(n): post('workflow.updated', {'stages': [{'id': 'unrelated', 'title': 'Unrelated update ' + str(n), 'status': 'pending'}]})
def readable(page):
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), 'page overflow'
    assert page.evaluate("() => [...document.querySelectorAll('#project-notes select, #project-notes button')].filter(e => e.getClientRects().length).every(e => e.getBoundingClientRect().height >= 44)"), 'small touch targets'

with sync_playwright() as pw:
    browser = pw.chromium.launch(headless=True, executable_path=os.environ.get('BROWSER_EXECUTABLE', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'), args=['--host-resolver-rules=MAP dashboard.test-tailnet.ts.net 127.0.0.1', '--no-proxy-server'] if args.tailscale else [])
    context = browser.new_context(viewport={'width':1440,'height':1050}, ignore_https_errors=args.tailscale)
    page = context.new_page(); errors, writes = [], []
    context.on('page', lambda p: p.on('pageerror', lambda e: errors.append(str(e))))
    page.on('pageerror', lambda e: errors.append(str(e)))
    context.on('request', lambda req: writes.append(req.post_data_json) if '/api/control/requests' in req.url and req.method == 'POST' else None)
    page.goto(url + '/#token=' + config['token']); expect(page.locator('#connection-label')).to_have_text('Dashboard connected')
    page.locator('#nav-notes').click(); expect(page.locator('#notes-heading')).to_be_focused()
    expect(page.locator('.notes-card')).to_have_count(4)
    first = page.locator('[data-note="1"]'); expect(first.locator('select')).to_have_value('')
    expect(first.get_by_role('button', name='Use as prompt', exact=True)).to_be_disabled(); expect(first.locator('.notes-text')).to_have_text(raw['tasks'][0]['title'])
    # Local draft editing needs no send grant and cannot write the source or submit work.
    viewer_source = source.read_bytes(); first.get_by_role('button', name='Edit prompt', exact=True).click()
    viewer_draft = first.locator('.notes-prompt-draft'); expect(viewer_draft).to_have_value(raw['tasks'][0]['title']); expect(viewer_draft).to_be_focused()
    viewer_draft.fill('Extra instruction before the note.\n' + raw['tasks'][0]['title'])
    expect(first.get_by_role('button', name='Use as prompt', exact=True)).to_be_disabled()
    first.get_by_role('button', name='Cancel edit', exact=True).click(); expect(viewer_draft).to_be_hidden()
    expect(first.get_by_role('button', name='Edit prompt', exact=True)).to_be_focused(); assert source.read_bytes() == viewer_source and not writes
    assert page.locator('#project-notes img').count() == 0
    page.locator('#notes-links summary').click(); expect(page.locator('.notes-link button').first).to_be_disabled()
    assert not writes
    page.goto('about:blank'); page.goto(url + '/#control-token=' + config['controlToken']); expect(page.locator('#connection-label')).to_have_text('Dashboard connected')
    page.locator('#nav-notes').click(); page.locator('#notes-links summary').click()
    link_row = page.locator('.notes-link').filter(has=page.get_by_text('Control-Fixture', exact=True))
    expect(link_row.locator('select')).to_have_value('')  # Same names never auto-link.
    expect(link_row.locator('option')).to_have_count(3)
    expect(link_row.locator(f'option[value="{project}"]')).to_contain_text(project)
    expect(link_row.locator('option[value="same-name-other"]')).to_contain_text('same-name-other')
    link_row.locator('select').select_option(project); link_row.locator('button').click()
    expect(page.locator('#notes-action-status')).to_contain_text('Project link saved')
    expect(first.locator('select')).to_have_value(project); assert not writes
    # A one-time override never falls back to another ready, same-named project.
    first.locator('select').select_option('same-name-other'); first.get_by_role('button', name='Use as prompt', exact=True).click()
    expect(page.locator('#notes-action-status')).to_contain_text('offline'); expect(page.locator('#project-notes')).to_be_visible(); assert not writes
    first.locator('select').select_option(project)
    body = first.locator('.notes-text'); body_node = body.element_handle(); select_node = first.locator('select').element_handle()
    body.focus(); body.evaluate("e => { const range=document.createRange(); range.selectNodeContents(e); const sel=getSelection(); sel.removeAllRanges(); sel.addRange(range); }")
    selection = page.evaluate('getSelection().toString()'); y = page.evaluate('scrollY')
    for n in range(3): pulse(n); page.wait_for_timeout(300)
    assert body_node.evaluate("e => e === document.querySelector('[data-note=\"1\"] .notes-text')")
    assert select_node.evaluate("e => e === document.querySelector('[data-note=\"1\"] select')")
    assert page.evaluate('getSelection().toString()') == selection; expect(body).to_be_focused(); assert abs(page.evaluate('scrollY') - y) < 2
    page.locator('#notes-status').select_option('done'); expect(page.locator('.notes-card')).to_have_count(1); expect(page.locator('[data-note="2"]')).to_contain_text('Completed in Terminal Todos')
    page.locator('#notes-status').select_option('open')
    # Draft from an unassigned note requires an explicit one-time target, not a saved name match.
    unassigned = page.locator('[data-note="3"]'); expect(unassigned.locator('select')).to_have_value('')
    unassigned.locator('select').select_option(project); unassigned.get_by_role('button', name='Use as prompt', exact=True).click()
    expect(page.locator('#control-other-prompt')).to_have_value(raw['tasks'][2]['title']); expect(page.locator('#control-review')).to_be_hidden(); assert not writes
    page.locator('#back-to-projects').click(); expect(page.locator('#notes-heading')).to_be_focused()
    # Full long notes are not silently cut or sent; require manual shortening.
    page.locator('[data-note="4"]').get_by_role('button', name='Use as prompt', exact=True).click(); expect(page.locator('#control-other-prompt')).to_have_value(raw['tasks'][3]['title'])
    page.locator('#control-other-review').click(); expect(page.locator('#control-receipt')).to_contain_text('8,000'); expect(page.locator('#control-review')).to_be_hidden(); assert not writes
    page.locator('#control-other-prompt').fill('x' * 8000); page.locator('#control-other-review').click()
    expect(page.locator('#control-receipt')).to_contain_text('including its visible request ID'); expect(page.locator('#control-review')).to_be_hidden()
    expect(page.locator('#control-other-prompt')).to_have_value('x' * 8000); assert not writes
    page.locator('#back-to-projects').click()
    first.get_by_role('button', name='Edit prompt', exact=True).click()
    draft = first.locator('.notes-prompt-draft'); expect(draft).to_have_value(raw['tasks'][0]['title']); expect(draft).to_be_focused()
    assert draft.evaluate('e => e.selectionStart === 0 && e.selectionEnd === 0')
    draft.fill('   '); expect(first.get_by_role('button', name='Use as prompt', exact=True)).to_be_disabled()
    first.get_by_role('button', name='Cancel edit', exact=True).click(); expect(draft).to_be_hidden(); assert not writes
    first.get_by_role('button', name='Edit prompt', exact=True).click(); expect(draft).to_have_value(raw['tasks'][0]['title'])
    edited = 'Önce yalnız bu projeyi incele.\n' + raw['tasks'][0]['title'] + '\nKeep this additional instruction.'
    draft.fill(edited); draft_node = draft.element_handle(); draft.evaluate('e => e.setSelectionRange(2, 12)')
    expect(first.locator('.notes-text')).to_have_text(raw['tasks'][0]['title'])
    for n in range(3, 6): pulse(n); page.wait_for_timeout(300)
    expect(draft).to_have_value(edited); expect(draft).to_be_focused()
    assert draft_node.evaluate('e => e === document.querySelector("[data-note=\\\"1\\\"] .notes-prompt-draft")')
    assert draft.evaluate('e => e.selectionStart === 2 && e.selectionEnd === 12')
    # Filter/navigation hide the card without destroying the local draft.
    page.locator('#notes-status').select_option('done'); page.locator('#notes-status').select_option('open'); expect(draft).to_have_value(edited)
    page.locator('#nav-projects').click(); page.locator('#nav-notes').click(); expect(draft).to_have_value(edited)
    assert source.read_bytes() == viewer_source and not writes
    raw['tasks'][0]['title'] = 'Updated later in Terminal Todos. Do not replace the copied draft.'
    temp = source.with_suffix('.tmp'); temp.write_text(json.dumps(raw)); temp.chmod(source_mode & 0o777); temp.replace(source)
    approved_source = source.read_bytes(); approved_mtime = source.stat().st_mtime_ns
    expect(first.locator('.notes-text')).to_have_text(raw['tasks'][0]['title']); expect(draft).to_have_value(edited)
    first.get_by_role('button', name='Use as prompt', exact=True).click(); expect(page.locator('#control-other-prompt')).to_have_value(edited)
    expect(page.locator('#control-other-prompt')).to_be_focused(); assert not writes
    pulse(6); page.wait_for_timeout(300)
    expect(page.locator('#control-other-prompt')).to_have_value(edited); expect(page.locator('#control-other-prompt')).to_be_focused()
    page.locator('#control-other-review').click()
    preview = page.locator('#control-review-prompt').inner_text()
    assert preview.startswith('PiScope note request. Request ID: ') and preview.split('\n\n', 1)[1] == edited
    expect(page.locator('#control-other-prompt')).to_have_value(edited)
    expect(page.locator('#control-review-identity')).to_contain_text(project); expect(page.locator('#control-review-identity')).to_contain_text(session['id'])
    expect(page.locator('#control-review-target')).to_contain_text('synthetic/current-model'); expect(page.locator('#control-review-consent')).to_contain_text('Only this project')
    pulse(6); page.wait_for_timeout(350); expect(page.locator('#control-review-prompt')).to_have_text(preview)
    page.locator('#control-cancel').click(); expect(page.locator('#control-review')).to_be_hidden(); expect(page.locator('#control-other-prompt')).to_have_value(edited); assert not writes
    page.locator('#control-other-review').click(); preview = page.locator('#control-review-prompt').inner_text()
    assert preview.split('\n\n', 1)[1] == edited
    page.locator('#control-confirm').evaluate('(e) => { e.click(); e.click(); }')
    expect(page.locator('#prompt')).to_have_text(preview); expect(page.locator('#control-other-review')).to_be_enabled(timeout=10000)
    assert len(writes) == 1 and writes[0]['projectId'] == project and writes[0]['sessionId'] == session['id'] and writes[0]['prompt'] == preview
    assert preview == 'PiScope note request. Request ID: ' + writes[0]['id'] + '\n\n' + edited
    assert 'reportDay' not in writes[0]; assert 'separate project note' not in writes[0]['prompt']
    assert writes[0]['todoRef'] == next(t['ref'] for t in state()['terminalTodos']['tasks'] if t['id'] == '1')
    page.locator('#nav-notes').click()
    expect(first.locator('.notes-activity .badge')).to_have_text('Reply ready')
    expect(first.locator('.notes-reply')).to_have_text('Synthetic response; no model called.')
    expect(first.locator('.notes-activity')).to_contain_text('not verification')
    expect(page.locator('[data-note="3"] .notes-activity')).to_be_hidden()  # Merely copying a draft starts no tracking.
    reply = first.locator('.notes-reply'); reply_node = reply.element_handle(); reply.focus()
    reply.evaluate('e => { const r=document.createRange(); r.selectNodeContents(e); const s=getSelection(); s.removeAllRanges(); s.addRange(r); }')
    response_selection = page.evaluate('getSelection().toString()'); response_y = page.evaluate('scrollY')
    for n in range(7, 10): pulse(n); page.wait_for_timeout(300)
    assert reply_node.evaluate('e => e === document.querySelector("[data-note=\\\"1\\\"] .notes-reply")')
    assert page.evaluate('getSelection().toString()') == response_selection; expect(reply).to_be_focused(); assert abs(page.evaluate('scrollY') - response_y) < 2
    first.get_by_role('button', name='View Pi request', exact=True).click()
    expect(page.locator('#prompt')).to_have_text(preview); expect(page.locator('#control-response-text')).to_have_text('Synthetic response; no model called.')
    page.locator('#back-to-projects').click(); expect(page.locator('#notes-heading')).to_be_focused(); expect(first.locator('.notes-activity .badge')).to_have_text('Reply ready')
    after = state(); assert len(next(s for s in after['sessions'] if s['id'] == 'offline-other-session')['runs']) == 1
    assert source.read_bytes() == approved_source and source.stat().st_mtime_ns == approved_mtime and source.stat().st_mode == source_mode; assert not raw['tasks'][0]['completed']; assert sorted(p.name for p in source.parent.iterdir()) == ['todos.json']
    # Reload retains explicit links; no task text is persisted in PiScope's link metadata.
    page.reload(); expect(page.locator('#connection-label')).to_have_text('Dashboard connected'); page.locator('#nav-notes').click()
    expect(first.locator('select')).to_have_value(project); expect(first.locator('.notes-text')).to_have_text(raw['tasks'][0]['title'])
    expect(first.locator('.notes-prompt-draft')).to_be_hidden()  # No draft persisted through reload.
    expect(first.locator('.notes-activity .badge')).to_have_text('Reply ready'); expect(first.locator('.notes-reply')).to_have_text('Synthetic response; no model called.')
    first.get_by_role('button', name='Edit prompt', exact=True).focus(); page.keyboard.press('Enter')
    expect(first.locator('.notes-prompt-draft')).to_be_focused(); expect(first.locator('.notes-prompt-draft')).to_have_value(raw['tasks'][0]['title'])
    for width in (1440, 768, 390, 320):
        page.set_viewport_size({'width':width, 'height':900}); readable(page)
        assert first.locator('.notes-prompt-draft').evaluate('e => e.getBoundingClientRect().right <= innerWidth'), 'draft overflow'
    page.set_viewport_size({'width':390,'height':844}); page.evaluate("document.documentElement.style.fontSize='200%'"); page.locator('#notes-links summary').click(); readable(page)
    prefix = 'https-' if args.tailscale else ''
    page.evaluate('scrollTo(0, 0)'); page.wait_for_timeout(300)
    page.screenshot(path=str(output / (prefix + 'mobile-200.png')), full_page=True)
    page.evaluate("document.documentElement.style.fontSize=''"); page.set_viewport_size({'width':1440,'height':1050}); page.evaluate('scrollTo(0, 0)'); page.wait_for_timeout(300)
    page.screenshot(path=str(output / (prefix + 'desktop.png')), full_page=True)
    # Source failures preserve last-read text, but cannot create fresh drafts.
    source.write_text('{broken'); expect(page.locator('#notes-warning')).to_contain_text('unreadable'); expect(first.get_by_role('button', name='Use as prompt', exact=True)).to_be_disabled(); expect(page.locator('#notes-results')).to_contain_text('last read snapshot')
    source.write_text(json.dumps(raw)); expect(first.get_by_role('button', name='Use as prompt', exact=True)).to_be_enabled()
    # UI-only busy state: no queuing or fallback to another project/session.
    busy = context.new_page(); frozen = copy.deepcopy(state()); next(a for a in frozen['control']['agents'] if a['projectId'] == project)['idle'] = False
    busy.route('**/api/state', lambda route: route.fulfill(status=200, content_type='application/json', body=json.dumps(frozen)))
    busy.route('**/api/events', lambda route: route.abort())
    busy.goto(url); expect(busy.locator('.project-notes-open').first).to_be_visible(); busy.locator('#nav-notes').click(); busy.locator('[data-note="1"]').get_by_role('button', name='Use as prompt', exact=True).click()
    expect(busy.locator('#notes-action-status')).to_contain_text('busy'); expect(busy.locator('#project-notes')).to_be_visible(); assert len(writes) == 1
    busy.close()
    outdated = context.new_page(); old = copy.deepcopy(state()); next(a for a in old['control']['agents'] if a['projectId'] == project)['canTrack'] = False
    outdated.route('**/api/state', lambda route: route.fulfill(status=200, content_type='application/json', body=json.dumps(old))); outdated.route('**/api/events', lambda route: route.abort())
    outdated.goto(url); expect(outdated.locator('.project-notes-open').first).to_be_visible(); outdated.locator('#nav-notes').click(); outdated.locator('[data-note="1"]').get_by_role('button', name='Use as prompt', exact=True).click()
    expect(outdated.locator('#notes-action-status')).to_contain_text('Update this project'); assert len(writes) == 1; outdated.close()
    for status, label in [('queued', 'Pending'), ('sent', 'Sent'), ('running', 'Running'), ('error', 'Error'), ('unknown', 'Unknown')]:
        simulated = context.new_page(); frozen_status = copy.deepcopy(state()); activity = frozen_status['terminalTodos']['activity'][0]
        activity.update(status=status, reason='Synthetic status only; not a completion claim.', summary='Literal <img src=x onerror=alert(1)> response excerpt.', detailAvailable=False, runId='expired-bound-run')
        simulated.route('**/api/state', lambda route: route.fulfill(status=200, content_type='application/json', body=json.dumps(frozen_status))); simulated.route('**/api/events', lambda route: route.abort())
        simulated.goto(url); expect(simulated.locator('.project-notes-open').first).to_be_visible(); simulated.locator('#nav-notes').click()
        item = simulated.locator('[data-note="1"]'); expect(item.locator('.notes-activity .badge')).to_have_text(label)
        expect(item.locator('.notes-reply')).to_have_text('Literal <img src=x onerror=alert(1)> response excerpt.'); assert item.locator('img').count() == 0
        expect(item.locator('.notes-result-open')).to_be_disabled(); expect(item.locator('.notes-activity')).to_contain_text('no longer retained'); expect(item.locator('.report-label').first).to_contain_text('Open note')
        simulated.set_viewport_size({'width':320, 'height':844}); simulated.evaluate("document.documentElement.style.fontSize='200%'"); readable(simulated); simulated.close()
    assert len(writes) == 1 and not errors, errors
    browser.close()
print('Project notes passed: HTTP/SSE, explicit links and one-time targets, local-only Edit prompt, prefix/exact edited text, cancel, stable drafts/selection, exact single-project delivery once, no source mutation/completion, mobile/200%; no model API or physical phone.')
