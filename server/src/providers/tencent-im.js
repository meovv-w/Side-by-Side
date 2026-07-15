const crypto = require('crypto');
const zlib = require('zlib');
const { AppError } = require('../lib/errors');

function base64Url(value) {
  return value.toString('base64').replace(/\+/g, '*').replace(/\//g, '-').replace(/=/g, '_');
}

function createUserSig(sdkAppId, secretKey, identifier, expiresIn = 86400, now = () => Date.now()) {
  const time = Math.floor(now() / 1000);
  const source = `TLS.identifier:${identifier}\nTLS.sdkappid:${sdkAppId}\nTLS.time:${time}\nTLS.expire:${expiresIn}\n`;
  const signature = crypto.createHmac('sha256', secretKey).update(source).digest('base64');
  const document = {
    'TLS.ver': '2.0',
    'TLS.identifier': identifier,
    'TLS.sdkappid': Number(sdkAppId),
    'TLS.expire': Number(expiresIn),
    'TLS.time': time,
    'TLS.sig': signature
  };
  return base64Url(zlib.deflateSync(JSON.stringify(document)));
}

class TencentImProvider {
  constructor(config, request = fetch, now = () => Date.now()) {
    this.config = config;
    this.request = request;
    this.now = now;
  }

  userSig(identifier, expiresIn) {
    this.#assertConfigured();
    return createUserSig(this.config.imSdkAppId, this.config.imSecretKey, identifier, expiresIn, this.now);
  }

  async importAccount(user) {
    return this.#call('im_open_login_svc', 'account_import', {
      Identifier: user.id,
      Nick: user.nickname,
      FaceUrl: user.avatar || ''
    });
  }

  async createGroup(groupId, name, ownerId, members = []) {
    return this.#call('group_open_http_svc', 'create_group', {
      GroupId: groupId,
      Type: 'Public',
      Name: name,
      Owner_Account: ownerId,
      ApplyJoinOption: 'NeedPermission',
      MemberList: members.map(id => ({ Member_Account: id }))
    });
  }

  async addGroupMember(groupId, userId) {
    return this.#call('group_open_http_svc', 'add_group_member', {
      GroupId: groupId,
      MemberList: [{ Member_Account: userId }]
    });
  }

  async removeGroupMember(groupId, userId, reason = '已退出车队') {
    return this.#call('group_open_http_svc', 'delete_group_member', {
      GroupId: groupId,
      MemberToDel_Account: [userId],
      Reason: reason,
      Silence: 1
    });
  }

  async sendPrivate(from, to, elements) {
    return this.#call('openim', 'sendmsg', {
      SyncOtherMachine: 2,
      From_Account: from,
      To_Account: to,
      MsgRandom: crypto.randomInt(1, 2147483647),
      MsgBody: elements
    });
  }

  async sendGroup(groupId, from, elements) {
    return this.#call('group_open_http_svc', 'send_group_msg', {
      GroupId: groupId,
      From_Account: from,
      Random: crypto.randomInt(1, 2147483647),
      MsgBody: elements
    });
  }

  async #call(service, command, payload) {
    this.#assertConfigured();
    const identifier = this.config.imAdminUser || 'administrator';
    const url = new URL(`https://console.tim.qq.com/v4/${service}/${command}`);
    url.search = new URLSearchParams({
      sdkappid: this.config.imSdkAppId,
      identifier,
      usersig: this.userSig(identifier),
      random: String(crypto.randomInt(1, 2147483647)),
      contenttype: 'json'
    });
    const response = await this.request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await response.json();
    if (!response.ok || result.ActionStatus !== 'OK') {
      throw new AppError(502, 'TENCENT_IM_ERROR', result.ErrorInfo || '腾讯云 IM 调用失败', {
        providerCode: result.ErrorCode
      });
    }
    return result;
  }

  #assertConfigured() {
    if (!this.config.imSdkAppId || !this.config.imSecretKey) {
      throw new AppError(503, 'IM_NOT_CONFIGURED', '腾讯云 IM 尚未配置');
    }
  }
}

module.exports = { TencentImProvider, createUserSig };
