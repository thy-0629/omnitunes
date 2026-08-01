# Omnitunes 三主题切换设计

## 目标

为生产界面提供三个可立即切换、跨刷新持久化的视觉主题：

1. **Apple · 流光玫瑰**：明亮暖白画布、浅玫瑰强调色、磨砂玻璃导航和播放器，以及更圆润的组件外形。
2. **Emil · 石墨青柠**：石墨黑界面、荧光青柠强调色、低噪声实体卡片与紧凑小圆角，面向夜间专注使用。
3. **Fusion · 极光夜航**：深蓝宇宙底色、蓝紫极光强调色、半透明导航/播放器与轻盈信息卡片，面向沉浸式聆听。

范围仅覆盖当前生产应用的视觉令牌和主题选择，不替换现有页面逻辑、路由、播放状态或原型预览路由。

## 架构

新增一个 `theme` Zustand store，主题 ID 固定为 `apple`、`emil`、`fusion`。store 使用 localStorage 持久化，默认 `apple`；页面首次加载便读取持久化选择，避免刷新后回退。

`AppShell` 订阅 store，并在最外层生产应用容器上设置 `data-theme` 属性。所有页面、浮层播放器和共享组件都在该容器内，因此可继承同一组 CSS custom properties；不需要修改各业务页面。

全局样式将收敛到同一个、按 `[data-theme]` 作用域隔离的主题令牌层。每个主题必须完整定义现有 Tailwind/shadcn 语义令牌：background、foreground、card、popover、primary、secondary、muted、accent、destructive、border、input、ring 和 radius，以及现有 Apple/Fusion 动效与材质工具类所需的变量。这样标准 utility class 与现有 `apple-*` 类都能随选择一起变化。

当前三个原型 CSS 被全局导入，且其中 Emil/Fusion 使用全局 `:root` / `.dark` 令牌，导致最后导入的 Fusion 覆盖默认样式。生产入口将停止全局导入这些原型主题 CSS；原型页面各自显式加载其所需样式，保持预览页面功能不变。

## 交互与响应式布局

主题选择器置于 `AppShell` 顶部导航的右侧，桌面端显示三个带色彩预览的紧凑按钮；窄屏端折叠为一个带可访问名称的 `<select>` 控件，以避免挤压主要导航。

选择主题时：

- 立即更新 `data-theme` 并刷新全部颜色、表面、圆角和材质。
- 写入 localStorage，在刷新、切换路由和重新打开应用后保留。
- 使用 `aria-pressed` 或原生 select 状态表达当前选择，保持键盘可操作和可读性。
- 不自动切换明暗模式；三个主题都是独立且固定的视觉方向，避免主题 ID 与系统配色产生歧义。

CSS 中沿用现有 `prefers-reduced-motion`、`prefers-reduced-transparency` 与 `prefers-contrast` 降级规则。主题切换本身以短暂颜色过渡为限；当用户请求减少动效时，不产生缩放或进入动画。

## 文件边界

- `web/src/stores/theme.ts`：主题类型、默认值、持久化状态与选择 action。
- `web/src/components/ThemeSelector.tsx`：无业务依赖的选择控件与可访问状态。
- `web/src/components/AppShell.tsx`：应用根作用域和选择器布局。
- `web/src/index.css`（或其唯一导入的主题样式文件）：三个完整主题令牌、共享材质/动效工具类和无障碍降级样式。
- `web/src/main.tsx`：移除原型 CSS 的全局副作用；若需要，保留单一主题样式入口。
- 各原型入口：仅在其对应预览路由保留对 Apple、Emil 或 Fusion 样式的引用。

## 错误处理

localStorage 无记录、无法读取或持久化值不是允许的 theme ID 时，一律回退至 Apple。主题选择不依赖网络或服务端请求，因此不能阻塞搜索、队列、播放或 WebSocket 生命周期。

## 验收与验证

1. 在 `/`、`/queue`、`/playlists`、`/collections`、`/history`、`/sources` 中选择任一主题，顶栏、卡片、按钮、文字、播放器和表单均使用相匹配的令牌。
2. 三个主题在色彩、表面材质和圆角上有明确可感知的区别：Apple 为亮色玫瑰玻璃，Emil 为石墨青柠实体表面，Fusion 为深蓝极光玻璃。
3. 选择主题后刷新页面，主题不变；切换路由与播放器展开状态不重置主题。
4. 键盘可聚焦并操作主题控件；窄屏下导航不溢出。
5. 执行 Web TypeScript 检查和生产构建，均无错误。
