import { openSync, writeFileSync, fsyncSync, closeSync, renameSync, unlinkSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

// Replace a private snapshot only after its complete contents reach disk.
export function savePrivateJSON(path, value) {
  const temporary = `${path}.${randomUUID()}.tmp`; let fd;
  try {
    fd = openSync(temporary, 'wx', 0o600);
    writeFileSync(fd, JSON.stringify(value) + '\n');
    fsyncSync(fd); closeSync(fd); fd = undefined;
    renameSync(temporary, path);
  } catch (error) {
    if (fd !== undefined) closeSync(fd);
    try { unlinkSync(temporary); } catch {}
    throw error;
  }
}
