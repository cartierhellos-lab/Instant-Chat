type ApiRegion = 'global' | 'cn';

interface ProxyRequestBody {
  endpoint: string;
  region?: ApiRegion;
  body?: Record<string, unknown>;
}

const REGION_BASE: Record<ApiRegion, string> = {
  global: 'https://openapi.duoplus.net',
  cn: 'https://openapi.duoplus.cn',
};

const JSON_HEADERS = {
  'Content-Type': 'application/json',
};

function getCorsHeaders(origin: string | null): HeadersInit {
  return {
    'Access-Control-Allow-Origin': origin ?? '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

function jsonResponse(status: number, payload: unknown, origin: string | null): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...JSON_HEADERS,
      ...getCorsHeaders(origin),
    },
  });
}

function getRegionToken(region: ApiRegion): string | undefined {
  if (region === 'cn') {
    return Deno.env.get('DUOPLUS_CN_API_KEY') ?? Deno.env.get('DUOPLUS_API_KEY');
  }
  return Deno.env.get('DUOPLUS_GLOBAL_API_KEY') ?? Deno.env.get('DUOPLUS_API_KEY');
}

function resolveBaseUrl(region: ApiRegion): string {
  const override = region === 'cn'
    ? Deno.env.get('DUOPLUS_CN_BASE_URL')
    : Deno.env.get('DUOPLUS_GLOBAL_BASE_URL');
  return override || REGION_BASE[region];
}

function isAllowedEndpoint(endpoint: string): boolean {
  return [
    '/api/v1/cloudNumber/numberList',
    '/api/v1/cloudNumber/smsList',
    '/api/v1/cloudNumber/imageWriteSms',
    '/api/v1/cloudPhone/list',
    '/api/v1/cloudPhone/command',
  ].includes(endpoint);
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(origin) });
  }

  if (req.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' }, origin);
  }

  try {
    const { endpoint, region = 'global', body = {} } = await req.json() as ProxyRequestBody;

    if (!endpoint || !isAllowedEndpoint(endpoint)) {
      return jsonResponse(400, { error: 'Unsupported endpoint' }, origin);
    }

    const apiKey = getRegionToken(region);
    if (!apiKey) {
      return jsonResponse(500, { error: `Missing DuoPlus API key for region: ${region}` }, origin);
    }

    const resp = await fetch(`${resolveBaseUrl(region)}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'DuoPlus-API-Key': apiKey,
        'Lang': 'zh',
      },
      body: JSON.stringify(body),
    });

    const text = await resp.text();
    const contentType = resp.headers.get('content-type') || 'application/json';

    return new Response(text, {
      status: resp.status,
      headers: {
        'Content-Type': contentType,
        ...getCorsHeaders(origin),
      },
    });
  } catch (error) {
    return jsonResponse(500, { error: (error as Error).message || 'Proxy request failed' }, origin);
  }
});
