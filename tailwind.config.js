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
      // 设计令牌：暗色战术风格。所有颜色在这里集中定义，
      // 页面里只写类名（如 bg-bg-card），不在组件里散落硬编码色值，
      // 后续要做主题切换时只需替换这一处（配合 CSS 变量）。
      // ──────────────────────────────────────────────────────────────
      colors: {
        // 品牌主色：战术橙，用于主按钮、激活态、关键数据强调
        brand: {
          DEFAULT: '#FF6B1A',
          light: '#FF8F4D',
          dark: '#D9540B',
        },
        // 背景层级：base < card < elevated，越靠上层越亮，形成纵深感
        bg: {
          base: '#0F1115',
          card: '#191C22',
          elevated: '#232830',
        },
        // 文本层级
        content: {
          primary: '#F5F7FA',
          secondary: '#9BA3AF',
          muted: '#5C6470',
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
