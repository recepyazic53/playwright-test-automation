// KORUMA TESTLERİ — paylaşılabilir HTML rapor üreticisi (sonuclar/html-rapor.mjs; saf fonksiyon, ağ / veritabanı yok):
// kullanıcı verisi kaçışlanır (XSS yok, betik yok), gizli değerler her zaman maskelenir, ortam adresi kapalıyken görünmez,
// ekran görüntüleri seçenek kapalıyken gömülmez (data: URI yok), dosya adı güvenli karakterlerden oluşur.
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { ekranKaydet, girisProfiliKaydet, ortamKaydet, projeKaydet, senaryoKaydet, veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { kosuKaydet, kosuyuBitir, sonucKaydet } from '../../scripts/platform/veritabani/sonuc-deposu.mjs';
import { htmlRaporuOlustur, htmlRaporuUret, raporDosyaAdi, type RaporVerisi } from '../../scripts/platform/sonuclar/html-rapor.mjs';
import { HIZLI_KDF } from './platform-ortak';

const PNG_1X1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function veri(): RaporVerisi {
  return {
    tur: 'ekran', baslik: 'Tam koşu', proje: 'Örnek <b>Proje</b>', ortam: 'TEST', ortamAdresi: 'https://test.ornek.local/app',
    baslangic: '2026-09-27T08:00:00.000Z', bitis: '2026-09-27T08:05:00.000Z', sureMs: 300_000, kosuDurumu: 'tamamlandi',
    sayilar: { basarili: 1, basarisiz: 1, atlanan: 0, durduruldu: 0 },
    senaryolar: [
      {
        baslik: '<script>alert(1)</script> Fatura', grup: 'Kargo"><img src=x onerror=alert(2)>', durum: 'basarisiz', sureMs: 4200,
        kalinanAdim: 'Giriş: parola=Adim-Gizli-77',
        hata: [
          'Error: expect(locator).toHaveText(expected) failed',
          'Expected: "Tamam"',
          'Received: "Hata: kullanıcı ali.veli@ornek.com, kart 4111 1111 1111 1111"',
          'Giriş reddedildi: Gizli-Parola-42 token=abc123xyz789 https://test.ornek.local/app/giris?oturum=zzz',
          '<Password>xml-sifre-55</Password> "apiKey": "json-anahtar-66"'
        ].join('\n'),
        goruntuler: [{ ad: 'hata.png', icerikTuru: 'image/png', base64: PNG_1X1 }, { ad: 'kotu.html', icerikTuru: 'text/html', base64: PNG_1X1 }]
      },
      { baslik: 'Kaydet', grup: 'Kargo', durum: 'basarili', sureMs: 900, kalinanAdim: null, hata: null }
    ],
    olusturma: '2026-09-27T09:00:00.000Z'
  };
}

const GIZLILER = ['Gizli-Parola-42'];

test('kullanıcı verisi kaçışlanır; raporda betik ve etkin öznitelik yoktur', () => {
  const html = htmlRaporuUret(veri(), { gizliDegerler: GIZLILER });
  expect(html).not.toMatch(/<script/i);
  expect(html).not.toContain('<img src=x');
  expect(html).not.toContain('<b>Proje</b>');
  expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; Fatura');
  expect(html).toContain('Kargo&quot;&gt;&lt;img src=x onerror=alert(2)&gt;');
  expect(html).toContain('<html lang="tr">');
  expect(html).toContain('<th scope="col">');
  expect(html).toContain("default-src 'none'");
  // Dış kaynak yok (font / CDN / betik).
  expect(html).not.toMatch(/(src|href)="https?:/i);
  expect(html).not.toMatch(/@import|url\(/i);
});

test('gizli değerler, adı gizli alanlar, e-posta, kart no ve ortam adresi maskelenir; Beklenen / Görülen kalır', () => {
  const html = htmlRaporuUret(veri(), { gizliDegerler: GIZLILER, ekAdlar: [] });
  for (const sizinti of ['Gizli-Parola-42', 'abc123xyz789', 'Adim-Gizli-77', 'xml-sifre-55', 'json-anahtar-66', 'ali.veli@', '4111 1111', 'test.ornek.local', 'oturum=zzz']) {
    expect(html, sizinti).not.toContain(sizinti);
  }
  expect(html).toContain('‹ortam adresi›');
  expect(html).toContain('<dt>Beklenen</dt><dd>&quot;Tamam&quot;</dd>');
  expect(html).toContain('<dt>Görülen</dt>');
  expect(html).toContain('Hata kalıpları');

  // Adres açıkken ortam adresi görünür (sorgu dizesi yine silinir), gizli değerler yine maskelenir.
  const acik = htmlRaporuUret(veri(), { gizliDegerler: GIZLILER, adres: true });
  expect(acik).toContain('https://test.ornek.local/app');
  expect(acik).not.toContain('oturum=zzz');
  expect(acik).not.toContain('Gizli-Parola-42');

  // Hata mesajları kapalıyken hata metni ve kalıplar rapora girmez.
  const hatasiz = htmlRaporuUret(veri(), { gizliDegerler: GIZLILER, hatalar: false });
  expect(hatasiz).not.toContain('toHaveText');
  expect(hatasiz).not.toContain('Beklenen');
  expect(hatasiz).not.toContain('Hata kalıpları');
});

test('ekran görüntüleri yalnız seçenek açıkken ve yalnız görüntü türünde gömülür', () => {
  const kapali = htmlRaporuUret(veri());
  expect(kapali).not.toMatch(/data:[a-z]+\//i); // (CSP'deki "img-src data:" bir kaynak değildir)
  expect(kapali).not.toContain(PNG_1X1);
  expect(kapali).not.toContain('<img');

  const acik = htmlRaporuUret(veri(), { goruntuler: true });
  expect(acik).toContain(`src="data:image/png;base64,${PNG_1X1}"`);
  expect(acik).not.toContain('data:text/html');
  expect(acik.match(/<img /g)?.length).toBe(1);
});

test('dosya adı: nobetci-rapor-<proje>-<ortam>-<tarih>.html, yalnız güvenli karakterler', () => {
  const ad = raporDosyaAdi('Örnek Ürün/Şube <x>', 'TEST: Canlı?', new Date(2026, 8, 27, 14, 5));
  expect(ad).toBe('nobetci-rapor-ornek-urun-sube-x-test-canli-2026-09-27-1405.html');
  expect(raporDosyaAdi('', null, new Date(2026, 0, 2, 3, 4))).toBe('nobetci-rapor-proje-ortam-2026-01-02-0304.html');
});

test('sunucu toplayıcısı: ekran koşusundan rapor; giriş parolası maskelenir, başka projenin koşusu verilmez', async () => {
  const klasor = mkdtempSync(join(tmpdir(), 'html-rapor-'));
  try {
    const vt = await veritabaniniHazirla(join(klasor, 'platform.db'));
    await kasaOlustur(vt, `Gecici-${randomBytes(6).toString('hex')}`, { kdf: HIZLI_KDF });
    const proje = projeKaydet(vt, { ad: 'Rapor Projesi' });
    const baska = projeKaydet(vt, { ad: 'Başka' });
    const ortam = ortamKaydet(vt, { projeId: proje, ad: 'TEST', tabanUrl: 'https://test.ornek.local/', ayarlar: { riskli: false } });
    girisProfiliKaydet(vt, { projeId: proje, ad: 'Ana', kullaniciAdi: 'rapor.kullanici', parola: 'Cok-Gizli-Parola-9' });
    const ekran = ekranKaydet(vt, { projeId: proje, anahtar: 'kargo', ad: 'Kargo' });
    const senaryo = senaryoKaydet(vt, { projeId: proje, ekranId: ekran, baslik: 'Peşin', icerik: {} });
    const z = (dk: number) => new Date(Date.UTC(2026, 8, 27, 9, dk)).toISOString();
    kosuKaydet(vt, { id: 'k1', projeId: proje, ortamId: ortam, tur: 'tam', baslangic: z(0) });
    sonucKaydet(vt, { kosuId: 'k1', projeId: proje, senaryoId: senaryo, senaryoBaslik: 'Peşin', durum: 'basarisiz', testKimligi: 't1', bitis: z(1),
      hataMesaji: 'Error: giriş başarısız (rapor.kullanici / Cok-Gizli-Parola-9) https://test.ornek.local/giris' });
    kosuyuBitir(vt, 'k1', { durum: 'tamamlandi', bitis: z(2) });

    const r = await htmlRaporuOlustur(vt, new URLSearchParams({ projeId: proje, tur: 'ekran', id: 'k1' }), { medyaKlasoru: join(klasor, 'medya') });
    expect(r.dosyaAdi).toMatch(/^nobetci-rapor-rapor-projesi-test-\d{4}-\d{2}-\d{2}-\d{4}\.html$/);
    expect(r.html).toContain('Rapor Projesi');
    expect(r.html).toContain('giriş başarısız');
    for (const sizinti of ['Cok-Gizli-Parola-9', 'rapor.kullanici', 'test.ornek.local']) expect(r.html, sizinti).not.toContain(sizinti);
    expect(r.goruntu).toEqual({ eklenen: 0, atlanan: 0, bayt: 0 });
    await expect(htmlRaporuOlustur(vt, new URLSearchParams({ projeId: baska, tur: 'ekran', id: 'k1' }), { medyaKlasoru: klasor })).rejects.toThrow('Koşu bulunamadı');
    vt.kapat();
  } finally {
    rmSync(klasor, { recursive: true, force: true });
  }
});
