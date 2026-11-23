const clients = new Set();

/**
 * Register a Server-Sent Events (SSE) client for real-time LINE Chat updates.
 */
function addSseClient(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders?.();

  res.write('event: connected\ndata: {"ok":true}\n\n');
  clients.add(res);

  const heartbeat = setInterval(() => {
    try {
      res.write(': ping\n\n');
    } catch (_err) {
      cleanup();
    }
  }, 25000);

  function cleanup() {
    clearInterval(heartbeat);
    clients.delete(res);
  }

  req.on('close', cleanup);
  req.on('error', cleanup);
}

/**
 * Broadcast an SSE event to all connected staff chat UI clients.
 */
function broadcastChatEvent(eventName, payload) {
  if (clients.size === 0) return;
  const serialized = JSON.stringify(payload, (_k, v) => (typeof v === 'bigint' ? Number(v) : v));
  const frame = `event: ${eventName}\ndata: ${serialized}\n\n`;

  for (const res of Array.from(clients)) {
    try {
      res.write(frame);
    } catch (_err) {
      clients.delete(res);
    }
  }
}

module.exports = {
  addSseClient,
  broadcastChatEvent,
};
