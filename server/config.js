// The settings file (~/.team-pet/config.json, or TEAM_PET_CONFIG, or --config <file>): what this
// PC is called, its rooms, its pet. A missing or broken file counts as an empty one; whatever the
// file leaves out comes from settingsDefaults().
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function settingsDefaults() {
  return {
    // Not the team office's 4321, so both can run on one PC.
    port: 4322,
    // The hub keys each PC's person by user id, so each PC needs its own.
    user: { id: os.hostname().toLowerCase(), name: os.userInfo().username },
    // Team. hub: serve the page on the office network (key required) and accept pushes.
    // push: send this PC's person (name, state, pet) to the hub at hubUrl.
    team: { key: '', hubUrl: '', host: '0.0.0.0' },
    // Floors: { name, key, code }. Each floor's key shows and accepts only that floor;
    // team.key is the admin key and sees every floor.
    floors: [],
    // My own state, set from my page: hidden sends nothing to any hub; status
    // ('' | 'focus' | 'help') and a short note are shown to my floor.
    // avatar: the character I picked (0-7), null = one is picked for me.
    me: { hidden: false, status: '', note: '', avatar: null },
    // quiet = 🔕 no Windows alert at all (the pet and the page are unchanged).
    notify: { quiet: false },
    // The desktop pet (server/pet.js): on, which animal, chat in bubbles or only
    // a dot (for a quiet office), how big (dragged by its grip, 0.5–1.6), and
    // where it sits (null = above the taskbar).
    pet: { on: true, kind: 'cat', bubbles: true, scale: 1, x: null, y: null },
  };
}

export function configPath(argv = process.argv) {
  const at = argv.lastIndexOf('--config');
  const given = at >= 0 ? argv[at + 1] : '';
  if (given) return path.resolve(given);
  return process.env.TEAM_PET_CONFIG || path.join(os.homedir(), '.team-pet', 'config.json');
}

// Each group of settings is filled in key by key, so a file from an older version still gets the
// newer keys; floors and the rest are taken as the file has them.
const GROUPS = ['user', 'team', 'me', 'notify', 'pet'];
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
export function loadConfig(file) {
  let saved = null;
  try { saved = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
  if (!isObject(saved)) saved = {};
  const base = settingsDefaults();
  const out = { ...base, ...saved };
  for (const g of GROUPS) out[g] = { ...base[g], ...(isObject(saved[g]) ? saved[g] : {}) };
  return out;
}

// Written whole into a file beside it, then moved over it: a PC that turns off halfway through
// leaves the old settings, never half of the new ones.
export function saveConfig(file, cfg) {
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const next = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(next, `${JSON.stringify(cfg, null, 2)}\n`);
  fs.renameSync(next, file);
}

// This PC's address on the office network, for the invite links: a real Wi-Fi or Ethernet address
// (192.168.*, then 10.*, then 172.16–31.*), never a VPN, virtual-machine, Docker or link-local one.
// The interface's name is the tell on each system (utun/awdl/bridge on a Mac, vEthernet/VMware/
// VirtualBox/Tailscale on Windows); a link-local 169.254.* address reaches nobody.
const VIRTUAL = /^(utun|tun|tap|awdl|llw|bridge|vmnet|vboxnet|docker|br-|veth|tailscale|zt|wg|ppp|ipsec|gif|stf|anpi|ap)\d*$|vEthernet|VMware|VirtualBox|Hyper-V|TAP-|Tailscale|ZeroTier|WireGuard|Loopback/i;
export function officeAddress(ifaces = os.networkInterfaces()) {
  const all = Object.entries(ifaces).flatMap(([name, list]) => (list || []).filter((n) => n.family === 'IPv4' && !n.internal).map((n) => ({ name, address: n.address })));
  const usable = all.filter((n) => !n.address.startsWith('169.254.'));
  const real = usable.filter((n) => !VIRTUAL.test(n.name));
  const pickFrom = (list) => list.find((n) => n.address.startsWith('192.168.')) || list.find((n) => n.address.startsWith('10.'))
    || list.find((n) => /^172\.(1[6-9]|2\d|3[01])\./.test(n.address)) || list[0];
  return (pickFrom(real) || pickFrom(usable) || all[0])?.address || 'localhost';
}
