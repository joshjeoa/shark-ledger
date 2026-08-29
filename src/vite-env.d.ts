/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  /** Supabase 项目地址（账号同步功能开关，未配置则功能整体隐藏） */
  readonly VITE_SUPABASE_URL?: string;
  /** Supabase anon key（公开密钥，安全边界在数据库 RLS） */
  readonly VITE_SUPABASE_ANON_KEY?: string;
}
