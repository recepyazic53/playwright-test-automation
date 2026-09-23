#!/usr/bin/env node
// Verilen dosyayı işletim sistemine göre varsayılan tarayıcıda/uygulamada açar.
// Windows'a özgü "start" komutunun yerini alır, macOS ve Linux'ta da çalışır.
// Ek bir npm paketine ihtiyaç duymaz (yalnızca Node'un kendi çocuk süreç API'si).
import { spawn } from 'node:child_process';

const hedefDosya = process.argv[2];

if (!hedefDosya) {
  console.error('Kullanım: node scripts/dosya-ac.mjs <dosya-yolu>');
  process.exit(1);
}

function acmaKomutunuOlustur(platform) {
  if (platform === 'win32') {
    // "start" bir cmd.exe iç komutudur; ilk boş "" argüman pencere başlığı için gereklidir.
    return { komut: 'cmd', argumanlar: ['/c', 'start', '', hedefDosya] };
  }
  if (platform === 'darwin') {
    return { komut: 'open', argumanlar: [hedefDosya] };
  }
  // Linux ve diğerleri
  return { komut: 'xdg-open', argumanlar: [hedefDosya] };
}

const { komut, argumanlar } = acmaKomutunuOlustur(process.platform);

const alt = spawn(komut, argumanlar, { stdio: 'ignore', detached: true, shell: false });
alt.on('error', (hata) => {
  console.error(`"${hedefDosya}" açılamadı: ${hata.message}`);
  process.exit(1);
});
alt.unref();
