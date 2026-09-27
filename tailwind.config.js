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
  // wot-design-uni 等组件库与小程序内置组件（button、input）的默认外观。
  // 基础样式改由 `src/App.vue` 的全局 <style> 与小程序的默认样式承担。
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
      // 本项目本来就不用那个语法（原因见 components/x-rating-badge 的说明），
      // 所以这个代价为零。
      //
      // 语义色（success/warning/danger/info）与评级色保持 hex 字面量：
      // 它们在浅色与深色背景上都有足够对比度，不需要随主题变化，
      // 而 rating 色还要被 constants/rating.ts 拼接成 8 位 hex 用作背景，
      // 换成 var() 会让那个拼接直接产生非法色值。
      // ──────────────────────────────────────────────────────────────
      colors: {
        // 品牌主色：战术橙，用于主按钮、激活态、关键数据强调
        brand: {
          DEFAULT: 'var(--color-brand)',
          light: 'var(--color-brand-light)',
          dark: 'var(--color-brand-dark)',
        },
        // 背景层级：base < card < elevated，越靠上层越亮，形成纵深感
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
        // 语义色：命中/警告/脱靶
        success: '#22C55E',
        warning: '#F59E0B',
        danger: '#EF4444',
        info: '#3B82F6',
        // 成绩评级色：S/A/B/C/D，与 src/constants/rating.ts 的枚举一一对应。
        // 之所以放进 Tailwind 而不是写在页面里，是为了让评分组件能直接用
        // `text-rating-s` 这类完整类名，避免动态拼接导致 JIT 扫描不到。
        rating: {
          s: '#FFC53D',
          a: '#A855F7',
          b: '#3B82F6',
          c: '#22C55E',
          d: '#6B7280',
        },
      },

      // 字号：显式使用 px 作为源值。
      // 虽然 vite 插件已开启 rem2rpx 自动换算，但显式声明可让
      // 设计稿标注值（375 基准）与代码值 1:1 对应，减少换算心智负担。
      fontSize: {
        '2xs': ['10px', { lineHeight: '14px' }],
        xs: ['12px', { lineHeight: '16px' }],
        sm: ['14px', { lineHeight: '20px' }],
        base: ['16px', { lineHeight: '24px' }],
        lg: ['18px', { lineHeight: '26px' }],
        xl: ['20px', { lineHeight: '28px' }],
        '2xl': ['24px', { lineHeight: '32px' }],
        '3xl': ['30px', { lineHeight: '38px' }],
        // 数据展示专用超大字号：得分、K/D 等仪表盘数字
        stat: ['40px', { lineHeight: '48px' }],
      },

      // 圆角：小程序卡片风格，统一走这里，避免各页面随手写 6px/8px/10px
      borderRadius: {
        card: '12px',
        panel: '16px',
      },
    },
  },

  plugins: [],
}
