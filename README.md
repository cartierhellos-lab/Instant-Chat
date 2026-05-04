# 技术栈

该项目使用以下技术栈
- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS


# 开发流程

1. 参考用户需求，调整 src/index.css 与 tailwind.config.ts 的主题风格
2. 根据用户需求，划分出所需要实现的页面
3. 整理好每个页面需要实现的功能，在 pages 下创建对应的文件夹及其下入口 Index.tsx
4. 在 App.tsx 中创建路由配置，引入刚才的各个入口文件 Index.tsx
5. 根据刚才整理的需求，如果需求简单，可以直接在 Index.tsx 中完成该页面的全部工作
6. 如果需求复杂，可以将 page 拆分为若干个组件来实现，目录结构如下：
    - Index.tsx 入口
    - /components/ 组件
    - /hooks/ 钩子
    - /stores/ 如果有复杂交互通信时，可以使用 zustand 进行通信
7. 在完成需求后，需要进行 pnpm i 安装依赖，并使用 npm run lint & npx tsc --noEmit -p tsconfig.app.json --strict 进行检查，并修复问题

# DuoPlus 前端配置

项目支持通过 Vite 环境变量预置公开前端连接信息：

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=你的 Supabase Anon Key
VITE_DUOPLUS_API_REGION=global
VITE_DUOPLUS_POLL_INTERVAL=5
```

- DuoPlus 控制密钥应配置在 Supabase Edge Function 环境变量中，不应进入前端构建产物
- `VITE_DUOPLUS_API_REGION=global` 默认走主域名 `https://openapi.duoplus.net`
- `cn` 作为备用区域，界面中显示为 `hkd.llc`

# 接入后端接口
- 当需要新增接口或者操作 supabase 时，需要先在 src/api 新增对应 api 文件，并导出对应的数据类型，可以参考 src/demo.ts 文件，如果是 supabase 还需要做好实现
- 前端与 supabase 做实现时，都需要完全按照数据类型进行实现，尽可能避免修改定好的数据类型，如果出现修改，需要检查所有引用该类型的文件
