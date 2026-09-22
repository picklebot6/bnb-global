const workflows = {
  downloadInvoices: { label: 'Download Invoices', statusId: 'invoiceStatus', buttonId: 'downloadInvoices' },
  processSalesOrders: { label: 'Process Sales Orders', statusId: 'salesStatus', buttonId: 'processSalesOrders' },
};

const $ = (id) => document.getElementById(id);

function setStatus(element, text, state = '') {
  element.innerHTML = `<span class="dot ${state}"></span><span>${text}</span>`;
}

function formatTime(iso) {
  return new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

async function request(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
  return body;
}

async function checkSession() {
  const result = await request('/api/session');
  showView(result.authenticated);
  if (result.authenticated) await refreshAll();
}

function showView(authenticated) {
  $('loginView').classList.toggle('hidden', authenticated);
  $('appView').classList.toggle('hidden', !authenticated);
}

async function runWorkflow(id) {
  const button = $(workflows[id].buttonId);
  const status = $(workflows[id].statusId);
  button.disabled = true;
  setStatus(status, 'Starting workflow...', 'running');
  try {
    await request(`/api/workflows/${id}/dispatch`, { method: 'POST', body: '{}' });
    setStatus(status, 'Workflow queued successfully.', 'success');
    setTimeout(refreshAll, 1500);
  } catch (error) {
    setStatus(status, error.message, 'failure');
  } finally {
    button.disabled = false;
  }
}

async function loadRuns(id) {
  const result = await request(`/api/workflows/${id}/runs`);
  return { id, runs: result.runs || [] };
}

function renderRuns(results) {
  const all = results.flatMap(({ id, runs }) => runs.map(run => ({ ...run, workflowId: id })));
  all.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const recent = all.slice(0, 10);

  if (!recent.length) {
    $('runs').innerHTML = '<div class="run-meta">No workflow runs found.</div>';
    return;
  }

  $('runs').innerHTML = recent.map(run => {
    const label = workflows[run.workflowId].label;
    const state = run.conclusion === 'success' ? 'success' : (run.conclusion === 'failure' || run.conclusion === 'cancelled' ? 'failure' : 'running');
    const status = run.status === 'completed' ? (run.conclusion || 'completed') : run.status;
    return `<div class="run-row">
      <div>
        <div class="run-name">${label}</div>
        <div class="run-meta">Run #${run.runNumber} · ${status} · ${formatTime(run.createdAt)}</div>
      </div>
      <a href="${run.url}" target="_blank" rel="noreferrer">View</a>
    </div>`;
  }).join('');

  for (const id of Object.keys(workflows)) {
    const matching = results.find(item => item.id === id)?.runs?.[0];
    const statusElement = $(workflows[id].statusId);
    if (!matching) {
      setStatus(statusElement, 'No recent runs.', '');
      continue;
    }
    if (matching.status !== 'completed') {
      setStatus(statusElement, `${matching.status} · Run #${matching.runNumber}`, 'running');
    } else if (matching.conclusion === 'success') {
      setStatus(statusElement, `Completed · Run #${matching.runNumber}`, 'success');
    } else {
      setStatus(statusElement, `${matching.conclusion || 'completed'} · Run #${matching.runNumber}`, 'failure');
    }
  }
}

async function refreshAll() {
  const refresh = $('refreshButton');
  refresh.disabled = true;
  try {
    const results = await Promise.all(Object.keys(workflows).map(loadRuns));
    renderRuns(results);
  } catch (error) {
    if (error.message === 'Unauthorized') {
      showView(false);
      return;
    }
    $('runs').innerHTML = `<div class="run-meta">${error.message}</div>`;
  } finally {
    refresh.disabled = false;
  }
}

$('loginForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  $('loginError').textContent = '';
  const password = $('password').value;
  try {
    await request('/api/login', { method: 'POST', body: JSON.stringify({ password }) });
    $('password').value = '';
    showView(true);
    await refreshAll();
  } catch (error) {
    $('loginError').textContent = error.message;
  }
});

$('logoutButton').addEventListener('click', async () => {
  await request('/api/logout', { method: 'POST', body: '{}' }).catch(() => {});
  showView(false);
});

$('refreshButton').addEventListener('click', refreshAll);
$('downloadInvoices').addEventListener('click', () => runWorkflow('downloadInvoices'));
$('processSalesOrders').addEventListener('click', () => runWorkflow('processSalesOrders'));

checkSession().catch(() => showView(false));

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}
