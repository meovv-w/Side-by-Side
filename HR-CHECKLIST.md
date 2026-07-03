# TongDao-v2 HR 需求覆盖清单

依据：`/home/lin/Downloads/自驾社交技术开发文档3 - 方案+UI+MVP增强版-发送5.docx` 提取文本。

## 已在 v2 演示覆盖

### 用户端 4 Tab

- 地图：`miniprogram/pages/index/index`
  - map 组件、队友位置、路线 polyline、地图图层、安全 POI、路况提示、地点聊天室入口、SOS mock。
- 消息：`miniprogram/pages/messages/messages`
  - 车队、地点、私信筛选；车队会话可进入群聊。
- 行程：`miniprogram/pages/trips/trips`
  - 行程列表、可加入筛选、发布行程、行程详情、加入行程。
- 我的：`miniprogram/pages/mine/mine`
  - 用户资料、同路值、等级、认证状态、订单、券包、邀请、下一趟行程、客服入口。

### 用户系统

- Mock 登录：`pages/login/login`
- 车主认证：`pages/certify/certify`
- 同路值/等级：`pages/mine/mine`
- 邀请链接/二维码 mock：`pages/invite/invite`
- 券包：`pages/coupons/coupons`
- 下一趟行程草稿：`pages/nextTrip/nextTrip`
- 客服工单：`pages/support/support`

### 行程、聊天、拼团、订单

- 发布行程、行程详情、加入行程。
- 车队群聊文本消息。
- 拼团列表、拼团详情、阶梯价格 mock 数据、进度条、模拟下单。
- 订单页展示核销码。
- 重复下单保护：本地 mock 与 `cloudfunctions/order` 均已处理。

### 后台

- 商家后台原型：`admin-merchant/index.html`
  - 登录/店铺信息、商品管理、订单、核销、结算、拉新券、推广码、修车救援、消息通知。
- 运营后台原型：`admin-ops/index.html`
  - 数据看板、用户审核、商家审核、订单/退款、结算、商家考核、券、邀请、等级规则、地点聊天室、客服/投诉。

### 数据与接口

- 本地 mock 数据：`miniprogram/utils/mockStore.js`
- 云数据库初始化参考：`scripts/mock-data.json`
- 本地 API 适配器：`miniprogram/utils/api.js`
- 云函数占位：`login`、`trip`、`groupbuy`、`order`、`chat`

## Mock 覆盖，真实上线前需替换

- 微信一键登录、手机号验证码登录。
- 行驶证照片上传、人脸活体。
- 高德地图 SDK、真实定位、路线规划、POI、天气、路况事件。
- 实时 IM、私信限制的服务端强校验。
- 微信支付 JSAPI、退款、分账。
- 商家扫码核销。
- 邀请自动归因、奖励发放。
- 券抵扣和券核销结算。
- 运营后台真实账号权限。

## 当前验证命令

```bash
cd /home/lin/workspace/tongdao-v2
node scripts/verify.js
```

通过标准：页面四件套、4 Tab、后台入口、云函数入口、mock 数据集合、登录/行程/聊天/拼团/订单/认证/邀请/券/客服/后台统计链路全部通过。
