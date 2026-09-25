const workflows = {
  downloadInvoices: {
    label: 'Download Invoices',
    description:
      'Downloads pending invoices, emails them to the mapped customer contacts, and updates the invoice status in Google Sheets.',
    cardId: 'invoiceCard',
    statusId: 'invoiceStatus',
    buttonId: 'downloadInvoices',
  },
  processSalesOrders: {
    label: 'Process Sales Orders',
    description:
      'Processes sales orders to Pack List status for the users you select.',
    cardId: 'salesCard',
    statusId: 'salesStatus',
    buttonId: 'processSalesOrders',
  },
};

const $ = (id) => document.getElementById(id);

let runStatusTimer;
let runStatusPollingEnabled = false;
const cancellationRequestedRunIds = new Set();

function hasCancellationBeenRequested(runId) {
  return cancellationRequestedRunIds.has(String(runId));
}

function markCancellationRequested(runId) {
  cancellationRequestedRunIds.add(String(runId));
}

function syncCancelButton(button, runId, defaultLabel) {
  const cancellationRequested = hasCancellationBeenRequested(runId);

  button.disabled = cancellationRequested;
  button.textContent = cancellationRequested
    ? 'Cancellation Requested'
    : defaultLabel;

  button.classList.toggle(
    'cancellation-requested',
    cancellationRequested,
  );

  return cancellationRequested;
}

function stopRunStatusPolling() {
  if (runStatusTimer) {
    clearTimeout(runStatusTimer);
    runStatusTimer = undefined;
  }
}

function isActiveRun(run) {
  return (
    run.status === 'queued' ||
    run.status === 'in_progress'
  );
}

function hasActiveRuns() {
  return [...runListsByWorkflow.values()]
    .some(({ runs }) => runs.some(isActiveRun));
}

function updateCachedRunStatus(workflowId, runId, state) {
  const cached = runListsByWorkflow.get(workflowId);
  const run = cached?.runs.find(
    item => String(item.id) === String(runId),
  );

  if (run) {
    Object.assign(run, state);
  }
}

/**
 * Keeps polling alive while an active run exists.
 *
 * Polling must first be enabled by a successful Run click.
 * Once enabled, it remains enabled until there are no
 * queued or in-progress runs remaining.
 */
function updateRunStatusPolling() {
  if (
    runStatusPollingEnabled &&
    hasActiveRuns()
  ) {
    scheduleRunStatusPolling();
    return;
  }

  runStatusPollingEnabled = false;
  stopRunStatusPolling();
}

function scheduleRunStatusPolling() {
  stopRunStatusPolling();

  if (
    !runStatusPollingEnabled ||
    !hasActiveRuns()
  ) {
    runStatusPollingEnabled = false;
    return;
  }

  runStatusTimer = setTimeout(async () => {
    if (
      !runStatusPollingEnabled ||
      !hasActiveRuns()
    ) {
      runStatusPollingEnabled = false;
      return;
    }

    try {
      if (
        !$("homeView").classList.contains("hidden")
      ) {
        await refreshHomeActivity(true);
      } else if (
        !$("appView").classList.contains("hidden")
      ) {
        await refreshAll(true);
      } else if (
        !$("allRunsView").classList.contains("hidden")
      ) {
        await showAllRuns(false, true);
      } else if (
        !$("runView").classList.contains("hidden")
      ) {
        await $("runRefresh").click();
      } else if (
        !$("startedView").classList.contains("hidden") &&
        selectedWorkflow
      ) {
        await loadRuns(selectedWorkflow, true);
      } else if (
        !$("psoView").classList.contains("hidden") &&
        selectedWorkflow
      ) {
        await loadRuns(selectedWorkflow, true);
      }
    } catch {
      // Keep polling through transient request failures.
    }

    updateRunStatusPolling();
  }, 5_000);
}

function setStatus(element, text, state = '') {
  element.innerHTML =
    `<span class="dot ${state}"></span><span>${text}</span>`;
}

function formatStatus(status) {
  return String(status || 'unknown')
    .split('_')
    .map(
      word =>
        word.charAt(0).toUpperCase() +
        word.slice(1),
    )
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

  const body = await response
    .json()
    .catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      body.error ||
        `Request failed (${response.status})`,
    );
  }

  return body;
}

/** Requests cancellation of an active workflow run. */
async function cancelRun(workflowId, runId) {
  await request(
    `/api/workflows/${workflowId}/runs/${runId}/cancel`,
    {
      method: 'POST',
      body: '{}',
    },
  );
}

let selectedWorkflow;
let viewVersion = 0;
let allRunsForWorkflow = [];
let homeActivityRuns = [];

const runListsByWorkflow = new Map();

function showOnly(id) {
  /*
   * Polling is intentionally NOT stopped here.
   * It is independent of the current view.
   */
  viewVersion++;

  for (
    const view of [
      'loginView',
      'homeView',
      'appView',
      'allRunsView',
      'psoView',
      'runView',
      'startedView',
    ]
  ) {
    $(view).classList.toggle(
      'hidden',
      view !== id,
    );
  }
}

async function checkSession() {
  const result = await request('/api/session');

  if (result.authenticated) {
    await renderRoute();
  } else {
    showView(false);
  }
}

function showView(authenticated) {
  showOnly(
    authenticated
      ? 'homeView'
      : 'loginView',
  );
}

function showPsoView() {
  return navigate(
    '/?workflow=processSalesOrders&selectUsers=1',
  );
}

function showAppView() {
  return navigate(
    `/?workflow=${selectedWorkflow}`,
  );
}

async function navigate(url) {
  history.pushState({}, '', url);
  await renderRoute();
}

async function renderRoute() {
  const params =
    new URLSearchParams(location.search);

  selectedWorkflow = params.get('workflow');

  if (!workflows[selectedWorkflow]) {
    selectedWorkflow = undefined;

    showOnly('homeView');

    $('workflowSelect').value = '';

    await refreshHomeActivity();

    updateRunStatusPolling();

    return;
  }

  const workflow =
    workflows[selectedWorkflow];

  if (params.has('started')) {
    showOnly('startedView');

    const runId =
      params.get('started');

    $('startedRun').disabled =
      !/^\d+$/.test(runId);

    const cancellationRequested =
      syncCancelButton(
        $('startedCancel'),
        runId,
        'Cancel Workflow',
      );

    $('startedCancel').disabled =
      cancellationRequested ||
      !/^\d+$/.test(runId);

    $('startedStatus').textContent =
      $('startedRun').disabled
        ? 'The workflow was accepted, but its run link was unavailable. Use Back to check Recent Runs.'
        : '';

    updateRunStatusPolling();

    return;
  }

  if (params.get('runs') === 'all') {
    return showAllRuns();
  }

  if (params.get('run')) {
    return showRunLogs(
      params.get('run'),
    );
  }

  if (
    selectedWorkflow ===
      'processSalesOrders' &&
    params.has('selectUsers')
  ) {
    showOnly('psoView');

    updateRunStatusPolling();

    return;
  }

  showOnly('appView');

  $('workflowTitle').textContent =
    workflow.label;

  $('workflowSwitcher').value = '';

  $('workflowDescription').textContent =
    workflow.description;

  for (
    const [id, item] of Object.entries(
      workflows,
    )
  ) {
    $(item.cardId).classList.toggle(
      'hidden',
      id !== selectedWorkflow,
    );
  }

  $('runs').textContent =
    'Loading recent runs…';

  await refreshAll();

  updateRunStatusPolling();
}

window.addEventListener(
  'popstate',
  () => renderRoute(),
);

$('workflowSelect').addEventListener(
  'change',
  event =>
    navigate(
      `/?workflow=${event.target.value}`,
    ),
);

$('workflowSwitcher').addEventListener(
  'change',
  event =>
    navigate(
      `/?workflow=${event.target.value}`,
    ),
);

for (
  const button of
    document.querySelectorAll('.homeButton')
) {
  button.addEventListener(
    'click',
    () => navigate('/'),
  );
}

$('viewAllRuns').addEventListener(
  'click',
  () =>
    navigate(
      `/?workflow=${selectedWorkflow}&runs=all`,
    ),
);

$('allRunsBack').addEventListener(
  'click',
  showAppView,
);

$('allRunsPeriod').addEventListener(
  'change',
  renderAllRuns,
);

$('allRunsRefresh').addEventListener(
  'click',
  () =>
    showAllRuns(false, true),
);

$('activityPeriod').addEventListener(
  'change',
  () =>
    renderActivityChart(
      homeActivityRuns,
    ),
);

async function showRunLogs(runId) {
  /*
   * Do NOT stop global polling here.
   * The run may still be active.
   */
  const params =
    new URLSearchParams(
      location.search,
    );

  const workflowId =
    params.get('workflow');

  const workflow =
    workflows[workflowId];

  if (!workflow) {
    history.replaceState(
      {},
      '',
      '/',
    );

    showAppView();

    await refreshAll();

    return;
  }

  showOnly('runView');

  const version =
    viewVersion;

  $('runLogs').textContent = '';

  $('watchRecording').classList.add(
    'hidden',
  );

  $('runCancel').classList.add(
    'hidden',
  );

  syncCancelButton(
    $('runCancel'),
    runId,
    'Cancel Workflow',
  );

  $('runRecording').classList.add(
    'hidden',
  );

  $('runRecording').removeAttribute(
    'src',
  );

  $('runTitle').textContent =
    `${workflow.label} · Run #${runId}`;

  let refreshing = false;

  async function refreshRunStatus() {
    if (
      refreshing ||
      version !== viewVersion
    ) {
      return;
    }

    stopRunStatusPolling();

    refreshing = true;

    $('runRefresh').disabled =
      true;

    try {
      const result =
        await request(
          `/api/workflows/${workflowId}/runs/${runId}/status`,
        );

      if (
        version !== viewVersion
      ) {
        return;
      }

      updateCachedRunStatus(
        workflowId,
        runId,
        result.run,
      );

      const runState =
        result.run.conclusion ||
        result.run.status;

      const canCancel =
        result.run.status ===
        'in_progress';

      $('runCancel').classList.toggle(
        'hidden',
        !canCancel,
      );

      if (canCancel) {
        syncCancelButton(
          $('runCancel'),
          runId,
          'Cancel Workflow',
        );
      }

      const jobLines =
        result.jobs.flatMap(
          job => [
            `${job.name}: ${formatStatus(
              job.conclusion ||
                job.status,
            )}`,
            ...job.steps.map(
              step =>
                `  ${step.name}: ${formatStatus(
                  step.conclusion ||
                    step.status,
                )}`,
            ),
          ],
        );

      $('runLogs').textContent = [
        `Run status: ${formatStatus(
          runState,
        )}`,
        '',
        ...jobLines,
      ].join('\n');

      $('runLogs').classList.remove(
        'hidden',
      );

      try {
        const logs =
          await request(
            `/api/workflows/${workflowId}/runs/${runId}/logs`,
          );

        if (
          version !== viewVersion
        ) {
          return;
        }

        $('runLogs').textContent =
          logs.logs;

        const active =
          result.run.status !==
          'completed';

        setStatus(
          $('runLogStatus'),
          active
            ? 'Latest available logs loaded.'
            : 'Logs loaded.',
          active
            ? 'running'
            : 'success',
        );

        $('watchRecording').classList.toggle(
          'hidden',
          active,
        );
      } catch {
        if (
          version !== viewVersion
        ) {
          return;
        }

        setStatus(
          $('runLogStatus'),
          result.run.status !==
            'completed'
            ? 'Run in progress. Showing latest step status; logs are not available yet.'
            : 'Run completed. Logs are still being prepared.',
          'running',
        );
      }
    } catch (error) {
      if (
        version !== viewVersion
      ) {
        return;
      }

      setStatus(
        $('runLogStatus'),
        error.message,
        'failure',
      );
    } finally {
      refreshing = false;

      if (
        version === viewVersion
      ) {
        $('runRefresh').disabled =
          false;

        updateRunStatusPolling();
      }
    }
  }

  $('runRefresh').onclick =
    refreshRunStatus;

  $('runCancel').onclick =
    async () => {
      const button =
        $('runCancel');

      button.disabled =
        true;

      try {
        await cancelRun(
          workflowId,
          runId,
        );

        markCancellationRequested(
          runId,
        );

        syncCancelButton(
          button,
          runId,
          'Cancel Workflow',
        );

        setStatus(
          $('runLogStatus'),
          'Cancellation requested.',
          'running',
        );

        await refreshRunStatus();
      } catch (error) {
        setStatus(
          $('runLogStatus'),
          error.message,
          'failure',
        );

        syncCancelButton(
          button,
          runId,
          'Cancel Workflow',
        );
      }
    };

  $('watchRecording').onclick =
    async () => {
      const button =
        $('watchRecording');

      button.disabled =
        true;

      button.textContent =
        'Loading Recording...';

      try {
        const response =
          await fetch(
            `/api/workflows/${workflowId}/runs/${runId}/recording`,
            {
              cache: 'no-store',
            },
          );

        if (!response.ok) {
          const error =
            await response
              .json()
              .catch(() => ({}));

          throw new Error(
            error.error ||
              'Could not load the recording.',
          );
        }

        const recording =
          $('runRecording');

        recording.src =
          URL.createObjectURL(
            await response.blob(),
          );

        recording.classList.remove(
          'hidden',
        );

        button.textContent =
          'Recording Loaded';
      } catch (error) {
        button.textContent =
          error.message;
      } finally {
        button.disabled =
          false;
      }
    };

  setStatus(
    $('runLogStatus'),
    'Loading run status...',
    'running',
  );

  await refreshRunStatus();
}

async function startWorkflow(
  id,
  inputs = {},
) {
  const result =
    await request(
      `/api/workflows/${id}/dispatch`,
      {
        method: 'POST',
        body: JSON.stringify(inputs),
      },
    );

  /*
   * The user successfully clicked Run,
   * so automatic polling begins now.
   */
  runStatusPollingEnabled =
    true;

  /*
   * Force-refresh so the newly-created
   * run enters the local cache.
   */
  await loadRuns(id, true).catch(
    () => {},
  );

  /*
   * Poll only if the new/current run
   * is actually queued or in progress.
   */
  updateRunStatusPolling();

  await navigate(
    `/?workflow=${id}&started=${encodeURIComponent(
      result.runId ?? '',
    )}`,
  );
}

$('startedBack').addEventListener(
  'click',
  () => showAppView(),
);

$('startedRun').addEventListener(
  'click',
  () => {
    const runId =
      new URLSearchParams(
        location.search,
      ).get('started');

    if (/^\d+$/.test(runId)) {
      navigate(
        `/?workflow=${selectedWorkflow}&run=${runId}`,
      );
    }
  },
);

$('startedCancel').addEventListener(
  'click',
  async () => {
    const runId =
      new URLSearchParams(
        location.search,
      ).get('started');

    const button =
      $('startedCancel');

    button.disabled =
      true;

    try {
      await cancelRun(
        selectedWorkflow,
        runId,
      );

      markCancellationRequested(
        runId,
      );

      history.back();
    } catch (error) {
      $('startedStatus').textContent =
        error.message;

      button.disabled =
        false;
    }
  },
);

async function runWorkflow(
  id,
  inputs = {},
) {
  const button =
    $(workflows[id].buttonId);

  const status =
    $(workflows[id].statusId);

  button.disabled =
    true;

  setStatus(
    status,
    'Starting workflow...',
    'running',
  );

  try {
    await startWorkflow(
      id,
      inputs,
    );

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
    button.disabled =
      false;
  }
}

async function loadRuns(
  id,
  force = false,
) {
  /*
   * Normal calls use cached data.
   */
  if (
    !force &&
    runListsByWorkflow.has(id)
  ) {
    return runListsByWorkflow.get(
      id,
    );
  }

  /*
   * force=true makes the actual API request.
   */
  const result =
    await request(
      `/api/workflows/${id}/runs`,
    );

  const runs = {
    id,
    runs:
      result.runs || [],
  };

  runListsByWorkflow.set(
    id,
    runs,
  );

  return runs;
}

/** Loads both workflows so the home-page chart covers all automation activity. */
async function refreshHomeActivity(
  force = false,
) {
  const version =
    viewVersion;

  try {
    const results =
      await Promise.all(
        Object.keys(workflows).map(
          id =>
            loadRuns(
              id,
              force,
            ),
        ),
      );

    if (
      version !== viewVersion
    ) {
      return;
    }

    homeActivityRuns =
      results.flatMap(
        ({ id, runs }) =>
          runs.map(run => ({
            ...run,
            workflowId: id,
          })),
      );

    renderActivityChart(
      homeActivityRuns,
    );

    /*
     * Continue an already-enabled polling
     * session only while an active run exists.
     */
    updateRunStatusPolling();
  } catch (error) {
    if (
      version !== viewVersion
    ) {
      return;
    }

    $('activityChart').innerHTML =
      '<div class="run-meta">Activity could not be loaded.</div>';
  }
}

function renderRuns(results) {
  const all =
    results.flatMap(
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

  const recent =
    all.slice(0, 5);

  if (!recent.length) {
    $('runs').innerHTML =
      '<div class="run-meta">No workflow runs found.</div>';

    return;
  }

  $('runs').innerHTML =
    renderRunRows(recent);

  for (
    const { id } of results
  ) {
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

    if (
      matching.status !==
      'completed'
    ) {
      setStatus(
        statusElement,
        `${formatStatus(
          matching.status,
        )} · Run #${matching.runNumber}`,
        'running',
      );
    } else if (
      matching.conclusion ===
      'success'
    ) {
      setStatus(
        statusElement,
        `Completed · Run #${matching.runNumber}`,
        'success',
      );
    } else {
      setStatus(
        statusElement,
        `${formatStatus(
          matching.conclusion ||
            'completed',
        )} · Run #${matching.runNumber}`,
        'failure',
      );
    }
  }

  /*
   * Rendering itself does not start polling.
   */
}

function renderRunRows(runs) {
  return runs
    .map(run => {
      const label =
        workflows[
          run.workflowId
        ].label;

      const status =
        run.status ===
        'completed'
          ? run.conclusion ||
            'completed'
          : run.status;

      const rowTone = {
        success:
          'success',
        failure:
          'failure',
        timed_out:
          'failure',
        cancelled:
          'cancelled',
        queued:
          'queued',
        waiting:
          'queued',
        requested:
          'queued',
        pending:
          'queued',
        in_progress:
          'progress',
      }[status] ||
      'queued';

      return `
        <div class="run-row run-${rowTone}">
          <div class="run-details">
            <div>
              <div class="run-name">
                ${label}
              </div>

              <div class="run-meta">
                Run #${run.runNumber} ·
                ${formatStatus(status)} ·
                ${formatTime(run.createdAt)}
              </div>

              ${
                run.status ===
                'in_progress'
                  ? '<div class="run-cancel-hint">View log to cancel this run.</div>'
                  : ''
              }
            </div>
          </div>

          <div class="run-actions">
            <a
              href="/?workflow=${encodeURIComponent(
                run.workflowId,
              )}&run=${encodeURIComponent(
                run.id,
              )}"
            >
              View
            </a>
          </div>
        </div>
      `;
    })
    .join('');
}

function renderAllRuns() {
  const period =
    $('allRunsPeriod').value;

  const start =
    new Date();

  start.setHours(
    0,
    0,
    0,
    0,
  );

  if (
    period === 'week'
  ) {
    start.setDate(
      start.getDate() - 6,
    );
  }

  if (
    period === 'month'
  ) {
    start.setDate(
      start.getDate() - 29,
    );
  }

  const visibleRuns =
    allRunsForWorkflow.filter(
      run =>
        new Date(
          run.createdAt,
        ) >= start,
    );

  $('allRuns').innerHTML =
    visibleRuns.length
      ? renderRunRows(
          visibleRuns,
        )
      : '<div class="run-meta">No workflow runs found for this period.</div>';
}

async function showAllRuns(
  resetPeriod = true,
  force = false,
) {
  showOnly(
    'allRunsView',
  );

  const workflow =
    workflows[
      selectedWorkflow
    ];

  $('allRunsTitle').textContent =
    `${workflow.label} · All Runs`;

  if (resetPeriod) {
    $('allRunsPeriod').value =
      'today';
  }

  $('allRuns').textContent =
    'Loading runs…';

  $('allRunsRefresh').disabled =
    true;

  const version =
    viewVersion;

  try {
    const { runs } =
      await loadRuns(
        selectedWorkflow,
        force,
      );

    if (
      version !== viewVersion
    ) {
      return;
    }

    allRunsForWorkflow =
      runs
        .map(run => ({
          ...run,
          workflowId:
            selectedWorkflow,
        }))
        .sort(
          (a, b) =>
            new Date(b.createdAt) -
            new Date(a.createdAt),
        );

    renderAllRuns();

    updateRunStatusPolling();
  } catch (error) {
    if (
      version !== viewVersion
    ) {
      return;
    }

    $('allRuns').textContent =
      error.message;
  } finally {
    if (
      version === viewVersion
    ) {
      $('allRunsRefresh').disabled =
        false;
    }
  }
}

/** Renders the selected dashboard view for recent workflow activity. */
function renderActivityChart(
  runs,
) {
  if (
    $('activityPeriod').value ===
    'today'
  ) {
    renderTodayActivityChart(
      runs,
    );

    return;
  }

  $('activitySubtitle').textContent =
    'Runs started in the past 7 days';

  $('activityLegend').classList.remove(
    'hidden',
  );

  $('activityChart').classList.remove(
    'automation-breakdown',
  );

  $('activityChart').setAttribute(
    'aria-label',
    'Automation activity for the past 7 days',
  );

  const statusTones = {
    success:
      'success',
    failure:
      'failure',
    timed_out:
      'failure',
    cancelled:
      'failure',
    in_progress:
      'progress',
    queued:
      'queued',
    waiting:
      'queued',
    requested:
      'queued',
    pending:
      'queued',
  };

  const dayKey =
    date =>
      [
        date.getFullYear(),
        String(
          date.getMonth() + 1,
        ).padStart(2, '0'),
        String(
          date.getDate(),
        ).padStart(2, '0'),
      ].join('-');

  const today =
    new Date();

  today.setHours(
    0,
    0,
    0,
    0,
  );

  const days =
    Array.from(
      { length: 7 },
      (_, index) => {
        const date =
          new Date(today);

        date.setDate(
          today.getDate() -
            (6 - index),
        );

        return {
          date,
          key: dayKey(date),
          counts: {
            success: 0,
            failure: 0,
            progress: 0,
            queued: 0,
          },
        };
      },
    );

  const daysByKey =
    new Map(
      days.map(
        day => [
          day.key,
          day,
        ],
      ),
    );

  for (
    const run of runs
  ) {
    const date =
      new Date(
        run.createdAt,
      );

    const day =
      daysByKey.get(
        dayKey(date),
      );

    if (!day) {
      continue;
    }

    const status =
      run.status ===
      'completed'
        ? run.conclusion ||
          'completed'
        : run.status;

    const tone =
      statusTones[
        status
      ] || 'queued';

    day.counts[
      tone
    ]++;
  }

  const totals =
    days.map(
      day =>
        Object.values(
          day.counts,
        ).reduce(
          (
            sum,
            count,
          ) =>
            sum + count,
          0,
        ),
    );

  const max =
    Math.max(
      1,
      ...totals,
    );

  $('activityChart').innerHTML =
    days
      .map(
        (day, index) => {
          const total =
            totals[index];

          const dateLabel =
            day.date.toLocaleDateString(
              [],
              {
                weekday:
                  'short',
                month:
                  'numeric',
                day:
                  'numeric',
              },
            );

          const details =
            Object.entries(
              day.counts,
            )
              .filter(
                ([, count]) =>
                  count > 0,
              )
              .map(
                ([
                  status,
                  count,
                ]) =>
                  `${count} ${formatStatus(
                    status,
                  )}`,
              )
              .join(', ') ||
            'No runs';

          const segments =
            Object.entries(
              day.counts,
            )
              .filter(
                ([, count]) =>
                  count > 0,
              )
              .map(
                ([
                  status,
                  count,
                ]) =>
                  `<span class="activity-segment activity-${status}" style="flex:${count}"></span>`,
              )
              .join('');

          const bar =
            total === 0
              ? '<div class="activity-bar empty"></div>'
              : `<div class="activity-bar" style="height:${Math.max(
                  10,
                  (total / max) *
                    100,
                )}%">${segments}</div>`;

          return `
            <div
              class="activity-day"
              title="${dateLabel}: ${details}"
            >
              <div class="activity-count">
                ${total || ''}
              </div>

              <div class="activity-bar-slot">
                ${bar}
              </div>

              <div class="activity-label">
                ${day.date.toLocaleDateString(
                  [],
                  {
                    weekday:
                      'short',
                  },
                )}
              </div>

              <div class="activity-date">
                ${day.date.toLocaleDateString(
                  [],
                  {
                    month:
                      'numeric',
                    day:
                      'numeric',
                  },
                )}
              </div>
            </div>
          `;
        },
      )
      .join('');
}

/** Renders today's run totals as one bar for each automation. */
function renderTodayActivityChart(
  runs,
) {
  const start =
    new Date();

  start.setHours(
    0,
    0,
    0,
    0,
  );

  const statusTones = {
    success:
      'success',
    failure:
      'failure',
    timed_out:
      'failure',
    cancelled:
      'failure',
    in_progress:
      'progress',
    queued:
      'queued',
    waiting:
      'queued',
    requested:
      'queued',
    pending:
      'queued',
  };

  const totals =
    Object.entries(
      workflows,
    )
      .map(
        ([id, workflow]) => ({
          id,
          label:
            workflow.label,
          counts: {
            success: 0,
            failure: 0,
            progress: 0,
            queued: 0,
          },
        }),
      )
      .map(item => {
        for (
          const run of runs
        ) {
          if (
            run.workflowId !==
              item.id ||
            new Date(
              run.createdAt,
            ) < start
          ) {
            continue;
          }

          const status =
            run.status ===
            'completed'
              ? run.conclusion ||
                'completed'
              : run.status;

          item.counts[
            statusTones[
              status
            ] || 'queued'
          ]++;
        }

        return {
          ...item,
          count:
            Object.values(
              item.counts,
            ).reduce(
              (
                sum,
                count,
              ) =>
                sum + count,
              0,
            ),
        };
      });

  const max =
    Math.max(
      1,
      ...totals.map(
        item =>
          item.count,
      ),
    );

  $('activitySubtitle').textContent =
    'Runs started today by automation';

  $('activityLegend').classList.remove(
    'hidden',
  );

  $('activityChart').classList.add(
    'automation-breakdown',
  );

  $('activityChart').setAttribute(
    'aria-label',
    "Today's runs by automation",
  );

  $('activityChart').innerHTML =
    totals
      .map(item => {
        const bar =
          item.count === 0
            ? '<div class="activity-bar empty"></div>'
            : `<div class="activity-bar" style="height:${Math.max(
                10,
                (item.count / max) *
                  100,
              )}%">${Object.entries(
                item.counts,
              )
                .filter(
                  ([, count]) =>
                    count > 0,
                )
                .map(
                  ([
                    status,
                    count,
                  ]) =>
                    `<span class="activity-segment activity-${status}" style="flex:${count}"></span>`,
                )
                .join('')}</div>`;

        return `
          <div
            class="activity-day"
            title="${item.label}: ${
              item.count
            } ${
              item.count ===
              1
                ? 'run'
                : 'runs'
            }"
          >
            <div class="activity-count">
              ${item.count}
            </div>

            <div class="activity-bar-slot">
              ${bar}
            </div>

            <div class="activity-label">
              ${item.label}
            </div>
          </div>
        `;
      })
      .join('');
}

async function refreshAll(
  force = false,
) {
  const id =
    selectedWorkflow;

  if (
    !id ||
    $('appView').classList.contains(
      'hidden',
    )
  ) {
    return;
  }

  const version =
    viewVersion;

  const refresh =
    $('refreshButton');

  refresh.disabled =
    true;

  try {
    const result =
      await loadRuns(
        id,
        force,
      );

    if (
      version !== viewVersion
    ) {
      return;
    }

    renderRuns([result]);

    updateRunStatusPolling();
  } catch (error) {
    if (
      error.message ===
      'Unauthorized'
    ) {
      showView(false);
      return;
    }

    $('runs').innerHTML =
      `<div class="run-meta">${error.message}</div>`;
  } finally {
    refresh.disabled =
      false;
  }
}

$('loginForm').addEventListener(
  'submit',
  async event => {
    event.preventDefault();

    $('loginError').textContent =
      '';

    const password =
      $('password').value;

    try {
      await request(
        '/api/login',
        {
          method: 'POST',
          body: JSON.stringify({
            password,
          }),
        },
      );

      $('password').value =
        '';

      /*
       * Login itself does not enable polling.
       * Cached data is used normally.
       */
      runStatusPollingEnabled =
        false;

      stopRunStatusPolling();

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

    runStatusPollingEnabled =
      false;

    stopRunStatusPolling();

    showView(false);
  },
);

$('refreshButton').addEventListener(
  'click',
  () =>
    refreshAll(true),
);

$('runBack').addEventListener(
  'click',
  () =>
    showAppView(),
);

$('homeLogout').addEventListener(
  'click',
  () =>
    $('logoutButton').click(),
);

$('downloadInvoices').addEventListener(
  'click',
  () =>
    runWorkflow(
      'downloadInvoices',
    ),
);

/*
 * Process Sales Orders
 */

$('processSalesOrders').addEventListener(
  'click',
  () => {
    $('psoAll').checked =
      false;

    for (
      const checkbox of
        document.querySelectorAll(
          '.psoUser',
        )
    ) {
      checkbox.checked =
        false;

      checkbox.disabled =
        false;

      checkbox
        .closest(
          '.selection-option',
        )
        .classList.remove(
          'disabled',
        );
    }

    showPsoView();
  },
);

$('psoAll').addEventListener(
  'change',
  () => {
    const allSelected =
      $('psoAll').checked;

    const userCheckboxes =
      document.querySelectorAll(
        '.psoUser',
      );

    for (
      const checkbox of
        userCheckboxes
    ) {
      checkbox.disabled =
        allSelected;

      if (allSelected) {
        checkbox.checked =
          false;
      }

      checkbox
        .closest(
          '.selection-option',
        )
        ?.classList.toggle(
          'disabled',
          allSelected,
        );
    }
  },
);

$('psoBack').addEventListener(
  'click',
  () => {
    showAppView();
  },
);

$('psoRun').addEventListener(
  'click',
  async () => {
    const allSelected =
      $('psoAll').checked;

    const users =
      allSelected
        ? ['all']
        : Array.from(
            document.querySelectorAll(
              '.psoUser:checked',
            ),
          ).map(
            checkbox =>
              checkbox.value,
          );

    if (
      users.length === 0
    ) {
      alert(
        'Please select at least one user.',
      );

      return;
    }

    try {
      $('psoRun').disabled =
        true;

      await startWorkflow(
        'processSalesOrders',
        { users },
      );
    } catch (error) {
      alert(
        error.message,
      );
    } finally {
      $('psoRun').disabled =
        false;
    }
  },
);

checkSession().catch(
  () =>
    showView(false),
);

function showCacheVersion(
  cacheName,
) {
  const version =
    String(cacheName).match(
      /-v(.+)$/,
    )?.[1];

  $('appVersion').textContent =
    version
      ? `Version ${version}`
      : 'Version unavailable';
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker
    .register('/sw.js')
    .then(() => {
      navigator.serviceWorker.addEventListener(
        'message',
        event => {
          if (
            event.data?.type ===
            'CACHE_VERSION'
          ) {
            showCacheVersion(
              event.data.cacheName,
            );
          }
        },
      );

      return navigator.serviceWorker
        .ready;
    })
    .then(
      registration => {
        const worker =
          navigator
            .serviceWorker
            .controller ||
          registration.active;

        worker?.postMessage({
          type: 'GET_CACHE_VERSION',
        });
      },
    )
    .catch(() => {});
}