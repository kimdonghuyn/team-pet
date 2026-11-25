// What the web pet (client/pet.js) may ask of the Mac app: let clicks through or not, move the
// window (dragging my pet), hide, quit.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('teamPet', {
  mouse: (over) => ipcRenderer.send('mouse', !!over),
  drag: (dx, dy) => ipcRenderer.invoke('drag', dx, dy),
  // Where in the window the pet sits (its right and bottom margins), whenever the app settles it.
  onDock: (cb) => ipcRenderer.on('dock', (_e, d) => cb(d)),
  // The clipboard (read by the app itself: a sandboxed preload has none): an invite link copied
  // from the invite page fills the first-run box by itself.
  clipboard: () => ipcRenderer.invoke('clipboard'),
  hide: () => ipcRenderer.send('hide'),
  quit: () => ipcRenderer.send('quit'),
});
