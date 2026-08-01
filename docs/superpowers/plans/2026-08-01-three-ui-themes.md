# Omnitunes 三主题切换 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为生产 Omnitunes 界面提供 Apple、Emil 和 Fusion 三个可访问、即时切换并跨刷新持久化的主题。

**Architecture:** 以一个持久化 Zustand store 作为主题选择的唯一数据源，`AppShell` 将当前 ID 映射到根节点的 `data-theme` 属性。所有语义色彩、材质、动效和圆角变量集中在受属性选择器隔离的 CSS 中，现有生产组件继续使用其 Tailwind 语义 class 和 `apple-*` 工具类，无需触碰业务页面或播放状态。

**Tech Stack:** React 18、TypeScript、Zustand 5、Tailwind CSS 3、Vite 5、Vitest 3。

## Global Constraints

- 只改生产界面的主题令牌与选择体验；搜索、队列、播放、路由和 WebSocket 行为不变。
- 允许的 theme ID 只能是 `apple`、`emil`、`fusion`；默认值为 `apple`，无效 localStorage 值也回退至它。
- Apple 必须是亮色玫瑰玻璃，Emil 必须是石墨黑/荧光青柠实体表面，Fusion 必须是深蓝蓝紫极光玻璃。
- 不增加运行时依赖；尊重现有 reduced-motion、reduced-transparency 和高对比度降级。
- 原型预览路由仍可使用自身样式，但不能再用全局 CSS 令牌污染生产应用。

---

## File Structure

- Create: `web/src/stores/theme.ts` — 主题 ID 校验、默认值及持久化 Zustand store。
- Create: `web/src/stores/theme.test.ts` — 纯主题 ID 校验的单元测试。
- Create: `web/src/components/ThemeSelector.tsx` — 桌面分段按钮和移动端 select 的受控主题控件。
- Create: `web/src/components/ThemeSelector.test.tsx` — 控件的键盘、选择状态和 store 集成测试。
- Modify: `web/src/components/AppShell.tsx` — 根 `data-theme` 作用域与顶部栏选择器插槽。
- Modify: `web/src/index.css` — 共享基础令牌、三个作用域主题令牌、通用 surface/press/glass 工具和可访问性降级。
- Modify: `web/src/main.tsx` — 将原型 CSS 导入移入对应预览组件或用受作用域的主题层替代，消除全局令牌冲突。
- Modify: `web/package.json`、`vitest.config.ts`、`web/vitest.config.ts`（仅在现有 Vitest 配置无法执行 React DOM 测试时）— 为前端单元测试提供 `happy-dom` 环境和明确脚本，不添加新的运行时依赖。
- Modify: `.gitignore` — 忽略本次视觉陪伴会话创建的 `.superpowers/` 文件。

### Task 1: 主题状态的约束与持久化

**Files:**
- Create: `web/src/stores/theme.ts`
- Create: `web/src/stores/theme.test.ts`
- Modify: `web/package.json`
- Modify: `web/vitest.config.ts`

**Interfaces:**
- Produces: `ThemeId`, `THEMES`, `DEFAULT_THEME`, `isThemeId(value: unknown): value is ThemeId` 和 `useThemeStore`。
- `useThemeStore` state: `{ theme: ThemeId; setTheme(theme: ThemeId): void }`。
- Persisted storage key: `omnitunes-theme`。

- [ ] **Step 1: 配置前端 Vitest 环境和测试脚本**

在 `web/package.json` 添加：

```json
"test": "vitest run"
```

创建 `web/vitest.config.ts`：

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: { environment: 'happy-dom', include: ['src/**/*.test.{ts,tsx}'] },
});
```

确认 `happy-dom` 已由当前 lockfile 的开发依赖解析；若 `pnpm --filter omnitunes-web test` 报模块缺失，只把 `happy-dom` 加入 `web` 的 `devDependencies`。

- [ ] **Step 2: 编写失败的主题 store 测试**

在 `web/src/stores/theme.test.ts` 写入：

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_THEME, isThemeId, useThemeStore } from './theme';

describe('theme store', () => {
  beforeEach(() => {
    localStorage.clear();
    useThemeStore.setState({ theme: DEFAULT_THEME });
  });

  it('recognizes only the three supported theme IDs', () => {
    expect(isThemeId('apple')).toBe(true);
    expect(isThemeId('emil')).toBe(true);
    expect(isThemeId('fusion')).toBe(true);
    expect(isThemeId('dark')).toBe(false);
    expect(isThemeId(null)).toBe(false);
  });

  it('changes and persists the selected theme', () => {
    useThemeStore.getState().setTheme('emil');
    expect(useThemeStore.getState().theme).toBe('emil');
    expect(JSON.parse(localStorage.getItem('omnitunes-theme') ?? '{}')).toMatchObject({ state: { theme: 'emil' } });
  });
});
```

- [ ] **Step 3: 运行测试并确认失败**

运行：`pnpm --filter omnitunes-web test -- theme.test.ts`

预期：FAIL，提示无法解析 `./theme`。

- [ ] **Step 4: 实现最小主题 store**

在 `web/src/stores/theme.ts` 实现：

```ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const THEMES = ['apple', 'emil', 'fusion'] as const;
export type ThemeId = (typeof THEMES)[number];
export const DEFAULT_THEME: ThemeId = 'apple';
export const isThemeId = (value: unknown): value is ThemeId =>
  typeof value === 'string' && (THEMES as readonly string[]).includes(value);

interface ThemeState {
  theme: ThemeId;
  setTheme: (theme: ThemeId) => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({ theme: DEFAULT_THEME, setTheme: (theme) => set({ theme }) }),
    { name: 'omnitunes-theme' },
  ),
);
```

在 `persist` 的 `merge` 中校验恢复值：仅当 `persistedState.theme` 通过 `isThemeId` 时覆盖默认值，其他值保留 `DEFAULT_THEME`。

- [ ] **Step 5: 运行 store 测试并确认通过**

运行：`pnpm --filter omnitunes-web test -- theme.test.ts`

预期：PASS，两个断言组成功。

- [ ] **Step 6: 提交状态层改动**

```bash
git add web/package.json web/vitest.config.ts web/src/stores/theme.ts web/src/stores/theme.test.ts pnpm-lock.yaml
git commit -m "feat(ui): persist selected theme"
```

### Task 2: 主题选择器的可访问交互

**Files:**
- Create: `web/src/components/ThemeSelector.tsx`
- Create: `web/src/components/ThemeSelector.test.tsx`

**Interfaces:**
- Consumes: `ThemeId`, `THEMES` 与 `useThemeStore` from `@/stores/theme`。
- Produces: `<ThemeSelector />`，无 props，直接读取和更新持久化 store。
- Desktop buttons use `type="button"` and `aria-pressed`; mobile select uses `aria-label="界面主题"`.

- [ ] **Step 1: 编写失败的控件测试**

在 `web/src/components/ThemeSelector.test.tsx` 写入：

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { ThemeSelector } from './ThemeSelector';
import { useThemeStore } from '@/stores/theme';

describe('ThemeSelector', () => {
  beforeEach(() => useThemeStore.setState({ theme: 'apple' }));

  it('marks the active desktop theme and updates the store', () => {
    render(<ThemeSelector />);
    const emil = screen.getByRole('button', { name: /emil/i });
    expect(emil).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(emil);
    expect(useThemeStore.getState().theme).toBe('emil');
    expect(emil).toHaveAttribute('aria-pressed', 'true');
  });

  it('offers all three themes through the mobile select', () => {
    render(<ThemeSelector />);
    const select = screen.getByRole('combobox', { name: '界面主题' });
    fireEvent.change(select, { target: { value: 'fusion' } });
    expect(useThemeStore.getState().theme).toBe('fusion');
  });
});
```

Add `@testing-library/react` and `@testing-library/jest-dom` only as `web` dev dependencies if no compatible test utilities are already installed. Configure `setupFiles` to import `@testing-library/jest-dom/vitest` if using `toHaveAttribute` type extensions.

- [ ] **Step 2: 运行测试并确认失败**

运行：`pnpm --filter omnitunes-web test -- ThemeSelector.test.tsx`

预期：FAIL，提示无法解析 `./ThemeSelector`。

- [ ] **Step 3: 实现选择器**

创建 `ThemeSelector.tsx`，用该元数据驱动三项 UI：

```ts
const THEME_OPTIONS: Array<{ id: ThemeId; label: string; swatch: string }> = [
  { id: 'apple', label: 'Apple', swatch: 'bg-rose-400' },
  { id: 'emil', label: 'Emil', swatch: 'bg-lime-300' },
  { id: 'fusion', label: 'Fusion', swatch: 'bg-indigo-400' },
];
```

桌面版使用 `hidden md:flex` 的 `<div role="group" aria-label="界面主题">`，每个按钮显示色点和标签；移动版使用 `md:hidden` 的 `<select>`。按钮当前项使用 primary 样式和 `aria-pressed={theme === id}`，每个 click 调用 `setTheme(id)`；select 的 `onChange` 仅传入通过 `isThemeId` 校验的值。

- [ ] **Step 4: 运行控件测试并确认通过**

运行：`pnpm --filter omnitunes-web test -- ThemeSelector.test.tsx`

预期：PASS，按钮和 select 各自更新同一 store。

- [ ] **Step 5: 提交选择器改动**

```bash
git add web/src/components/ThemeSelector.tsx web/src/components/ThemeSelector.test.tsx web/package.json pnpm-lock.yaml
git commit -m "feat(ui): add accessible theme selector"
```

### Task 3: 将主题作用域接入生产壳层

**Files:**
- Modify: `web/src/components/AppShell.tsx`

**Interfaces:**
- Consumes: `useThemeStore` from `@/stores/theme` and `<ThemeSelector />` from `@/components/ThemeSelector`.
- Produces: 根 production `<div data-theme={theme}>`；所有 `<Outlet />`、`<PlayerBar />`、`<AudioPlayer />` 与 `<EmbedPlayer />` 保持在该节点内。

- [ ] **Step 1: 编写失败的 AppShell 集成测试**

在 `web/src/components/AppShell.test.tsx` 使用 `MemoryRouter`、`Routes`、`Route` 渲染 AppShell，并 mock `wsClient.start` 与 `useQueueStore.getState().refresh`。断言：

```tsx
expect(screen.getByTestId('app-shell')).toHaveAttribute('data-theme', 'fusion');
expect(screen.getByRole('button', { name: /emil/i })).toBeInTheDocument();
```

在渲染前调用 `useThemeStore.setState({ theme: 'fusion' })`。

- [ ] **Step 2: 运行测试并确认失败**

运行：`pnpm --filter omnitunes-web test -- AppShell.test.tsx`

预期：FAIL，根节点尚无 `data-theme` 或 selector。

- [ ] **Step 3: 接入主题根与布局**

在 `AppShell.tsx`：

```tsx
const theme = useThemeStore((state) => state.theme);

return (
  <div data-testid="app-shell" data-theme={theme} className="flex min-h-screen flex-col bg-background text-foreground">
```

将 `<ThemeSelector />` 放在现有 header glass 容器中、`<nav>` 后方，使用 `ml-auto shrink-0`，并在小屏让选择器的 select 保持可见。不要改变 NAV 数组、WebSocket effect、播放器或 Outlet 的层级。

- [ ] **Step 4: 运行集成测试并确认通过**

运行：`pnpm --filter omnitunes-web test -- AppShell.test.tsx`

预期：PASS，根作用域和控件均存在。

- [ ] **Step 5: 提交壳层接入改动**

```bash
git add web/src/components/AppShell.tsx web/src/components/AppShell.test.tsx
git commit -m "feat(ui): scope application theme in shell"
```

### Task 4: 收敛 CSS 令牌并隔离原型样式

**Files:**
- Modify: `web/src/index.css`
- Modify: `web/src/main.tsx`
- Modify: `web/src/prototypes/apple/AppleSearchPage.tsx`
- Modify: `web/src/prototypes/emil/EmilSearchPage.tsx`
- Modify: `web/src/prototypes/fusion/FusionSearchPage.tsx`

**Interfaces:**
- Consumes: `<div data-theme={ThemeId}>` supplied by AppShell.
- Produces: complete theme values under `[data-theme='apple']`, `[data-theme='emil']`, `[data-theme='fusion']`; production-safe shared classes `apple-glass-strong`, `apple-btn`, `apple-card`, `apple-press`, and `apple-progress-*`.

- [ ] **Step 1: 保持主题行为测试为绿并进行视觉令牌验收**

CSS custom properties 的用户可见结果是渲染后的色彩和材质，而不是源文件中的文字。先运行主题 store、选择器和 AppShell 的现有测试；随后用本地 Vite 预览在 Apple、Emil、Fusion 三种选择下检查计算后的 `data-theme`、背景色、前景色和实际截图。不要以 grep CSS 文本替代行为验证。

- [ ] **Step 2: 实现三套完整令牌和共享工具类**

重写 `index.css` 的 token 区为 `[data-theme='apple']`、`[data-theme='emil']`、`[data-theme='fusion']`。每个选择器显式给出所有 Tailwind 语义变量和 `--radius`，另提供：

```css
[data-theme='apple'] { --primary: 346 85% 55%; --radius: 1rem; }
[data-theme='emil'] { --background: 120 5% 7%; --primary: 76 100% 63%; --radius: 0.625rem; }
[data-theme='fusion'] { --background: 228 42% 11%; --primary: 196 100% 74%; --radius: 0.875rem; }
```

将 `apple-glass*`、`apple-btn`、`apple-card`、`apple-press` 和进度条类改为只使用每套主题都定义的 `--surface-glass`、`--surface-border`、`--surface-shadow-*`、`--motion-*` 变量，使 Production AppShell 在三个主题下均完整渲染。Emil 的这些变量应指向不透明 card/token，Fusion 指向深蓝玻璃值。保留 reduced-motion、reduced-transparency、high-contrast 查询，并将其中 glass fallback 指向 `hsl(var(--card))`。

从 `main.tsx` 删除三份原型 CSS 的顶层 import。将对应 CSS import 移到各自的三组原型组件入口，使 `/prototypes/apple*`、`/prototypes/emil*` 与 `/prototypes/fusion*` 保持预览样式，生产路由不再受它们的 `:root` 影响。

- [ ] **Step 3: 运行主题行为测试与前端类型检查**

运行：

```bash
pnpm --filter omnitunes-web test
pnpm typecheck:web
```

预期：主题行为测试 PASS，TypeScript 无错误。

- [ ] **Step 4: 提交 CSS 和原型隔离改动**

```bash
git add web/src/index.css web/src/main.tsx web/src/prototypes/emil/emil-theme.css web/src/prototypes/fusion/fusion-theme.css
git commit -m "feat(ui): add scoped visual theme tokens"
```

### Task 5: 端到端构建和视觉验收

**Files:**
- Modify: `.gitignore`

**Interfaces:**
- Consumes: complete theme store, selector, AppShell scope and CSS tokens.
- Produces: ignored `.superpowers/` visual-companion artifacts and verified production build.

- [ ] **Step 1: 忽略视觉陪伴临时文件**

在 `.gitignore` 末尾添加：

```gitignore
# local visual brainstorming artifacts
.superpowers/
```

- [ ] **Step 2: 运行全部前端自动验证**

运行：

```bash
pnpm --filter omnitunes-web test
pnpm typecheck:web
pnpm build:web
```

预期：测试、类型检查和 Vite 生产构建均以退出码 0 完成。

- [ ] **Step 3: 执行手工视觉验收**

运行 `pnpm dev:web` 后，在浏览器按下列顺序检查：

1. 打开 `/`，分别选择 Apple、Emil、Fusion，检查顶栏、结果卡片、按钮、文字、播放器和输入框的色彩、圆角与材质。
2. 刷新 `/`，确认最后选择的主题保留。
3. 访问 `/queue`、`/playlists`、`/collections`、`/history`、`/sources`，确认主题未回退且控件没有压缩导航。
4. 在窄屏视口确认 select 可访问且 header 不横向溢出；在键盘下用 Tab/Enter 和 select 切换主题。
5. 启用 `prefers-reduced-motion`、`prefers-reduced-transparency` 和 `prefers-contrast: more`，确认主题仍可读、玻璃降为 card 且无缩放动画。
6. 打开 `/prototypes/apple`、`/prototypes/emil`、`/prototypes/fusion`，确认各自保留原有预览样式，且切换生产主题不会改变原型路由。

- [ ] **Step 4: 提交忽略规则和验证相关变更**

```bash
git add .gitignore
git commit -m "chore: ignore visual brainstorming artifacts"
```

## Self-review

- Spec coverage: Task 1 enforces the valid IDs, default and persistence; Task 2 covers accessible desktop/mobile selection; Task 3 scopes every production descendant; Task 4 realizes the three confirmed visual directions and removes prototype token leakage; Task 5 checks persistence, routes, responsive layout, accessibility and builds.
- Placeholder scan: no deferred implementation markers or unspecified interfaces remain; each action includes an explicit command, code contract, or visual checkpoint.
- Type consistency: all tasks use `ThemeId`, `useThemeStore.theme`, `setTheme`, `data-theme`, `apple|emil|fusion` and `omnitunes-theme` consistently.
