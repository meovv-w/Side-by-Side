# 同路行 TongDao MVP Restart

自驾社交微信小程序 V1 MVP 增强版演示实现：覆盖地图、消息、行程、我的 4 个 Tab，并补齐商家后台、运营后台和 HR 文档要求的主要业务链路 mock。

## 为什么重启

旧项目位于 `../tongdao/`。v2 保留核心方向，重新整理成可扫码演示、可逐项验收的版本：

- 用户端按 HR 文档改为 4 Tab：地图、消息、行程、我的。
- 商家后台和运营后台作为静态可操作原型纳入 v2。
- 真实微信支付、高德 SDK、实时 IM 等上线能力先用 mock 演示，接口边界保留。
- 云函数仍按 `login/trip/groupbuy/order/chat` 聚合 action，避免首版部署过碎。

可保留的内容：项目一句话、微信原生小程序 + 云开发技术路线、部分页面命名、模拟支付方向。应重写的内容：页面路由、云函数边界、数据模型、运行说明。

## MVP 范围

本目录是干净重启版本，不修改旧项目。

已实现 HR 演示闭环：

- 登录/mock 用户
- 地图 mock、队友位置、路线、POI、路况、安全 POI、SOS
- 消息 Tab：车队、地点、私信筛选
- 行程列表
- 发布行程
- 行程详情
- 加入行程
- 车队聊天 mock
- 车主认证 mock
- 同路值、等级、勋章数据 mock
- 邀请链接/二维码 mock
- 券包 mock
- 下一趟行程草稿
- 拼团列表
- 拼团详情
- 阶梯价格和进度条 mock
- 模拟下单
- 订单核销码
- 客服工单 mock
- 商家后台 10 类模块原型
- 运营后台 12 类模块原型

## 目录结构

```text
tongdao-v2/
├── miniprogram/
│   ├── app.js
│   ├── app.json
│   ├── app.wxss
│   ├── project.config.json
│   ├── sitemap.json
│   ├── utils/
│   │   ├── api.js
│   │   └── mockStore.js
│   └── pages/
│       ├── index/
│       ├── messages/
│       ├── trips/
│       ├── publishTrip/
│       ├── tripDetail/
│       ├── chatGroup/
│       ├── certify/
│       ├── invite/
│       ├── coupons/
│       ├── nextTrip/
│       ├── support/
│       ├── groupbuyList/
│       ├── groupbuyDetail/
│       ├── orders/
│       ├── mine/
│       └── login/
├── admin-merchant/
│   └── index.html
├── admin-ops/
│   └── index.html
├── cloudfunctions/
│   ├── login/
│   ├── trip/
│   ├── groupbuy/
│   ├── order/
│   └── chat/
└── scripts/
    └── mock-data.json
```

## 数据集合

`users`

| 字段 | 说明 |
|---|---|
| `_id` | 用户 ID |
| `openid` | 云开发 openid，mock 时为固定值 |
| `nickname` | 昵称 |
| `avatar` | 头像 URL |
| `role` | `owner` 或 `passenger` |
| `createdAt` | 创建时间 |

`trips`

| 字段 | 说明 |
|---|---|
| `_id` | 行程 ID |
| `ownerId` | 车主用户 ID |
| `ownerName` | 车主昵称 |
| `title` | 行程标题 |
| `from` / `to` | 起终点文本 |
| `departAt` | 出发时间 |
| `seatTotal` | 总座位 |
| `seatJoined` | 已加入人数 |
| `priceShare` | 人均油费/过路费 |
| `status` | `open` / `full` / `done` |
| `route` | 地图 polyline mock |
| `teammates` | 队友位置 mock |

`trip_members`

| 字段 | 说明 |
|---|---|
| `_id` | 成员记录 ID |
| `tripId` | 行程 ID |
| `userId` | 用户 ID |
| `nickname` | 昵称 |
| `role` | `owner` 或 `passenger` |
| `joinedAt` | 加入时间 |

`messages`

| 字段 | 说明 |
|---|---|
| `_id` | 消息 ID |
| `tripId` | 行程 ID |
| `userId` | 发送者 ID |
| `nickname` | 发送者昵称 |
| `content` | 文本内容 |
| `createdAt` | 发送时间 |

`groupbuys`

| 字段 | 说明 |
|---|---|
| `_id` | 拼团 ID |
| `title` | 商品/服务标题 |
| `merchantName` | 商家名 |
| `price` | 拼团价 |
| `originPrice` | 原价 |
| `minPeople` | 成团人数 |
| `joined` | 已参团人数 |
| `validUntil` | 截止时间 |
| `description` | 说明 |

`orders`

| 字段 | 说明 |
|---|---|
| `_id` | 订单 ID |
| `userId` | 用户 ID |
| `groupbuyId` | 拼团 ID |
| `title` | 商品标题 |
| `amount` | 支付金额 |
| `status` | `paid` / `used` |
| `verifyCode` | 核销码 |
| `createdAt` | 创建时间 |

## 运行方式

1. 打开微信开发者工具。
2. 导入项目目录：`/home/lin/workspace/tongdao-v2/miniprogram`。
3. AppID 可先使用测试号或替换 `project.config.json` 里的 `appid`。
4. 勾选“不校验合法域名、web-view、TLS 版本以及 HTTPS 证书”。
5. 编译后进入首页，点击底部“我的”完成 Mock 登录，或直接按演示路径操作。

默认使用本地 mock adapter，无需云开发环境即可演示。数据写在本机小程序 storage 中，点击首页“重置演示数据”可恢复初始数据。

## 本地验证

```bash
cd /home/lin/workspace/tongdao-v2
node scripts/verify.js
```

该脚本会检查页面四件套、HR 4 Tab、云函数入口、mock 初始化数据、商家/运营后台入口，并跑通登录、发布行程、聊天、拼团下单、订单、认证、邀请、券包、下一趟行程、客服和后台统计链路。

## HR 需求验收

逐项覆盖表见 [HR-CHECKLIST.md](./HR-CHECKLIST.md)。

后台入口：

- 商家后台：`/home/lin/workspace/tongdao-v2/admin-merchant/index.html`
- 运营后台：`/home/lin/workspace/tongdao-v2/admin-ops/index.html`

## 云开发替换点

当前页面统一调用 `miniprogram/utils/api.js`。5 个云函数已按 action 提供 MVP 版本，返回结构与本地 mock adapter 一致。要接真实云开发：

1. 在 `app.js` 中填入真实 `env`。
2. 将 `api.js` 中的 `useCloud = false` 改成 `true`。
3. 在微信开发者工具中上传并部署 `cloudfunctions/login`、`trip`、`groupbuy`、`order`、`chat`。
4. 按 `scripts/mock-data.json` 初始化云数据库集合。

云函数按 action 分发，避免首版部署十几个函数。

## 演示路径

1. 进入地图 Tab，查看队友位置、路线、图层、地点聊天室和 SOS。
2. 进入消息 Tab，切换车队/地点/私信，打开车队群聊并发送消息。
3. 进入行程 Tab，发布行程、查看详情、加入行程。
4. 从地图或我的页进入拼团，查看阶梯价和进度，模拟下单。
5. 进入订单页查看核销码。
6. 进入我的页，查看同路值、认证、券包、邀请、下一趟行程、客服入口。
7. 打开商家后台，演示商品、订单、核销、结算、拉新券、推广码、修车救援。
8. 打开运营后台，演示审核、订单退款、结算、商家考核、券、邀请、聊天室、客服。

## 上线前仍需真实接入

- 微信一键登录/手机号验证码。
- 行驶证上传、人脸活体、真实审核流。
- 高德地图 SDK、真实定位、路线、POI、天气、路况。
- 实时 IM、私信风控服务端校验。
- 微信支付、退款、分账。
- 商家扫码核销、真实结算。
- 运营后台真实账号权限和云数据库权限规则。
