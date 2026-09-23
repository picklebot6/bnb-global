type Env = {
  ASSETS: Fetcher;
  GITHUB_TOKEN: string;
  APP_PASSWORD: string;
  SESSION_SECRET: string;
};

type WorkflowConfig = {
  file: string;
  label: string;
  logStep: string;
  logMarker: string;
};

const OWNER = 'picklebot6';
const REPO = 'bnb-global';
const REF = 'main';

const WORKFLOWS: Record<string, WorkflowConfig> = {
  downloadInvoices: {
    file: 'downloadInvoices.yml',
    label: 'Download Invoices',
    logStep: 'Run invoice workflow',
    logMarker: 'npm run di',
  },
  processSalesOrders: {
    file: 'processSalesOrders.yml',
    label: 'Process Sales Orders',
    logStep: 'Run sales order workflow',
    logMarker: 'npm run pso',
  },
};

function json(
  data: unknown,
  status = 200,
  headers?: HeadersInit,
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...headers,
    },
  });
}

function getCookie(
  request: Request,
  name: string,
): string | null {
  const raw = request.headers.get('Cookie') ?? '';

  for (const part of raw.split(';')) {
    const [key, ...valueParts] = part.trim().split('=');

    if (key === name) {
      return decodeURIComponent(valueParts.join('='));
    }
  }

  return null;
}

function base64Url(bytes: Uint8Array): string {
  let binary = '';

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function fromBase64Url(value: string): Uint8Array {
  const padded =
    value
      .replace(/-/g, '+')
      .replace(/_/g, '/') +
    '==='.slice((value.length + 3) % 4);

  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

async function hmacSign(
  value: string,
  secret: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    {
      name: 'HMAC',
      hash: 'SHA-256',
    },
    false,
    ['sign'],
  );

  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(value),
  );

  return base64Url(new Uint8Array(signature));
}

async function createSession(
  secret: string,
): Promise<string> {
  const payload =
    `${Math.floor(Date.now() / 1000) + 60 * 60 * 12}`;

  const encoded = base64Url(
    new TextEncoder().encode(payload),
  );

  const signature = await hmacSign(
    encoded,
    secret,
  );

  return `${encoded}.${signature}`;
}

async function isAuthenticated(
  request: Request,
  secret: string,
): Promise<boolean> {
  const token = getCookie(
    request,
    'bnb_session',
  );

  if (!token) {
    return false;
  }

  const [encoded, signature] = token.split('.');

  if (!encoded || !signature) {
    return false;
  }

  const expected = await hmacSign(
    encoded,
    secret,
  );

  if (signature.length !== expected.length) {
    return false;
  }

  const sigBytes =
    new TextEncoder().encode(signature);

  const expBytes =
    new TextEncoder().encode(expected);

  let diff = 0;

  for (let i = 0; i < sigBytes.length; i++) {
    diff |= sigBytes[i] ^ expBytes[i];
  }

  if (diff !== 0) {
    return false;
  }

  try {
    const expiresAt = Number(
      new TextDecoder().decode(
        fromBase64Url(encoded),
      ),
    );

    return (
      Number.isFinite(expiresAt) &&
      expiresAt >
        Math.floor(Date.now() / 1000)
    );
  } catch {
    return false;
  }
}

function githubHeaders(
  token: string,
): HeadersInit {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'bnb-automation-dashboard',
  };
}

async function dispatchWorkflow(
  workflowFile: string,
  env: Env,
  inputs: Record<string, string> = {},
): Promise<Response> {
  const url =
    `https://api.github.com/repos/${OWNER}/${REPO}` +
    `/actions/workflows/` +
    `${encodeURIComponent(workflowFile)}/dispatches`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      ...githubHeaders(env.GITHUB_TOKEN),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ref: REF,
      inputs,
    }),
  });

  if (!response.ok) {
    const body = await response.text();

    return json(
      {
        ok: false,
        error:
          body ||
          `GitHub returned ${response.status}`,
      },
      response.status,
    );
  }

  return json({ ok: true });
}

async function getLatestRuns(
  workflowFile: string,
  env: Env,
): Promise<Response> {
  const url =
    `https://api.github.com/repos/${OWNER}/${REPO}` +
    `/actions/workflows/` +
    `${encodeURIComponent(workflowFile)}` +
    `/runs?branch=${encodeURIComponent(REF)}` +
    `&per_page=5`;

  const response = await fetch(url, {
    headers: githubHeaders(env.GITHUB_TOKEN),
  });

  if (!response.ok) {
    const body = await response.text();

    return json(
      {
        ok: false,
        error:
          body ||
          `GitHub returned ${response.status}`,
      },
      response.status,
    );
  }

  const data =
    await response.json() as {
      workflow_runs?: Array<{
        id: number;
        run_number: number;
        name: string;
        status: string;
        conclusion: string | null;
        created_at: string;
        updated_at: string;
        html_url: string;
      }>;
    };

  return json({
    ok: true,
    runs: (data.workflow_runs ?? []).map(
      run => ({
        id: run.id,
        runNumber: run.run_number,
        name: run.name,
        status: run.status,
        conclusion: run.conclusion,
        createdAt: run.created_at,
        updatedAt: run.updated_at,
        url: run.html_url,
      }),
    ),
  });
}

function findEndOfCentralDirectory(bytes: Uint8Array): number {
  // The ZIP end record is within the last 64 KiB of the archive.
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65_557); offset--) {
    if (
      bytes[offset] === 0x50 &&
      bytes[offset + 1] === 0x4b &&
      bytes[offset + 2] === 0x05 &&
      bytes[offset + 3] === 0x06
    ) {
      return offset;
    }
  }

  throw new Error('GitHub returned an invalid log archive.');
}

function cleanLogLine(line: string): string {
  return line
    .replace(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d+Z /, '')
    .replace(/\x1b\[[0-9;]*m/g, '');
}

export function extractAutomationStep(
  log: string,
  command: string,
): string | null {
  const lines = log.split(/\r?\n/).map(cleanLogLine);

  for (let start = 0; start < lines.length; start++) {
    if (!lines[start].startsWith('##[group]Run ')) {
      continue;
    }

    const headerEnd = lines.indexOf('##[endgroup]', start + 1);
    if (headerEnd < 0) {
      continue;
    }

    const header = lines.slice(start, headerEnd);
    if (!header.some(line => line.trim() === command)) {
      continue;
    }

    let end = headerEnd + 1;
    while (end < lines.length && !lines[end].startsWith('##[group]Run ')) {
      end++;
    }

    const output = lines.slice(headerEnd + 1, end).join('\n').trim();
    return output || null;
  }

  return null;
}

async function extractZipText(
  archive: ArrayBuffer,
  logStep: string,
  logMarker: string,
): Promise<string> {
  const bytes = new Uint8Array(archive);
  const view = new DataView(archive);
  const end = findEndOfCentralDirectory(bytes);
  const entries = view.getUint16(end + 10, true);
  let offset = view.getUint32(end + 16, true);
  const decoder = new TextDecoder();
  let stepOutput: string | null = null;

  for (let index = 0; index < entries; index++) {
    if (view.getUint32(offset, true) !== 0x02014b50) {
      throw new Error('GitHub returned an invalid log archive.');
    }

    const compression = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const fileNameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = decoder.decode(bytes.slice(offset + 46, offset + 46 + fileNameLength));
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = bytes.slice(dataStart, dataStart + compressedSize);

    if (!name.endsWith('/') && !stepOutput) {
      let contents: Uint8Array;

      if (compression === 0) {
        contents = compressed;
      } else if (compression === 8) {
        const stream = new Blob([compressed]).stream().pipeThrough(
          new DecompressionStream('deflate-raw'),
        );
        contents = new Uint8Array(await new Response(stream).arrayBuffer());
      } else {
        throw new Error(`Unsupported compression in ${name}.`);
      }

      stepOutput = extractAutomationStep(decoder.decode(contents), logMarker);
    }

    offset += 46 + fileNameLength + extraLength + commentLength;
  }

  if (!stepOutput) {
    throw new Error(`The ${logStep} log is not available for this run.`);
  }

  return stepOutput;
}

async function getRunLogs(
  runId: string,
  logStep: string,
  logMarker: string,
  env: Env,
): Promise<Response> {
  const apiUrl =
    `https://api.github.com/repos/${OWNER}/${REPO}` +
    `/actions/runs/${encodeURIComponent(runId)}/logs`;
  const archiveResponse = await fetch(apiUrl, {
    headers: githubHeaders(env.GITHUB_TOKEN),
    redirect: 'manual',
  });

  if (archiveResponse.status < 300 || archiveResponse.status >= 400) {
    const body = await archiveResponse.text();
    return json({ ok: false, error: body || `GitHub returned ${archiveResponse.status}` }, archiveResponse.status);
  }

  const downloadUrl = archiveResponse.headers.get('Location');
  if (!downloadUrl) {
    return json({ ok: false, error: 'GitHub did not provide a log download URL.' }, 502);
  }

  const downloadResponse = await fetch(downloadUrl);
  if (!downloadResponse.ok) {
    return json({ ok: false, error: `Could not download logs (${downloadResponse.status}).` }, 502);
  }

  try {
    return json({
      ok: true,
      logs: await extractZipText(
        await downloadResponse.arrayBuffer(),
        logStep,
        logMarker,
      ),
    });
  } catch (error) {
    return json({
      ok: false,
      error: error instanceof Error ? error.message : 'Could not read the log archive.',
    }, 502);
  }
}

export default {
  async fetch(
    request: Request,
    env: Env,
  ): Promise<Response> {
    const url = new URL(request.url);

    if (
      url.pathname === '/api/login' &&
      request.method === 'POST'
    ) {
      const body =
        await request
          .json()
          .catch(() => null) as {
            password?: string;
          } | null;

      if (
        !body?.password ||
        body.password !== env.APP_PASSWORD
      ) {
        return json(
          {
            ok: false,
            error: 'Invalid password.',
          },
          401,
        );
      }

      const session = await createSession(
        env.SESSION_SECRET,
      );

      return json(
        { ok: true },
        200,
        {
          'Set-Cookie':
            `bnb_session=${encodeURIComponent(session)}; ` +
            `Path=/; ` +
            `HttpOnly; ` +
            `Secure; ` +
            `SameSite=Strict; ` +
            `Max-Age=43200`,
        },
      );
    }

    if (
      url.pathname === '/api/logout' &&
      request.method === 'POST'
    ) {
      return json(
        { ok: true },
        200,
        {
          'Set-Cookie':
            'bnb_session=; ' +
            'Path=/; ' +
            'HttpOnly; ' +
            'Secure; ' +
            'SameSite=Strict; ' +
            'Max-Age=0',
        },
      );
    }

    if (
      url.pathname === '/api/session' &&
      request.method === 'GET'
    ) {
      return json({
        authenticated:
          await isAuthenticated(
            request,
            env.SESSION_SECRET,
          ),
      });
    }

    if (
      url.pathname === '/api/workflows' &&
      request.method === 'GET'
    ) {
      if (
        !(await isAuthenticated(
          request,
          env.SESSION_SECRET,
        ))
      ) {
        return json(
          {
            ok: false,
            error: 'Unauthorized',
          },
          401,
        );
      }

      return json({
        ok: true,
        workflows: Object.entries(
          WORKFLOWS,
        ).map(([id, value]) => ({
          id,
          ...value,
        })),
      });
    }

    const dispatchMatch =
      url.pathname.match(
        /^\/api\/workflows\/([^/]+)\/dispatch$/,
      );

    if (
      dispatchMatch &&
      request.method === 'POST'
    ) {
      if (
        !(await isAuthenticated(
          request,
          env.SESSION_SECRET,
        ))
      ) {
        return json(
          {
            ok: false,
            error: 'Unauthorized',
          },
          401,
        );
      }

      const workflow =
        WORKFLOWS[dispatchMatch[1]];

      if (!workflow) {
        return json(
          {
            ok: false,
            error: 'Unknown workflow.',
          },
          404,
        );
      }

      const body =
        await request
          .json()
          .catch(() => null) as {
            users?: unknown;
          } | null;

      let inputs: Record<string, string> = {};

      if (
        dispatchMatch[1] ===
        'processSalesOrders'
      ) {
        if (!Array.isArray(body?.users)) {
          return json(
            {
              ok: false,
              error:
                'users must be an array.',
            },
            400,
          );
        }

        if (
          !body.users.every(
            user =>
              typeof user === 'string' &&
              user.trim().length > 0,
          )
        ) {
          return json(
            {
              ok: false,
              error:
                'users must be an array of non-empty strings.',
            },
            400,
          );
        }

        inputs = {
          user: JSON.stringify(
            body.users,
          ),
        };
      }

      return dispatchWorkflow(
        workflow.file,
        env,
        inputs,
      );
    }

    const runsMatch =
      url.pathname.match(
        /^\/api\/workflows\/([^/]+)\/runs$/,
      );

    if (
      runsMatch &&
      request.method === 'GET'
    ) {
      if (
        !(await isAuthenticated(
          request,
          env.SESSION_SECRET,
        ))
      ) {
        return json(
          {
            ok: false,
            error: 'Unauthorized',
          },
          401,
        );
      }

      const workflow =
        WORKFLOWS[runsMatch[1]];

      if (!workflow) {
        return json(
          {
            ok: false,
            error: 'Unknown workflow.',
          },
          404,
        );
      }

      return getLatestRuns(
        workflow.file,
        env,
      );
    }

    const logsMatch =
      url.pathname.match(
        /^\/api\/workflows\/([^/]+)\/runs\/(\d+)\/logs$/,
      );

    if (logsMatch && request.method === 'GET') {
      if (!(await isAuthenticated(request, env.SESSION_SECRET))) {
        return json({ ok: false, error: 'Unauthorized' }, 401);
      }

      if (!WORKFLOWS[logsMatch[1]]) {
        return json({ ok: false, error: 'Unknown workflow.' }, 404);
      }

      return getRunLogs(
        logsMatch[2],
        WORKFLOWS[logsMatch[1]].logStep,
        WORKFLOWS[logsMatch[1]].logMarker,
        env,
      );
    }

    return env.ASSETS.fetch(request);
  },
};
