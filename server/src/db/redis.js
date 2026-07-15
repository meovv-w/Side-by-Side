const { EventEmitter } = require('events');
const Redis = require('ioredis');

class MemoryRedis {
  constructor() {
    this.values = new Map();
    this.events = new EventEmitter();
  }
  async get(key) { const item = this.values.get(key); if (!item) return null; if (item.expiresAt && item.expiresAt <= Date.now()) { this.values.delete(key); return null; } return item.value; }
  async set(key, value, mode, ttl) { this.values.set(key, { value: String(value), expiresAt: mode === 'EX' ? Date.now() + Number(ttl) * 1000 : null }); return 'OK'; }
  async setex(key, ttl, value) { return this.set(key, value, 'EX', ttl); }
  async del(key) { return this.values.delete(key) ? 1 : 0; }
  async publish(channel, value) { this.events.emit(channel, value); return this.events.listenerCount(channel); }
  subscribe(channel, listener) { this.events.on(channel, listener); return () => this.events.off(channel, listener); }
  async quit() {}
}

class RedisBus {
  constructor(url) {
    this.client = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 2 });
    this.publisher = this.client.duplicate();
    this.subscriber = this.client.duplicate();
    this.listeners = new Map();
  }
  async connect() { await Promise.all([this.client.connect(), this.publisher.connect(), this.subscriber.connect()]); this.subscriber.on('message', (channel, message) => { for (const listener of this.listeners.get(channel) || []) listener(message); }); }
  get(...args) { return this.client.get(...args); }
  set(...args) { return this.client.set(...args); }
  setex(...args) { return this.client.setex(...args); }
  del(...args) { return this.client.del(...args); }
  publish(...args) { return this.publisher.publish(...args); }
  async subscribe(channel, listener) { const first = !this.listeners.has(channel); if (first) this.listeners.set(channel, new Set()); this.listeners.get(channel).add(listener); if (first) await this.subscriber.subscribe(channel); return async () => { const listeners = this.listeners.get(channel); listeners.delete(listener); if (!listeners.size) { this.listeners.delete(channel); await this.subscriber.unsubscribe(channel); } }; }
  async quit() { await Promise.all([this.client.quit(), this.publisher.quit(), this.subscriber.quit()]); }
}

module.exports = { MemoryRedis, RedisBus };
