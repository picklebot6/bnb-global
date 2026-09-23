const workflows = {
  downloadInvoices: {
    label: 'Download Invoices',
    statusId: 'invoiceStatus',
    buttonId: 'downloadInvoices',
  },
  processSalesOrders: {
    label: 'Process Sales Orders',
    statusId: 'salesStatus',
    buttonId: 'processSalesOrders',
  },
};

const $ = (id) => document.getElementById(id);

function setStatus(element, text, state = '') {
  element.innerHTML = `<span class="dot ${state}"></span><span>${text}</span>`;
}

function formatTime(iso) {
  return new Date(iso).toLocaleString([], {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

async function request(path, options = {}) {
  const response = await fetch(path, {
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

async function checkSession() {
  const result = await request('/api/session');

  const run = new URLSearchParams(location.search).get('run');
  showView(result.authenticated);

  if (result.authenticated) {
    if (run) {
      await showRunLogs(run);
    } else {
      await refreshAll();
    }
  }
}

function showView(authenticated) {
  $('loginView').classList.toggle('hidden', authenticated);
  $('appView').classList.toggle('hidden', !authenticated);
  $('psoView').classList.add('hidden');
  $('runView').classList.add('hidden');
}

function showPsoView() {
  $('loginView').classList.add('hidden');
  $('appView').classList.add('hidden');
  $('psoView').classList.remove('hidden');
}

function showAppView() {
  $('psoView').classList.add('hidden');
  $('runView').classList.add('hidden');
  $('appView').classList.remove('hidden');
}

async function showRunLogs(runId) {
  const params = new URLSearchParams(location.search);
  const workflowId = params.get('workflow');
  const workflow = workflows[workflowId];

  if (!workflow) {
    history.replaceState({}, '', '/');
    showAppView();
    await refreshAll();
    return;
  }

  $('appView').classList.add('hidden');
  $('psoView').classList.add('hidden');
  $('runView').classList.remove('hidden');
  $('runTitle').textContent = `${workflow.label} · Run #${runId}`;
  $('runLogs').classList.add('hidden');
  setStatus($('runLogStatus'), 'Loading logs...', 'running');

  try {
    const result = await request(`/api/workflows/${workflowId}/runs/${runId}/logs`);
    $('runLogs').textContent = result.logs;
    $('runLogs').classList.remove('hidden');
    setStatus($('runLogStatus'), 'Logs loaded.', 'success');
  } catch (error) {
    setStatus($('runLogStatus'), error.message, 'failure');
  }
}

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
    await request(
      `/api/workflows/${id}/dispatch`,
      {
        method: 'POST',
        body: JSON.stringify(inputs),
      },
    );

    setStatus(
      status,
      'Workflow queued successfully.',
      'success',
    );

    setTimeout(refreshAll, 1500);
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

      return `
        <div class="run-row">
          <div>
            <div class="run-name">
              ${label}
            </div>
            <div class="run-meta">
              Run #${run.runNumber} ·
              ${status} ·
              ${formatTime(run.createdAt)}
            </div>
          </div>

          <a href="/?workflow=${encodeURIComponent(run.workflowId)}&run=${encodeURIComponent(run.id)}">
            View
          </a>
        </div>
      `;
    })
    .join('');

  for (const id of Object.keys(workflows)) {
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
        `${matching.status} · Run #${matching.runNumber}`,
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
        `${matching.conclusion || 'completed'} · Run #${matching.runNumber}`,
        'failure',
      );
    }
  }
}

async function refreshAll() {
  const refresh = $('refreshButton');

  refresh.disabled = true;

  try {
    const results = await Promise.all(
      Object.keys(workflows).map(loadRuns),
    );

    renderRuns(results);
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

      showView(true);
      const run = new URLSearchParams(location.search).get('run');

      if (run) {
        await showRunLogs(run);
      } else {
        await refreshAll();
      }
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

$('runBack').addEventListener('click', async () => {
  history.replaceState({}, '', '/');
  showAppView();
  await refreshAll();
});

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
    $('psoChloe').checked = false;
    $('psoChloe').disabled = false;
    $('psoChloeOption').classList.remove('disabled');

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

      await request(
        '/api/workflows/processSalesOrders/dispatch',
        {
          method: 'POST',
          body: JSON.stringify({
            users,
          }),
        },
      );

      showAppView();

      await refreshAll();
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
