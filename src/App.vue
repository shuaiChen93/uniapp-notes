<script setup lang="ts">
import { onLaunch, onShow, onHide, onError } from '@dcloudio/uni-app'

/**
 * 应用生命周期。
 *
 * 这里刻意不放任何业务初始化逻辑（登录、拉枪械配置等），原因：
 * onLaunch 是同步阻塞首屏渲染的，把网络请求塞在这里会让冷启动凭空多一次 RTT。
 * 正确做法是让首页的 onLoad 去触发这些请求，用户至少能先看到骨架屏。
 * 此处只保留生命周期钩子骨架与埋点位，方便后续接入监控。
 */
onLaunch(() => {
  // 记录启动时间戳：后续首屏耗时埋点以此为基准
  console.log('[App] launch')
})

onShow(() => {
  // 从后台切回前台时触发。注意：小程序端切前台不一定重新走 onLaunch，
  // 需要「回到前台就刷新」的数据（如排行榜），应在这里而不是 onLaunch 里处理
  console.log('[App] show')
})

onHide(() => {
  // 进入后台：适合做「把未上传的成绩暂存到本地」这类收尾动作
  console.log('[App] hide')
})

onError((err) => {
  // 全局错误兜底。小程序端未捕获的异常不会打印完整堆栈，
  // 这里统一转成可上报的结构，避免线上问题无从查起
  console.error('[App] error:', err)
})
</script>

<style lang="scss">
/**
 * 全局基础样式。
 *
 * 注意：这里只写「每个页面都需要」的重置，页面级样式一律写在各自 SFC 中。
 * 原因：App.vue 的样式在编译后会进入 app.wxss（小程序全局样式表），
 * 一旦臃肿，会影响所有页面的样式解析与注入耗时。
 */

/* 小程序没有 html/body，页面根节点是 page。统一暗色底，避免页面切换时闪白 */
page {
  background-color: #0f1115;
  color: #f5f7fa;
  /* 使用系统字体栈：小程序无法加载 web 字体，系统字体是唯一零成本选择 */
  font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Helvetica,
    'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif;
  font-size: 28rpx;
  line-height: 1.5;
}

/**
 * 全局盒模型统一。
 * Tailwind 的 preflight 已在 tailwind.config.js 中关闭（它会用通配选择器
 * 污染小程序内置组件），因此这里手工补上最关键的一条：
 * 小程序默认使用 content-box，不加这条会导致所有带 padding 的元素宽度溢出。
 */
view,
scroll-view,
swiper,
swiper-item,
text,
image,
button,
input,
textarea {
  box-sizing: border-box;
}

/* 去掉 button 在小程序端的默认边框与背景，交给 Tailwind 类控制 */
button {
  padding: 0;
  margin: 0;
  background-color: transparent;
  line-height: normal;

  &::after {
    border: none;
  }
}
</style>
