/** 下载：桌面 Chromium 用 showSaveFilePicker，iOS Safari 一律 <a download> */
export async function downloadFile(name: string, content: string, mime: string): Promise<void> {
  await downloadBlob(name, new Blob([content], { type: mime }));
}

/** Blob 下载（年报分享卡片等二进制产物）；桌面走文件选择器，iOS 仍走 <a download> */
export async function downloadBlob(name: string, blob: Blob): Promise<void> {
  const w = window as Window & {
    showSaveFilePicker?: (opts: unknown) => Promise<{ createWritable: () => Promise<{ write: (b: Blob) => Promise<void>; close: () => Promise<void> }> }>;
  };
  if (typeof w.showSaveFilePicker === 'function') {
    try {
      const handle = await w.showSaveFilePicker({ suggestedName: name });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    } catch (e) {
      if ((e as DOMException)?.name === 'AbortError') return; // 用户取消
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
