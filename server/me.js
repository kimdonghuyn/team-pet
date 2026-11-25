// This PC's person as the rest of the server sees it: an id, a name that can change, and a
// 'change' signal when something about me should reach the room soon (a new name, a new animal,
// a status). The room's push (server/team.js startPush) reads snapshot() and listens for it.
// Team Pet watches no work on this PC, so the person carries no sessions (agents is always empty).
import { EventEmitter } from 'node:events';

export class Me extends EventEmitter {
  constructor({ id, name = '' }) {
    super();
    this.id = id;
    this.name = name;
  }

  rename(name) {
    if (name && name !== this.name) { this.name = name; this.changed(); }
  }

  snapshot() {
    return { user: { id: this.id, name: this.name }, now: Date.now(), agents: [] };
  }

  changed() {
    this.emit('change');
  }
}
