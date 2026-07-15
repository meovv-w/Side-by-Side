const crypto = require('crypto');

class RealtimeHub {
  constructor(cache) {
    this.cache = cache;
    this.instanceId = crypto.randomUUID();
    this.clients = new Map();
    this.unsubscribe = null;
  }

  async start() {
    this.unsubscribe = await this.cache.subscribe('tongdao:events', raw => {
      try {
        const event = JSON.parse(raw);
        if (event.origin !== this.instanceId) this.#sendLocal(event.userId, event.payload);
      } catch (_) {}
    });
  }

  add(userId, socket) {
    if (!this.clients.has(userId)) this.clients.set(userId, new Set());
    this.clients.get(userId).add(socket);
    socket.on('close', () => this.remove(userId, socket));
  }

  remove(userId, socket) {
    const sockets = this.clients.get(userId);
    if (!sockets) return;
    sockets.delete(socket);
    if (!sockets.size) this.clients.delete(userId);
  }

  async send(userId, payload) {
    this.#sendLocal(userId, payload);
    await this.cache.publish('tongdao:events', JSON.stringify({ origin: this.instanceId, userId, payload }));
  }

  async stop() {
    if (this.unsubscribe) await this.unsubscribe();
  }

  #sendLocal(userId, payload) {
    const encoded = JSON.stringify(payload);
    for (const socket of this.clients.get(userId) || []) {
      if (socket.readyState === 1) socket.send(encoded);
    }
  }
}

module.exports = { RealtimeHub };
