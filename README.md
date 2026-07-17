# 同路行 TongDao V1

本仓库实现《自驾社交技术开发文档3 - 方案+UI+MVP增强版-发送5.docx》定义的 V1 MVP 增强版：用户通过微信小程序完成车主认证、组队、地图协同、聊天、拼团、支付、核销、成长和邀请，商家与运营人员分别在独立后台完成经营和平台管理。

当前准确状态：V1 代码、演示闭环、真实服务端接口和生产服务适配器均已完成；正式商用仍需公司提供企业账号、密钥、HTTPS 域名、真实商户资料和合规文本，并完成外部服务联调及微信审核。

## 交付组成

- 微信原生小程序：4 个 Tab、26 个页面、离线演示与远端 API 双模式。
- Node.js 服务：Fastify、MySQL、Redis、WebSocket、每分钟业务任务，共 8 个迁移。
- 商家后台：入驻、商品、订单详情、订单/券扫码核销、结算、拉新券、推广、救援、考核、通知和客服。
- 运营后台：用户/资质/商家审核、拼团、订单、退款、分账、券结算、考核、邀请、成长、地点内容、安全、客服、救援和审计。
- 生产适配器：微信登录/支付/退款/分账、高德路线/POI/天气/交通事件、腾讯短信/IM、OCR/活体、对象存储。
- 自动化：41 项服务端测试、产品结构与离线流程校验、MySQL/Redis 集成冒烟、后台浏览器检查和微信官方 CI。

`cloudfunctions/` 的 5 个目录是早期兼容入口，不是当前权威后端。真实业务服务位于 `server/`。

## V1 能力

- 用户与增长：微信/手机号登录、浏览权限边界、车主认证、资料、成长流水、等级、勋章、轨迹、邀请三种归因、奖励券和券包。
- 行程与匹配：三步发布/编辑、1-5 个途经点、路线采样顺路率、10km 推荐、申请审批、下一趟草稿、出发/行进/完成、退出审批和自动脱队。
- 地图与安全：本队实时位置、路线、队长基准、终点、其他车队/个人、POI、拼团、交通事件、地点话题、安全点、天气、海拔、图层、聚合、消息预览、补能提醒和 SOS。
- 消息与社交：车队文字/图片/语音/位置/拼团消息、永久群、地点话题在线状态/回复/归档/复活、关注、黑名单和私信防骚扰规则。
- 拼团与交易：商品图、阶梯价、目标人数、实时进度、分享、微信 JSAPI 支付、库存预占、自动/主动退款、订单/券二维码核销和动态佣金分账。
- 后台闭环：商家资料与经营、运营审核与干预、真实状态持久化、通知、客服会话、财务流水、规则配置和写操作审计。

文档明确列为 V1.2 的“平台预置热门地点话题”不属于本次 V1；用户创建和交通事件自动创建均已完成。

## 本地运行

需要 Node.js 20 以上。

```bash
cd /home/lin/workspace/tongdao-v2/server
npm install
npm run demo
```

- 商家后台：<http://127.0.0.1:8790/merchant/?preview=1>
- 运营后台：<http://127.0.0.1:8790/ops/?preview=1>
- 健康检查：<http://127.0.0.1:8790/health>

微信开发者工具导入 `miniprogram/` 后默认连接本机 `8790`，可验证小程序与两个后台共享状态。手机扫描 `preview-qrcode.png` 时使用设备内离线演示数据；手机无法访问电脑的 `127.0.0.1`，跨端联调需要部署 HTTPS API 并配置合法域名。

## 数据库验证

```bash
cd /home/lin/workspace/tongdao-v2
podman compose up -d mysql redis

cd server
MYSQL_URL=mysql://tongdao:tongdao_dev@127.0.0.1:3306/tongdao npm run migrate
SEED_DEMO=true MYSQL_URL=mysql://tongdao:tongdao_dev@127.0.0.1:3306/tongdao npm run seed
MYSQL_URL=mysql://tongdao:tongdao_dev@127.0.0.1:3306/tongdao \
REDIS_URL=redis://127.0.0.1:6379/0 npm run test:integration
```

部署时基于 `server/.env.example` 配置环境变量。不要提交 `.env`、支付证书、CI 私钥或访问令牌。

## 已验证

2026-07-17 最终核验结果：

```text
API business tests               36/36 passed
AMap adapter tests                3/3 passed
UTC/China time tests              2/2 passed
node scripts/verify.js           passed
npm run check                    passed
npm audit --omit=dev             0 vulnerabilities
MySQL 8.4 + Redis 7.4 smoke      passed
Chromium desktop/mobile          passed, runtime errors 0
WeChat miniprogram-ci            passed, 84 code files, 526428-byte package
```

微信 CI 已更新 `preview-qrcode.png`。预览码会过期，且仅该 AppID 的管理员、开发者或体验成员可进入；给 HR 测试前需添加其微信号为体验成员，或现场重新生成。

## 正式上线依赖

- 微信认证小程序 AppID/AppSecret、隐私接口声明、合法 HTTPS 域名和审核发布权限。
- 微信支付商户号、API v3 证书、回调域名、退款/分账权限及财务配置。
- 高德 Key 与路线、POI、天气、交通事件商业授权及动态签名服务。
- 腾讯云短信/IM、OCR/活体、对象存储的正式账号、模板、回调和额度。
- 生产 MySQL/Redis、监控、备份、告警、审计保留和运维策略。
- 真实商家、商品、资质、客服流程、用户协议、隐私政策、备案和内容审核。

需求证据见 [HR-CHECKLIST.md](./HR-CHECKLIST.md)，人工验收见 [BOSS-ACCEPTANCE.md](./BOSS-ACCEPTANCE.md)，交付说明见 [SUBMISSION.md](./SUBMISSION.md)。
