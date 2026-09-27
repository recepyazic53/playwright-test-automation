// UÇTAN UCA (yerel) — model koşucusunun ek doldurma kuralları: "degerJs" (gizli <select> / gizli girdi: değer betikle yazılır),
// kapalı (disabled) alanın atlanması, kimlik profilindeki değerin dilimlenmesi (telefon → ilk 3 hane / kalanı) ve alan
// beklemesi sırasında adımın hata penceresi açılınca zaman aşımını beklemeden düşme; zorla işaretlenecek seçenek sayfada yoksa test
// süresini beklemeden açık hata. Sahte sayfa (girişsiz; 127.0.0.1),
// geçici Nöbetçi örneği. Şirket sitesine istek yoktur.
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { yerelSunucu, type FiksturIstegi, type FiksturYaniti } from './giris-fikstur';
import { nobetciApi, nobetciBaslat, type Nobetci } from './nobetci-sunucusu';
import { HIZLI_KDF, izinleriAc } from './platform-ortak';

type Nesne = Record<string, unknown>;
const PAROLA = `Gecici-Kosucu-${randomBytes(6).toString('hex')}`;
const KISI = { tcKimlikNo: '10000000146', cepTelefonu: '532 111 22 33' };
const HATA = 'Kimlik sorgusu yapılamadı: servis yanıt vermiyor.';

let nobetci: Nobetci;
let fikstur: Awaited<ReturnType<typeof yerelSunucu>>;
let klasor = '';
let projeId = '';
let ortamId = '';
let ekranId = '';
const gonderimler: Nesne[] = [];

const html = (govde: string): FiksturYaniti => ({ tur: 'text/html; charset=utf-8', govde: `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>Form</title></head><body>${govde}</body></html>` });
const sayfa = (): FiksturYaniti => html(`<h1>Başvuru</h1>
  <select id="gizliListe" style="display:none"><option value="">Seçiniz</option><option value="10">Mesken</option><option value="20">İşyeri</option></select>
  <input type="hidden" id="gizliKod">
  <label>Kapalı <input id="kapali" disabled></label>
  <span>Sahip <input type="radio" name="sahip" id="sahip-E" value="E" style="display:none"><input type="radio" name="sahip" id="sahip-H" value="H" style="display:none"></span>
  <span>Ek <input type="checkbox" id="ek" style="display:none"></span><input type="hidden" id="sahipIsleyici">
  <label>Tarih <input id="tarih"></label><div id="katman" style="display:none;position:fixed;inset:0;z-index:99;background:rgba(0,0,0,.01)"></div>
  <label>Kimlik no <input id="kimlik"></label><button id="sorgula" type="button">Sorgula</button><span id="ad"></span>
  <label>Tel kodu <input id="telKodu"></label><label>Tel no <input id="telNo"></label>
  <button id="gonder" type="button">Gönder</button><p id="sonuc"></p><div id="hata" hidden></div>
  <script>
    const $ = (id) => document.getElementById(id);
    // Takvim benzeri katman: tarih alanına odaklanınca açılır, sayfanın üstünü kapatır (kendiliğinden kapanmaz).
    // Gizli radyonun kendi tıklama işleyicisi (özel çizimli kutular gibi): betikle tıklanınca da çalışmalı.
    for (const r of document.getElementsByName('sahip')) r.onclick = () => { $('sahipIsleyici').value = 'tiklandi:' + r.value; };
    $('tarih').addEventListener('focus', () => { $('katman').style.display = 'block'; });
    // Sorgu: kimlik "99…" ile başlarsa hata penceresi açılır, ad hiç dolmaz.
    $('sorgula').onclick = () => setTimeout(() => {
      if ($('kimlik').value.startsWith('99')) { $('hata').textContent = ${JSON.stringify(HATA)}; $('hata').hidden = false; }
      else $('ad').textContent = 'KİŞİ ' + $('kimlik').value.slice(-3);
    }, 200);
    $('gonder').onclick = async () => {
      const g = { liste: $('gizliListe').value, gizliKod: $('gizliKod').value, kapali: $('kapali').value, kimlik: $('kimlik').value, ad: $('ad').textContent,
        telKodu: $('telKodu').value, telNo: $('telNo').value,
        sahip: document.querySelector('[name=sahip]:checked')?.value ?? '', sahipIsleyici: $('sahipIsleyici').value, ek: $('ek').checked };
      await fetch('/gonder', { method: 'POST', body: JSON.stringify(g) });
      $('sonuc').textContent = 'Başvuru alındı.';
    };
  </script>`);
const uygulama = (i: FiksturIstegi): FiksturYaniti => {
  if (i.yol === '/form/' || i.yol === '/form') return sayfa();
  if (i.yol === '/gonder' && i.yontem === 'POST') { gonderimler.push(JSON.parse(i.govde || '{}') as Nesne); return { tur: 'application/json', govde: '{}' }; }
  return { durum: 404, tur: 'text/plain', govde: 'yok' };
};

const alan = (id: string, tip: string, etiket: string, secici: string, ek: Nesne = {}) => ({
  id, tip, etiket: { ekran: etiket }, yapilandirma: 'senaryo', eslesme: { senaryo: id }, konum: { secici, kirilganlik: 'orta' }, zorunlu: false, ...ek
});
function paket(): Nesne {
  const model = {
    semaSurumu: 2, tur: 'ekran', id: 'basvuru', ad: 'Başvuru', aciklama: 'Koşucu ek kuralları denemesi', ekranUrl: '/form/', girisGerekmez: true,
    specDosyasi: 'tests/scenarios/basvuru/basvuru.spec.ts', pageObject: 'yok', veriKaynaklari: { senaryo: 'Nöbetçi' }, kosullar: {},
    adimlar: [
      {
        id: 'bilgiler', sira: 1, baslik: 'Bilgiler girilir',
        bolumler: [{ id: 'b', baslik: 'Bilgiler', alanlar: [
          alan('liste', 'secim', 'Kullanım', '#gizliListe', { doldurucu: 'degerJs', secenekler: null, seceneklerDurumu: 'bilinmiyor' }),
          alan('gizliKod', 'metin', 'Gizli kod', '#gizliKod', { doldurucu: 'degerJs' }),
          alan('kapali', 'metin', 'Kapalı alan', '#kapali'),
          alan('sahip', 'radyo', 'Sahip', '#sahip-E', { doldurucu: 'radyoZorla', seceneklerDurumu: 'tam', secenekler: [
            { deger: 'E', metin: 'Evet', secici: '#sahip-E' }, { deger: 'H', metin: 'Hayır', secici: '#sahip-H' }, { deger: 'K', metin: 'Kiracı', secici: '#sahip-K' }] }),
          alan('ek', 'onayKutusu', 'Ek', '#ek', { doldurucu: 'onayKutusuZorla' }),
          alan('tarih', 'metin', 'Tarih', '#tarih', { doldurucuParametreleri: { gizle: '#katman' } }),
          {
            id: 'kisi', tip: 'kimlikProfili', kimlikTuru: 'ozel', etiket: { ekran: null, form: 'Kişi' }, zorunlu: true, yapilandirma: 'senaryo',
            eslesme: { senaryo: ['kisiKimligi', 'kisiProfili'], profilHavuzu: 'Bireysel kişi' },
            altAlanlar: [
              { id: 'kisiTc', tip: 'metin', sira: 1, etiket: { ekran: 'Kimlik no' }, eslesme: { kimlikAlani: 'tcKimlikNo' }, konum: { secici: '#kimlik', kirilganlik: 'orta' },
                doldurucuParametreleri: { tikla: '#sorgula', bekle: { secici: '#ad', durum: 'dolu', zamanAsimiSn: 20 } } },
              { id: 'kisiTelKodu', tip: 'metin', sira: 2, etiket: { ekran: 'Tel kodu' }, eslesme: { kimlikAlani: { ad: 'cepTelefonu', dilim: [0, 3] } }, konum: { secici: '#telKodu', kirilganlik: 'orta' } },
              { id: 'kisiTelNo', tip: 'metin', sira: 3, etiket: { ekran: 'Tel no' }, eslesme: { kimlikAlani: { ad: 'cepTelefonu', dilim: [3] } }, konum: { secici: '#telNo', kirilganlik: 'orta' } }
            ]
          },
          { id: 'gonderDugmesi', tip: 'buton', etiket: { ekran: 'Gönder' }, yapilandirma: 'aksiyon', konum: { secici: '#gonder', kirilganlik: 'orta' } }
        ] }],
        kosu: { aksiyonlar: [{ tur: 'tikla', secici: '#gonder', aciklama: 'Gönder' }], basariGostergesi: { tur: 'metin', deger: 'Başvuru alındı.' }, hataGostergesi: { secici: '#hata' } }
      }
    ],
    senaryoDuzeyi: { alanlar: [{ id: 'baslik', tip: 'metin', etiket: { ekran: null, form: 'Başlık' }, zorunlu: true, benzersiz: true, yapilandirma: 'senaryo', eslesme: { senaryo: 'baslik' } }] },
    urunDuzeyi: {}, isKurallari: [], bilinmeyenler: []
  };
  return {
    tur: 'sayfa-paketi', surum: 1,
    meta: { ekran: { anahtar: 'basvuru', ad: 'Başvuru', urlYolu: '/form/' }, olusturan: 'test', olusturulma: new Date().toISOString(), baglamProfilleri: [], not: 'test' },
    model, senaryoOnerileri: [], gerekenAyarlar: { girisGerekli: false, ikiAsamaliDogrulama: 'yok', captchaGoruldu: false, testVerisiTurleri: [] }, bilinmeyenler: []
  };
}

const api = (yol: string, govde?: Nesne) => nobetciApi(nobetci, yol, govde);
async function basarili(yol: string, govde: Nesne): Promise<Nesne> {
  const y = await api(yol, govde);
  expect(y.basarili, `${yol}: ${String(y.mesaj ?? '')} ${JSON.stringify(y.hatalar ?? '')}`).toBe(true);
  return y;
}
async function kos(baslik: string, veri: Nesne): Promise<Nesne> {
  const yeni = await basarili('/platform/senaryo/kaydet', { projeId, ekranId, baslik, ortamIdleri: [ortamId], veri: { baslik, ...veri } });
  const y = await api('/platform/senaryolar/calistir', { projeId, kosuId: `kosu-${randomUUID()}`, senaryoId: yeni.id, ortamId });
  expect(y.basarili, String(y.mesaj ?? '')).toBe(true);
  return (await api(`/platform/sonuclar/sonuc?id=${String(y.sonucId)}`)).sonuc as Nesne;
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  test.setTimeout(120_000);
  klasor = mkdtempSync(join(tmpdir(), 'kosucu-eksik-'));
  fikstur = await yerelSunucu(uygulama);
  const vtYolu = join(klasor, 'platform.db');
  const vt = await veritabaniniHazirla(vtYolu);
  await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
  // İzinlerden bağımsız davranış sınanıyor: Ayarlar > İzinler (varsayılan kapalı) açılır.
  izinleriAc(vt);
  vt.kapat();
  nobetci = await nobetciBaslat(klasor, vtYolu, {});
  await basarili('/platform/kasa/ac', { parola: PAROLA });
  projeId = String(((await basarili('/platform/proje/kaydet', { ad: 'Koşucu Projesi' })).proje as Nesne).id);
  ortamId = String(((await basarili('/platform/ortam/kaydet', { projeId, ad: 'Deneme', tabanUrl: fikstur.adres, varsayilan: true, riskli: false })).ortam as Nesne).id);
  const tur = String((await basarili('/platform/test-verisi-turu/kaydet', { projeId, ad: 'Bireysel kişi', alanlar: ['tcKimlikNo', 'cepTelefonu'].map((ad) => ({ ad, hassas: true })) })).id);
  await basarili('/platform/test-verisi-profili/kaydet', { projeId, turId: tur, ad: 'k1', degerler: KISI });
  await basarili('/platform/test-verisi-profili/kaydet', { projeId, turId: tur, ad: 'hatali', degerler: { ...KISI, tcKimlikNo: '99000000012' } });
  await basarili('/platform/sayfa-paketi/ekle', { projeId, paket: paket(), senaryoIndeksleri: [], ortamIdleri: [ortamId] });
  const liste = await api(`/platform/senaryolar?projeId=${projeId}&ortamId=${ortamId}`) as { ekranlar: Nesne[] };
  ekranId = String((liste.ekranlar.find((e) => e.ad === 'Başvuru') as Nesne).id);
});

test.afterAll(async () => {
  nobetci?.surec.kill('SIGTERM');
  await fikstur?.kapat();
  if (klasor) rmSync(klasor, { recursive: true, force: true });
});

test('degerJs gizli listeyi metinle / gizli girdiyi yazar; görünmez radyo / onay kutusu zorla işaretlenir; kapalı alan atlanır; telefon profilden dilimlenir; üstü kapatan katman gizlenir', async () => {
  test.setTimeout(90_000);
  const sonuc = await kos('Ek kurallar', { sahip: 'H', ek: true, liste: 'İşyeri', gizliKod: 'X-7', kapali: 'yazılmamalı', tarih: '01.01.2026', kisiProfili: 'k1' });
  expect(sonuc.durum, JSON.stringify(sonuc.hataMesaji)).toBe('basarili');
  expect(gonderimler.at(-1)).toEqual({ liste: '20', gizliKod: 'X-7', kapali: '', kimlik: KISI.tcKimlikNo, ad: 'KİŞİ 146', telKodu: '532', telNo: '1112233',
    sahip: 'H', sahipIsleyici: 'tiklandi:H', ek: true });
});

test('sorgu hata penceresi açılınca adım zaman aşımını (20 sn) beklemeden, hata mesajıyla düşer', async () => {
  test.setTimeout(90_000);
  const once = gonderimler.length;
  const bas = Date.now();
  const sonuc = await kos('Sorgu hatası', { liste: 'Mesken', kisiProfili: 'hatali' });
  expect(sonuc.durum).toBe('basarisiz');
  expect(String(sonuc.hataMesaji)).toContain(HATA);
  expect(Date.now() - bas).toBeLessThan(20_000);
  expect(gonderimler.length).toBe(once);
});

test('zorla işaretlenecek radyo seçeneği sayfada yoksa test süresini beklemeden "seçenek sayfada yok" hatasıyla düşer', async () => {
  test.setTimeout(90_000);
  const bas = Date.now();
  const sonuc = await kos('Olmayan seçenek', { sahip: 'K', liste: 'Mesken', kisiProfili: 'k1' });
  expect(sonuc.durum).toBe('basarisiz');
  expect(String(sonuc.hataMesaji)).toContain('seçenek sayfada yok');
  expect(Date.now() - bas).toBeLessThan(60_000);
});
