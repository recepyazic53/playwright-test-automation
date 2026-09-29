// KORUMA TESTLERİ — Terim sözlüğü: kullanıcıya görünen metinde her kavram tek adla geçer.
//   "Planlı koşu" (zamanlanmış değil) · "Test verisi" (menü / başlıkta tek başına "Veri" değil) · sonuç durumu "Başarısız"
//   (kaldı / kalan değil) · "CANLI" yalnız ortam türü (canlı görüntü rozeti "Canlı görüntü", tema "Parlak").
// Arayüz ve sunucu kaynaklarındaki dize değişmezleri (yorumlar hariç), rehber içerikleri, README ve docs denetlenir.
// Tema: eski "canli" anahtarı "parlak"a eşlenir (kayıtlı seçim kaybolmaz). Terimler sözlüğü ve tarama rehberi adımları.
import { expect, test } from '@playwright/test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { ESKI_STIL_ADLARI, STILLER, VARSAYILAN_STIL, stilAdiniCoz } from '../../scripts/platform/arayuz/tema-stilleri.mjs';
import { TERIMLER } from '../../scripts/platform/arayuz/terimler.mjs';
import { dizeDegismezleri, terimIhlalleri } from './terim-denetimi';

const KOK = join(__dirname, '..', '..');

function kaynaklar(klasor: string): string[] {
  const sonuc: string[] = [];
  for (const ad of readdirSync(klasor)) {
    const yol = join(klasor, ad);
    if (statSync(yol).isDirectory()) sonuc.push(...kaynaklar(yol));
    else if (/\.m?js$/.test(ad)) sonuc.push(yol);
  }
  return sonuc;
}
const goreli = (yol: string): string => relative(KOK, yol).split(sep).join('/');

test('denetim sözlüğe aykırı kullanımları yakalar, doğru kullanımlara takılmaz', () => {
  const aykiri: Array<[string, string?]> = [
    ['Zamanlanmış koşular'], ['Yeni zamanlanmış koşu'], ['Projede zamanlanmış kural yok'],
    ['Veri'], ['Henüz tablo yok (Veri > Tablolar).'], ["Tabloyu Veri'de tamamlayın"],
    ['Kaldı'], ['Kaldı: '], ['Sözleşme: Kaldı — 2 uyumsuzluk'], ['✗ kaldı'], ['geçti / kaldı'], ['Yalnız kalanlar'],
    ['Kalan testlerin hataları (3)'], ['yalnız kalan testlerde'], ['yeni kalan'],
    ['CANLI', "h('span', { class: 'canli-rozeti' }, 'CANLI')"], ['CANLI önizleme']
  ];
  for (const [metin, satir] of aykiri) expect(terimIhlalleri(metin, satir), metin).not.toEqual([]);
  const dogru: Array<[string, string?]> = [
    ['Planlı koşular'], ['Test verisi'], ['Veri sağlığı'], ['Veri koşusu'], ['Veri klasörü'], ['Başarısız'], ['Yalnız başarısızlar'],
    ['Yarıda kaldı'], ['İçerik aynı kaldı (yeniden kaydedildi).'], ['Kalan tablonun adı'], ['kalan süre'], ['CANLI onayı verilmedi; kalan senaryolar koşmadı.'],
    ['CANLI ortam'], ["CANLI'da çağrılmasın"], ['CANLI', "const KAPSAM = { test: 'TEST', canli: 'CANLI' };"], ['Canlı görüntü'], ['Canlı']
  ];
  for (const [metin, satir] of dogru) expect(terimIhlalleri(metin, satir), metin).toEqual([]);
});

test('arayüz ve sunucu metinleri sözlüğe uyar (Planlı koşu, Test verisi, Başarısız, CANLI yalnız ortam)', () => {
  const bulunan: string[] = [];
  for (const dosya of [...kaynaklar(join(KOK, 'scripts', 'platform')), ...kaynaklar(join(KOK, 'scripts', 'dogrulama'))]) {
    const kaynak = readFileSync(dosya, 'utf8');
    const satirlar = kaynak.split('\n');
    for (const d of dizeDegismezleri(kaynak)) {
      for (const ihlal of terimIhlalleri(d.metin, satirlar[d.satir - 1] ?? '')) bulunan.push(`${goreli(dosya)}:${d.satir} ${ihlal}: "${d.metin.slice(0, 120)}"`);
    }
  }
  expect(bulunan).toEqual([]);
});

test('README ve docs: "Zamanlanmış koşu" ve "Veri >" yolu geçmez', () => {
  const md = ['README.md', ...readdirSync(join(KOK, 'docs')).filter((a) => a.endsWith('.md')).map((a) => `docs/${a}`)];
  const bulunan: string[] = [];
  for (const ad of md) {
    readFileSync(join(KOK, ad), 'utf8').split('\n').forEach((s, i) => {
      if (/[Zz]amanlanmış (koşu|kural)|(^|[^\p{L}*])Veri >|\*\*Veri >/u.test(s)) bulunan.push(`${ad}:${i + 1}: ${s.trim().slice(0, 120)}`);
    });
  }
  expect(bulunan).toEqual([]);
});

test('üst menü "Test verisi" adını taşır; canlı görüntü rozeti "Canlı görüntü"', () => {
  const arayuz = (ad: string): string => readFileSync(join(KOK, 'scripts', 'platform', 'arayuz', ad), 'utf8');
  const ayarlar = arayuz('ayarlar.js');
  expect(ayarlar).toMatch(/\{ ad: 'veri', menu: 'Test verisi',/);
  expect(ayarlar).toMatch(/\{ ad: 'planli-kosular', menu: 'Planlı koşular',/);
  // Adres ve iç kimlikler değişmez; eski adresler yönlenir.
  expect(ayarlar).toContain("'zamanlanmis-kosular': '#/planli-kosular'");
  for (const kaynak of [arayuz('senaryo-formu.js'), arayuz('kosu-paneli.js'), arayuz('servis-kosu-paneli.js')]) {
    expect(kaynak).not.toMatch(/class: 'canli-rozeti'.*?\}, 'CANLI'\)/);
  }
  expect(arayuz('senaryo-formu.js')).toMatch(/class: 'canli-rozeti'.*?\}, 'Canlı görüntü'\)/);
});

test('tema: "Canlı" adı "Parlak" oldu; eski "canli" anahtarı "parlak"a eşlenir, bilinmeyen varsayılana düşer', () => {
  expect(STILLER.map((s) => [s.ad, s.etiket])).toEqual([['komuta', 'Komuta merkezi'], ['kurumsal', 'Kurumsal'], ['parlak', 'Parlak']]);
  expect(STILLER.some((s) => /canl/i.test(s.etiket) || String(s.ad) === 'canli')).toBe(false);
  expect(ESKI_STIL_ADLARI).toEqual({ canli: 'parlak' });
  expect(stilAdiniCoz('canli')).toBe('parlak');
  expect(stilAdiniCoz('parlak')).toBe('parlak');
  expect(stilAdiniCoz('kurumsal')).toBe('kurumsal');
  expect(stilAdiniCoz('komuta')).toBe('komuta');
  for (const x of [null, undefined, '', 'yok', 'CANLI', 'toString', '__proto__', 42]) expect(stilAdiniCoz(x), String(x)).toBe(VARSAYILAN_STIL);
  // CSS yeni anahtarla yazılır; eski anahtar CSS'te kalmaz (eşleme ortak.js'te).
  const css = readFileSync(join(KOK, 'scripts', 'platform', 'arayuz', 'stil.css'), 'utf8');
  expect(css).toContain(':root[data-stil="parlak"]');
  expect(css).not.toContain('data-stil="canli"');
  expect(readFileSync(join(KOK, 'scripts', 'test-sunucu.mjs'), 'utf8')).toContain("['/arayuz/tema-stilleri.mjs'");
});

test('Terimler sözlüğü: istenen her kavram tek cümleyle; sözlüğün kendisi de kurallara uyar', () => {
  const terimler = TERIMLER.map((t) => t.terim);
  for (const t of ['Ekran', 'Ortak akış', 'Akış', 'Senaryo', 'Model', 'Paket', 'Bulgu', 'Test verisi tablosu (kayıt / liste)', 'Karşılık', 'Ortam türü', 'İzin', 'Planlı koşu', 'Dene / Koşu']) {
    expect(terimler, t).toContain(t);
  }
  expect(new Set(terimler).size).toBe(terimler.length);
  for (const t of TERIMLER) {
    expect(t.aciklama.trim().endsWith('.'), t.terim).toBe(true);
    // Tek cümle: sonda nokta, içeride cümle sonu yok ("ör." kısaltması hariç).
    expect(t.aciklama.replace(/(^|[^\p{L}])ör\./gu, '$1ör').slice(0, -1), t.terim).not.toMatch(/[.!?]\s+\p{Lu}/u);
    expect(terimIhlalleri(t.aciklama), t.terim).toEqual([]);
  }
  expect(readFileSync(join(KOK, 'scripts', 'platform', 'arayuz', 'ayarlar.js'), 'utf8')).toContain('terimlerKarti()');
  expect(readFileSync(join(KOK, 'scripts', 'test-sunucu.mjs'), 'utf8')).toContain("['/arayuz/terimler.mjs'");
});

test('rehber: tarama adımları ("Düğmeyi ve sonucu işaretle", "Sayfada seç", "Öğe seç", keşif varsayılan açık) ve Terimler', () => {
  // Rehber içerikleri tarayıcı modülüdür (sunucu adresinden içe aktarır); burada kaynak metinden bölüm bölüm okunur.
  const kaynak = readFileSync(join(KOK, 'scripts', 'platform', 'arayuz', 'rehber-icerikleri.js'), 'utf8');
  const bolumler = new Map<string, string>();
  let anahtar = '';
  for (const s of kaynak.split('\n')) {
    const m = s.match(/^ {2}(?:'([a-z0-9-]+)'|([a-z0-9]+)): \{/);
    if (m) anahtar = m[1] || m[2];
    else if (anahtar) bolumler.set(anahtar, `${bolumler.get(anahtar) ?? ''}\n${s}`);
  }
  const metin = (a: string): string => bolumler.get(a) ?? '';
  const basliklar = (a: string): string[] => [...metin(a).matchAll(/\bbaslik: (?:'((?:[^'\\]|\\.)*)'|"([^"]*)")/g)].map((m) => (m[1] ?? m[2]).replace(/\\'/g, '\''));
  expect(basliklar('ekran-ekle')).toContain('Düğmeyi ve sonucu işaretle');
  expect(metin('ekran-ekle')).toMatch(/keşfi varsayılan olarak açıktır/);
  expect(basliklar('tarama')).toEqual(expect.arrayContaining(['Seçim keşfi', 'Düğmeyi ve sonucu işaretle']));
  for (const s of ['Sayfada seç', 'Öğe seç', 'Önizlemeye geç']) expect(metin('tarama'), s).toContain(s);
  expect(basliklar('akis-tasarimi')).toContain('Sayfada seç');
  expect(metin('akis-tasarimi')).toContain('Öğe seç');
  expect(basliklar('ayarlar-arayuz')).toContain('Terimler');
  // Sonuçlar rehberinin bölüm sırası (arayuz-tasma testi) değişmez.
  const sonuclar = basliklar('sonuclar');
  const sira = ['Ürün / ekran seçimi', 'Sağlık noktası', 'Rapor sekmeleri', 'Başlık ve "Koşuyu başlat"', 'Tarih aralığı',
    'Özet kartlar', 'Koşu trendi', 'Başarısız testler', 'Test paneli', 'Koşu geçmişi', 'Hata kalıpları'].map((b) => sonuclar.indexOf(b));
  expect(sira.every((x, i) => x > 0 && (i === 0 || x > sira[i - 1])), JSON.stringify(sira)).toBe(true);
});
