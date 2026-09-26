import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'

/**
 * 单元测试配置
 * ══════════════════════════════════════════════════════════════════════
 * 刻意**不复用** vite.config.ts，而是独立一份：
 *
 * vite.config.ts 里挂了 @dcloudio/vite-plugin-uni，它会在 config 阶段
 * 读取 pages.json / manifest.json 并注入一大堆小程序编译期插件。
 * 这些都只服务于「打包」，在跑单测时纯属噪音，还会因为平台环境变量缺失而报错。
 *
 * 单测真正需要的只有两件事：`@` 路径别名（与运行时保持一致）和 uni API 打桩
 * （见 tests/setup.ts）。配置分开写，两边互不牵连。
 * ══════════════════════════════════════════════════════════════════════
 */
export default defineConfig({
  resolve: {
    // 必须与 vite.config.ts / tsconfig.json 的 paths 完全一致，
    // 否则会出现「测试里 import 得到 undefined」这种与代码无关的假失败
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },

  test: {
    // happy-dom 提供 window / document。本项目源码不直接依赖 DOM，
    // 但 happy-dom 比 node 环境更接近真实小程序运行时的全局对象形态，
    // 后续要测组件挂载时也不必再换环境
    environment: 'happy-dom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.spec.ts'],
    // 覆盖率报告留到阶段 4 统一配置，这里先不开启，
    // 避免每次跑测试都产生一份没人看的 coverage 目录
  },
})
