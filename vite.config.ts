/**
 * Vite 配置
 * ══════════════════════════════════════════════════════════════════════════
 * 本文件同时服务三条编译链路：H5 / 微信小程序 / App。
 * uni-app 的官方插件 `@dcloudio/vite-plugin-uni` 会在不同的 UNI_PLATFORM 下
 * 走完全不同的产物形态（H5 是标准 Web 打包，小程序是 wxml+wxss+js 的
 * 「按页拆包」形态），因此很多配置必须按平台区分，不能一把梭。
 *
 * ⚠️ 版本约束（勿随意升级，否则整条链路会断）：
 *   vite                          固定 5.2.8
 *   @dcloudio/vite-plugin-uni     固定 3.0.0-5020420260813003
 * 原因：该 uni 插件的 peerDependencies 是 **精确版本** `"vite": "5.2.8"`
 * （不是 `^5.0.0`）。uni-app 编译器与 Vite 内部 API 耦合极深，
 * 升到 5.3/6.x 会出现「插件钩子签名对不上」的静默错误——产物能生成但运行时报错，
 * 排查成本极高。因此 package.json 里 vite 写死 5.2.8，不带 `^`。
 * ══════════════════════════════════════════════════════════════════════════
 */
import { fileURLToPath, URL } from 'node:url'
import { defineConfig, type PluginOption } from 'vite'
import uni from '@dcloudio/vite-plugin-uni'
import { UnifiedViteWeappTailwindcssPlugin } from 'weapp-tailwindcss/vite'
import tailwindcss from 'tailwindcss'

/**
 * 当前编译平台。
 *
 * 由 uni CLI 注入：`uni`(默认 h5) / `uni -p mp-weixin` / `uni -p app`。
 * 兜底 'h5' 是为了让「直接用 vite 命令」或编辑器插件做类型推断时也不报错。
 */
const UNI_PLATFORM = process.env.UNI_PLATFORM ?? 'h5'
const isH5 = UNI_PLATFORM === 'h5'
const isMp = UNI_PLATFORM.startsWith('mp-')

/**
 * 小程序端的类名转义 + rem→rpx 换算，交给 weapp-tailwindcss。
 *
 * 为什么必须在 Vite 插件层（而不是 PostCSS 层）接入：
 * 小程序 WXSS 不允许类名里出现 `/` `.` `[` `%` 等字符（Tailwind 的
 * `w-1/2`、`text-[14px]` 全都违规），转义必须「同时改写 wxss 与 wxml 里的类名」，
 * 才能保证样式与模板不错位。PostCSS 阶段拿不到 wxml 模板，做不到。
 *
 * rem2rpx 为什么必须开：
 * 微信小程序的 WXSS **不支持 rem 单位**，而 Tailwind 的间距/尺寸类
 * （p-4、w-8、space-x-2 …）默认全部输出 rem。不转换的话这些类会在真机上
 * 直接失效（且不会有任何报错，只是样式不生效，属最难查的一类问题）。
 * 默认 rootValue=32 对应「1rem = 32rpx」——正好对齐 375 基准设计稿
 * （375px 稿上的 16px = 750rpx 屏宽下的 32rpx），与 tailwind.config.js
 * 里「代码值 = 设计稿标注值」的约定一致。
 *
 * 只在 isMp 时挂载：H5 端浏览器原生支持 rem，若转成 rpx 反而全线失效。
 */
const weappTailwindcssPlugins = isMp
  ? (UnifiedViteWeappTailwindcssPlugin({ rem2rpx: true }) ?? [])
  : []

/**
 * H5 端第三方库分包策略。
 *
 * 单页应用的第一版产物通常是「一个 2MB 的 index.js」，任何一行业务代码改动
 * 都会让用户重新下载整包。手工分块后，业务代码迭代不会让 UI 库/vendor 的
 * 文件名变化，浏览器与 CDN 缓存得以命中。
 *
 * 注意这里**没有**给图表库分块：本项目的图表是纯 view + CSS 实现的
 * （原因见 components/x-bar-chart），依赖树里根本没有图表库。
 * 曾为 echarts 预留过一条规则，在确认不引入后一并删掉了——
 * 留一条永远不会命中的正则，只会让后来的人以为项目里在用它。
 *
 * ⚠️ 刻意把 `@dcloudio/*`（uni-app 运行时）排除在外，让它留在业务 chunk 中：
 * uni 运行时的模块间存在大量循环依赖与副作用式初始化，单独抽块容易在
 * H5 首屏出现「运行时未初始化就被调用」的偶发白屏，收益远小于风险。
 * 小程序端不用这套逻辑——小程序的拆包由 pages.json 的 subPackages 完成，
 * 见 pages.json 中 `pages-sub` 分包与 preloadRule 配置。
 */
function resolveManualChunks(id: string): string | undefined {
  if (!id.includes('node_modules')) return undefined

  // UI 组件库：版本升级频率低，独立成块可让它的缓存长期有效
  if (/[\\/]node_modules[\\/](wot-design-uni|@wot-design)[\\/]/.test(id)) return 'chunk-ui'

  // uni-app 运行时 / Vue 核心不进 vendor 块（原因见上方注释）
  if (/[\\/]node_modules[\\/](@dcloudio|@vue|vue|vue-i18n)[\\/]/.test(id)) return undefined

  // 其余第三方依赖统一进 vendor
  return 'chunk-vendor'
}

export default defineConfig(() => {
  const plugins: PluginOption[] = [
    // uni 插件必须放在第一位：它注册的 resolve/transform 钩子要为后续插件
    // 先把 uni-app 的虚拟模块（如 pages.json、easycom 组件）准备出来
    uni(),
    ...weappTailwindcssPlugins,
  ]

  return {
    plugins,

    /**
     * PostCSS 配置必须写在这里，不能依赖根目录的 postcss.config.js。
     *
     * ⚠️ 这是一个非常隐蔽的坑，务必读完再改：
     * @dcloudio/vite-plugin-uni 会在自己的 config 钩子里**主动设置**
     * `css.postcss.plugins = [uni-app 插件, autoprefixer]`
     * （源码：node_modules/@dcloudio/uni-cli-shared/dist/postcss/index.js 的
     *   initPostcssPlugin，由 vite 插件在 createCss 阶段注入）。
     *
     * 而 Vite 的规则是：**只要 css.postcss 已被设置，就完全跳过对
     * postcss.config.js 的查找**。因此本项目**不保留根目录的
     * postcss.config.js**——留着一个改了不生效的配置文件，只会让后来者
     * 以为「改那里能调整 Tailwind」，白白浪费时间。
     *
     * 这个坑的典型症状（本项目实测踩过）：tailwind 一条原子类都不生成，
     * 产物里原样残留 `@tailwind base;` 这种未展开指令，但构建**不报任何错**，
     * 极易被误判成「Tailwind 装错了」或「版本不兼容」。
     *
     * 因此这里显式声明 tailwindcss。
     * 不写 autoprefixer 的原因：uni 已经注入了它，重复声明会让插件链里
     * 出现两个 autoprefixer（幂等但浪费构建时间，且日志难读）。
     *
     * 插件的最终执行顺序（Vite 会按 [用户插件, uni 注入的插件] 拼接）：
     *   tailwindcss → uni-app → autoprefixer
     * 正好符合「先生成原子类、再由 uni 处理 rpx/作用域、最后补前缀」的预期。
     */
    css: {
      postcss: {
        plugins: [
          // 显式传入配置路径而非让它去 cwd 猜：uni 编译期会切换工作目录，
          // 依赖隐式查找容易在多平台构建时拿到不一致的配置。
          tailwindcss(fileURLToPath(new URL('./tailwind.config.js', import.meta.url))),
        ],
      },
    },

    resolve: {
      alias: {
        // ⚠️ 必须与 tsconfig.json 的 compilerOptions.paths 保持一致。
        // 两处不一致会出现最迷惑的一类问题：编辑器里跳转/类型全对，
        // 但运行时报「找不到模块」——因为 TS 走 paths、Vite 走 alias，各认各的。
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },

    /**
     * H5 开发服务器。
     *
     * proxy 只在 H5 端有意义：小程序的网络请求由微信客户端发出，
     * 不受浏览器同源策略约束、也压根不经过 Vite dev server。
     * 后端接口基址统一走环境变量，阶段 2 接入 request.ts 时以它为准。
     */
    server: {
      host: true,
      port: 5173,
      proxy: {
        '/api': {
          target: process.env.VITE_APP_PROXY_TARGET ?? 'http://127.0.0.1:3000',
          changeOrigin: true,
          // 后端本身没有 /api 前缀时即可开启重写
          // rewrite: (path) => path.replace(/^\/api/, ''),
        },
      },
    },

    /**
     * 构建配置：只在 H5 端做自定义分包。
     * 小程序端保持默认——产物结构由 uni 编译器按 pages.json 决定，插手会破坏分包。
     */
    build: isH5
      ? {
          // 单文件超过 500KB 才告警：echarts 已单独分块，其余块不该再超
          chunkSizeWarningLimit: 500,
          rollupOptions: {
            output: {
              manualChunks: resolveManualChunks,
            },
          },
        }
      : {},
  }
})
