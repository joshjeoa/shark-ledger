/**
 * 凭证照片云同步（鲨鱼 Pro，方案见 docs/VIP功能方案.md Phase 2）。
 * - 上传：本地 IndexedDB 全量照片 → Supabase Storage `photos/<uid>/<photoId>`（列目录去重，幂等）；
 * - 下载：云端清单中「本地缺失且仍被某笔账单引用」的照片回落到本地；
 * - 路径不含账单 id（账单可删除/回收站恢复，归属以本地 bills.photoIds 为准）。
 * 必须已配置账号体系且已登录；由账号页手动触发或保险库同步成功后自动增量执行。
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { repo } from '../db/repo';
import { isAccountConfigured, getSharedSupabase } from '../sync/account';
import { isProNow } from './entitlement';
import { useSettings } from '../store/settings';

const BUCKET = 'photos';

export interface PhotoCloudStats {
  localCount: number;
  cloudCount: number;
  /** 云端有、本地缺失且仍被账单引用（可下载） */
  missingCount: number;
  /** 本地有、云端没有（可上传） */
  pendingCount: number;
}

export interface PhotoSyncResult {
  transferred: number;
  skipped: number;
  failed: number;
}

async function requireClient(): Promise<{ sb: SupabaseClient; uid: string }> {
  if (!isAccountConfigured()) throw new Error('未配置账号体系');
  const sb = await getSharedSupabase();
  const {
    data: { session },
  } = await sb.auth.getSession();
  if (!session) throw new Error('请先登录');
  return { sb, uid: session.user.id };
}

/** 云端当前用户的照片 id 清单（目录不存在/为空 → 空集合） */
async function listCloudIds(sb: SupabaseClient, uid: string): Promise<Set<string>> {
  const { data, error } = await sb.storage.from(BUCKET).list(uid, { limit: 10000, sortBy: { column: 'name', order: 'asc' } });
  if (error) {
    if (error.message.includes('not found') || error.message.includes('does not exist')) return new Set();
    throw new Error(`读取云端照片清单失败：${error.message}`);
  }
  return new Set((data ?? []).map((f) => f.name));
}

/** 统计本地/云端差异（账号页展示） */
export async function photoCloudStats(): Promise<PhotoCloudStats> {
  const { sb, uid } = await requireClient();
  const [photos, cloudIds] = await Promise.all([repo.allPhotos(), listCloudIds(sb, uid)]);
  const billRefs = new Set<string>();
  for (const b of repo.fullDump().data.bills) for (const pid of b.photoIds ?? []) billRefs.add(pid);
  let pendingCount = 0;
  let missingCount = 0;
  const localIds = new Set<string>();
  for (const p of photos) {
    localIds.add(p.id);
    if (!cloudIds.has(p.id)) pendingCount++;
  }
  for (const id of cloudIds) if (!localIds.has(id) && billRefs.has(id)) missingCount++;
  return { localCount: photos.length, cloudCount: cloudIds.size, missingCount, pendingCount };
}

/** 上传本地全部照片（幂等：云端已有的跳过） */
export async function uploadAllPhotos(onProgress?: (done: number, total: number) => void): Promise<PhotoSyncResult> {
  const { sb, uid } = await requireClient();
  const cloudIds = await listCloudIds(sb, uid);
  const photos = (await repo.allPhotos()).filter((p) => !cloudIds.has(p.id));
  let transferred = 0;
  let failed = 0;
  let done = 0;
  for (const p of photos) {
    try {
      const { error } = await sb.storage.from(BUCKET).upload(`${uid}/${p.id}`, p.blob, {
        contentType: p.blob.type || 'image/jpeg',
        upsert: false,
      });
      if (error) {
        // 并发/重复上传时目标已存在视为跳过成功
        if (error.message.includes('exists') || error.message.includes('duplicate')) transferred++;
        else failed++;
      } else {
        transferred++;
      }
    } catch {
      failed++;
    }
    onProgress?.(++done, photos.length);
  }
  return { transferred, skipped: photos.length - transferred - failed, failed };
}

/** 下载云端缺失照片（仅回落仍被本地账单引用的；孤儿文件忽略并在结果中计为 skipped） */
export async function downloadMissingPhotos(onProgress?: (done: number, total: number) => void): Promise<PhotoSyncResult> {
  const { sb, uid } = await requireClient();
  const cloudIds = await listCloudIds(sb, uid);
  const localPhotos = await repo.allPhotos();
  const localIds = new Set(localPhotos.map((p) => p.id));
  // 照片归属以本地账单引用为准
  const billOfPhoto = new Map<string, string>();
  for (const b of repo.fullDump().data.bills) for (const pid of b.photoIds ?? []) billOfPhoto.set(pid, b.id);
  const targets = Array.from(cloudIds).filter((id) => !localIds.has(id) && billOfPhoto.has(id));
  let transferred = 0;
  let failed = 0;
  let done = 0;
  for (const id of targets) {
    try {
      const { data, error } = await sb.storage.from(BUCKET).download(`${uid}/${id}`);
      if (error || !data) {
        failed++;
      } else if (await repo.importCloudPhoto(id, billOfPhoto.get(id) ?? '', data)) {
        transferred++;
      } else {
        failed++;
      }
    } catch {
      failed++;
    }
    onProgress?.(++done, targets.length);
  }
  return { transferred, skipped: targets.length - transferred - failed, failed };
}

// ---------- 自动同步（保险库同步成功后增量上传） ----------

let autoRunning = false;
let autoTimer: ReturnType<typeof setTimeout> | undefined;

/** 防抖 8s（避开保险库同步的网络高峰）：Pro 且开启自动同步时才执行 */
export function schedulePhotoCloudSync(): void {
  if (!isAccountConfigured() || !isProNow() || !useSettings.getState().photoCloudAuto) return;
  clearTimeout(autoTimer);
  autoTimer = setTimeout(() => void runAutoUpload(), 8000);
}

async function runAutoUpload(): Promise<void> {
  if (autoRunning) return;
  autoRunning = true;
  try {
    await uploadAllPhotos();
  } catch {
    /* 静默：手动同步时可见错误；自动通道失败不打扰 */
  } finally {
    autoRunning = false;
  }
}
