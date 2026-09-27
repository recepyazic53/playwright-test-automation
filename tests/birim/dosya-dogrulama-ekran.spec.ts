// KORUMA TESTLERİ — Ekran akışında "İndirilen dosyayı doğrula": akış tasarımı bloğu → model adımı (dosyaKontrolu) → koşu planı
// (ve geri); model doğrulayıcı; gerçek koşu (Playwright download olayı) CSV (Windows-1254, ;) / XLSX / PDF, ${alan} ve gizli
// ${Tablo.Sütun} başvurusu, kalan beklentide Beklenen / Görülen + maskeleme, şifreli PDF'te açık hata, dosya eki Ayarlar kararına
// göre (varsayılan saklanmaz); akış tasarımında blok formu (masaüstü + 390px taşma yok). Uygulama 127.0.0.1'de sahte "Rapor"
// ekranıdır; ayrı Nöbetçi örneği geçici veritabanıyla çalışır. Dış siteye istek gitmez.
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { DOSYA_BEKLENTI_TURLERI } from '../../scripts/dogrulama/ekran-modeli-dogrulayici.mjs';
import { BEKLENTI_TURLERI } from '../../scripts/platform/dosyalar/dosya-icerigi.mjs';
import { akistanKayitEnvanteri, type AkisEnvanteri } from '../../scripts/platform/tarama/akis-tasarimi.mjs';
import { kayitPaketiOlustur, type HamAlan } from '../../scripts/platform/tarama/paket-olusturucu.mjs';
import { adimlardanBloklar, modeldenAkisEnvanteri } from '../../scripts/platform/ekranlar/akis-servisi.mjs';
import { sayfaPaketiniDogrula } from '../../scripts/platform/ekranlar/sayfa-paketi.mjs';
import { modelKosuPlani } from '../../scripts/platform/senaryolar/model-kosusu.mjs';
import { pdfUret, windows1254, xlsxUret } from './dosya-fikstur';
import { korumaliTarayici } from './giris-fikstur';
import { nobetciApi, nobetciBaslat, type Nobetci } from './nobetci-sunucusu';
import { HIZLI_KDF, izinleriAc } from './platform-ortak';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- model JSON'u serbestçe gezilir (test verisi)
type Nesne = Record<string, any>;

// ---- Saf: tasarım bloğu → model → plan → blok ----------------------------------------------------------------------------

const alan = (anahtar: string, etiket: string): HamAlan => ({
  anahtar, tur: 'text', etiket, etiketKaynagi: 'label', kimlik: anahtar.slice(1), ad: null, secici: anahtar, kirilganlik: 'dusuk', adaySeciciler: [anahtar],
  zorunlu: false, devreDisi: false, saltOkunur: false, coklu: false, bolum: { anahtar: 'b', baslik: 'Süzgeç' }
});
const ENV: AkisEnvanteri = {
  kip: 'kayit', bicim: 'akis', profil: null, baslik: 'Rapor', alanlar: [{ alan: alan('#kategori', 'Kategori'), secili: true }],
  dugmeler: [{ secici: '#uygula', metin: 'Uygula' }, { secici: '#csvIndir', metin: 'CSV indir' }], mesajlar: [], olaylar: [], engellenenler: [], notlar: []
};
const META = { ekranAnahtari: 'rapor', ekranAdi: 'Rapor', urlYolu: '/rapor', girisGerekli: false, girissiz: true, ikiAsamali: 'yok' as const, baglamTuru: null };
const CSV_TANIMI = { bicim: 'csv', ayrac: ';', beklentiler: [{ tur: 'icerir', deger: '${kategori}' }, { tur: 'satirSayisi', islem: 'enAz', deger: 1 }] };

test('tasarım: dosya bloğu kendi adımı olur (tetikleyici düğme + tanım), modelden geri döner, koşu planında dosya; kurallar', () => {
  const { envanter: k, hatalar } = akistanKayitEnvanteri(ENV, [
    { tur: 'alanlar', ad: 'Süzgeç', alanlar: ['#kategori'], zorunlu: [] },
    { tur: 'aksiyon', dugme: 0, istegeBagli: false },
    { tur: 'dosya', ad: 'Liste indirilir', dugme: 1, dosya: CSV_TANIMI },
    { tur: 'mesaj', mesaj: null, metin: 'Rapor hazır' },
    { tur: 'bitir' }
  ]);
  expect(hatalar).toEqual([]);
  const paket = kayitPaketiOlustur(META, k as NonNullable<typeof k>).paket;
  expect(sayfaPaketiniDogrula(paket, {})).toMatchObject({ gecerli: true, hatalar: [] });
  const m = paket.model as Nesne;
  expect(m.adimlar.map((a: Nesne) => [a.baslik, a.kosu?.basariGostergesi ?? null, a.dosyaKontrolu ?? null])).toEqual([
    ['Süzgeç', { tur: 'metin', deger: 'Rapor hazır' }, null],
    ['Liste indirilir', null, { ...CSV_TANIMI, tetikleyici: { secici: '#csvIndir', aciklama: 'CSV indir' } }]
  ]);
  // Model → diyagram blokları (tetikleyici düğme sağ listede) → aynı tanım.
  const env = modeldenAkisEnvanteri(m);
  expect(env.dugmeler).toEqual(expect.arrayContaining([{ secici: '#csvIndir', metin: 'CSV indir' }]));
  const bloklar = adimlardanBloklar(m, m.adimlar, env) as Nesne[];
  expect(bloklar.map((b) => b.tur)).toEqual(['alanlar', 'aksiyon', 'mesaj', 'dosya', 'bitir']);
  const dosya = bloklar.find((b) => b.tur === 'dosya') as Nesne;
  expect(env.dugmeler[dosya.dugme]).toEqual({ secici: '#csvIndir', metin: 'CSV indir' });
  expect(dosya.dosya).toEqual(CSV_TANIMI);
  const plan = modelKosuPlani(m, { kategori: 'Kırtasiye' });
  expect(plan.adimlar[1]).toMatchObject({ baslik: 'Liste indirilir', dosya: { tetikleyici: { secici: '#csvIndir' } }, sonAdim: true, alanlar: [] });
  // Kurallar: düğme seçilmeli, tanım geçerli olmalı, aksiyonsuz alan grubundan hemen sonra gelmez, ardından bekleme konmaz.
  const hata = (b: Nesne[]): string[] => akistanKayitEnvanteri(ENV, b as Parameters<typeof akistanKayitEnvanteri>[1]).hatalar.map((x) => x.mesaj);
  expect(hata([{ tur: 'aksiyon', dugme: 0, istegeBagli: false }, { tur: 'dosya', ad: '', dugme: -1, dosya: { beklentiler: [] } }, { tur: 'bitir' }]))
    .toEqual(['İndirmeyi başlatan düğmeyi seçin.', 'Dosya için en az bir beklenti ekleyin (ör. metin içeriyor).']);
  expect(hata([{ tur: 'alanlar', ad: 'Süzgeç', alanlar: ['#kategori'], zorunlu: [] }, { tur: 'dosya', ad: '', dugme: 1, dosya: CSV_TANIMI }, { tur: 'bitir' }])[0]).toContain('aksiyondan');
  expect(hata([{ tur: 'aksiyon', dugme: 0, istegeBagli: false }, { tur: 'dosya', ad: '', dugme: 1, dosya: CSV_TANIMI }, { tur: 'bekle', saniye: 2 }, { tur: 'bitir' }])[0])
    .toContain('indirmeyi bekleme');
  // Model doğrulayıcının tür listesi motorla aynı; tetikleyicisiz / beklentisiz adım reddedilir.
  expect([...DOSYA_BEKLENTI_TURLERI]).toEqual([...BEKLENTI_TURLERI]);
  const bozuk = { ...paket, model: { ...m, adimlar: [m.adimlar[0], { ...m.adimlar[1], dosyaKontrolu: { beklentiler: [] } }] } };
  expect(JSON.stringify(sayfaPaketiniDogrula(bozuk, {}).hatalar)).toContain('tetikleyici.secici');
});

test('varsayılan kapalı: dosya adımı olmayan model planı aynı (dosya alanı yok)', () => {
  const { envanter: k } = akistanKayitEnvanteri(ENV, [
    { tur: 'alanlar', ad: 'Süzgeç', alanlar: ['#kategori'], zorunlu: [] }, { tur: 'aksiyon', dugme: 0, istegeBagli: false }, { tur: 'mesaj', mesaj: null, metin: 'Rapor hazır' }, { tur: 'bitir' }
  ]);
  const m = kayitPaketiOlustur(META, k as NonNullable<typeof k>).paket.model as Nesne;
  expect(m.adimlar.some((a: Nesne) => 'dosyaKontrolu' in a)).toBe(false);
  expect(modelKosuPlani(m, { kategori: 'x' }).adimlar.some((a) => 'dosya' in a)).toBe(false);
});

// ---- Gerçek koşu -----------------------------------------------------------------------------------------------------------

const KUPON = 'YAZ-4821';
const CSV = `Sipariş No;Ürün;Kategori;Kupon;Tutar\n1001;Kırmızı Kalem;Kırtasiye;${KUPON};45,00\n1002;Defter;Kırtasiye;;20,50\n`;
const SAYFA = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>Rapor</title></head><body>
<label>Kategori <input id="kategori"></label>
<button id="uygula" onclick="document.getElementById('durum').textContent = 'Rapor hazır: ' + document.getElementById('kategori').value">Uygula</button>
<p id="durum"></p>
<a id="csvIndir" href="/dosya/csv">CSV indir</a> <a id="xlsxIndir" href="/dosya/xlsx">Excel indir</a>
<a id="pdfIndir" href="/dosya/pdf">PDF indir</a> <a id="sifreliIndir" href="/dosya/sifreli">Şifreli PDF indir</a>
</body></html>`;
const DOSYALAR: Record<string, { ad: string; tur: string; veri: Buffer }> = {
  '/dosya/csv': { ad: 'siparisler-2026.csv', tur: 'text/csv', veri: windows1254(CSV) },
  '/dosya/xlsx': { ad: 'stok.xlsx', tur: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    veri: xlsxUret([{ ad: 'Stok', satirlar: [['Ürün', 'Depo', 'Adet'], ['Kalem', 'Ankara', 120], ['Silgi', 'İzmir', 0]] }]) },
  '/dosya/pdf': { ad: 'fatura-42.pdf', tur: 'application/pdf', veri: pdfUret([['Fatura No: 2026-0042', 'Toplam tutar: 145,90 TL']], { sikistir: true }) },
  '/dosya/sifreli': { ad: 'gizli.pdf', tur: 'application/pdf', veri: pdfUret([['Gizli belge']], { sifreli: true }) }
};

const dosyaAdimi = (id: string, sira: number, baslik: string, secici: string, aciklama: string, tanim: Nesne): Nesne =>
  ({ id, sira, baslik, dosyaKontrolu: { tetikleyici: { secici, aciklama }, zamanAsimiSn: 20, ...tanim } });
function raporPaketi(anahtar: string, ad: string, dosyaAdimlari: Nesne[]): Nesne {
  const model = {
    semaSurumu: 2, tur: 'ekran', id: anahtar, ad, aciklama: 'Dosya doğrulama (nötr fikstür).', ekranUrl: '/rapor', girisGerekmez: true,
    specDosyasi: 'yok', pageObject: 'yok (model koşucusu)', veriKaynaklari: { senaryo: 'Nöbetçi' }, kosullar: {},
    adimlar: [
      {
        id: 'suzgec', sira: 1, baslik: 'Rapor süzülür',
        bolumler: [{ id: 'suzgecBolumu', baslik: 'Süzgeç', alanlar: [{ id: 'kategori', tip: 'metin', etiket: { ekran: 'Kategori' }, yapilandirma: 'senaryo', eslesme: { senaryo: 'kategori' }, konum: { secici: '#kategori', kirilganlik: 'dusuk' }, zorunlu: false }] }],
        kosu: { aksiyonlar: [{ tur: 'tikla', secici: '#uygula', aciklama: 'Uygula' }], basariGostergesi: { tur: 'metin', deger: 'Rapor hazır', secici: '#durum' }, zamanAsimiSn: 10 }
      },
      ...dosyaAdimlari.map((a, i) => ({ ...a, sira: i + 2 }))
    ],
    senaryoDuzeyi: { alanlar: [{ id: 'baslik', tip: 'metin', etiket: { ekran: null, form: 'Başlık' }, zorunlu: true, benzersiz: true, yapilandirma: 'senaryo', eslesme: { senaryo: 'baslik' } }] },
    urunDuzeyi: {}, isKurallari: [], bilinmeyenler: []
  };
  return {
    tur: 'sayfa-paketi', surum: 1,
    meta: { ekran: { anahtar, ad, urlYolu: '/rapor' }, olusturan: 'test', olusturulma: '2026-09-28T09:00:00Z', baglamProfilleri: [], not: 'Nötr fikstür; değerler sahte.' },
    model, senaryoOnerileri: [], gerekenAyarlar: { girisGerekli: false, ikiAsamaliDogrulama: 'yok', captchaGoruldu: false, testVerisiTurleri: [] }, bilinmeyenler: []
  };
}

test.describe('gerçek koşu (sahte rapor ekranı)', () => {
  test.describe.configure({ mode: 'serial' });
  const PAROLA = `Gecici-Dosya-${randomBytes(6).toString('hex')}`;
  let nobetci: Nobetci;
  let sunucu: Server;
  let adres = '';
  let klasor = '';
  let projeId = '';
  let ortamId = '';
  const istekler: string[] = [];
  const api = (yol: string, govde?: Nesne) => nobetciApi(nobetci, yol, govde) as Promise<Nesne>;
  const basarili = async (yol: string, govde?: Nesne): Promise<Nesne> => {
    const y = await api(yol, govde);
    expect(y.basarili, `${yol}: ${String(y.mesaj ?? '')} ${JSON.stringify(y.hatalar ?? '')}`).toBe(true);
    return y;
  };
  const ekranBul = async (ad: string): Promise<string> => String(((await api(`/platform/senaryolar?projeId=${projeId}&ortamId=${ortamId}`)).ekranlar as Nesne[]).find((e) => e.ad === ad)?.id);
  const kaydetVeKos = async (ekranId: string, baslik: string, veri: Nesne): Promise<Nesne> => {
    const yeni = await basarili('/platform/senaryo/kaydet', { projeId, ekranId, baslik, ortamIdleri: [ortamId], veri: { baslik, ...veri } });
    const y = await api('/platform/senaryolar/calistir', { projeId, kosuId: `kosu-${randomUUID()}`, senaryoId: yeni.id, ortamId, canliOnay: true });
    expect(y.basarili, `${baslik}: ${String(y.mesaj ?? '')}`).toBe(true);
    return (await api(`/platform/sonuclar/sonuc?id=${String(y.sonucId)}`)).sonuc as Nesne;
  };
  const ekAdlari = (s: Nesne): string[] => ((s.medya ?? []) as Nesne[]).map((m) => String(m.ad));

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    klasor = mkdtempSync(join(tmpdir(), 'dosya-dogrulama-'));
    sunucu = createServer((q, r) => {
      const yol = new URL(q.url ?? '/', 'http://127.0.0.1').pathname;
      istekler.push(yol);
      const d = DOSYALAR[yol];
      if (d) { r.writeHead(200, { 'Content-Type': d.tur, 'Content-Disposition': `attachment; filename="${d.ad}"` }); r.end(d.veri); return; }
      if (yol === '/rapor') { r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); r.end(SAYFA); return; }
      r.writeHead(404); r.end();
    });
    await new Promise<void>((c) => sunucu.listen(0, '127.0.0.1', () => c()));
    adres = `http://127.0.0.1:${(sunucu.address() as AddressInfo).port}`;
    const vtYolu = join(klasor, 'platform.db');
    const vt = await veritabaniniHazirla(vtYolu);
    await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
    izinleriAc(vt);
    vt.kapat();
    nobetci = await nobetciBaslat(klasor, vtYolu, {});
    await basarili('/platform/kasa/ac', { parola: PAROLA });
    projeId = String((await basarili('/platform/proje/kaydet', { ad: 'Rapor Projesi' })).proje.id);
    ortamId = String((await basarili('/platform/ortam/kaydet', { projeId, ad: 'Deneme', tabanUrl: adres, varsayilan: true, riskli: false })).ortam.id);
    await basarili('/platform/tablo/kaydet', { projeId, ad: 'Kuponlar', sutunlar: [{ ad: 'Kod', gizli: true }], satirlar: [{ degerler: { Kod: KUPON } }] });
    await basarili('/platform/sayfa-paketi/ekle', { projeId, senaryoIndeksleri: [], ortamIdleri: [ortamId], paket: raporPaketi('rapor', 'Rapor', [
      dosyaAdimi('csv', 2, 'Sipariş listesi indirilir', '#csvIndir', 'CSV indir', { bicim: 'otomatik', beklentiler: [
        { tur: 'adDeseni', deger: 'siparisler-*.csv' }, { tur: 'enAzBoyut', deger: 20 }, { tur: 'icerir', deger: '${kategori}' }, { tur: 'sutunVar', deger: 'Ürün' },
        { tur: 'satirSayisi', islem: 'enAz', deger: 2 }, { tur: 'hucre', sutun: 'Tutar', deger: '45,00', satir: { tur: 'kosul', sutun: 'Kupon', deger: '${Kuponlar.Kod}' } }] }),
      dosyaAdimi('xlsx', 3, 'Stok listesi indirilir', '#xlsxIndir', 'Excel indir', { beklentiler: [
        { tur: 'sutunVar', deger: 'Depo' }, { tur: 'hucre', sutun: 'Adet', deger: '0', satir: { tur: 'kosul', sutun: 'Depo', deger: 'izmir' } }, { tur: 'icerir', deger: 'Kalem' }] }),
      dosyaAdimi('pdf', 4, 'Fatura indirilir', '#pdfIndir', 'PDF indir', { beklentiler: [{ tur: 'icerir', deger: 'toplam tutar: 145,90 TL' }, { tur: 'icermez', deger: 'İptal' }] })
    ]) });
    await basarili('/platform/sayfa-paketi/ekle', { projeId, senaryoIndeksleri: [], ortamIdleri: [ortamId], paket: raporPaketi('rapor-sifreli', 'Rapor (şifreli)', [
      dosyaAdimi('sifreli', 2, 'Şifreli belge indirilir', '#sifreliIndir', 'Şifreli PDF indir', { beklentiler: [{ tur: 'icerir', deger: 'Gizli belge' }] })
    ]) });
  });

  test.afterAll(async () => {
    nobetci?.surec.kill('SIGTERM');
    await new Promise((c) => sunucu?.close(c));
    if (klasor) rmSync(klasor, { recursive: true, force: true });
  });

  test('geçen koşu: CSV (1254, ;), XLSX, PDF indirilip doğrulanır; özet eklenir, dosya eklenmez (varsayılan)', async () => {
    test.setTimeout(180_000);
    const s = await kaydetVeKos(await ekranBul('Rapor'), 'Kırtasiye raporu', { kategori: 'Kırtasiye' });
    expect(s.durum, String(s.hataMesaji)).toBe('basarili');
    expect(istekler.filter((y) => y.startsWith('/dosya/'))).toEqual(['/dosya/csv', '/dosya/xlsx', '/dosya/pdf']);
    const adlar = ekAdlari(s);
    expect(adlar).toEqual(expect.arrayContaining(['Dosya doğrulama - Sipariş listesi indirilir', 'Dosya doğrulama - Stok listesi indirilir', 'Dosya doğrulama - Fatura indirilir']));
    expect(adlar.some((a) => a.startsWith('İndirilen dosya'))).toBe(false);
  });

  test('kalan beklenti: Beklenen / Görülen, gizli değer maskeli; Ayarlar "yalnız kalan" iken dosya eklenir', async () => {
    test.setTimeout(240_000);
    const ekranId = await ekranBul('Rapor');
    const s = await kaydetVeKos(ekranId, 'Oyuncak raporu', { kategori: 'Oyuncak' });
    expect(s.durum).toBe('basarisiz');
    const hata = String(s.hataMesaji);
    expect(hata).toContain('Sipariş listesi indirilir adımında beklenen sonuç doğrulanamadı.');
    expect(hata).toContain('Beklenen: "içerir: "Oyuncak"" — Görülen: "bulunamadı; dosyanın başı: Sipariş No;Ürün;Kategori;Kupon;Tutar');
    expect(hata).not.toContain(KUPON);
    expect(ekAdlari(s).some((a) => a.startsWith('İndirilen dosya'))).toBe(false);
    await basarili('/platform/kosu-ayarlari/kaydet', { ayarlar: { indirilenDosya: 'yalnizHata' } });
    const s2 = await kaydetVeKos(ekranId, 'Oyuncak raporu 2', { kategori: 'Oyuncak' });
    expect(s2.durum).toBe('basarisiz');
    expect(ekAdlari(s2)).toContain('İndirilen dosya - siparisler-2026.csv');
    await basarili('/platform/kosu-ayarlari/kaydet', { ayarlar: { indirilenDosya: 'kapali' } });
  });

  test('şifreli PDF: "metin çıkarılamadı" açık hatası', async () => {
    test.setTimeout(180_000);
    const s = await kaydetVeKos(await ekranBul('Rapor (şifreli)'), 'Şifreli belge', { kategori: 'x' });
    expect(s.durum).toBe('basarisiz');
    expect(String(s.hataMesaji)).toContain('Görülen: "PDF şifreli (parola korumalı); metin çıkarılamadı."');
  });

  test('arayüz: akış tasarımında "İndirilen dosyayı doğrula" bloğu ve formu; masaüstü + 390px taşma yok', async ({}, testInfo) => {
    test.setTimeout(120_000);
    const ekranId = await ekranBul('Rapor');
    const tarayici = await korumaliTarayici();
    try {
      const page = await (await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1440, height: 1100 } })).newPage();
      const hatalar: string[] = [];
      page.on('pageerror', (e) => hatalar.push(String(e)));
      await page.goto(`/#/ekranlar/e/${encodeURIComponent(ekranId)}/akis`);
      await page.getByRole('button', { name: 'Düzenle' }).click();
      await expect(page.getByRole('heading', { name: /^Akışı düzenle/ })).toBeVisible();
      // Modeldeki dosya adımları blok olarak gelir; tetikleyici düğme seçili, beklentiler formda.
      const blok = page.locator('.tasarim-blogu.tur-dosya').filter({ has: page.getByRole('textbox', { name: 'Dosya adımının adı' }) }).first();
      await expect(blok.getByRole('combobox', { name: 'İndirmeyi başlatan düğme' })).toHaveValue(/\d+/);
      await expect(blok.getByRole('combobox', { name: 'İndirmeyi başlatan düğme' }).locator('option:checked')).toHaveText('“CSV indir”');
      await expect(blok.getByRole('list', { name: 'Beklentiler' }).getByRole('listitem')).toHaveCount(6);
      // Yeni blok: "+" menüsünden eklenir; beklenti türü değişince alanları değişir.
      await page.getByRole('button', { name: 'Buraya blok ekle' }).last().click();
      await page.getByRole('group', { name: 'Eklenecek blok' }).getByRole('button', { name: 'İndirilen dosyayı doğrula' }).click();
      const yeni = page.locator('.tasarim-blogu.tur-dosya').last();
      await yeni.getByRole('combobox', { name: '1. beklenti türü' }).selectOption('hucre');
      await expect(yeni.getByRole('textbox', { name: '1. beklenti sütun' })).toBeVisible();
      await yeni.getByRole('combobox', { name: '1. beklenti satır' }).selectOption('kosul');
      await expect(yeni.getByRole('textbox', { name: '1. beklenti koşul değeri' })).toBeVisible();
      await yeni.getByRole('button', { name: 'Beklenti ekle' }).click();
      await expect(yeni.getByRole('list', { name: 'Beklentiler' }).getByRole('listitem')).toHaveCount(2);
      await yeni.getByRole('combobox', { name: 'Dosya biçimi' }).selectOption('pdf');
      await expect(yeni.getByRole('combobox', { name: 'CSV ayracı' })).toHaveCount(0);
      await testInfo.attach('dosya-blogu', { path: await ekranGoruntusu(page, testInfo.outputPath('dosya-blogu.png')), contentType: 'image/png' });
      await tasmaYok(page);
      await page.setViewportSize({ width: 390, height: 900 });
      await yeni.scrollIntoViewIfNeeded();
      await tasmaYok(page);
      await testInfo.attach('dosya-blogu-390', { path: await ekranGoruntusu(page, testInfo.outputPath('dosya-blogu-390.png')), contentType: 'image/png' });
      expect(hatalar).toEqual([]);
    } finally {
      await tarayici.close();
    }
  });
});

/** Tam sayfa ekran görüntüsü (test çıktı klasörüne; rapora eklenir). */
async function ekranGoruntusu(page: Page, yol: string): Promise<string> {
  await page.screenshot({ path: yol, fullPage: true });
  return yol;
}

/** Ana içerikte sağ kenarı görünen alanı aşan öğe yok (kendi kaydırma kutusundakiler sayılmaz). */
async function tasmaYok(page: Page): Promise<void> {
  const o = await page.evaluate(() => {
    const gorunen = document.documentElement.clientWidth;
    const ana = document.querySelector('main');
    const kaydirmaIcinde = (e: Element): boolean => {
      for (let p = e.parentElement; p && p !== ana; p = p.parentElement) if (['auto', 'scroll', 'hidden', 'clip'].includes(getComputedStyle(p).overflowX)) return true;
      return false;
    };
    const tasanlar = [...(ana?.querySelectorAll('.dosya-kontrolu, .dosya-kontrolu *') ?? [])].filter((e) => !kaydirmaIcinde(e) && e.getBoundingClientRect().right > gorunen + 0.5)
      .slice(0, 5).map((e) => `${e.tagName.toLowerCase()}.${String((e as HTMLElement).className).replace(/\s+/g, '.')}`);
    return { tasanlar, gorunen, belge: document.documentElement.scrollWidth - window.innerWidth };
  });
  expect(o.tasanlar, `görünen ${o.gorunen}px; taşan: ${o.tasanlar.join(', ')}`).toEqual([]);
  expect(o.belge).toBeLessThanOrEqual(0);
}
