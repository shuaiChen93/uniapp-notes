# 压枪训练助手

基于 **uni-app + Vue 3 + TypeScript + Vite** 的「压枪测试 / 灵敏度训练」小程序，类《和平精英》的灵敏度调校工具。

当前进度：**阶段 2**（请求库、状态管理、登录链路）已完成。核心业务页面（压枪测试、灵敏度方案、记录、排行榜）在阶段 3 接入。

> **现在还没有后端。** 所有接口由 `src/mock/` 在本地扮演服务端，数据用 uni storage 落盘持久化。接真实后端时只需把 `src/constants/config.ts` 里的 `USE_MOCK` 改成 `false`，请求层、api 层、store、页面**全部无需改动**——mock 只替换了「网络传输」这一层。

---

## 一、技术栈

| 分类 | 选型 | 说明 |
| --- | --- | --- |
| 框架 | uni-app `3.0.0-5020420260813003` | 一套代码编译到微信小程序 / H5 / App |
| 视图 | Vue `3.4` + `<script setup lang="ts">` | 全部使用组合式 API |
| 语言 | TypeScript `5.6` | 全量 `strict` 模式 |
| 构建 | Vite `5.2.8` | **版本写死，不带 `^`**，原因见下文「已知坑」 |
| 状态 | Pinia `2.3` | 配自研持久化插件（基于 `uni.setStorageSync`） |
| 样式 | TailwindCSS `3.4` + weapp-tailwindcss `4.12` | 小程序端自动做类名转义与 `rem → rpx` 换算 |
| UI 库 | wot-design-uni `1.14` | 通过 `pages.json` 的 `easycom` 按需引入 |
| 图表 | echarts `5.6` | 仅 H5 端使用，已单独分块 |
| 测试 | Vitest `2.1.9` + happy-dom | 另配 miniprogram-automator 做小程序 E2E |
| 包管理 | pnpm `11` | workspace 中配置了 `allowBuilds` |

---

## 二、环境要求

- **Node.js ≥ 18.0.0**（`package.json` 的 `engines` 字段已声明）
- **pnpm ≥ 9**（未安装：`npm i -g pnpm`）
- **微信开发者工具**（仅调试小程序端时需要，需在设置里开启「服务端口」以便 CLI/自动化调用）

---

## 三、常用命令

### 安装依赖

```bash
pnpm install
```

> ⚠️ 本项目在 `pnpm-workspace.yaml` 里用 `allowBuilds` 显式声明了允许执行构建脚本的依赖。
> 如果 pnpm 报 `ERR_PNPM_IGNORED_BUILDS`，说明有依赖的构建脚本被拦截，
> **不要用 `--ignore-scripts` 绕过**，而是把该依赖加进 `allowBuilds` 并显式写 `true`。

### 启动开发

```bash
# H5 端 —— 浏览器直接访问 http://localhost:5173
pnpm dev:h5

# 微信小程序端 —— 产物在 dist/dev/mp-weixin
pnpm dev:mp-weixin

# App 端
pnpm dev:app
```

小程序端的启动方式和 H5 不同：命令只负责**编译**，编译产物需要用**微信开发者工具**导入 `dist/dev/mp-weixin` 目录才能预览。开发模式下改动会自动重新编译，开发者工具里会自动刷新。

> H5 端启动了 `/api` 代理（见 [vite.config.ts](vite.config.ts)），默认转发到 `http://127.0.0.1:3000`。接真实后端时用环境变量覆盖：`VITE_APP_PROXY_TARGET=http://your-api.com pnpm dev:h5`。
> 小程序端的请求由微信客户端发出，不走 Vite dev server，因此代理配置对它无效。

### 打包

```bash
# H5 —— 产物在 dist/build/h5
pnpm build:h5

# 微信小程序 —— 产物在 dist/build/mp-weixin，用开发者工具导入后上传
pnpm build:mp-weixin

# App
pnpm build:app
```

### 质量检查

```bash
# TypeScript 类型检查（含 .vue 文件，由 vue-tsc 完成）
pnpm type-check

# 单元测试（跑一次即退出）
pnpm test

# 单元测试（监听模式，改代码自动重跑）
pnpm test:watch

# 单元测试 + 覆盖率报告
pnpm test:coverage

# 微信小程序 E2E（基于 miniprogram-automator）
# ⚠️ 骨架尚未编写，属于阶段 4 的内容，现在执行会失败
pnpm e2e:mp-weixin
```

**建议的提交前检查**：

```bash
pnpm type-check && pnpm test
```

---

## 四、目录结构

```txt
uniapp-demo/
├── src/
│   ├── api/                        # 接口层：只描述「有哪些接口」，不关心怎么发
│   │   ├── index.ts                #   统一出口
│   │   └── modules/auth.ts         #   登录 / 刷新 / 用户信息
│   ├── components/                 # 自研组件，统一 x- 前缀，easycom 自动引入
│   │   ├── x-page-shell/           #   页面外壳（自定义导航栏 + 安全区）
│   │   └── x-user-avatar/          #   头像（无图时退化为「昵称首字 + 渐变底」文字头像）
│   ├── constants/
│   │   ├── config.ts               # ⭐ USE_MOCK 开关、接口基址、超时、token 安全余量
│   │   ├── http.ts                 #   HTTP 状态码与业务码
│   │   └── storage.ts              #   所有 storage 键名的唯一来源
│   ├── mock/                       # ⭐ 本地 mock 服务端（详见下文）
│   │   ├── db.ts                   #   基于 storage 的「数据表」增删改查
│   │   ├── utils.ts                #   token 签发/校验、统一响应信封
│   │   ├── index.ts                #   路由表：METHOD + PATH → handler
│   │   └── routes/auth.ts          #   登录 / 刷新 / 用户信息 / 更新资料
│   ├── pages/                      # 主包页面（必须秒开的 tabBar 页）
│   │   ├── index/index.vue         #   首页
│   │   ├── recoil/index.vue        #   压枪测试
│   │   ├── record/index.vue        #   训练记录
│   │   ├── mine/index.vue          #   我的
│   │   └── login/index.vue         #   登录页（兜底，正常情况下用户看不到）
│   ├── pages-sub/                  # 分包页面（低频、体积大）
│   │   ├── sensitivity/index.vue   #   灵敏度方案
│   │   ├── rank/index.vue          #   排行榜
│   │   ├── settings/index.vue      #   设置
│   │   └── profile/index.vue       #   个人资料（改头像昵称）
│   ├── store/
│   │   ├── index.ts                #   pinia 实例 + 统一出口
│   │   ├── modules/user.ts         #   用户 store：登录、登出、拉取/更新资料
│   │   └── plugins/persist.ts      #   持久化插件
│   ├── styles/tailwind.css         # Tailwind 入口
│   ├── types/                      # 类型定义（api / user / 统一出口）
│   ├── utils/
│   │   ├── request.ts              # ⭐ 企业级请求库（传输 / 鉴权 / 业务三层）
│   │   ├── login-code.ts           #   登录凭证 code 的获取
│   │   ├── token.ts                # ⭐ 凭证的唯一权威来源
│   │   ├── storage.ts              #   storage 读写（含脏数据自愈）
│   │   └── id.ts                   #   设备 ID / uuid
│   ├── App.vue                     # 应用入口（含启动时静默登录）
│   ├── main.ts                     # 挂载 Vue 与 pinia
│   ├── manifest.json               # 各端打包配置（appid 在这里配）
│   └── pages.json                  # 路由、分包、tabBar、easycom
├── tests/
│   ├── setup.ts                    # uni.* 的测试桩（storage + 事件总线）
│   └── unit/auth.spec.ts           # 登录 / 无感刷新 / 静默登录链路
├── tailwind.config.js
├── vite.config.ts                  # 构建配置（含 Tailwind 的 PostCSS 挂载）
├── vitest.config.ts                # ⚠️ 独立于 vite.config.ts，详见「已知坑」
└── tsconfig.json
```

---

## 五、架构说明

### 5.1 请求库的分层（[src/utils/request.ts](src/utils/request.ts)）

基于 `uni.request` 封装，**不用 axios**——小程序端没有 `XMLHttpRequest`，axios 无法工作。分三层：

| 层 | 职责 | 关键点 |
| --- | --- | --- |
| 传输层 `transport()` | 唯一与「网络」相关的部分 | `USE_MOCK` 开关只影响这里，上层完全不知道自己连的是 mock 还是真服务 |
| 鉴权层 `ensureFreshToken()` | 401 无感刷新 | 并发请求**共享同一个 Promise**，只真正刷新一次 |
| 业务层 `request()` | token 注入、loading、错误提示、泛型解包 | 直接返回业务数据，已剥掉 `{ code, message, data }` 信封 |

**一个刻意的取舍：不做「提前预判过期」的主动刷新。** 主动刷新需要在「token 已过期但刷新失败」时分叉出「照常发送」的分支，逻辑分叉多且容易漏。本项目采用**被动刷新**——先发请求，收到 401 再刷新并重试。代价是过期后第一个请求多一次往返，换来的是控制流只有一条直线。

其余能力：

- **取消请求**：`cancelRequest(key)` + 请求选项里的 `cancelKey`。典型场景是搜索联想，避免「旧关键词的结果后到、覆盖了新结果」。
- **loading 引用计数**：`uni.showLoading` 是全局单例，并发 3 个请求时第一个结束就 `hideLoading` 会把还在飞的请求的 loading 一起关掉。用计数保证「第一个请求开、最后一个请求关」。
- **错误提示节流**：并发请求同时失败时（比如断网）连弹好几个 toast 会让用户看到闪烁。同一文案 800ms 内只弹一次。
- **`silent` 选项**：开启后该请求不触发任何全局副作用——不弹 loading、不弹错误提示、即使服务端返回「登录态失效」也不清凭证、不跳登录页。登录和刷新这两个接口必须开，否则会出现「登录失败 → 跳登录页」的自我跳转。

### 5.2 凭证的唯一权威来源（[src/utils/token.ts](src/utils/token.ts)）

**token 存在 storage 里，storage 是唯一权威来源；store 里那份只是给界面用的内存副本。**

这条约定是为了打破一个会致命的循环依赖：

```txt
store → api → request → store        ← 小程序端循环依赖会让某个模块拿到 undefined
```

所以 `request.ts` 里**不允许 import store**。当凭证发生变化时，它用 `uni.$emit('auth:token-refreshed', result)` 把消息广播出去，由 store 自己监听并更新内存副本。

### 5.3 持久化（[src/store/plugins/persist.ts](src/store/plugins/persist.ts)）

基于 `uni.setStorageSync`，**不依赖浏览器 localStorage**（小程序端根本没有）。在 `defineStore` 的第三个参数里声明：

```ts
defineStore('user', { ... }, {
  persist: {
    key: STORAGE_KEYS.USER,
    paths: ['userInfo'],   // 只持久化需要的字段
  },
})
```

两个细节值得注意：

- **`paths` 务必显式声明**。state 里往往混着 `loading`、`error` 这类只属于当前会话的字段，全量持久化会让用户下次打开时看到一个永远转不完的 loading——因为上次退出时它恰好是 `true`。
- **写盘有 300ms 节流**。storage 是同步 IO，高频变更直接写盘会阻塞渲染，表现为「滑动列表时卡顿」这类与业务逻辑毫无关系的性能问题。

### 5.4 Mock 服务端（[src/mock/](src/mock/)）

mock 层扮演的是**真实服务端**，而不只是「返回假数据」：

- **token 是真的会过期的**。accessToken 有效期 2 分钟，过期后接口**真的返回 HTTP 401**。因此前端那套无感刷新逻辑能被真实地跑通，而不是等接上后端才发现队列写错了。
- **刻意加了 180–420ms 的模拟延迟**。真实的网络请求不是 0ms 返回的。如果 mock 瞬时返回，开发期就看不到 loading 态，等接上真后端才发现「loading 根本没写」。
- **用户表落在 storage 里**，重复登录同一个账号拿到的是同一个用户，不是每次新建。

接口清单：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/auth/login` | 登录。code 相当于真实后端的 openid |
| POST | `/auth/refresh` | 用 refreshToken 换新 accessToken |
| GET | `/auth/profile` | 拉取当前用户信息（需要有效 accessToken） |
| PUT | `/auth/profile` | 更新昵称 / 头像 |

新增接口：在 `src/mock/routes/` 下写 handler，然后在 `src/mock/index.ts` 的路由表里登记一行。

---

## 六、登录链路（重点）

### 6.1 用户不需要进入登录页

**登录页是兜底，不是必经之路。**

微信的 `wx.login` 是**完全静默**的：不弹授权框、不需要用户点击、不消耗任何用户操作。因此小程序完全可以在启动时就把登录做完——用户在 `App.vue` 的 `onLaunch` 里就已经登录完成，从打开到进入首页，全程不知道背后发生过一次登录。

```txt
应用启动
  └─ App.vue onLaunch → silentLogin()
       ├─ 凭证还有效 ────────────────────→ 直接可用
       ├─ 有 refreshToken ───────────────→ 交给 401 刷新链路，按需刷新
       └─ 什么都没有 → wx.login() → POST /auth/login → 落盘凭证
```

**「登录」和「授权」是两件事，这是理解本设计的关键。** 以前那种「先弹登录页、等用户点一下按钮」的流程，是照搬了「需要用户授权」时代的习惯。如今 `wx.login` 没有任何授权成本，把登录页当作必经之路，等于凭空给用户加了一道没有任何作用的门槛。

登录页仍然保留，但只在两种情况下出现：

1. 静默登录失败了（appid 未配置、断网、微信侧异常）；
2. 用户**主动点过**退出登录。

### 6.2 三层兜底，逐级降级

| 场景 | 处理 | 用户感知 |
| --- | --- | --- |
| 冷启动 | `App.vue` 的 `onLaunch` 调 `silentLogin()` | 无感 |
| accessToken 过期（2 分钟后） | 401 → 静默刷新 → 自动重试原请求 | **完全无感**，连请求返回值都不变 |
| refreshToken 也过期（30 天没打开） | 401 → 刷新失败 → 静默重登 → 自动重试原请求 | **完全无感**，不会因为「一个月没来」被弹登录页 |
| 静默重登也失败 | 清凭证 → 跳登录页 | 看到登录页 |
| 用户主动退出 | 打上 `LOGGED_OUT` 标记，静默登录不再生效 | 停留在未登录态 |

### 6.3 「退出登录」必须是真按钮

自动登录和「退出登录」是一对直接冲突的需求：如果退出后 `onLaunch` 又把人登回去，这个按钮就是个点了没反应的假按钮。

解法是 `STORAGE_KEYS.LOGGED_OUT` 标记：

- `store.logout()` → 打上标记；
- `store.login()`(用户主动登录) → 清除标记；
- `ensureSilentLogin()` → 标记存在时**直接返回 false，什么都不做**。

### 6.4 头像和昵称为什么必须用户主动填

这是微信的隐私策略决定的，**与登录是两件事**：

- **登录（`wx.login`）是静默的** → 所以打开小程序即登录完成；
- **头像昵称无法静默获取** → 所以只能由用户主动提供。

微信先后回收了三代获取用户信息的接口：`wx.getUserInfo`、`wx.getUserProfile`、`<button open-type="getUserInfo">`。它们现在**不报错**，但会静默返回「微信用户」这个假名字和一张灰色默认头像——这比报错更难排查。

目前唯一合规的路径是**「头像昵称填写能力」**：

- 头像：`<button open-type="chooseAvatar" @chooseavatar="...">`，**必须**用 `button`，外层换成 `view` 或 `image` 都不会触发，点击毫无反应；
- 昵称：`<input type="nickname">`，用户聚焦时键盘上方会直接展示他的微信昵称，点一下就填进来。

因此**个人资料页是可选的**：用户不进去，账号照常用，只是显示默认昵称和文字头像。

> ⚠️ `chooseavatar` 返回的 `avatarUrl` 是**临时文件路径**（形如 `wxfile://...`），不是可以长期使用的 URL。真实项目必须在保存前用 `uni.uploadFile` 上传到自己的对象存储、换成永久地址再提交，否则这次会话结束后头像就变成裂图。本项目没有后端和对象存储，mock 层直接存了临时路径，因此重启小程序后可能失效——`x-user-avatar` 对此做了兜底：图片加载失败时自动退回文字头像，界面不会出现破图。

---

## 七、已知坑（改代码前请先读）

这些都是本项目**实测踩过**的，写在代码注释里，此处汇总：

### 7.1 `postcss.config.js` 是一份「改了不生效」的配置

`@dcloudio/vite-plugin-uni` 会在自己的 `config` 钩子里**主动设置** `css.postcss.plugins`，而 Vite 的规则是：**只要 `css.postcss` 已被设置，就完全跳过对 `postcss.config.js` 的查找**。

所以本项目**不保留根目录的 `postcss.config.js`**——留着一个改了不生效的配置文件，只会让后来者以为「改那里能调整 Tailwind」。Tailwind 声明在 [vite.config.ts](vite.config.ts) 的 `css.postcss.plugins` 里。

这个坑的典型症状：**Tailwind 一条原子类都不生成**，产物里原样残留 `@tailwind base;` 这种未展开指令，但构建**不报任何错**，极易被误判成「Tailwind 装错了」或「版本不兼容」。

### 7.2 Vite 必须锁死 `5.2.8`

`@dcloudio/vite-plugin-uni` 的 `peerDependencies` 是**精确版本** `"vite": "5.2.8"`，不是 `^5.0.0`。uni-app 编译器与 Vite 内部 API 耦合极深，升到 5.3/6.x 会出现「插件钩子签名对不上」的**静默错误**——产物能生成，但运行时才报错，排查成本极高。

因此 `package.json` 里 vite 写死 `5.2.8`，不带 `^`。

### 7.3 小程序端 Tailwind 类名会被转义

`weapp-tailwindcss` 会同时改写 wxss 与 wxml 里的类名（WXSS 不允许类名里出现 `/` `.` `[` `%` 等字符）。因此**产物里的类名和源码不一样**，这是正常的：

| 源码 | 产物 |
| --- | --- |
| `mt-1.5` | `.mt-1_d5` |
| `active:bg-bg-elevated` | `.active_cbg-bg-elevated:active` |

**在 `app.wxss` 里搜不到源码中的类名，不代表它没生成。**

另外 `rem2rpx` 必须开启：微信小程序的 WXSS **不支持 rem 单位**，而 Tailwind 的间距/尺寸类默认全部输出 rem。不转换的话这些类会在真机上直接失效，且**不会有任何报错**。

### 7.4 组件不需要额外配置样式隔离

微信官方文档说「app.wxss 不会作用于自定义组件」，但 **uni-app 默认给所有自定义组件设置了 `addGlobalClass: true`**（等价于 `styleIsolation: 'apply-shared'`）。这一行为在 `node_modules/@dcloudio/uni-mp-weixin/dist/uni.mp.esm.js` 的 `parseComponent` 里，不是文档里的内容。

所以 `app.wxss` 里的 Tailwind 输出能正常作用到组件内部，**不用给组件加任何配置**（加了也不会有变化，因为 uni 把它放在运行时组件选项里，而不是组件的 `.json` 文件里）。

### 7.5 `<input>` 的事件类型需要断言

模板里的 `<input>` 在 `vue-tsc` 眼里是浏览器的 `HTMLInputElement`，`blur`/`input` 事件被推导成 DOM 的 `FocusEvent`/`InputEvent`；而实际运行时（小程序和 H5 都是）传进来的是 uni 的事件对象，值在 `e.detail.value` 里。

因此处理函数的参数类型要写成 `Event`（DOM 事件的基类）而不是具体形状——函数参数是逆变的，只有声明成超类型才能赋值给 DOM 事件要求的签名——再用 `as unknown as` 取出 `detail.value`。

### 7.6 条件编译在单元测试里只是普通注释

`// #ifdef MP-WEIXIN` 是**构建期**由 uni 编译器处理的。在 vitest 眼里它就是一句普通注释，于是**两个分支会同时保留，且永远只会执行到第一个 `return`**——单测就错误地落在了「小程序」分支上。

这个坑的症状很隐蔽：`getPreferredLoginType()` 在测试里返回 `'wechat'`，而测试手写的登录方式是 `'guest'`，mock 服务端按 `(code + 登录方式)` 认人，于是每次静默重登都会被当成新用户注册，**账号凭空多出来一个**——而这一切在真机上都不会发生。

解法见 [src/utils/login-code.ts](src/utils/login-code.ts) 的 `isMpWeixin()`：条件编译之外再加一层运行时判断（`typeof wx !== 'undefined'`）。真机上 `wx` 一定存在，判断为真；测试环境里 `wx` 不存在，自然落回非小程序分支，与 H5 端行为一致。

### 7.7 `vitest.config.ts` 必须独立于 `vite.config.ts`

不能直接复用 `vite.config.ts`——它会加载 uni 插件，而 uni 插件在 vitest 环境下会尝试执行小程序编译流程并失败。因此单测用独立的 [vitest.config.ts](vitest.config.ts)，只配别名和 happy-dom 环境。

单测里 `uni.*` 全部由 [tests/setup.ts](tests/setup.ts) 打桩，其中 storage 用内存 Map 模拟，**事件总线 `$emit/$on/$off` 是真实实现的**——如果用空函数糊弄过去，`auth:expired` / `auth:token-refreshed` 这类事件就传不到 store，会漏测真实的登录态联动。

---

## 八、接入真实后端要改什么

1. `src/constants/config.ts` → `USE_MOCK` 改为 `false`；
2. 同文件 → `API_BASE_URL` 改成真实域名（或保持 `/api` 并用 `VITE_APP_PROXY_TARGET` 配代理）；
3. `src/manifest.json` → 填入微信小程序 `appid`（当前为空，`wx.login` 会失败并自动降级为设备登录，不影响游客体验）；
4. 核对 `src/types/` 里的接口类型与真实后端的响应结构是否一致。

**其余代码一行都不用改。**

---

## 九、开发路线

| 阶段 | 内容 | 状态 |
| --- | --- | --- |
| 阶段 1 | 工程初始化、构建配置、目录结构 | ✅ 已完成 |
| 阶段 2 | 请求库、api 层、Pinia store、持久化、登录 / 刷新 token 链路 | ✅ 已完成 |
| 阶段 3 | 核心页面：首页、压枪测试、灵敏度、记录、排行榜、我的 / 设置 | ⏳ 待开始 |
| 阶段 4 | 单元测试补全、小程序 E2E 骨架、运行说明 | ⏳ 待开始 |
