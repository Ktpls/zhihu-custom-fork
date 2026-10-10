import { store } from '../../store';
import { dom, domById, domC, fnDomReplace, formatTime, message, myStorage } from '../../tools';
import { Semaphore } from '../../tools/semaphore';
import { ID_BLOCK_LIST, initHTMLBlockedUsers } from './create-html';
import { blockUserOnZhihuServer, removeBlockUser } from './do-fetch';
import { BLACK_LIST_CONFIG_NAMES, IBlockedUser, IConfigBlackList, mergeBlockedUsers } from './types';

/** 导出黑名单部分配置 */
export const onExportBlack = async () => {
  const config = await myStorage.getConfig();
  const configBlackList: IConfigBlackList = {};
  BLACK_LIST_CONFIG_NAMES.forEach((name) => {
    if (typeof config[name] !== 'undefined') {
      configBlackList[name] = config[name] as any;
    }
  });
  const dateNumber = +new Date();
  const link = domC('a', {
    href: 'data:text/csv;charset=utf-8,\ufeff' + encodeURIComponent(JSON.stringify(configBlackList)),
    download: `黑名单配置-${formatTime(dateNumber, 'YYYYMMDD-HHmmss')}-${dateNumber}.txt`,
  });
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

/** 黑名单部分配置导入 */
export const onImportBlack = async (oFREvent: ProgressEvent<FileReader>) => {
  let configBlackJson = oFREvent.target ? oFREvent.target.result : '';
  if (typeof configBlackJson !== 'string') return;
  const configBlack = JSON.parse(configBlackJson) as IConfigBlackList;
  const { blockedUsers = [], localBlockedUsers = [], blockedUsersTags = [] } = configBlack;
  const prevConfig = await myStorage.getConfig();
  const { blockedUsers: prevBlockUsers = [], localBlockedUsers: prevLocalBlockedUsers = [], blockedUsersTags: prevBlockedUsersTags = [] } = prevConfig;
  // 标签合并去重
  const nTags = [...new Set([...prevBlockedUsersTags, ...blockedUsersTags])];
  const nBlackList: IBlockedUser[] = mergeBlockedUsers([...prevBlockUsers, ...blockedUsers]);
  const blockedUserIds = new Set(nBlackList.map((item) => item.id));
  const nLocalBlackList: IBlockedUser[] = mergeBlockedUsers([...prevLocalBlockedUsers, ...localBlockedUsers]).filter((item) => !blockedUserIds.has(item.id));
  await myStorage.updateConfig({
    ...prevConfig,
    ...configBlack,
    blockedUsers: nBlackList,
    localBlockedUsers: nLocalBlackList,
    blockedUsersTags: nTags,
  });
  message('导入完成，请等待知乎黑名单同步...');
  onSyncBlackList(0);
};

/** 清空黑名单列表 */
export const onSyncRemoveBlockedUsers = async () => {
  if (!confirm('您确定要取消所有知乎黑名单用户吗？')) return;
  if (!confirm('确定清空所有知乎黑名单用户？')) return;

  const { blockedUsers = [] } = await myStorage.getConfig();
  if (!blockedUsers.length) return;

  const buttonSync = dom('button[name="syncBlackRemove"]') as HTMLButtonElement;
  if (!buttonSync.querySelector('ctz-loading')) {
    fnDomReplace(buttonSync, { innerHTML: '<i class="ctz-loading">↻</i>', disabled: true });
  }

  const len = blockedUsers.length;
  let finishNumber = 0;

  for (let i = 0; i < len; i++) {
    const info = blockedUsers[i];
    if (info.id) {
      removeBlockUser(info, false).then(async () => {
        finishNumber++;
        if (finishNumber === len) {
          fnDomReplace(buttonSync, { innerHTML: '清空知乎黑名单', disabled: false });
          await myStorage.updateConfigItem('blockedUsers', []);
          initHTMLBlockedUsers(document.body);
        }
      });
    }
  }
};

/** 同步黑名单 */
export function onSyncBlackList(offset = 0, l: IBlockedUser[] = []) {
  const nodeList = domById(ID_BLOCK_LIST);
  if (!l.length && nodeList) {
    nodeList.innerHTML = '知乎黑名单加载中...';
  }

  const buttonSync = dom('button[name="syncBlack"]') as HTMLButtonElement;
  if (!buttonSync.querySelector('ctz-loading')) {
    fnDomReplace(buttonSync, { innerHTML: '<i class="ctz-loading">↻</i>', disabled: true });
  }

  const limit = 20;
  const headers = store.getFetchHeaders();
  fetch(`https://www.zhihu.com/api/v3/settings/blocked_users?offset=${offset}&limit=${limit}`, {
    method: 'GET',
    headers: new Headers(headers),
    credentials: 'include',
  })
    .then((response) => response.json())
    .then(async ({ data, paging }: { data: any[]; paging: any }) => {
      const prevConfig = await myStorage.getConfig();
      const { blockedUsers = [], localBlockedUsers = [] } = prevConfig;
      const prevBlockedUsers = [...blockedUsers, ...localBlockedUsers];

      data.forEach(({ id, name, url_token }) => {
        const findItem = prevBlockedUsers.find((i) => i.id === id);
        l.push({ id, name, urlToken: url_token, tags: (findItem && findItem.tags) || [] });
      });
      if (!paging.is_end) {
        onSyncBlackList(offset + limit, l);
        if (nodeList) {
          nodeList.innerHTML = `知乎黑名单加载中（${l.length} / ${paging.totals}）...`;
        }
      } else {
        const syncedIds = new Set(l.map((item) => item.id));
        await myStorage.updateConfig({
          ...prevConfig,
          blockedUsers: l,
          localBlockedUsers: localBlockedUsers.filter((item) => !syncedIds.has(item.id)),
        });
        initHTMLBlockedUsers(document.body);
        fnDomReplace(buttonSync, { innerHTML: '同步知乎黑名单', disabled: false });
        message('知乎黑名单同步完成');
      }
    });
}
export const onPushBlacklistToZhihu = async () => {
  const config = await myStorage.getConfig();
  const { localBlockedUsers = [] } = config;
  if (!localBlockedUsers.length) {
    message('本地黑名单为空，无需推送');
    return;
  }
  message(`开始推送知乎黑名单，共 ${localBlockedUsers.length} 条`);

  const buttonPush = dom('button[name="pushBlacklistToZhihu"]') as HTMLButtonElement;
  if (!buttonPush.querySelector('ctz-loading')) {
    fnDomReplace(buttonPush, { innerHTML: '<i class="ctz-loading">↻</i>', disabled: true });
  }

  const semaphore = new Semaphore(100);
  const total = localBlockedUsers.length;
  let successCount = 0;
  let failCount = 0;
  let finishNumber = 0;
  for (const item of localBlockedUsers) {
    await semaphore.acquire();
    try {
      const { urlToken } = item;
      if (!urlToken) continue;
      await blockUserOnZhihuServer(urlToken);
      successCount += 1;
    } catch (error) {
      failCount += 1;
      message(`推送黑名单用户 ${item.name} 失败`);
    } finally {
      await semaphore.release();
      finishNumber += 1;
      if (finishNumber < total) {
        fnDomReplace(buttonPush, { innerHTML: `<i class="ctz-loading">↻</i>（${finishNumber} / ${total}）`, disabled: true });
      }
    }
  }
  fnDomReplace(buttonPush, { innerHTML: '向知乎推送', disabled: false });
  message(`黑名单已推送至知乎，成功 ${successCount}，失败 ${failCount}`);
}
export const onPullBlacklistFromZhihu = async () => {
  const config = await myStorage.getConfig();
  const { blockedUsers = [], localBlockedUsers = [] } = config;

  message('开始拉取知乎黑名单，等待拉取最新黑名单记录...');

  const buttonPull = dom('button[name="pullBlacklistFromZhihu"]') as HTMLButtonElement;
  if (!buttonPull.querySelector('ctz-loading')) {
    fnDomReplace(buttonPull, { innerHTML: '<i class="ctz-loading">↻</i>', disabled: true });
  }

  // 本地已有记录的 id 集合
  const existedIds = new Set<string>([
    ...blockedUsers.map((item) => item.id),
    ...localBlockedUsers.map((item) => item.id),
  ]);

  const limit = 20;
  const headers = store.getFetchHeaders();
  let offset = 0;
  let hasMore = true;
  let hasError = false;
  const addedToZhihu: IBlockedUser[] = [];

  while (hasMore) {
    const response = await fetch(
      `https://www.zhihu.com/api/v3/settings/blocked_users?offset=${offset}&limit=${limit}`,
      {
        method: 'GET',
        headers: new Headers(headers),
        credentials: 'include',
      }
    );

    if (!response.ok) {
      const text = await response.clone().text().catch(() => '');
      message(`拉取知乎黑名单失败：${response.status} ${text}`);
      hasError = true;
      break;
    }

    const result = await response.json();
    const data = result.data || [];
    const paging = result.paging || { is_end: true };

    for (const item of data) {
      const { id, name, url_token } = item;
      if (id && !existedIds.has(id)) {
        const newUser: IBlockedUser = {
          id,
          name: name || '',
          urlToken: url_token || '',
          tags: [],
        };
        // 拉取优先添加到知乎黑名单
        addedToZhihu.push(newUser);
        existedIds.add(id);
      }
    }

    if (paging.is_end) {
      hasMore = false;
    } else {
      offset += limit;
      fnDomReplace(buttonPull, { innerHTML: `<i class="ctz-loading">↻</i>（${offset + limit} / ${paging.totals}）`, disabled: true });
    }
  }

  if (addedToZhihu.length) {
    await myStorage.updateConfig({
      ...config,
      blockedUsers: [...blockedUsers, ...addedToZhihu],
    });
  }

  fnDomReplace(buttonPull, { innerHTML: '从知乎拉取', disabled: false });
  initHTMLBlockedUsers(document.body);
  if (hasError) {
    message(`知乎黑名单拉取中断，已获取新增 ${addedToZhihu.length} 条`);
  } else {
    message('知乎黑名单拉取完成');
  }
};

/** 转移知乎黑名单到本地黑名单 */
export const onTransferZhihuBlacklistToLocal = async () => {
  if (!confirm('确定要将所有知乎黑名单用户转移到本地黑名单吗？\\n此操作会清空知乎黑名单，并合并到本地黑名单（标签将合并）。')) return;

  const config = await myStorage.getConfig();
  const { blockedUsers = [], localBlockedUsers = [] } = config;

  // 合并知乎黑名单和本地黑名单（去重并合并标签）
  const mergedList = mergeBlockedUsers([...blockedUsers, ...localBlockedUsers]);

  await myStorage.updateConfig({
    ...config,
    blockedUsers: [], // 清空知乎黑名单
    localBlockedUsers: mergedList,
  });

  // 更新 UI
  initHTMLBlockedUsers(document.body);
  message('知乎黑名单已转移到本地黑名单');
};