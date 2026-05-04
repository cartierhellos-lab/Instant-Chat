# DuoPlus Proxy Edge Function

该函数作为前端访问 DuoPlus 的安全代理，避免在浏览器暴露真实控制密钥。

需要配置的环境变量：

```env
DUOPLUS_API_KEY=
DUOPLUS_GLOBAL_API_KEY=
DUOPLUS_CN_API_KEY=
DUOPLUS_GLOBAL_BASE_URL=https://openapi.duoplus.net
DUOPLUS_CN_BASE_URL=https://openapi.duoplus.cn
```

说明：
- `DUOPLUS_GLOBAL_API_KEY` 用于主域名 `openapi.duoplus.net`
- `DUOPLUS_CN_API_KEY` 用于备用区域
- 如果两个区域共用同一密钥，可只配置 `DUOPLUS_API_KEY`
