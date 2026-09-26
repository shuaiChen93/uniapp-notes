import { createSSRApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'

// Tailwind 的样式入口在这里引入而不是 App.vue 的 <style> 里，原因有二：
// 1. weapp-tailwindcss 官方推荐 Tailwind 入口是独立 .css 文件，
//    混入 scss 链路（App.vue 若用 lang="scss"）会先经历 sass 编译再进 PostCSS，
//    多一层转换容易在转义阶段出问题；
// 2. 小程序端 uni-app 会把入口 css 收集进 app.wxss，放在 main.ts 能被正确收集。
import './styles/tailwind.css'

/**
 * uni-app 的应用入口。
 *
 * ⚠️ 必须用 createSSRApp 而不是 createApp：
 * uni-app 的 Vue3 运行时在小程序端需要 SSR 形态的渲染器来接管
 * setData 更新，用 createApp 会导致页面白屏。
 */
export function createApp() {
  const app = createSSRApp(App)

  // Pinia 实例在此创建并挂载。
  // 放在 createApp 内部而不是模块顶层：H5 端 SSR / 多次调用 createApp 时，
  // 模块顶层的单例会被多个 app 复用，造成跨请求状态污染。
  const pinia = createPinia()

  // 持久化插件在阶段 2 接入（src/store/plugins/persist.ts），
  // 届时在此处追加：pinia.use(persistPlugin)
  app.use(pinia)

  return {
    app,
    // 一并导出 pinia：H5 SSR 场景需要用它恢复组件内的 store 状态。
    // 非 SSR 端导出无害，保留以兼容官方约定。
    pinia,
  }
}
