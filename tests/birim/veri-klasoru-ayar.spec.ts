// VERİ KLASÖRÜ AYAR DOSYASI (geliştirme başlatıcısı): "npm run baslat" de paketli başlatıcılarla aynı kasa dışı ayar dosyasını kullanır;
// böylece açılış ekranındaki "Değiştir…" geliştirme kurulumunda da açılır. Yalnızca saf yol kuralları (dosya sistemine dokunmaz).
import { expect, test } from '@playwright/test';
import { varsayilanAyarDosyasi } from '../../scripts/platform/ayarlar/klasor-secimi.mjs';

test('varsayılan ayar dosyası: macOS Application Support, Linux ~/.config; ana klasör yoksa null', () => {
  expect(varsayilanAyarDosyasi({ HOME: '/Users/deneme' }, 'darwin')).toBe('/Users/deneme/Library/Application Support/Nöbetçi/ayar.json');
  expect(varsayilanAyarDosyasi({ HOME: '/home/deneme' }, 'linux')).toBe('/home/deneme/.config/Nöbetçi/ayar.json');
  expect(varsayilanAyarDosyasi({ HOME: '/home/deneme', XDG_CONFIG_HOME: '/etc/xdg' }, 'linux')).toBe('/etc/xdg/Nöbetçi/ayar.json');
  expect(varsayilanAyarDosyasi({}, 'linux')).toBeNull();
});
