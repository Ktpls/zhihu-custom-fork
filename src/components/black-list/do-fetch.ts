import { store } from '../../store';
import { myStorage } from '../../tools';
import { IBlockedUser } from './types';
import { removeItemAfterBlock, updateItemAfterBlock } from './update';

/** 确定是否需要与知乎服务器同步 */
async function shouldPushToZhihu(pushToZhihu: boolean | undefined): Promise<boolean> {
  if (pushToZhihu !== undefined) {
    return pushToZhihu;
  }
  const { syncBlacklistWithZhihuServer = false } = await myStorage.getConfig();
  return syncBlacklistWithZhihuServer;
}

/** 拉黑用户（屏蔽用户）方法 */
export const addBlockUser = (userInfo: IBlockedUser, pushToZhihu: boolean | undefined = undefined) => {
  const { name, urlToken } = userInfo;
  const message = `是否要屏蔽${name}？\n屏蔽后，对方将不能关注你、向你发私信、评论你的实名回答、使用「@」提及你、邀请你回答问题，但仍然可以查看你的公开信息。`;
  return new Promise<void>(async (resolve) => {
    await shouldPushToZhihu(pushToZhihu) && await blockUserOnZhihuServer(urlToken);
    await updateItemAfterBlock(userInfo);
    resolve();
  });
};

/** 解除拉黑用户 */
export const removeBlockUser = (info: IBlockedUser, needConfirm = true, pushToZhihu: boolean | undefined = undefined) => {
  if (needConfirm) {
    const message = '取消屏蔽之后，对方将可以：关注你、给你发私信、向你提问、评论你的答案、邀请你回答问题。';
    if (!confirm(message)) return Promise.reject();
  }
  return new Promise<void>(async (resolve) => {
    const { urlToken } = info;
    await shouldPushToZhihu(pushToZhihu) && await removeBlockUserOnZhihuServer(urlToken);
    await removeItemAfterBlock(info);
    resolve();
  });
};

export async function removeBlockUserOnZhihuServer(urlToken: string) {
  const headers = store.getFetchHeaders();
  await fetch(`https://www.zhihu.com/api/v4/members/${urlToken}/actions/block`, {
    method: 'DELETE',
    headers: new Headers({
      ...headers,
      'x-xsrftoken': document.cookie.match(/(?<=_xsrf=)[\w-]+(?=;)/)![0] || '',
    }),
    credentials: 'include',
  });
}

export async function blockUserOnZhihuServer(urlToken: string) {
  const headers = store.getFetchHeaders();
  await fetch(`https://www.zhihu.com/api/v4/members/${urlToken}/actions/block`, {
    method: 'POST',
    headers: new Headers({
      ...headers,
      'x-xsrftoken': document.cookie.match(/(?<=_xsrf=)[\w-]+(?=;)/)![0] || '',
    }),
    credentials: 'include',
  });
}