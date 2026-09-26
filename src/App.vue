<script setup lang="ts">
import { onLaunch, onShow, onHide, onError } from '@dcloudio/uni-app'
import { silentLogin } from '@/utils/request'

/**
 * 应用生命周期。
 *
 * 这里刻意不放业务数据请求（拉枪械配置、拉训练记录等），原因：
 * 那些请求会影响首屏内容，放在 onLoad 里配合骨架屏才是正确做法。
 * 此处只保留生命周期钩子骨架与埋点位，方便后续接入监控。
 */
onLaunch(() => {
  // 记录启动时间戳：后续首屏耗时埋点以此为基准
  console.log('[App] launch')

  /**
   * 静默登录。
   *
   * 这是上面那条「不放业务请求」原则的**唯一例外**，理由：
   *
   * ① 它不产生界面内容。用户看到什么由页面自己决定，
   *    登录成功与否只影响「我的」页显示昵称还是「未登录」。
   * ② 它不阻塞渲染。silentLogin 是异步的且没有被 await，
   *    onLaunch 同步返回，首屏照常渲染。
   * ③ 它必须是全局最早的一次。放在页面里的话，
   *    首屏那几个请求会在登录完成前发出去，白白吃一次 401 和一次刷新等待。
   *
   * 之所以敢「打开即登录」，是因为小程序的 wx.login 完全静默——
   * 不弹授权框、不需要用户点击。用户从打开到进入首页，
   * 全程不会知道背后完成了一次登录，更不会看到一个多余的登录页。
   *
   * 失败也无所谓：这里不接错误处理，等用户真正需要登录态时再兜底。
   */
  silentLogin()
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
