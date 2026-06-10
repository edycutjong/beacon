// Dummy mock for web to prevent react-native-bare-kit from crashing Metro Web builds
class DummyEventEmitter {
  on() {}
  off() {}
  emit() {}
}

export class Worklet extends DummyEventEmitter {
  static _worklets = new Set();
  constructor() {
    super();
    this.IPC = {
      _open: (cb) => cb(null),
      _read: (cb) => {},
      _write: (data, cb) => cb(null)
    };
  }
  get started() { return true; }
  get terminated() { return false; }
  get suspended() { return false; }
  start() {}
  suspend() {}
  resume() {}
  wakeup() {}
  terminate() {}
}
