const workflows = {
  downloadInvoices: {
    label: 'Download Invoices',
    description: 'Downloads pending invoices, emails them to the mapped customer contacts, and updates the invoice status in Google Sheets.',
    cardId: 'invoiceCard',
    statusId: 'invoiceStatus',
    buttonId: 'downloadInvoices',
  },
  processSalesOrders: {
    label: 'Process Sales Orders',
    description: 'Processes sales orders to Pack List status for the users you select.',
    cardId: 'salesCard',
    statusId: 'salesStatus',
    buttonId: 'processSalesOrders',
  },
};

const $ = (id) => document.getElementById(id);
let runStatusTimer;

function stopRunStatusPolling() {
  if (runStatusTimer) {
    clearTimeout(runStatusTimer);
    runStatusTimer = undefined;
  }
}

function setStatus(element, text, state = '') {
  element.innerHTML = `<span class="dot ${state}"></span><span>${text}</span>`;
}

function formatStatus(status) {
  return String(status || 'unknown')
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function formatTime(iso) {
  return new Date(iso).toLocaleString([], {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

async function request(path, options = {}) {
  const response = await fetch(path, {
    cache: 'no-store',
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(options.headers || {}),
    },
  });

  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      body.error || `Request failed (${response.status})`,
    );
  }

  return body;
}

/** Requests cancellation of an active workflow run. */
async function cancelRun(workflowId, runId) {
  await request(`/api/workflows/${workflowId}/runs/${runId}/cancel`, {
    method: 'POST',
    body: '{}',
  });
}

let selectedWorkflow;
let viewVersion = 0;
function showOnly(id) {
  stopRunStatusPolling();
  viewVersion++;
  for (const view of ['loginView', 'homeView', 'appView', 'psoView', 'runView', 'startedView']) {
    $(view).classList.toggle('hidden', view !== id);
  }
}
async function checkSession() {
  const result = await request('/api/session');
  if (result.authenticated) await renderRoute();
  else showView(false);
}
function showView(authenticated) {
  showOnly(authenticated ? 'homeView' : 'loginView');
}
function showPsoView() { return navigate('/?workflow=processSalesOrders&selectUsers=1'); }
function showAppView() { return navigate(`/?workflow=${selectedWorkflow}`); }
async function navigate(url) {
  history.pushState({}, '', url);
  await renderRoute();
}
async function renderRoute() {
  const params = new URLSearchParams(location.search);
  selectedWorkflow = params.get('workflow');
  if (!workflows[selectedWorkflow]) {
    selectedWorkflow = undefined;
    showOnly('homeView');
    $('workflowSelect').value = '';
    return;
  }
  const workflow = workflows[selectedWorkflow];
  if (params.has('started')) {
    showOnly('startedView');
    const runId = params.get('started');
    $('startedRun').disabled = !/^\d+$/.test(runId);
    $('startedCancel').disabled = !/^\d+$/.test(runId);
    $('startedStatus').textContent = $('startedRun').disabled ? 'The workflow was accepted, but its run link was unavailable. Use Back to check Recent Runs.' : '';
    return;
  }
  if (params.get('run')) return showRunLogs(params.get('run'));
  if (selectedWorkflow === 'processSalesOrders' && params.has('selectUsers')) {
    showOnly('psoView');
    return;
  }
  showOnly('appView');
  $('workflowTitle').textContent = workflow.label;
  $('workflowSwitcher').value = '';
  $('workflowDescription').textContent = workflow.description;
  for (const [id, item] of Object.entries(workflows)) {
    $(item.cardId).classList.toggle('hidden', id !== selectedWorkflow);
  }
  $('runs').textContent = 'Loading recent runs…';
  await refreshAll();
}
window.addEventListener('popstate', () => renderRoute());
$('workflowSelect').addEventListener('change', event => navigate(`/?workflow=${event.target.value}`));
$('workflowSwitcher').addEventListener('change', event => navigate(`/?workflow=${event.target.value}`));
for (const button of document.querySelectorAll('.homeButton')) {
  button.addEventListener('click', () => navigate('/'));
}

async function showRunLogs(runId) {
  stopRunStatusPolling();
  const params = new URLSearchParams(location.search);
  const workflowId = params.get('workflow');
  const workflow = workflows[workflowId];

  if (!workflow) {
    history.replaceState({}, '', '/');
    showAppView();
    await refreshAll();
    return;
  }

  showOnly('runView');
  const version = viewVersion;
  $('runLogs').textContent = '';
  $('watchRecording').classList.add('hidden');
  $('runCancel').classList.add('hidden');
  $('runRecording').classList.add('hidden');
  $('runRecording').removeAttribute('src');
  $('runTitle').textContent = `${workflow.label} · Run #${runId}`;
  let refreshing = false;
  async function refreshRunStatus() {
    if (refreshing || version !== viewVersion) return;
    stopRunStatusPolling();
    refreshing = true;
    $('runRefresh').disabled = true;
    try {
      const result = await request(
        `/api/workflows/${workflowId}/runs/${runId}/status`,
      );
      if (version !== viewVersion) return;
      const runState = result.run.conclusion || result.run.status;
      const canCancel = result.run.status === 'in_progress';
      $('runCancel').classList.toggle('hidden', !canCancel);
      const jobLines = result.jobs.flatMap(job => [
        `${job.name}: ${formatStatus(job.conclusion || job.status)}`,
        ...job.steps.map(step => `  ${step.name}: ${formatStatus(step.conclusion || step.status)}`),
      ]);

      $('runLogs').textContent = [
        `Run status: ${formatStatus(runState)}`,
        '',
        ...jobLines,
      ].join('\n');
      $('runLogs').classList.remove('hidden');

      try {
        const logs = await request(`/api/workflows/${workflowId}/runs/${runId}/logs`);
        if (version !== viewVersion) return;
        $('runLogs').textContent = logs.logs;
        const active = result.run.status !== 'completed';
        setStatus($('runLogStatus'), active ? 'Latest available logs loaded. Refreshing every 5 seconds.' : 'Logs loaded.', active ? 'running' : 'success');
        if (active) runStatusTimer = setTimeout(refreshRunStatus, 5_000);
        $('watchRecording').classList.toggle('hidden', active);
      } catch {
        if (version !== viewVersion) return;
        setStatus($('runLogStatus'), result.run.status !== 'completed' ? 'Run in progress. Showing latest step status; logs are not available yet.' : 'Run completed. Logs are still being prepared.', 'running');
        runStatusTimer = setTimeout(refreshRunStatus, 5_000);
      }
    } catch (error) {
      if (version !== viewVersion) return;
      setStatus($('runLogStatus'), error.message, 'failure');
    } finally {
      refreshing = false;
      if (version === viewVersion) $('runRefresh').disabled = false;
    }
  }
  $('runRefresh').onclick = refreshRunStatus;
  $('runCancel').onclick = async () => {
    const button = $('runCancel');
    button.disabled = true;
    try {
      await cancelRun(workflowId, runId);
      setStatus($('runLogStatus'), 'Cancellation requested.', 'running');
      button.classList.add('hidden');
      await refreshRunStatus();
    } catch (error) {
      setStatus($('runLogStatus'), error.message, 'failure');
    } finally {
      button.disabled = false;
    }
  };
  $('watchRecording').onclick = async () => {
    const button = $('watchRecording');
    button.disabled = true;
    button.textContent = 'Loading Recording...';
    try {
      const response = await fetch(
        `/api/workflows/${workflowId}/runs/${runId}/recording`,
        { cache: 'no-store' },
      );
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || 'Could not load the recording.');
      }
      const recording = $('runRecording');
      recording.src = URL.createObjectURL(await response.blob());
      recording.classList.remove('hidden');
      button.textContent = 'Recording Loaded';
    } catch (error) {
      button.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  };

  setStatus($('runLogStatus'), 'Loading run status...', 'running');
  await refreshRunStatus();
}

async function startWorkflow(id, inputs = {}) {
  const result = await request(`/api/workflows/${id}/dispatch`, {
    method: 'POST', body: JSON.stringify(inputs),
  });
  await navigate(`/?workflow=${id}&started=${encodeURIComponent(result.runId ?? '')}`);
}
$('startedBack').addEventListener('click', () => showAppView());
$('startedRun').addEventListener('click', () => {
  const runId = new URLSearchParams(location.search).get('started');
  if (/^\d+$/.test(runId)) navigate(`/?workflow=${selectedWorkflow}&run=${runId}`);
});
$('startedCancel').addEventListener('click', async () => {
  const runId = new URLSearchParams(location.search).get('started');
  const button = $('startedCancel');
  button.disabled = true;
  try {
    await cancelRun(selectedWorkflow, runId);
    $('startedStatus').textContent = 'Cancellation requested.';
  } catch (error) {
    $('startedStatus').textContent = error.message;
    button.disabled = false;
  }
});

async function runWorkflow(id, inputs = {}) {
  const button = $(workflows[id].buttonId);
  const status = $(workflows[id].statusId);

  button.disabled = true;

  setStatus(
    status,
    'Starting workflow...',
    'running',
  );

  try {
    await startWorkflow(id, inputs);

    setStatus(
      status,
      'Workflow queued successfully.',
      'success',
    );


  } catch (error) {
    setStatus(
      status,
      error.message,
      'failure',
    );
  } finally {
    button.disabled = false;
  }
}

async function loadRuns(id) {
  const result = await request(
    `/api/workflows/${id}/runs`,
  );

  return {
    id,
    runs: result.runs || [],
  };
}

function renderRuns(results) {
  const all = results.flatMap(
    ({ id, runs }) =>
      runs.map(run => ({
        ...run,
        workflowId: id,
      })),
  );

  all.sort(
    (a, b) =>
      new Date(b.createdAt) -
      new Date(a.createdAt),
  );

  const recent = all.slice(0, 10);

  if (!recent.length) {
    $('runs').innerHTML =
      '<div class="run-meta">No workflow runs found.</div>';

    return;
  }

  $('runs').innerHTML = recent
    .map(run => {
      const label =
        workflows[run.workflowId].label;

      const status =
        run.status === 'completed'
          ? run.conclusion || 'completed'
          : run.status;

      const rowTone = {
        success: 'success',
        failure: 'failure',
        timed_out: 'failure',
        queued: 'queued',
        waiting: 'queued',
        requested: 'queued',
        pending: 'queued',
        in_progress: 'progress',
      }[status] || 'queued';

      return `
        <div class="run-row run-${rowTone}">
          <div>
            <div class="run-name">
              ${label}
            </div>
            <div class="run-meta">
              Run #${run.runNumber} ·
              ${formatStatus(status)} ·
              ${formatTime(run.createdAt)}
            </div>
          </div>

          <div class="run-actions">
            ${run.status === 'in_progress' ? `<button class="button danger" type="button" data-cancel-workflow="${run.workflowId}" data-cancel-run="${run.id}">Cancel</button>` : ''}
            <a href="/?workflow=${encodeURIComponent(run.workflowId)}&run=${encodeURIComponent(run.id)}">View</a>
          </div>
        </div>
      `;
    })
    .join('');

  for (const button of document.querySelectorAll('[data-cancel-run]')) {
    button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        await cancelRun(button.dataset.cancelWorkflow, button.dataset.cancelRun);
        await refreshAll();
      } catch (error) {
        button.textContent = error.message;
        button.disabled = false;
      }
    });
  }

  for (const { id } of results) {
    const matching =
      results.find(
        item => item.id === id,
      )?.runs?.[0];

    const statusElement =
      $(workflows[id].statusId);

    if (!matching) {
      setStatus(
        statusElement,
        'No recent runs.',
        '',
      );

      continue;
    }

    if (matching.status !== 'completed') {
      setStatus(
        statusElement,
        `${formatStatus(matching.status)} · Run #${matching.runNumber}`,
        'running',
      );
    } else if (
      matching.conclusion === 'success'
    ) {
      setStatus(
        statusElement,
        `Completed · Run #${matching.runNumber}`,
        'success',
      );
    } else {
      setStatus(
        statusElement,
        `${formatStatus(matching.conclusion || 'completed')} · Run #${matching.runNumber}`,
        'failure',
      );
    }
  }
}

async function refreshAll() {
  const id = selectedWorkflow;
  if (!id || $('appView').classList.contains('hidden')) return;
  const version = viewVersion;
  const refresh = $('refreshButton');

  refresh.disabled = true;

  try {
    const result = await loadRuns(id);
    if (version !== viewVersion) return;
    renderRuns([result]);
  } catch (error) {
    if (error.message === 'Unauthorized') {
      showView(false);
      return;
    }

    $('runs').innerHTML =
      `<div class="run-meta">${error.message}</div>`;
  } finally {
    refresh.disabled = false;
  }
}

$('loginForm').addEventListener(
  'submit',
  async event => {
    event.preventDefault();

    $('loginError').textContent = '';

    const password =
      $('password').value;

    try {
      await request('/api/login', {
        method: 'POST',
        body: JSON.stringify({
          password,
        }),
      });

      $('password').value = '';

      await renderRoute();
    } catch (error) {
      $('loginError').textContent =
        error.message;
    }
  },
);

$('logoutButton').addEventListener(
  'click',
  async () => {
    await request(
      '/api/logout',
      {
        method: 'POST',
        body: '{}',
      },
    ).catch(() => {});

    showView(false);
  },
);

$('refreshButton').addEventListener(
  'click',
  refreshAll,
);

$('runBack').addEventListener('click', () => showAppView());
$('homeLogout').addEventListener('click', () => $('logoutButton').click());

$('downloadInvoices').addEventListener(
  'click',
  () => runWorkflow('downloadInvoices'),
);

/*
 * Process Sales Orders
 */

$('processSalesOrders').addEventListener(
  'click',
  () => {
    // Reset selections every time the page is opened.
    $('psoAll').checked = false;
    for (const checkbox of document.querySelectorAll('.psoUser')) {
      checkbox.checked = false;
      checkbox.disabled = false;
      checkbox.closest('.selection-option').classList.remove('disabled');
    }

    showPsoView();
  },
);

$('psoAll').addEventListener('change', () => {
  const allSelected = $('psoAll').checked;
  const userCheckboxes = document.querySelectorAll('.psoUser');

  for (const checkbox of userCheckboxes) {
    checkbox.disabled = allSelected;

    if (allSelected) {
      checkbox.checked = false;
    }

    checkbox.closest('.selection-option')?.classList.toggle(
      'disabled',
      allSelected,
    );
  }
});

$('psoBack').addEventListener(
  'click',
  () => {
    showAppView();
  },
);

$('psoRun').addEventListener(
  'click',
  async () => {
    const allSelected = $('psoAll').checked;

    const users = allSelected
      ? ['all']
      : Array.from(
          document.querySelectorAll(
            '.psoUser:checked',
          ),
        ).map(checkbox => checkbox.value);

    if (users.length === 0) {
      alert('Please select at least one user.');
      return;
    }

    try {
      $('psoRun').disabled = true;

      await startWorkflow('processSalesOrders', { users });
    } catch (error) {
      alert(error.message);
    } finally {
      $('psoRun').disabled = false;
    }
  },
);

checkSession().catch(() =>
  showView(false),
);

if ('serviceWorker' in navigator) {
  navigator.serviceWorker
    .register('/sw.js')
    .catch(() => {});
}
