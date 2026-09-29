/** @type {import('tailwindcss').Config} */
module.exports = {
  // ────────────────────────────────────────────────────────────────
  // ① 内容扫描路径
  // Tailwind v3 是 JIT 编译：只有"能被静态扫描到"的完整类名才会生成样式。
  // ⚠️ 小程序里禁止动态拼接类名（如 `text-${color}-500`），因为拼接结果扫描不到，
  //    样式会凭空消失。凡涉及枚举 → 样式的映射，一律在 constants 中写完整类名字符串。
  // ────────────────────────────────────────────────────────────────
  content: ['./index.html', './src/**/*.{vue,js,ts,jsx,tsx}'],

  // ────────────────────────────────────────────────────────────────
  // ② 必须关闭 preflight
  // Tailwind 的 preflight 会注入 `*, ::before, ::after { ... }` 等通配选择器和
  // 针对 html/body 的重置。小程序没有 html/body 标签，且通配选择器会污染
  // 小程序内置组件（button、input）的默认外观。
  // 基础样式改由 `src/App.vue` 的全局 <style> 承担。
  // ────────────────────────────────────────────────────────────────
  corePlugins: {
    preflight: false,
  },

  theme: {
    extend: {
      // ──────────────────────────────────────────────────────────────
      // 设计令牌。
      //
      // ⚠️ 品牌色 / 背景 / 文本这三组走的是 **CSS 变量**（值定义在 App.vue 的
      // 全局样式里），而不是写死的 hex。这是主题切换的基础：
      // 换肤时只需要给页面根节点换一个 class 覆盖那组变量，
      // 所有页面、所有组件都会跟着变，不需要改动任何一处类名。
      //
      // 用变量的代价：Tailwind 的透明度语法（如 bg-brand/20）失效——
      // 它需要在编译期算出 rgb 分量，而 var() 是运行期才解析的。
      // 本项目不使用那个语法，所以这个代价为零。
      //
      // 语义色（success/warning/danger/info）保持 hex 字面量：
      // 它们在浅色与暗色背景上都有足够对比度，不需要随主题变化，
      // 换了主题反而可能出现「暗色下的红字看不清」这类问题。
      // 取值同样偏低饱和，与整体的柔和中性基调一致。
      // ──────────────────────────────────────────────────────────────
      colors: {
        // 品牌主色：柔和墨绿，用于主按钮、激活态、关键强调
        brand: {
          DEFAULT: 'var(--color-brand)',
          light: 'var(--color-brand-light)',
          dark: 'var(--color-brand-dark)',
        },
        // 背景层级：base < card < elevated
        bg: {
          base: 'var(--color-bg-base)',
          card: 'var(--color-bg-card)',
          elevated: 'var(--color-bg-elevated)',
        },
        // 文本层级
        content: {
          primary: 'var(--color-content-primary)',
          secondary: 'var(--color-content-secondary)',
          muted: 'var(--color-content-muted)',
        },
        // 语义色：成功 / 提醒 / 危险（删除等不可逆操作）
        success: '#4E9A6B',
        warning: '#D9A441',
        danger: '#D9534F',
        info: '#5B7FBF',
      },

      // 字号：显式使用 px 作为源值。
      // 虽然 vite 插件已开启 rem2rpx 自动换算，但显式声明可让
      // 设计稿标注值（375 基准）与代码值 1:1 对应，减少换算心智负担。
      fontSize: {
        '2xs': ['10px', { lineHeight: '14px' }],
        xs: ['12px', { lineHeight: '18px' }],
        sm: ['14px', { lineHeight: '20px' }],
        base: ['15px', { lineHeight: '24px' }], // 正文：比常规界面略大，长文本更好读
        lg: ['17px', { lineHeight: '26px' }],
        xl: ['20px', { lineHeight: '28px' }],
        '2xl': ['24px', { lineHeight: '32px' }],
        '3xl': ['30px', { lineHeight: '38px' }],
      },

      // 圆角：卡片风格，统一走这里，避免各页面随手写 6px/8px/10px
      borderRadius: {
        card: '12px',
        panel: '16px',
      },
    },
  },

  plugins: [],
}
