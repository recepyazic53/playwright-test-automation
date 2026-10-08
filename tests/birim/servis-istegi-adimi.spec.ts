// SERVİS İSTEĞİ ADIMI (ekran akışında "+ > Servis isteği"; servisler/servis-adimi.mjs). Ekran adımından sonra servisin kayıtlı senaryosu
// şablon olarak çalışır: atama şablondaki ${TC}'yi ekranın değeriyle değiştirir, yanıttan okunan "No" sonraki servis adımında ${akis:No}
// olur, koşulu tutmayan adım atlanır, kontrol tutmazsa adım (ve senaryo) kalır. Akış tasarımı → model → plan → diyagram gidiş-dönüşü.
// Güvenlik: yalnız 127.0.0.1'deki sahte ekran + sahte REST servisi; geçici veritabanı. Değerler UYDURMADIR.
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { ortamKaydet, projeKaydet, veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { servisKaydet, servisSenaryosuKaydet } from '../../scripts/platform/servisler/servis-deposu.mjs';
import { atamalariCoz, atamalariUygula, servisTanimiDogrula } from '../../scripts/platform/servisler/servis-adimi.mjs';
import { akistanKayitEnvanteri, type AkisEnvanteri } from '../../scripts/platform/tarama/akis-tasarimi.mjs';
import { kayitPaketiOlustur, type HamAlan } from '../../scripts/platform/tarama/paket-olusturucu.mjs';
import { adimlardanBloklar, modeldenAkisEnvanteri } from '../../scripts/platform/ekranlar/akis-servisi.mjs';
import { sayfaPaketiniDogrula } from '../../scripts/platform/ekranlar/sayfa-paketi.mjs';
import { modelKosuPlani } from '../../scripts/platform/senaryolar/model-kosusu.mjs';
import { korumaliTarayici } from './giris-fikstur';
import { nobetciApi, nobetciBaslat, type Nobetci } from './nobetci-sunucusu';
import { HIZLI_KDF, izinleriAc } from './platform-ortak';

type Nesne = Record<string, any>;

test('saf: tanım doğrulama, atamaların çözümü ve şablona uygulanması', () => {
  expect(servisTanimiDogrula({}).hatalar).toEqual(['Servisi seçin.', 'Şablon olarak kullanılacak servis senaryosunu seçin.']);
  const d = servisTanimiDogrula({ servisId: 's1', senaryoId: 'k1', atamalar: [{ bul: '${TC}', deger: '${tc}' }, { bul: '', deger: '' }], okumalar: [{ ad: 'No', yol: 'no', kaynak: 'json' }, { ad: '1x', yol: 'a' }] });
  expect(d.hatalar).toEqual(['Okuma adı geçersiz: "1x" (harfle başlamalı; harf, rakam, _ . -).']);
  expect(d.tanim).toEqual({ servisId: 's1', senaryoId: 'k1', atamalar: [{ bul: '${TC}', deger: '${tc}' }], okumalar: [{ ad: 'No', yol: 'no', kaynak: 'json' }] });
  // Okumanın "Kullanılacağı alanlar"ı: metin olmayan / boş / tekrar atılır, kırpılır; boşsa anahtar hiç yazılmaz.
  const h = servisTanimiDogrula({ servisId: 's1', senaryoId: 'k1', okumalar: [{ ad: 'No', yol: 'no', hedefAlanlar: [' no ', 'no', '', 3, 'dogum'] }, { ad: 'Durum', yol: 'durum', hedefAlanlar: [] }] });
  expect(h.tanim.okumalar).toEqual([{ ad: 'No', yol: 'no', hedefAlanlar: ['no', 'dogum'] }, { ad: 'Durum', yol: 'durum' }]);
  const c = atamalariCoz([{ bul: '${TC}', deger: 'x-${tc}-${akis:No}' }, { bul: 'Y', deger: '${yok}' }], (i) => ({ tc: '11', 'akis:No': 'N1' } as Record<string, string>)[i]);
  expect(c).toEqual({ atamalar: [{ bul: '${TC}', deger: 'x-11-N1' }, { bul: 'Y', deger: '${yok}' }], eksik: ['yok'] });
  const u = atamalariUygula({ govde: '{"tc":"${TC}","t":"${TC}"}', http: { metot: 'POST', yol: '/k/${TC}' }, basliklar: { X: '${TC}' } }, [{ bul: '${TC}', deger: '11' }, { bul: 'YOK', deger: '1' }]);
  expect(u).toEqual({ icerik: { govde: '{"tc":"11","t":"11"}', http: { metot: 'POST', yol: '/k/11' }, basliklar: { X: '11' } }, bulunamayan: ['YOK'] });
});

const ham = (anahtar: string, etiket: string): HamAlan => ({
  anahtar, tur: 'text', etiket, etiketKaynagi: 'label', kimlik: anahtar.slice(1), ad: null, secici: anahtar, kirilganlik: 'dusuk', adaySeciciler: [anahtar],
  zorunlu: false, devreDisi: false, saltOkunur: false, coklu: false, bolum: { anahtar: 'b', baslik: 'Kayıt' }
});
const ENV: AkisEnvanteri = {
  kip: 'kayit', bicim: 'akis', profil: null, baslik: 'Kayıt', alanlar: [{ alan: ham('#tc', 'TC'), secili: true }],
  dugmeler: [{ secici: '#kaydet', metin: 'Kaydet' }], mesajlar: [], olaylar: [], engellenenler: [], notlar: []
};
const META = { ekranAnahtari: 'kayit', ekranAdi: 'Kayıt', urlYolu: '/kayit', girisGerekli: false, girissiz: true, ikiAsamali: 'yok' as const, baglamTuru: null };

test('akış tasarımı: servis bloğu modele (servisKontrolu) ve plana geçer, koşulu görünürlük olur, diyagrama geri döner; sıra kuralı', () => {
  const servis = { servisId: 's1', senaryoId: 'k1', atamalar: [{ bul: '${TC}', deger: '${tc}' }] };
  const { envanter: k, hatalar } = akistanKayitEnvanteri(ENV, [
    { tur: 'alanlar', ad: 'Kayıt', alanlar: ['#tc'], zorunlu: [] }, { tur: 'aksiyon', dugme: 0, istegeBagli: false },
    { tur: 'servis', ad: 'Serviste var', servis, kosul: { bag: 've', satirlar: [{ alan: '#tc', islem: 'dolu', degerler: [] }] } }, { tur: 'bitir' }
  ]);
  expect(hatalar).toEqual([]);
  const paket = kayitPaketiOlustur(META, k as NonNullable<typeof k>).paket;
  expect(sayfaPaketiniDogrula(paket, {})).toMatchObject({ gecerli: true, hatalar: [] });
  const m = paket.model as Nesne;
  expect(m.adimlar[1]).toMatchObject({ baslik: 'Serviste var', servisKontrolu: servis, gorunurluk: { kosul: expect.any(String) } });
  expect(modelKosuPlani(m, { tc: '1' }).adimlar[1]).toMatchObject({ servis, dahil: true });
  expect(modelKosuPlani(m, {}).adimlar[1]).toMatchObject({ dahil: false });
  expect((adimlardanBloklar(m, m.adimlar, modeldenAkisEnvanteri(m)) as Nesne[]).find((b) => b.tur === 'servis')).toMatchObject({ ad: 'Serviste var', servis, kosul: expect.any(Object) });
  // Alan grubundan hemen sonra (ilerleme düğmesi olmadan) gelemez; eksik tanım hata.
  const h = akistanKayitEnvanteri(ENV, [{ tur: 'alanlar', ad: 'Kayıt', alanlar: ['#tc'], zorunlu: [] }, { tur: 'servis', ad: 'X', servis: {} }, { tur: 'bitir' }]).hatalar.map((x) => x.mesaj);
  expect(h).toEqual(expect.arrayContaining(['Servisi seçin.']));
});

const SAYFA = `<!doctype html><html lang="tr"><body><h1>Kayıt</h1>
<label for="tc">TC</label><input id="tc"> <button id="kaydet" type="button">Kaydet</button><div id="durum"></div>
<label for="no">Kayıt no</label><input id="no"> <button id="onayla" type="button">Onayla</button><div id="onay"></div>
<script>document.getElementById('kaydet').addEventListener('click', function () { document.getElementById('durum').textContent = 'Kaydedildi'; });
document.getElementById('onayla').addEventListener('click', function () { document.getElementById('onay').textContent = 'Onaylandı: ' + document.getElementById('no').value; });</script></body></html>`;

test.describe('gerçek koşu (sahte ekran + sahte REST servisi)', () => {
  test.describe.configure({ mode: 'serial' });
  const PAROLA = `Gecici-Servis-${randomBytes(6).toString('hex')}`;
  let nobetci: Nobetci;
  let sunucu: Server;
  let adres = '';
  let klasor = '';
  let projeId = '';
  let ortamId = '';
  let servisId = '';
  let sablonId = '';
  let ekranId = '';
  const gelenler: Nesne[] = [];
  const api = (yol: string, govde?: Nesne) => nobetciApi(nobetci, yol, govde) as Promise<Nesne>;
  const basarili = async (yol: string, govde?: Nesne): Promise<Nesne> => {
    const y = await api(yol, govde);
    expect(y.basarili, `${yol}: ${String(y.mesaj ?? '')} ${JSON.stringify(y.hatalar ?? '')}`).toBe(true);
    return y;
  };
  const kos = async (baslik: string, tc: string, no = '${akis:No}'): Promise<Nesne> => {
    const yeni = await basarili('/platform/senaryo/kaydet', { projeId, ekranId, baslik, ortamIdleri: [ortamId], veri: { baslik, tc, no } });
    const y = await api('/platform/senaryolar/calistir', { projeId, kosuId: `kosu-${randomUUID()}`, senaryoId: yeni.id, ortamId, canliOnay: true });
    expect(y.basarili, `${baslik}: ${String(y.mesaj ?? '')}`).toBe(true);
    return (await api(`/platform/sonuclar/sonuc?id=${String(y.sonucId)}`)).sonuc as Nesne;
  };

  test.beforeAll(async () => {
    test.setTimeout(150_000);
    klasor = mkdtempSync(join(tmpdir(), 'servis-istegi-'));
    sunucu = createServer((q, r) => {
      const yol = new URL(q.url ?? '/', 'http://127.0.0.1').pathname;
      if (yol === '/kayit') { r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); r.end(SAYFA); return; }
      if (yol === '/api/kayit' && q.method === 'POST') {
        let g = '';
        q.on('data', (p) => { g += p; });
        q.on('end', () => {
          const b = JSON.parse(g || '{}') as Nesne;
          gelenler.push(b);
          r.writeHead(200, { 'Content-Type': 'application/json' });
          r.end(JSON.stringify(b.tc === 'HATA' ? { durum: 'hata' } : { durum: 'ok', no: `NO-${String(b.tc)}`, kimlik: '99999999999' }));
        });
        return;
      }
      r.writeHead(404); r.end();
    });
    await new Promise<void>((c) => sunucu.listen(0, '127.0.0.1', () => c()));
    adres = `http://127.0.0.1:${(sunucu.address() as AddressInfo).port}`;
    const vtYolu = join(klasor, 'platform.db');
    const vt = await veritabaniniHazirla(vtYolu);
    await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
    izinleriAc(vt);
    projeId = projeKaydet(vt, { ad: 'Servis Projesi' });
    ortamId = ortamKaydet(vt, { projeId, ad: 'Deneme', tabanUrl: adres, varsayilan: true, ayarlar: { riskli: false } });
    servisId = servisKaydet(vt, { projeId, anahtar: 'kayit', ad: 'Kayıt servisi', tur: 'rest', ayarlar: { yol: '/api', operasyonlar: [{ ad: 'Kayit', metot: 'POST', yol: '/kayit' }] } });
    sablonId = servisSenaryosuKaydet(vt, { projeId, servisId, baslik: 'Kayıt sorgusu', icerik: {
      operasyon: 'Kayit', govde: '{"tc":"${TC}"}', http: { metot: 'POST', yol: '/kayit', icerikTuru: 'application/json' },
      kontroller: [{ tur: 'durumKodu', deger: '200' }, { tur: 'jsonEsit', yol: 'durum', deger: 'ok' }]
    } });
    vt.kapat();
    nobetci = await nobetciBaslat(klasor, vtYolu, {});
    await basarili('/platform/kasa/ac', { parola: PAROLA });
    const noAlani = { id: 'no', tip: 'metin', etiket: { ekran: 'Kayıt no' }, yapilandirma: 'senaryo', eslesme: { senaryo: 'no' }, konum: { secici: '#no', kirilganlik: 'dusuk' }, zorunlu: false };
    // "Önceki adımdan…": yalnız okumanın "Kullanılacağı alanlar"ında (hedefAlanlar: alan kimlikleri) çıkar; hassas ve tarih alanında da.
    // Hedefi olmayan okuma (Durum) hiçbir alanda önerilmez.
    const kimlikAlani = { id: 'kimlik', tip: 'metin', hassas: true, etiket: { ekran: 'Kimlik no' }, yapilandirma: 'senaryo', eslesme: { senaryo: 'kimlik' }, konum: { secici: '#kimlik', kirilganlik: 'dusuk' }, zorunlu: false };
    const dogumAlani = { id: 'dogum', tip: 'tarih', etiket: { ekran: 'Doğum tarihi' }, yapilandirma: 'senaryo', eslesme: { senaryo: 'dogum' }, konum: { secici: '#dogum', kirilganlik: 'dusuk' }, zorunlu: false };
    const alan = { id: 'tc', tip: 'metin', etiket: { ekran: 'TC' }, yapilandirma: 'senaryo', eslesme: { senaryo: 'tc' }, konum: { secici: '#tc', kirilganlik: 'dusuk' }, zorunlu: false };
    const model = {
      semaSurumu: 2, tur: 'ekran', id: 'kayit', ad: 'Kayıt', aciklama: 'Servis isteği (nötr fikstür).', ekranUrl: '/kayit', girisGerekmez: true,
      specDosyasi: 'yok', pageObject: 'yok (model koşucusu)', veriKaynaklari: { senaryo: 'Nöbetçi' },
      kosullar: { hicbirZaman: { aciklama: 'TC = YOK ise', ifade: { alan: 'tc', esit: 'YOK' } } },
      adimlar: [
        { id: 'form', sira: 1, baslik: 'Kayıt', bolumler: [{ id: 'b', baslik: 'Kayıt', alanlar: [alan] }],
          kosu: { aksiyonlar: [{ tur: 'tikla', secici: '#kaydet', aciklama: 'Kaydet' }], basariGostergesi: { tur: 'metin', deger: 'Kaydedildi', secici: '#durum' }, zamanAsimiSn: 10 } },
        { id: 'servis1', sira: 2, baslik: 'Serviste kayıt var', servisKontrolu: { servisId, senaryoId: sablonId, atamalar: [{ bul: '${TC}', deger: '${tc}' }], okumalar: [{ ad: 'No', yol: 'no', kaynak: 'json', hedefAlanlar: ['no', 'dogum'] }, { ad: 'Kimlik', yol: 'kimlik', kaynak: 'json', gizli: true, hedefAlanlar: ['kimlik'] }, { ad: 'Durum', yol: 'durum', kaynak: 'json' }] } },
        { id: 'servis2', sira: 3, baslik: 'Numarayla sorgu', servisKontrolu: { servisId, senaryoId: sablonId, atamalar: [{ bul: '${TC}', deger: 'tekrar-${akis:No}' }] } },
        { id: 'servis3', sira: 4, baslik: 'Hiç çalışmaz', gorunurluk: { kosul: 'hicbirZaman' }, servisKontrolu: { servisId, senaryoId: sablonId, atamalar: [{ bul: '${TC}', deger: 'ATLANMALI' }] } },
        { id: 'onay', sira: 5, baslik: 'Numara onaylanır', bolumler: [{ id: 'o', baslik: 'Onay', alanlar: [noAlani, kimlikAlani, dogumAlani] }],
          kosu: { aksiyonlar: [{ tur: 'tikla', secici: '#onayla', aciklama: 'Onayla' }], basariGostergesi: { tur: 'metin', deger: 'Onaylandı: NO-12345', secici: '#onay' }, zamanAsimiSn: 10 } }
      ],
      senaryoDuzeyi: { alanlar: [{ id: 'baslik', tip: 'metin', etiket: { ekran: null, form: 'Başlık' }, zorunlu: true, benzersiz: true, yapilandirma: 'senaryo', eslesme: { senaryo: 'baslik' } }] },
      urunDuzeyi: {}, isKurallari: [], bilinmeyenler: []
    };
    await basarili('/platform/sayfa-paketi/ekle', { projeId, senaryoIndeksleri: [], ortamIdleri: [ortamId], paket: {
      tur: 'sayfa-paketi', surum: 1, meta: { ekran: { anahtar: 'kayit', ad: 'Kayıt', urlYolu: '/kayit' }, olusturan: 'test', olusturulma: '2026-10-06T09:00:00Z', baglamProfilleri: [] },
      model, senaryoOnerileri: [], gerekenAyarlar: { girisGerekli: false, ikiAsamaliDogrulama: 'yok', captchaGoruldu: false, testVerisiTurleri: [] }, bilinmeyenler: []
    } });
    ekranId = String(((await api(`/platform/senaryolar?projeId=${projeId}&ortamId=${ortamId}`)).ekranlar as Nesne[]).find((e) => e.ad === 'Kayıt')?.id);
  });
  test.afterAll(async () => {
    nobetci?.surec.kill('SIGTERM');
    await new Promise((c) => sunucu?.close(c));
    if (klasor) rmSync(klasor, { recursive: true, force: true });
  });

  test('ekrandan sonra servis isteği: atama ekranın değerini yazar, okunan değer sonraki istekte kullanılır, koşulsuz kalan adım atlanır', async () => {
    test.setTimeout(240_000);
    const once = gelenler.length;
    const s = await kos('Kayıtlı TC', '12345');
    expect(s.durum, JSON.stringify(s.hataMesaji).slice(0, 400)).toBe('basarili');
    expect(gelenler.slice(once)).toEqual([{ tc: '12345' }, { tc: 'tekrar-NO-12345' }]);
    // Ekran alanının değeri ${akis:No}: servisin yanıtından okunan numara sonraki ekran adımında alana yazılır (başarı metni
    // "Onaylandı: NO-12345" ancak öyle görünür).
    expect((s.adimlar as Nesne[]).map((a) => [a.ad, a.durum])).toContainEqual(['Numara onaylanır', 'basarili']);
    // Servisin geçmişinde "Dene" olarak görünür.
    const kosular = (await api(`/platform/servis/kosular?projeId=${projeId}&servisId=${servisId}`)) as Nesne;
    expect(JSON.stringify(kosular)).toContain('ekran koşusu');
  });

  test('ekran alanında okunmamış ${akis:…}: alan yazılmaz, adım hangi değerin okunmadığını söyleyerek kalır', async () => {
    test.setTimeout(240_000);
    const s = await kos('Okunmamış değer', '777', '${akis:Yok}');
    expect(s.durum).toBe('basarisiz');
    expect(String(s.hataMesaji)).toContain('${akis:Yok} okunmadı');
  });

  test('kontrol tutmazsa adım ve senaryo kalır; mesaj hangi kontrolün tutmadığını söyler', async () => {
    test.setTimeout(240_000);
    const s = await kos('Hatalı TC', 'HATA');
    expect(s.durum).toBe('basarisiz');
    expect(String(s.hataMesaji)).toContain('Serviste kayıt var: servis isteği başarısız');
    expect(String(s.hataMesaji)).toContain('durum');
  });

  test('arayüz: senaryo formunda alanın değeri önceki adımda okunan değer olur ("Önceki adımdan…" → ${akis:Ad} rozeti; yalnız okumanın hedef alanlarında; okumadan önceki alanda seçim yok)', async () => {
    test.setTimeout(120_000);
    const tarayici = await korumaliTarayici();
    try {
      const page = await (await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1280, height: 1200 } })).newPage();
      const hatalar: string[] = [];
      page.on('pageerror', (e) => hatalar.push(String(e)));
      await page.goto(`/#/senaryolar/yeni/${encodeURIComponent(ekranId)}`);
      const no = page.locator('[data-alan="no"]');
      const secim = no.getByRole('combobox', { name: 'Kayıt no: önceki adımda okunan değer' });
      await expect(secim).toBeVisible();
      // Yalnız bu alanı hedefleyen okuma listelenir (Kimlik başka alanın, Durum'un hedefi yok).
      expect(await secim.locator('option').allTextContents()).toEqual(['Önceki adımdan…', 'No (Serviste kayıt var)']);
      await expect(page.locator('[data-alan="tc"]').getByRole('combobox', { name: /önceki adımda okunan değer/ })).toHaveCount(0);
      await secim.selectOption({ label: 'No (Serviste kayıt var)' });
      await expect(no).toContainText('Önceki adımdan: No');
      await expect(no).toContainText('Serviste kayıt var adımında okunur');
      await no.getByRole('button', { name: 'Kayıt no: önceki adımdan almayı kaldır' }).click();
      await expect(no.getByRole('textbox')).toHaveValue('');
      // Hassas alan (Kimlik no): seçim çıkar, yalnız onu hedefleyen okuma (gizli olan işaretli).
      const kimlik = page.locator('[data-alan="kimlik"]');
      const kimlikSecimi = kimlik.getByRole('combobox', { name: 'Kimlik no: önceki adımda okunan değer' });
      await expect(kimlikSecimi).toBeVisible();
      expect(await kimlikSecimi.locator('option').allTextContents()).toEqual(['Önceki adımdan…', 'Kimlik (Serviste kayıt var) · gizli']);
      await kimlikSecimi.selectOption({ label: 'Kimlik (Serviste kayıt var) · gizli' });
      await expect(kimlik).toContainText('Önceki adımdan: Kimlik');
      await kimlik.getByRole('button', { name: 'Kimlik no: önceki adımdan almayı kaldır' }).click();
      // Tarih alanı: hedefleyen okuma (No) listelenir.
      const dogum = page.locator('[data-alan="dogum"]');
      const dogumSecimi = dogum.getByRole('combobox', { name: 'Doğum tarihi: önceki adımda okunan değer' });
      await expect(dogumSecimi).toBeVisible();
      expect(await dogumSecimi.locator('option').allTextContents()).toEqual(['Önceki adımdan…', 'No (Serviste kayıt var)']);
      await dogumSecimi.selectOption({ label: 'No (Serviste kayıt var)' });
      await expect(dogum).toContainText('Önceki adımdan: No');
      expect(hatalar).toEqual([]);
    } finally { await tarayici.close(); }
  });

  test('arayüz: akış diyagramında "Servis isteği" bloğu — servis + şablon senaryo seçilir, şablondaki değişken atamaya eklenir; kaydedince modelde', async () => {
    test.setTimeout(180_000);
    const tarayici = await korumaliTarayici();
    try {
      const page = await (await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1440, height: 1400 } })).newPage();
      const hatalar: string[] = [];
      page.on('pageerror', (e) => hatalar.push(String(e)));
      await page.goto(`/#/ekranlar/e/${encodeURIComponent(ekranId)}/akis`);
      await page.getByRole('button', { name: 'Düzenle' }).click();
      const ekleDugmeleri = page.getByRole('button', { name: 'Buraya blok ekle' });
      await ekleDugmeleri.nth((await ekleDugmeleri.count()) - 1).click();
      await page.getByRole('group', { name: 'Eklenecek blok' }).getByRole('button', { name: 'Servis isteği' }).click();
      await page.getByRole('textbox', { name: 'Servis isteği adımının adı' }).last().fill('Arayüzden servis');
      await page.getByRole('combobox', { name: 'Servis', exact: true }).last().selectOption({ label: 'Kayıt servisi (REST)' });
      await page.getByRole('combobox', { name: 'Şablon senaryo' }).last().selectOption({ label: 'Kayıt sorgusu' });
      await page.getByRole('button', { name: '${TC}' }).last().click();
      await page.getByRole('textbox', { name: '1. atama: yeni değer' }).last().fill('${tc}');
      await page.getByRole('button', { name: 'Değişiklikleri kaydet' }).click();
      const onay = page.locator('dialog.onay-diyalogu');
      await onay.getByRole('button', { name: 'Kaydet', exact: true }).click();
      await expect(page.getByRole('heading', { name: /Akışı düzenle/ })).toBeHidden({ timeout: 20_000 });
      const m = (await api(`/platform/ekran?projeId=${projeId}&id=${ekranId}`)).model as Nesne;
      const adim = (m.adimlar as Nesne[]).find((a) => a.baslik === 'Arayüzden servis');
      expect(adim?.servisKontrolu).toEqual({ servisId, senaryoId: sablonId, atamalar: [{ bul: '${TC}', deger: '${tc}' }] });
      expect(hatalar).toEqual([]);
    } finally { await tarayici.close(); }
  });

  test('arayüz: akış diyagramında okumanın "Kullanılacağı alanlar"ı — yalnız sonraki alanlar listelenir, seçim kaydedilir, diğer hedefler korunur', async () => {
    test.setTimeout(180_000);
    const tarayici = await korumaliTarayici();
    try {
      const page = await (await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1440, height: 1400 } })).newPage();
      const hatalar: string[] = [];
      page.on('pageerror', (e) => hatalar.push(String(e)));
      await page.goto(`/#/ekranlar/e/${encodeURIComponent(ekranId)}/akis`);
      await page.getByRole('button', { name: 'Düzenle' }).click();
      // "Serviste kayıt var" bloğunun 3. okuması (Durum): hedefi yok → "seçilmedi"; seçenekler yalnız bloktan sonraki alanlar.
      const hedefler = (n: number) => page.locator('.servis-okumasi').filter({ has: page.getByRole('textbox', { name: `${n}. okuma: ad` }) }).locator('details.okuma-hedefleri');
      const ozet = hedefler(3);
      const grup = ozet.getByRole('group', { name: '3. okuma: kullanılacağı alanlar' });
      await expect(ozet.locator('summary')).toContainText('seçilmedi — senaryoda önerilmez');
      await ozet.locator('summary').click();
      expect(await grup.locator('label').allTextContents()).toEqual(['Kayıt no', 'Kimlik no', 'Doğum tarihi']);
      await grup.getByRole('checkbox', { name: 'Kayıt no' }).check();
      await expect(ozet.locator('summary')).toContainText('Kullanılacağı alanlar: Kayıt no');
      // 1. okuma (No): kayıtlı hedefler işaretli görünür.
      await expect(hedefler(1).locator('summary')).toContainText('Kayıt no, Doğum tarihi');
      await page.getByRole('button', { name: 'Değişiklikleri kaydet' }).click();
      await page.locator('dialog.onay-diyalogu').getByRole('button', { name: 'Kaydet', exact: true }).click();
      await expect(page.getByRole('heading', { name: /Akışı düzenle/ })).toBeHidden({ timeout: 20_000 });
      const m = (await api(`/platform/ekran?projeId=${projeId}&id=${ekranId}`)).model as Nesne;
      const adim = (m.adimlar as Nesne[]).find((a) => a.baslik === 'Serviste kayıt var');
      expect(adim?.servisKontrolu.okumalar).toEqual([
        { ad: 'No', yol: 'no', kaynak: 'json', hedefAlanlar: ['no', 'dogum'] },
        { ad: 'Kimlik', yol: 'kimlik', kaynak: 'json', gizli: true, hedefAlanlar: ['kimlik'] },
        { ad: 'Durum', yol: 'durum', kaynak: 'json', hedefAlanlar: ['no'] }
      ]);
      expect(hatalar).toEqual([]);
    } finally { await tarayici.close(); }
  });
});
