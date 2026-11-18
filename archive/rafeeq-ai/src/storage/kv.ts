// Copyright (c) 2026 DRS AI. All rights reserved.
import { Storage } from 'expo-sqlite/kv-store';
import type { StateStorage } from 'zustand/middleware';

/** Synchronous key-value storage backed by SQLite, used for persisted Zustand stores. */
export const kvStorage: StateStorage = {
  getItem: (name) => Storage.getItemSync(name),
  setItem: (name, value) => Storage.setItemSync(name, value),
  removeItem: (name) => {
    Storage.removeItemSync(name);
  },
};
