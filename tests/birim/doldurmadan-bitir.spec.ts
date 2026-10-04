// VERİ DURAĞINDA "DOLDURMADAN BURADA BİTİR" (hızlı test; genel): bir basıştan sonra yeni alanlar soran bir pencere açılınca kullanıcı
// alanları doldurmadan testi bitirebilir ("bu ekran açılınca bitsin").
//  - Düğme yalnız en az bir basıştan sonra görünür (ilk veri durağında yok; Hayır izninde basış olmadığı için yok).
//  - Bu duraktaki alanlara hiçbir şey yazılmaz, hiçbir düğmeye basılmaz; doğrudan bitiş koşulu adımına geçilir ("Burada bitir" yolu).
//  - Bitiş adımında açılan pencere aday: "Açılan pencere görününce bitti". Durağın soruları senaryoya, modele ve tablolara girmez.
//  - Normal koşu pencere görününce başarılı biter; pencere alanlarına yazmaz. 1440 / 390 px'te taşma yok.
// Güvenlik: yalnız 127.0.0.1'deki sahte sayfa (yerelSunucu); geçici veritabanı; veri/ klasörüne dokunulmaz. Değerler UYDURMADIR.
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { korumaliTarayici, yerelSunucu, type FiksturIstegi, type FiksturYaniti } from './giris-fikstur';
import { nobetciApi, nobetciBaslat, type Nobetci, type Yanit } from './nobetci-sunucusu';
import { HIZLI_KDF, izinleriAc } from './platform-ortak';

type Nesne = Record<string, any>;

const SAYFA = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>Başvuru</title>
<style>body{font:14px system-ui;margin:24px}[role=dialog]{border:1px solid #888;padding:16px;margin-top:16px;max-width:520px}[role=dialog][hidden]{display:none}</style></head><body>
<h1>Başvuru</h1>
<label for="ad">Ad</label> <input id="ad" name="ad">
<p><button type="button" id="gonder">Gönder</button></p>
<div id="pencere" role="dialog" aria-modal="true" aria-labelledby="pb" hidden>
  <h2 id="pb">Ek bilgiler</h2>
  <p><label for="ekNot">Açıklama notu</label> <input id="ekNot" name="ekNot"></p>
  <p><label for="ekKod">Referans kodu</label> <input id="ekKod" name="ekKod"></p>
  <p><button type="button" id="onayla">Onayla</button></p>
</div>
<script>
  var $ = function (id) { return document.getElementById(id); };
  $('gonder').addEventListener('click', function () {
    fetch('/api/gonder', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ad: $('ad').value }) })
      .then(function (r) { return r.json(); }).then(function () { $('pencere').hidden = false; });
  });
  ['ekNot', 'ekKod'].forEach(function (id) { $(id).addEventListener('input', function () { fetch('/api/yazildi?alan=' + id, { method: 'POST' }); }); });
  $('onayla').addEventListener('click', function () { fetch('/api/onay', { method: 'POST' }); });
</script></body></html>`;

class Uygulama {
  readonly gonderimler: string[] = [];
  readonly yazilanlar: string[] = [];
  readonly onaylar: number[] = [];
  readonly isle = (i: FiksturIstegi): FiksturYaniti => {
    if (i.yol === '/pencere/' && i.yontem === 'GET') return { tur: 'text/html; charset=utf-8', govde: SAYFA };
    if (i.yol === '/api/gonder' && i.yontem === 'POST') { this.gonderimler.push(i.govde); return { tur: 'application/json', govde: '{"tamam":true}', gecikmeMs: 300 }; }
    if (i.yol === '/api/yazildi' && i.yontem === 'POST') { this.yazilanlar.push(i.sorgu.get('alan') ?? ''); return { tur: 'application/json', govde: '{}' }; }
    if (i.yol === '/api/onay' && i.yontem === 'POST') { this.onaylar.push(Date.now()); return { tur: 'application/json', govde: '{}' }; }
    return { durum: 404, tur: 'text/plain', govde: 'yok' };
  };
}

test.describe.configure({ mode: 'serial' });
const PAROLA = `Gecici-Doldurmadan-${randomBytes(6).toString('hex')}`;
let nobetci: Nobetci;
const u = new Uygulama();
let fikstur: Awaited<ReturnType<typeof yerelSunucu>>;
let klasor = '';
let projeId = '';
let ortamId = '';
const api = (yol: string, govde?: Nesne): Promise<Yanit> => nobetciApi(nobetci, yol, govde);
async function basarili(yol: string, govde?: Nesne): Promise<Yanit> {
  const y = await api(yol, govde);
  expect(y.basarili, `${yol}: ${y.mesaj ?? ''} ${JSON.stringify(y).slice(0, 400)}`).toBe(true);
  return y;
}
async function bekle(id: string, durumlar: string[], sn = 120): Promise<Nesne> {
  const son = Date.now() + sn * 1000;
  for (;;) {
    const o = (await api(`/platform/hizli-test/durum?id=${id}`)).oturum as Nesne;
    if (durumlar.includes(o.durum)) return o;
    if (o.durum === 'kesifOnay') { await api('/platform/hizli-test/onay', { id, cevap: false }); continue; }
    if (['hata', 'iptal'].includes(o.durum) || Date.now() > son) throw new Error(`beklenen ${durumlar.join('/')}, olan ${o.durum}: ${JSON.stringify(o.hata ?? o.sonHata)} ${JSON.stringify(o.gunluk?.slice(-6))}`);
    await new Promise((c) => setTimeout(c, 300));
  }
}
const tasmaYok = async (page: Page): Promise<void> => {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
};

test.beforeAll(async () => {
  test.setTimeout(120_000);
  klasor = mkdtempSync(join(tmpdir(), 'doldurmadan-'));
  fikstur = await yerelSunucu(u.isle);
  const vtYolu = join(klasor, 'platform.db');
  const vt = await veritabaniniHazirla(vtYolu);
  await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
  izinleriAc(vt);
  vt.kapat();
  nobetci = await nobetciBaslat(klasor, vtYolu, { NOBETCI_KAYIT_BASSIZ: '1', NOBETCI_TARAMA_IZINLI_KOKENLER: fikstur.adres, NOBETCI_KAYIT_ZAMAN_ASIMI_SN: '600', NOBETCI_REHBER_OTOMATIK: '0' });
  await basarili('/platform/kasa/ac', { parola: PAROLA });
  projeId = String(((await basarili('/platform/proje/kaydet', { ad: 'Doldurmadan Projesi' })).proje as Nesne).id);
  ortamId = String(((await basarili('/platform/ortam/kaydet', { projeId, ad: 'Deneme', tabanUrl: fikstur.adres, varsayilan: true, riskli: false })).ortam as Nesne).id);
});
test.afterAll(async () => {
  nobetci?.surec.kill('SIGTERM');
  await fikstur?.kapat();
  if (klasor) rmSync(klasor, { recursive: true, force: true });
});

test('basıştan sonra açılan pencerede "Doldurmadan burada bitir" → bitiş (pencere bitti) → kayıt; normal koşu pencere görününce başarılı, pencere alanlarına yazmaz', async () => {
  test.setTimeout(600_000);
  const id = String((await basarili('/platform/hizli-test/baslat', {
    projeId, ortamId, hedef: '/pencere/', ekranAdi: 'Pencere', izin: 'evet', cumle: 'Gönder düğmesine bas'
  })).id);
  let o = await bekle(id, ['veri'], 300);
  // İlk veri durağı (basış yok): düğme yok.
  expect(o.soru.doldurmadanBitir).toBe(false);
  // Basış yokken istek reddedilir.
  expect(await api('/platform/hizli-test/karar', { id, karar: 'doldurmadanBitir' })).toMatchObject({ basarili: false });
  const ad = (o.soru.alanlar as Nesne[]).find((a) => a.etiket === 'Ad') as Nesne;
  await basarili('/platform/hizli-test/veri', { id, degerler: { [ad.anahtar]: { deger: 'Deneme', kaynak: 'elle' } } });
  o = await bekle(id, ['veri', 'karar'], 180);
  if (o.durum === 'karar') {
    const aday = (o.soru.adaylar as Nesne[]).find((a) => a.metin === 'Gönder');
    await basarili('/platform/hizli-test/karar', { id, karar: 'bas', secici: aday?.secici });
    o = await bekle(id, ['veri'], 180);
  }
  expect(u.gonderimler.length).toBe(1);
  expect((o.soru.alanlar as Nesne[]).map((a) => a.etiket)).toEqual(['Açıklama notu', 'Referans kodu']);
  expect(o.soru.doldurmadanBitir).toBe(true);

  // Arayüz: düğme görünür (1440 / 390 taşma yok); basınca bitiş adımı, açılan pencere önerisiyle.
  const tarayici = await korumaliTarayici();
  try {
    const page = await (await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1440, height: 900 } })).newPage();
    const hatalar: string[] = [];
    page.on('pageerror', (e) => hatalar.push(String(e)));
    await page.goto(`/#/hizli-test/o/${id}`);
    const soru = page.locator('.hizli-soru');
    await expect(soru.getByRole('heading', { name: /veri gerekli/ })).toBeVisible({ timeout: 30_000 });
    const dugme = soru.getByRole('button', { name: 'Doldurmadan burada bitir' });
    await expect(dugme).toBeVisible();
    await tasmaYok(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(dugme).toBeVisible();
    await tasmaYok(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await dugme.click();
    const pencere = page.locator('#hizli-bitis-pencere');
    await expect(pencere).toBeVisible({ timeout: 30_000 });
    await expect(pencere).toContainText('Açılan pencere görününce bitti');
    await expect(page.locator('#hizli-bitis-oge-sec')).toBeVisible();
    await tasmaYok(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(pencere).toBeVisible();
    await tasmaYok(page);
    expect(hatalar).toEqual([]);
  } finally { await tarayici.close(); }

  // Pencere alanlarına hiçbir şey yazılmadı, pencerenin düğmesine basılmadı.
  expect(u.yazilanlar).toEqual([]);
  expect(u.onaylar).toEqual([]);
  o = await bekle(id, ['bitis']);
  expect(o.soru.pencereOnerisi).toMatchObject({ metin: 'Ek bilgiler' });
  const secici = String(o.soru.pencereOnerisi.secici);
  await basarili('/platform/hizli-test/bitis-ekle', { id, pencere: true });
  o = await bekle(id, ['bitis']);
  const etiketsiz = Object.fromEntries(Object.keys(o.soru.etiketler).map((m) => [m, null]));
  await basarili('/platform/hizli-test/bitis', { id, etiketler: etiketsiz, ogeler: [secici] });
  await bekle(id, ['kaydet']);
  const baslik = 'Pencere açılınca biter';
  const oz = (await basarili('/platform/hizli-test/ozet', { id, baslik })).ozet as Nesne;
  expect(oz.sorunlar).toEqual([]);
  // Durağın soruları tablolara girmez.
  expect(JSON.stringify(oz.onizleme)).not.toMatch(/Açıklama notu|Referans kodu/);
  const k = await basarili('/platform/hizli-test/kaydet', { id, baslik, secim: oz.secim });
  expect(k.kaydedildi).toBe(true);
  // Model ve senaryo: pencere alanları yok; son adımın başarı göstergesi pencere.
  const model = ((await api(`/platform/ekran?projeId=${projeId}&id=${String(k.ekranId)}`)) as Nesne).model as Nesne;
  expect(JSON.stringify(model)).not.toMatch(/#ekNot|#ekKod|Açıklama notu|Referans kodu/);
  expect(model.adimlar[model.adimlar.length - 1].kosu.basariGostergesi).toEqual({ tur: 'eleman', deger: secici });
  const detay = (await basarili(`/platform/senaryo?id=${String(k.senaryoId)}&ortamId=${ortamId}`)).senaryo as Nesne;
  expect(JSON.stringify(detay.veri)).not.toMatch(/ekNot|ekKod/);
  const tablolar = (await basarili(`/platform/tablolar?projeId=${projeId}`)).tablolar as Nesne[];
  expect(JSON.stringify(tablolar.map((t) => t.sutunlar))).not.toMatch(/Açıklama notu|Referans kodu/);

  // Normal koşu: Gönder → pencere görününce başarılı; pencere alanlarına yazmaz.
  const once = u.gonderimler.length;
  const y = await api('/platform/senaryolar/calistir', { projeId, kosuId: `kosu-${randomBytes(6).toString('hex')}`, senaryoId: k.senaryoId, ortamId });
  expect(y.basarili, y.mesaj).toBe(true);
  const sonuc = (await api(`/platform/sonuclar/sonuc?id=${String(y.sonucId)}`)).sonuc as Nesne;
  expect(sonuc.durum, JSON.stringify(sonuc.hataMesaji).slice(0, 400)).toBe('basarili');
  expect(u.gonderimler.length).toBe(once + 1);
  expect(JSON.parse(String(u.gonderimler.at(-1)))).toEqual({ ad: 'Deneme' });
  expect(u.yazilanlar).toEqual([]);
  expect(u.onaylar).toEqual([]);
});
