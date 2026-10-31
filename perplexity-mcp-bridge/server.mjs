import express from 'express';
import cors from 'cors';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createPerplexityServer, performSearch } from '@perplexity-ai/mcp-server';

const app = express();
const PORT = Number(process.env.PORT || 8080);
const BRIDGE_TOKEN = process.env.BRIDGE_TOKEN || '';

if (!process.env.PERPLEXITY_API_KEY) {
  console.error('PERPLEXITY_API_KEY is required');
  process.exit(1);
}

app.use(cors({
  origin: '*',
  exposedHeaders: ['Mcp-Session-Id', 'mcp-protocol-version'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Bridge-Token', 'mcp-session-id', 'mcp-protocol-version']
}));
app.use(express.json({ limit: '2mb' }));

function requireBridgeAuth(req, res, next) {
  if (!BRIDGE_TOKEN) return next();
  const bearer = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.slice(7)
    : '';
  const alt = req.headers['x-bridge-token'];
  if (bearer === BRIDGE_TOKEN || alt === BRIDGE_TOKEN) return next();
  return res.status(401).json({ error: 'Unauthorized' });
}

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'milad-perplexity-mcp-bridge' });
});

app.get('/search', requireBridgeAuth, async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (!q) return res.status(400).json({ error: 'Missing q query parameter' });

    const maxResults = Math.min(Math.max(Number(req.query.max_results || 10), 1), 20);
    const maxTokensPerPage = Math.min(Math.max(Number(req.query.max_tokens_per_page || 1024), 128), 20000);
    const country = req.query.country ? String(req.query.country) : undefined;
    const recency = req.query.recency ? String(req.query.recency) : undefined;
    const searchType = req.query.search_type ? String(req.query.search_type) : undefined;
    const domains = req.query.domains
      ? String(req.query.domains).split(',').map(v => v.trim()).filter(Boolean)
      : undefined;

    const filters = {};
    if (['hour', 'day', 'week', 'month', 'year'].includes(recency)) {
      filters.search_recency_filter = recency;
    }
    if (domains?.length) filters.search_domain_filter = domains;
    if (searchType) filters.search_type = searchType;

    const text = await performSearch(
      q,
      maxResults,
      maxTokensPerPage,
      country,
      filters,
      'milad-perplexity-mcp-bridge'
    );

    res.json({ query: q, result: text });
  } catch (error) {
    console.error(error);
    res.status(502).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.all('/mcp', requireBridgeAuth, async (req, res) => {
  let transport;
  let server;
  try {
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true
    });
    server = createPerplexityServer('milad-perplexity-mcp-bridge');

    res.on('close', () => {
      try { transport?.close(); } catch {}
      try { server?.close(); } catch {}
    });

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error(error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: { code: -32603, message: 'Internal server error' },
        id: null
      });
    }
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Perplexity bridge listening on port ${PORT}`);
});
