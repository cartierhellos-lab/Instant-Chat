/**
 * Vite + Electron 构建配置
 * 职责：
 *   - 前端（React）打包到 dist/renderer/
 *   - Electron 主进程 / preload 用 esbuild 单独编译到 dist/electron/
 *   - 开发模式：Vite DevServer (5173) + Electron 热重载
 *   - 生产模式：electron-builder 打包为可分发安装包
 */

import { defineConfig, UserConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';
import * as path from 'path';
import * as fs from 'fs';
import { builtinModules } from 'module';

// ─── 环境判断 ─────────────────────────────────────────────────────────────────

const IS_ELECTRON_BUILD = process.env.ELECTRON_BUILD === '1';
const IS_DEV = process.env.NODE_ENV !== 'production';

// ─── 共享外部模块（electron 主进程/preload 中不打包的 Node 内置模块）──────
const ELECTRON_EXTERNALS = [
  'electron',
  'electron-updater',
  'electron-log',
  ...builtinModules,
  ...builtinModules.map((m) => `node:${m}`),
];

// ─── 渲染进程（React SPA）配置 ───────────────────────────────────────────────

const rendererConfig: UserConfig = {
  root: path.resolve(__dirname, 'src'),
  base: IS_DEV ? '/' : './', // 生产环境使用相对路径（file:// 协议）

  plugins: [
    react({
      // 开发模式使用 React Fast Refresh
      fastRefresh: true,
    }),
    tsconfigPaths(),
  ],

  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@components': path.resolve(__dirname, 'src/components'),
      '@stores': path.resolve(__dirname, 'src/stores'),
      '@hooks': path.resolve(__dirname, 'src/hooks'),
      '@types': path.resolve(__dirname, 'src/types'),
      '@utils': path.resolve(__dirname, 'src/utils'),
    },
  },

  build: {
    outDir: path.resolve(__dirname, 'dist/renderer'),
    emptyOutDir: true,
    // 生产构建：代码分割 + tree-shaking
    rollupOptions: {
      input: path.resolve(__dirname, 'src/index.html'),
      output: {
        // 按功能分包，优化首屏加载
        manualChunks: {
          react: ['react', 'react-dom'],
          zustand: ['zustand'],
          supabase: ['@supabase/supabase-js'],
          router: ['react-router-dom'],
        },
      },
    },
    // 生产构建关闭 sourcemap（安全）
    sourcemap: IS_DEV ? 'inline' : false,
    // chunk 大小警告阈值
    chunkSizeWarningLimit: 1000,
  },

  server: {
    port: 5173,
    strictPort: true,
    // 允许 Electron 的 file:// 请求
    cors: true,
    // API 代理（如有后端）
    proxy: {
      '/api': {
        target: process.env.VITE_API_URL || 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },

  // 环境变量注入
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version || '0.0.0'),
    __IS_ELECTRON__: JSON.stringify(true),
  },
};

// ─── Electron 主进程构建配置 ─────────────────────────────────────────────────

/**
 * 使用 Vite 的 library 模式编译 Electron 主进程和 preload
 * 输出格式：CommonJS（Electron 需要）
 */
const electronMainConfig: UserConfig = {
  root: path.resolve(__dirname, 'electron'),
  plugins: [],

  build: {
    outDir: path.resolve(__dirname, 'dist/electron'),
    emptyOutDir: false,
    // 使用 lib 模式输出单文件
    lib: {
      entry: {
        main: path.resolve(__dirname, 'electron/main.ts'),
        preload: path.resolve(__dirname, 'electron/preload.ts'),
      },
      formats: ['cjs'],
    },
    rollupOptions: {
      // 所有 Node/Electron 模块视为外部
      external: ELECTRON_EXTERNALS,
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: '[name]-[hash].js',
        // 主进程使用 CommonJS
        format: 'cjs',
      },
    },
    // 主进程允许 sourcemap（便于调试崩溃日志）
    sourcemap: true,
    // 不压缩（可读性 + 崩溃栈追踪）
    minify: false,
    // 指定目标平台为 Node（Electron 使用）
    target: 'node18',
  },

  resolve: {
    alias: {
      '@electron': path.resolve(__dirname, 'electron'),
    },
  },
};

// ─── Vite 插件：Electron 开发热重载 ──────────────────────────────────────────

/**
 * 开发模式下：
 * 1. 前端改动 → Vite HMR 自动更新（无需重启 Electron）
 * 2. electron/ 目录改动 → 重新编译主进程 → 重启 Electron
 */
function electronDevPlugin() {
  return {
    name: 'vite-plugin-electron-dev',
    configureServer(server: any) {
      server.httpServer?.on('listening', () => {
        // 监听 electron/ 目录变化
        const { spawn } = require('child_process');
        let electronProcess: any = null;

        const startElectron = () => {
          if (electronProcess) {
            electronProcess.kill();
          }
          // 先编译主进程
          const build = spawn(
            'npx',
            ['tsc', '-p', 'electron/tsconfig.json', '--outDir', 'dist/electron', '--module', 'commonjs'],
            { stdio: 'inherit', shell: true },
          );
          build.on('close', () => {
            electronProcess = spawn('npx', ['electron', '.'], {
              stdio: 'inherit',
              env: { ...process.env, NODE_ENV: 'development' },
              shell: true,
            });
          });
        };

        // 首次启动
        startElectron();

        // 监听 electron/ 目录文件变更
        const chokidar = require('chokidar');
        chokidar
          .watch(path.resolve(__dirname, 'electron'), {
            ignoreInitial: true,
            ignored: /dist/,
          })
          .on('change', (filePath: string) => {
            console.log(`[electron-dev] File changed: ${filePath}, restarting...`);
            startElectron();
          });
      });
    },
  };
}

// ─── electron-builder 配置 ────────────────────────────────────────────────────
// 通过 electron-builder.yml 或 package.json > build 字段配置
// 以下为等效 JS 配置，可在 package.json 中引用

export const electronBuilderConfig = {
  appId: 'com.instant-chat.app',
  productName: 'Instant-Chat',
  copyright: 'Copyright © 2024 Instant-Chat',

  // 需要打包的文件
  files: [
    'dist/**/*',
    'node_modules/**/*',
    '!node_modules/.cache',
    '!**/*.map', // 排除 sourcemap（可选）
  ],

  // 额外资源文件（托盘图标等）
  extraResources: [
    {
      from: 'public/tray-icon.png',
      to: 'tray-icon.png',
    },
  ],

  directories: {
    output: 'release',
    buildResources: 'build',
  },

  // macOS
  mac: {
    target: [
      { target: 'dmg', arch: ['x64', 'arm64'] },
      { target: 'zip', arch: ['x64', 'arm64'] },
    ],
    icon: 'build/icon.icns',
    hardenedRuntime: true,
    gatekeeperAssess: false,
    entitlements: 'build/entitlements.mac.plist',
    entitlementsInherit: 'build/entitlements.mac.plist',
    category: 'public.app-category.business',
  },

  // Windows
  win: {
    target: [
      { target: 'nsis', arch: ['x64'] },
      { target: 'portable', arch: ['x64'] },
    ],
    icon: 'build/icon.ico',
    publisherName: 'Instant-Chat',
    verifyUpdateCodeSignature: false,
  },

  // Linux
  linux: {
    target: [
      { target: 'AppImage', arch: ['x64'] },
      { target: 'deb', arch: ['x64'] },
    ],
    icon: 'build/icon.png',
    category: 'Network',
  },

  // NSIS 安装器（Windows）
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    installerIcon: 'build/icon.ico',
    uninstallerIcon: 'build/icon.ico',
  },

  // 自动更新发布配置（GitHub Releases）
  publish: [
    {
      provider: 'github',
      owner: 'cartierhellos-lab',
      repo: 'Instant-Chat',
      releaseType: 'release',
    },
  ],
};

// ─── 默认导出（根据构建目标选择配置）────────────────────────────────────────

export default defineConfig((env) => {
  // ELECTRON_TARGET=main 时只编译主进程（CI/CD 分步构建用）
  if (process.env.ELECTRON_TARGET === 'main') {
    return electronMainConfig;
  }

  // 默认：编译渲染进程（React SPA）
  const config = { ...rendererConfig };

  // 开发模式额外加入 Electron 热重载插件
  if (env.mode === 'development' && IS_ELECTRON_BUILD) {
    config.plugins = [...(config.plugins || []), electronDevPlugin()];
  }

  return config;
});
