const store = new Map<string, string>();

const mockStorage: Storage = {
  get length() {
    return store.size;
  },
  clear() {
    store.clear();
  },
  getItem(key: string) {
    return store.get(key) ?? null;
  },
  key(index: number) {
    return [...store.keys()][index] ?? null;
  },
  removeItem(key: string) {
    store.delete(key);
  },
  setItem(key: string, value: string) {
    store.set(key, value);
  },
};

let installed = false;
let prevWindow: typeof globalThis.window | undefined;

export function installLocalStorageMock(): void {
  store.clear();
  if (installed) {
    return;
  }
  prevWindow = globalThis.window;
  globalThis.window = { localStorage: mockStorage } as Window &
    typeof globalThis;
  globalThis.localStorage = mockStorage;
  installed = true;
}

export function uninstallLocalStorageMock(): void {
  store.clear();
  if (!installed) {
    return;
  }
  globalThis.window = prevWindow;
  if (prevWindow?.localStorage) {
    globalThis.localStorage = prevWindow.localStorage;
  } else {
    // @ts-expect-error test cleanup
    globalThis.localStorage = undefined;
  }
  installed = false;
}
