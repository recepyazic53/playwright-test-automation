#!/usr/bin/env node
// "npm run baslat": yerel test sunucusunu (scripts/test-sunucu.mjs) başlatır, hazır olunca
// platform arayüzünü varsayılan tarayıcıda açar: http://127.0.0.1:<PORT>/
// - Sunucu bu portta zaten çalışıyorsa yenisi başlatılmaz; yalnızca tarayıcı açılır.
// - Port: TEST_SUNUCU_PORT (varsayılan 5566). Tarayıcıyı açmamak için BASLAT_TARAYICI_ACMA=1.
// - Tarayıcı açma scripts/dosya-ac.mjs ile yapılır (macOS: open, Windows: cmd /c start, Linux: xdg-open).
// Sunucunun çıktısı bu terminalde görünür; kapatmak için Ctrl+C.
import 'dotenv/config';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const klasor = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.TEST_SUNUCU_PORT) || 5566;
const ADRES = `http://127.0.0.1:${PORT}/`;

async function sunucuHazirMi() {
  try {
    const yanit = await fetch(`http://127.0.0.1:${PORT}/saglik`, { signal: AbortSignal.timeout(1000) });
    return yanit.ok;
  } catch {
    return false;
  }
}

function tarayiciyiAc() {
  if (process.env.BASLAT_TARAYICI_ACMA === '1') {
    console.log(`Platform arayüzü: ${ADRES}`);
    return;
  }
  const alt = spawn(process.execPath, [join(klasor, 'dosya-ac.mjs'), ADRES], { stdio: 'inherit', shell: false });
  alt.on('error', (hata) => console.error(`Tarayıcı açılamadı (${hata.message}); adresi elle açın: ${ADRES}`));
}

if (await sunucuHazirMi()) {
  console.log(`Sunucu ${PORT} portunda zaten çalışıyor; tarayıcı açılıyor.`);
  tarayiciyiAc();
} else {
  const sunucu = spawn(process.execPath, [join(klasor, 'test-sunucu.mjs')], { stdio: 'inherit', shell: false, env: process.env });
  sunucu.on('exit', (kod) => process.exit(kod ?? 0));
  const kapat = (/** @type {NodeJS.Signals} */ sinyal) => { if (!sunucu.killed) sunucu.kill(sinyal); };
  process.on('SIGINT', () => kapat('SIGINT'));
  process.on('SIGTERM', () => kapat('SIGTERM'));
  let hazir = false;
  for (let i = 0; i < 100 && !hazir; i++) {
    await new Promise((coz) => setTimeout(coz, 200));
    hazir = await sunucuHazirMi();
  }
  if (hazir) tarayiciyiAc();
  else console.error(`Sunucu 20 saniye içinde hazır olmadı; çıktıyı kontrol edin. Adres: ${ADRES}`);
}
