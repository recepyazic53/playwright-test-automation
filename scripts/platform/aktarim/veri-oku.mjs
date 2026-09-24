#!/usr/bin/env node
// TEST SÜREÇLERİ İÇİN VERİ OKUYUCU (genel) — tests/support/platform-veri.ts bunu ayrı bir süreçte
// (execFileSync) çalıştırır; çünkü spec dosyaları veriyi modül yüklenirken EŞZAMANLI ister, sql.js
// ise yalnızca eşzamansız başlatılabilir. Veritabanı SALT OKUNUR açılır (diske hiç yazılmaz);
// sonuç yalnızca stdout borusundan (bellekte) üst sürece döner, hiçbir dosyaya yazılmaz.
//
// Kullanım: node veri-oku.mjs <kip> --adaptor <ad> [--ortam <ortam>]
//   durum   → veritabanı/aktarım durumu + koşudan hariç senaryo anahtarları (kasa GEREKMEZ)
//   veri    → durum + adaptörün yenidenKur çıktısı (test verisi, ekran modelleri, taban adres, giriş)
//             (PLATFORM_KASA_ANAHTARI [base64url] ya da PLATFORM_KASA_PAROLASI gerekir)
//   anahtar → PLATFORM_KASA_PAROLASI'ndan anahtarı türetip doğrular, base64url olarak döner
// Çıktı her zaman tek satır JSON'dur; hata durumunda { hata, kod } (çıkış kodu 0). Gizli değerler
// yalnızca "veri"/"anahtar" kiplerinin stdout'unda bulunur; loglara ASLA yazılmaz.
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { veritabaniAc, veritabaniYolu } from '../veritabani/baglanti.mjs';
import { gocleriUygula } from '../veritabani/gocler.mjs';
import { KasaHatasi, kasaDurumu, kasayiAnahtarlaAc, parolayiDogrula } from '../kasa.mjs';
import { aktarilmisProjeyiBul } from './motor.mjs';
import { adaptorBul } from '../../../projeler/index.mjs';

const PROJE_KOKU = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/** @param {unknown} veri */
function yaz(veri) {
  process.stdout.write(`${JSON.stringify(veri)}\n`);
}

/** @param {string} ad */
function arguman(ad) {
  const i = process.argv.indexOf(`--${ad}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}

async function calistir() {
  const kip = process.argv[2];
  const adaptor = adaptorBul(arguman('adaptor') ?? '');
  if (!adaptor) return { hata: 'Bilinmeyen adaptör.', kod: 'ADAPTOR' };
  const yol = veritabaniYolu(PROJE_KOKU);
  if (!existsSync(yol)) return { durum: 'veritabani-yok' };
  const vt = await veritabaniAc(yol, { saltOkunur: true });
  try {
    gocleriUygula(vt); // yalnızca bellekte (salt okunur bağlantı diske yazmaz)
    const kasaVar = kasaDurumu(vt).olusturuldu;

    if (kip === 'anahtar') {
      if (!kasaVar) return { hata: 'Kasa henüz oluşturulmamış.', kod: 'KASA_YOK' };
      const anahtar = await parolayiDogrula(vt, process.env.PLATFORM_KASA_PAROLASI ?? '');
      if (!anahtar) return { hata: 'Kasa parolası yanlış.', kod: 'PAROLA_YANLIS' };
      return { anahtar: anahtar.toString('base64url') };
    }

    const proje = aktarilmisProjeyiBul(vt, adaptor.ad);
    if (!proje || !kasaVar) return { durum: 'aktarilmamis', kasaVar };
    const aktarim = /** @type {Record<string, unknown>} */ (proje.ayarlar.aktarim ?? {});
    const temel = {
      durum: 'aktarildi',
      kasaVar,
      projeId: proje.id,
      sonAktarim: aktarim.sonAktarim ?? null,
      haricTutulanlar: adaptor.kosudanHaricAnahtarlar(vt, proje.id)
    };
    if (kip === 'durum') return temel;
    if (kip !== 'veri') return { hata: 'Bilinmeyen kip.', kod: 'KIP' };

    const ortam = arguman('ortam');
    if (!ortam) return { hata: '--ortam gerekli.', kod: 'KIP' };
    let anahtar;
    if (process.env.PLATFORM_KASA_ANAHTARI) anahtar = Buffer.from(process.env.PLATFORM_KASA_ANAHTARI, 'base64url');
    else if (process.env.PLATFORM_KASA_PAROLASI) anahtar = await parolayiDogrula(vt, process.env.PLATFORM_KASA_PAROLASI);
    if (!anahtar) {
      return process.env.PLATFORM_KASA_PAROLASI
        ? { hata: 'PLATFORM_KASA_PAROLASI yanlış.', kod: 'PAROLA_YANLIS' }
        : { ...temel, anahtarYok: true };
    }
    kasayiAnahtarlaAc(vt, anahtar);
    anahtar.fill(0);
    return { ...temel, veri: adaptor.yenidenKur(vt, proje.id, ortam) };
  } finally {
    vt.kapat();
  }
}

calistir().then(yaz, (hata) => {
  const kod = hata instanceof KasaHatasi ? hata.kod : 'HATA';
  // Hata mesajları gizli değer içermez (kasa/depo mesajları bilinçli olarak genel).
  yaz({ hata: String(hata?.message ?? hata).split('\n')[0].slice(0, 300), kod });
});
