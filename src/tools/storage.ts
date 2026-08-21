import type { IBlockedUser } from '../components/black-list/types';
import { SAVE_HISTORY_NUMBER } from '../config';
import { IPfConfig, IPfHistory } from '../config/types';
import { BlacklistCache } from './blacklistcache';

const memoryRawCache: Record<string, string | undefined> = {};
let configCacheRaw = '';
let configCache: IPfConfig | undefined = undefined;
let historyCacheRaw = '';
let historyCache: IPfHistory | undefined = undefined;

const parseStorageData = (raw: string) => {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
};

const updateRawCache = (name: string, raw: string) => {
  memoryRawCache[name] = raw;
  if (name === 'pfConfig') {
    configCacheRaw = raw;
    configCache = parseStorageData(raw) || {};
  }
  if (name === 'pfHistory') {
    historyCacheRaw = raw;
    historyCache = parseStorageData(raw) || { list: [], view: [] };
  }
};

const syncRawStorage = async (name: string, raw: string, gmRaw: string, localRaw: string) => {
  if (!raw) return;
  if (localRaw !== raw) {
    localStorage.setItem(name, raw);
  }
  if (gmRaw !== raw) {
    await GM.setValue(name, raw);
  }
};

window.addEventListener('storage', (event) => {
  if (!event.key || !['pfConfig', 'pfHistory'].includes(event.key)) return;
  updateRawCache(event.key, event.newValue || '');
});

/** 使用 localStorage + GM 存储，解决跨域存储配置不同的问题 */
export const myStorage = {
  set: async function (name: string, value: Record<string, any>, refreshTimestamp = true) {
    const nextValue = { ...value };
    if (refreshTimestamp || !nextValue.t) {
      nextValue.t = +new Date();
    }
    const v = JSON.stringify(nextValue);
    updateRawCache(name, v);
    localStorage.setItem(name, v);
    await GM.setValue(name, v);
  },
  remove: async function (name: string) {
    updateRawCache(name, '');
    localStorage.removeItem(name);
    await GM.deleteValue(name);
  },
  get: async function (name: string, force = false) {
    const configLocal = localStorage.getItem(name) || '';
    if (!force && memoryRawCache[name] !== undefined && memoryRawCache[name] === configLocal) return memoryRawCache[name] as string;

    const gmValue = await GM.getValue(name);
    const config = typeof gmValue === 'string' ? gmValue : gmValue ? JSON.stringify(gmValue) : '';
    const cParse = parseStorageData(config);
    const cLParse = parseStorageData(configLocal);
    if (!cParse && !cLParse) {
      updateRawCache(name, '');
      return '';
    }
    if (!cParse) {
      updateRawCache(name, configLocal);
      await syncRawStorage(name, configLocal, config, configLocal);
      return configLocal;
    }
    if (!cLParse) {
      updateRawCache(name, config);
      await syncRawStorage(name, config, config, configLocal);
      return config;
    }
    const nextRaw = cParse.t < cLParse.t ? configLocal : config;
    updateRawCache(name, nextRaw);
    await syncRawStorage(name, nextRaw, config, configLocal);
    return nextRaw;
  },
  getConfig: async function (force = false): Promise<IPfConfig> {
    const nConfig = await this.get('pfConfig', force);
    if (!force && configCache && nConfig === configCacheRaw) return configCache;
    configCacheRaw = nConfig || '';
    configCache = (parseStorageData(configCacheRaw) as IPfConfig) || {};
    return configCache;
  },
  getHistory: async function (force = false): Promise<IPfHistory> {
    const nHistory = await myStorage.get('pfHistory', force);
    if (!force && historyCache && nHistory === historyCacheRaw) return historyCache;
    historyCacheRaw = nHistory || '';
    historyCache = (parseStorageData(historyCacheRaw) as IPfHistory) || { list: [], view: [] };
    return historyCache;
  },
  /** 修改配置中的值 */
  updateConfigItem: async function (key: string | Record<string, any>, value?: any) {
    const config = await this.getConfig(true);
    if (typeof key === 'string') {
      config[key] = value;
    } else {
      for (let itemKey in key) {
        config[itemKey] = key[itemKey];
      }
    }
    await this.updateConfig(config);
  },
  /** 更新配置 */
  updateConfig: async function (params: IPfConfig, refreshTimestamp = true) {
    await this.set('pfConfig', params, refreshTimestamp);
    // 配置更新可能包含黑名单变更，使黑名单缓存失效，下次查询时自动重建
    // 禁用缓存自动失效，留待页面刷新时再更新
    // await this._weakCachedBlacklist.invalidate();
  },
  updateHistoryItem: async function (key: 'list' | 'view', params: string[]) {
    const pfHistory = await this.getHistory();
    pfHistory[key] = params.slice(0, SAVE_HISTORY_NUMBER);
    await this.set('pfHistory', pfHistory);
  },
  updateHistory: async function (value: IPfHistory) {
    await this.set('pfHistory', value);
  },
  _weakCachedBlacklist: new BlacklistCache<IBlockedUser>(
    (user) => user.id,
    async (): Promise<IBlockedUser[]> => {
      // 缓存数据源：知乎黑名单 + 本地黑名单
      const config = await myStorage.getConfig();
      return [
        ...((config['blockedUsers'] || []) as IBlockedUser[]),
        ...((config['localBlockedUsers'] || []) as IBlockedUser[]),
      ];
    }
  ),
  getWeakCachedBlacklist: function () {
    return this._weakCachedBlacklist;
  },
  clearWeakCachedBlacklist: async function () {
    // invalidate 后下次查询时通过 ensureCacheBuilt 自动重建
    await this._weakCachedBlacklist.invalidate();
  },
  getBlacklistedDude: async function (userId: string | null | undefined) {
    return await this.getWeakCachedBlacklist().get(userId)
  },
};