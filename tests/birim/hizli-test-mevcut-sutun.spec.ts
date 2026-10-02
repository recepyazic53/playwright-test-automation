// HIZLI TEST KAYIT PLANI — MEVCUT SÜTUNA BAĞLAMA, AYNI ADLI LİSTE, ZİNCİRSİZ ÖNERİLER.
//  - Saf kurallar: alan adı ↔ mevcut sütun eşlemesi (birebir / benzer / ilgisiz), "Mevcut tabloya bağla" adayları (tek ve çok sütunlu),
//    zincirsiz ekranda senaryo önerileri (koşullu dal + bağımsız seçimlerin ikili kapsamı; öneri sayısı ayara uyar).
//  - Geçici veritabanı: planYaz "bagla" — değer tabloda varsa o satıra satır kimliğiyle, yoksa bağlam adlı yeni satır.
//  - Uçtan uca: geçici veritabanıyla ayrı Nöbetçi + 127.0.0.1'deki sahte "Adres formu"; projede "Adres" kayıt tablosu (sütun "Adres kodu",
//    satırlar il adları) varken hızlı test → özet "Mevcut tabloya bağla: Adres › Adres kodu" (varsayılan seçili), kaydedince "Adres Kodu"
//    tablosu OLUŞMAZ, senaryo satıra bağlanır, normal koşu o değeri gönderir. Arayüz (1440 px): aynı adlı "İl" ekran listesinde Birleştir
//    seçenekleri görünür ve varsayılan; özet açıkken aynı adlı tablo oluşursa onay özeti yeniler (seçenekler görünür), ikinci onay kaydeder.
// Güvenlik: şirket sitesine HİÇBİR istek gitmez (yalnız 127.0.0.1); veri/ klasörüne ve 5566 portuna dokunulmaz; değerler uydurmadır.
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { projeKaydet, veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { adEslesmesi, mevcutSutunAdaylari, planKur, planOnizle, planYaz, senaryoOnerileri, varsayilanSecim, type PlanTablosu } from '../../scripts/platform/hizli-test/kayit-plani.mjs';
import { tabloKaydet, tablolariListele } from '../../scripts/platform/tablolar/tablo-deposu.mjs';
import { SATIR_KIMLIGI, sutunSecenekleri } from '../../scripts/platform/tablolar/tablo-secimi.mjs';
import { korumaliTarayici, yerelSunucu, type FiksturIstegi, type FiksturYaniti } from './giris-fikstur';
import { YanginUygulamasi } from './bagli-liste-fikstur';
import { nobetciApi, nobetciBaslat, type Nobetci, type Yanit } from './nobetci-sunucusu';
import { HIZLI_KDF, izinleriAc } from './platform-ortak';

type Nesne = Record<string, any>;
const s = (deger: string, metin = deger) => ({ deger, metin });
const ILLER = [s('06', 'Ankara'), s('35', 'İzmir'), s('16', 'Bursa'), s('01', 'Adana'), s('42', 'Konya')];
/** "Adres" kayıt tablosu: satır adı il, sütun "Adres kodu" (uydurma). */
const ADRES_SATIRLARI = [['Ankara', '06100'], ['İzmir', '35200'], ['Bursa', '16000'], ['Adana', '01100']].map(([ad, kod]) => ({ ad, degerler: { 'Adres kodu': kod } }));

test.describe('saf kurallar', () => {
  test('alan adı ↔ sütun adı: birebir (harf / Türkçe karakter / noktalama farkı yok), benzer (kısaltma, eş anlam, kök), ilgisiz', () => {
    expect(adEslesmesi('Adres Kodu', 'Adres kodu')).toBe('birebir');
    expect(adEslesmesi('ADRES KODU:', 'adres-kodu')).toBe('birebir');
    expect(adEslesmesi('T.C. Kimlik No', 'tc kimlik no')).toBe('birebir');
    expect(adEslesmesi('TEL', 'Telefon')).toBe('benzer');
    expect(adEslesmesi('D.TARİHİ', 'Doğum tarihi')).toBe('benzer');
    expect(adEslesmesi('Telefon', 'Cep telefonu')).toBe('benzer');
    expect(adEslesmesi('Yolcu adı', 'Ad')).toBe('benzer');
    // İlgisiz: ayrı sözcük; tablo / sütun adı tamlamanın başı değil; genel ad köke eşlenmez.
    expect(adEslesmesi('Adres no', 'Adres kodu')).toBeNull();
    expect(adEslesmesi('Adres Kodu', 'Adres')).toBeNull();
    expect(adEslesmesi('Adres kodu', 'Kod')).toBeNull();
    expect(adEslesmesi('Kullanıcı adı', 'Ad')).toBeNull();
    expect(adEslesmesi('', 'Ad')).toBeNull();
  });

  test('mevcut tabloya bağla adayları: tek sütunlu alanda sütun eşleşmeli (tablo ADI sayılmaz); kişi grubunda sütunların çoğu', () => {
    const plan = planKur({ baslik: 'Adres testi', alanlar: [{ anahtar: 'kod', tur: 'text', etiket: 'Adres Kodu' }], degerler: { kod: { deger: '16000' } } });
    const t = plan.tablolar[0];
    expect(t).toMatchObject({ ad: 'Adres Kodu', tur: 'kayit' });
    const mevcutlar = [
      { id: 't1', ad: 'Adres', sutunlar: [{ ad: 'Adres kodu' }], satirlar: ADRES_SATIRLARI.map((r, i) => ({ id: `r${i}`, ...r })) },
      { id: 't2', ad: 'Adres no tablosu', sutunlar: [{ ad: 'Adres no' }], satirlar: [] },
      { id: 't3', ad: 'Adres', sutunlar: [{ ad: 'Açıklama' }], satirlar: [] },
      { id: 'baglam_x', ad: 'Bağlam', baglam: true, sutunlar: [{ ad: 'Adres kodu' }], satirlar: [] }
    ];
    const a = mevcutSutunAdaylari(t, mevcutlar);
    expect(a).toEqual([{
      id: 't1', ad: 'Adres', eslesme: [{ plan: 'Adres Kodu', hedef: 'Adres kodu', tur: 'birebir' }], yeniSutunlar: [], kesin: true,
      satirSayisi: 4, eklenecekSatir: 0, mevcutSatir: { id: 'r2', ad: 'Bursa' }
    }]);
    // Değer tabloda yoksa yeni satır eklenecek.
    const plan2 = planKur({ baslik: 'x', alanlar: [{ anahtar: 'kod', tur: 'text', etiket: 'Adres Kodu' }], degerler: { kod: { deger: '42000' } } });
    expect(mevcutSutunAdaylari(plan2.tablolar[0], mevcutlar)[0]).toMatchObject({ kesin: true, mevcutSatir: null, eklenecekSatir: 1 });
    // Benzer ad (kısaltma): aday ama kesin değil (varsayılan seçili olmaz).
    const plan3 = planKur({ baslik: 'x', alanlar: [{ anahtar: 'k', tur: 'text', etiket: 'Abone' }], degerler: { k: { deger: '5' } } });
    expect(mevcutSutunAdaylari(plan3.tablolar[0], [{ id: 'a', ad: 'Aboneler', sutunlar: [{ ad: 'Abonelik' }], satirlar: [] }])).toEqual([
      expect.objectContaining({ id: 'a', kesin: false, eslesme: [{ plan: 'Abone', hedef: 'Abonelik', tur: 'benzer' }] })
    ]);
    // Kişi grubu: mevcut tablonun sütunları alanların çoğunu karşılıyor (2 birebir + 1 benzer) → aday (kesin değil; yeni sütun yok).
    const kisi = planKur({
      baslik: 'Kişi', alanlar: [{ anahtar: 'ad', tur: 'text', etiket: 'Ad soyad' }, { anahtar: 'tel', tur: 'tel', etiket: 'Telefon' }, { anahtar: 'dt', tur: 'date', etiket: 'Doğum tarihi' }],
      degerler: { ad: { deger: 'Deneme Kişi' }, tel: { deger: '5550000000' }, dt: { deger: '01.01.1990' } }
    }).tablolar.find((x) => x.ad === 'Kişi bilgileri') as PlanTablosu;
    const k = mevcutSutunAdaylari(kisi, [
      { id: 'm', ad: 'Müşteriler', sutunlar: [{ ad: 'Ad soyad' }, { ad: 'Tel' }, { ad: 'Doğum tarihi' }, { ad: 'E-posta' }], satirlar: [] },
      { id: 'n', ad: 'Notlar', sutunlar: [{ ad: 'Telefon' }, { ad: 'Not' }], satirlar: [] }
    ]);
    expect(k.map((x) => x.id)).toEqual(['m']);
    expect(k[0]).toMatchObject({ kesin: false, yeniSutunlar: [] });
    expect(k[0].eslesme).toEqual(expect.arrayContaining([{ plan: 'Telefon', hedef: 'Tel', tur: 'benzer' }, { plan: 'Ad soyad', hedef: 'Ad soyad', tur: 'birebir' }]));
  });

  test('zincirsiz ekran önerileri: koşullu dal (veri gerekli), bağımsız seçimlerin ikili kapsamı; tekrarsız; öneri sayısı ayara uyar', () => {
    const alanlar: Array<Record<string, any>> = [
      { anahtar: 'tip', tur: 'radio', etiket: 'Başvuran tipi', hazir: true, mevcut: 'Özel', radyolar: [s('O', 'Özel'), s('T', 'Tüzel')] },
      { anahtar: 'tc', tur: 'text', etiket: 'TC kimlik no', kosul: { secim: 'tip', degerler: ['O'] } },
      { anahtar: 'unvan', tur: 'text', etiket: 'Unvan', kosul: { secim: 'tip', degerler: ['T'] } },
      { anahtar: 'vergi', tur: 'text', etiket: 'Vergi no', kosul: { secim: 'tip', degerler: ['T'] } },
      { anahtar: 'yapi', tur: 'select', etiket: 'Yapı tarzı', secenekler: [s('', 'Seçiniz'), s('b', 'Betonarme'), s('k', 'Kagir'), s('c', 'Çelik')] },
      { anahtar: 'alt', tur: 'select', etiket: 'Alternatif', secenekler: [s('1', 'Alternatif 1'), s('2', 'Alternatif 2'), s('3', 'Alternatif 3')] },
      { anahtar: 'tem', tur: 'radio', etiket: 'Kapsam', hazir: true, mevcut: '100.000', radyolar: [s('100', '100.000'), s('250', '250.000'), s('500', '500.000')] }
    ];
    const degerler = { tc: { deger: '10000000146' }, yapi: { deger: 'b' }, alt: { deger: '1' } };
    const plan = planKur({ baslik: 'Konut', alanlar, degerler });
    const ham = { tc: '10000000146', yapi: 'b', alt: '1' };
    const o = senaryoOnerileri(plan, 'Konut', { enCok: 5, alanlar, degerler: ham });
    const degisim = (x: (typeof o)[number]) => Object.fromEntries((x.alt?.degisiklikler ?? []).map((d) => [d.oturumAnahtar, d.deger]));
    // Görünürlük dalı (Tüzel) + görünürlüğü değiştirmeyen seçimlerin her değeri (6) sınırı (5) aşar: gerektiği kadar her değer seçimi dal
    // önerisine katılır; her alternatif değer yine en az bir kez, tekrar yok.
    const ikili = o.slice(1);
    expect(ikili).toHaveLength(5);
    const gorulen = (k: string) => new Set(ikili.map((x) => degisim(x)[k]).filter(Boolean));
    expect([...gorulen('yapi')].sort()).toEqual(['Kagir', 'Çelik'].sort());
    expect([...gorulen('alt')].sort()).toEqual(['Alternatif 2', 'Alternatif 3']);
    expect([...gorulen('tem')].sort()).toEqual(['250.000', '500.000']);
    expect(new Set(o.map((x) => JSON.stringify(degisim(x)))).size).toBe(o.length);
    // Dal (Tüzel: Unvan, Vergi no açılır; değerleri yok) "veri gerekli" işaretini korur ve katılan seçimlerle zenginleşir.
    const dalli = ikili.filter((x) => degisim(x).tip);
    expect(dalli).toHaveLength(1);
    expect(degisim(dalli[0])).toMatchObject({ tip: 'Tüzel' });
    expect(Object.keys(degisim(dalli[0])).length).toBeGreaterThan(1);
    expect(dalli[0].veriGerekli).toEqual(['Unvan', 'Vergi no']);
    expect(dalli[0].gerekce).toMatch(/^görünürlük dalları: tüm birleşimler; “.+”: her değer/);
    expect(dalli[0].baslik).toMatch(/^Konut — Başvuran tipi: Tüzel · /);
    for (const x of ikili.filter((y) => !degisim(y).tip)) expect(x.veriGerekli).toEqual([]);
    // Öneri sayısı ayara uyar.
    expect(senaryoOnerileri(plan, 'Konut', { enCok: 2, alanlar, degerler: ham })).toHaveLength(3);
  });
});

test('planYaz "bagla": değer tabloda varsa o satıra satır kimliğiyle; yoksa bağlam (seçilen il) adlı yeni satır; "Adres Kodu" tablosu oluşmaz', async () => {
  const k = mkdtempSync(join(tmpdir(), 'hizli-mevcut-sutun-'));
  try {
    const vt = await veritabaniniHazirla(join(k, 'p.db'));
    await kasaOlustur(vt, `Gecici-Sutun-${randomBytes(6).toString('hex')}`, { kdf: HIZLI_KDF });
    const p = String(projeKaydet(vt, { ad: 'Plan' }));
    const adresId = tabloKaydet(vt, { projeId: p, ad: 'Adres', tur: 'kayit', sutunlar: [{ ad: 'Adres kodu' }], satirlar: ADRES_SATIRLARI });
    const alanlar = [{ anahtar: 'il', tur: 'select', etiket: 'İl', secenekler: ILLER }, { anahtar: 'kod', tur: 'text', etiket: 'Adres Kodu' }];
    const yaz = (il: string, kod: string) => {
      const plan = planKur({ baslik: 'Adres testi', alanlar, degerler: { il: { deger: il }, kod: { deger: kod } } });
      const on = planOnizle(vt, p, plan, null, {});
      const secim = varsayilanSecim(on);
      return { on, secim, yazilan: planYaz(vt, p, plan, secim, { ekranAdi: 'Adres formu' }) };
    };
    const a = yaz('16', '16000');
    expect(a.on.tablolar.find((t) => t.ad === 'Adres Kodu')?.bagla[0]).toMatchObject({ ad: 'Adres', kesin: true, mevcutSatir: { ad: 'Bursa' } });
    expect(a.secim.tablolar['Adres Kodu']).toEqual({ islem: 'bagla', hedefId: adresId });
    const y = a.yazilan.find((x) => x.planAdi === 'Adres Kodu');
    const bursa = tablolariListele(vt, p).find((t) => t.id === adresId)?.satirlar.find((r) => r.ad === 'Bursa');
    expect(y).toMatchObject({ ad: 'Adres', id: adresId, islem: 'bagla', eklenenSatir: 0, satirId: bursa?.id });
    expect(y?.hedef('Adres Kodu')).toBe('Adres kodu');
    expect(tablolariListele(vt, p).map((t) => t.ad).sort()).toEqual(['Adres', 'İl']);
    // Değer yok: yeni satır, adı seçilen il (satır adları il adları).
    const b = yaz('42', '42000');
    const y2 = b.yazilan.find((x) => x.planAdi === 'Adres Kodu');
    const adres = tablolariListele(vt, p).find((t) => t.id === adresId);
    expect(adres?.satirlar.map((r) => r.ad)).toEqual(['Ankara', 'İzmir', 'Bursa', 'Adana', 'Konya']);
    expect(y2).toMatchObject({ islem: 'bagla', eklenenSatir: 1, satirId: adres?.satirlar.find((r) => r.ad === 'Konya')?.id });
    expect(adres?.satirlar.find((r) => r.ad === 'Konya')?.degerler['Adres kodu']).toBe('42000');
    expect(tablolariListele(vt, p).map((t) => t.ad).sort()).toEqual(['Adres', 'İl']);
    vt.kapat();
  } finally { rmSync(k, { recursive: true, force: true }); }
});

test('zincir tablosu: projede İl / İlçe / Mahalle sütunlu tablo varsa ona bağlanır (varsayılan); gözlenen yeni kombinasyonlar yeni satır; İl seçilince İlçe satırlardan süzülür', async () => {
  const k = mkdtempSync(join(tmpdir(), 'hizli-zincir-bagla-'));
  try {
    const vt = await veritabaniniHazirla(join(k, 'p.db'));
    await kasaOlustur(vt, `Gecici-Zincir-${randomBytes(6).toString('hex')}`, { kdf: HIZLI_KDF });
    const p = String(projeKaydet(vt, { ad: 'Plan' }));
    const mevcutId = tabloKaydet(vt, {
      projeId: p, ad: 'Adres zinciri', tur: 'liste', sutunlar: [{ ad: 'İl' }, { ad: 'İlçe' }, { ad: 'Mahalle' }],
      satirlar: [{ ad: 'Ankara › Çankaya › Kızılay', degerler: { 'İl': 'Ankara', 'İlçe': 'Çankaya', Mahalle: 'Kızılay' } }]
    });
    const alanlar = [
      { anahtar: 'il', tur: 'select', etiket: 'İl', secenekler: [s('', 'Seçiniz'), s('06', 'Ankara'), s('01', 'Adana')] },
      { anahtar: 'ilce', tur: 'select', etiket: 'İlçe', secenekler: [s('0601', 'Çankaya'), s('0602', 'Keçiören')] },
      { anahtar: 'mah', tur: 'select', etiket: 'Mahalle', secenekler: [s('Etlik')] }
    ];
    const gozlemler = [
      { anahtar: 'ilce', secimler: { il: '06' }, secenekler: [s('0601', 'Çankaya'), s('0602', 'Keçiören')] },
      { anahtar: 'mah', secimler: { il: '06', ilce: '0602' }, secenekler: [s('Etlik')] },
      { anahtar: 'mah', secimler: { il: '06', ilce: '0601' }, secenekler: [s('Kızılay')] },
      { anahtar: 'ilce', secimler: { il: '01' }, secenekler: [s('0101', 'Seyhan')] },
      { anahtar: 'mah', secimler: { il: '01', ilce: '0101' }, secenekler: [s('Reşatbey')] }
    ];
    const plan = planKur({ baslik: 'Adres', alanlar, degerler: { il: { deger: '06' }, ilce: { deger: '0602' }, mah: { deger: 'Etlik' } }, iliskiler: [{ ust: 'il', alt: 'ilce' }, { ust: 'ilce', alt: 'mah' }], gozlemler });
    expect(plan.tablolar.map((t) => t.ad)).toEqual(['İl - İlçe - Mahalle']);
    expect(plan.tablolar[0].satirlar).toHaveLength(3); // Keçiören/Etlik, Çankaya/Kızılay, Seyhan/Reşatbey
    const on = planOnizle(vt, p, plan, null, { il: 'il', ilce: 'ilce', mah: 'mah' });
    expect(on.tablolar[0]).toMatchObject({ zincir: ['İl', 'İlçe', 'Mahalle'], mevcut: null });
    expect(on.tablolar[0].bagla[0]).toMatchObject({ id: mevcutId, kesin: true, eklenecekSatir: 2 });
    const secim = varsayilanSecim(on);
    expect(secim.tablolar['İl - İlçe - Mahalle']).toEqual({ islem: 'bagla', hedefId: mevcutId });
    const [y] = planYaz(vt, p, plan, secim, { ekranAdi: 'Adres' });
    expect(y).toMatchObject({ id: mevcutId, islem: 'bagla', eklenenSatir: 2, tur: 'liste', pin: { 'İl': 'Ankara', 'İlçe': 'Keçiören', Mahalle: 'Etlik' } });
    const t = tablolariListele(vt, p);
    expect(t.map((x) => x.ad)).toEqual(['Adres zinciri']);
    const z = t[0];
    expect(z.satirlar.map((r) => [r.degerler['İl'], r.degerler['İlçe'], r.degerler.Mahalle])).toEqual([
      ['Ankara', 'Çankaya', 'Kızılay'], ['Ankara', 'Keçiören', 'Etlik'], ['Adana', 'Seyhan', 'Reşatbey']
    ]);
    // Sayfa değeri karşılıkları mevcut sütunlara eklendi (koşu seçeneği koddan tanır).
    expect(z.sutunlar.find((c) => c.ad === 'İl')?.karsiliklar).toMatchObject({ Ankara: { sayfa: '06' }, Adana: { sayfa: '01' } });
    // Senaryo formu: İl seçilince İlçe yalnız o ilin satırlarından.
    expect(sutunSecenekleri(z, { 'İl': 'Ankara' }, 'İlçe')).toEqual(['Çankaya', 'Keçiören']);
    expect(sutunSecenekleri(z, { 'İl': 'Adana' }, 'İlçe')).toEqual(['Seyhan']);
    vt.kapat();
  } finally { rmSync(k, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------------------------------
// Uçtan uca (Nöbetçi + 127.0.0.1 sahte sayfa)
// ---------------------------------------------------------------------------------------

const ADRES_FORMU = `<h1>Adres formu</h1>
<label for="il">İl</label>
<select id="il" name="il"><option value="">Seçiniz</option>${ILLER.map((x) => `<option value="${x.deger}">${x.metin}</option>`).join('')}</select>
<label for="adresKodu">Adres Kodu</label><input id="adresKodu" name="adresKodu">
<fieldset><legend>Kanal</legend><label><input type="radio" name="kanal" value="w"> Web</label><label><input type="radio" name="kanal" value="m"> Mobil</label></fieldset>
<p><button type="button" id="gonder">Gönder</button></p>
<div id="sonuc" class="alert alert-success" role="status" hidden></div>
<script>
  document.getElementById('gonder').addEventListener('click', function () {
    var k = document.querySelector('input[name=kanal]:checked');
    fetch('/api/gonder?il=' + document.getElementById('il').value + '&kod=' + encodeURIComponent(document.getElementById('adresKodu').value) + '&kanal=' + (k ? k.value : ''))
      .then(function () { var s = document.getElementById('sonuc'); s.textContent = 'Kayıt alındı'; s.hidden = false; });
  });
</script>`;

class AdresFormu {
  readonly gonderilenler: Array<Record<string, string>> = [];
  isle = (i: FiksturIstegi): FiksturYaniti => {
    if (i.yol === '/adres-formu/' && i.yontem === 'GET') {
      return { tur: 'text/html; charset=utf-8', govde: `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>Adres formu</title></head><body>${ADRES_FORMU}</body></html>` };
    }
    if (i.yol === '/api/gonder') { this.gonderilenler.push(Object.fromEntries(i.sorgu.entries())); return { tur: 'application/json', govde: '{"tamam":true}' }; }
    return { durum: 404, tur: 'text/plain', govde: 'yok' };
  };
}

test.describe('uçtan uca', () => {
  test.describe.configure({ mode: 'serial' });
  const PAROLA = `Gecici-Sutun-${randomBytes(6).toString('hex')}`;
  let nobetci: Nobetci;
  let uygulama: AdresFormu;
  const yangin = new YanginUygulamasi();
  let fikstur: Awaited<ReturnType<typeof yerelSunucu>>;
  let klasor = '';
  let projeId = '';
  let ortamId = '';
  let adresId = '';
  const api = (yol: string, govde?: Nesne): Promise<Yanit> => nobetciApi(nobetci, yol, govde);
  async function basarili(yol: string, govde: Nesne): Promise<Yanit> {
    const y = await api(yol, govde);
    expect(y.basarili, `${yol}: ${y.mesaj ?? ''} ${JSON.stringify(y).slice(0, 400)}`).toBe(true);
    return y;
  }
  async function bekle(id: string, durumlar: string[], sn = 120): Promise<Nesne> {
    const son = Date.now() + sn * 1000;
    for (;;) {
      const o = (await api(`/platform/hizli-test/durum?id=${id}`)).oturum as Nesne;
      // Keşif toplu sorusu bu testin konusu değil: "Hiçbirine basma".
      if (o.durum === 'kesifOnay' && !durumlar.includes('kesifOnay')) { await api('/platform/hizli-test/onay', { id, cevap: false }); continue; }
      if (durumlar.includes(o.durum)) return o;
      if (['hata', 'iptal'].includes(o.durum) || Date.now() > son) throw new Error(`beklenen ${durumlar.join('/')}, olan ${o.durum}: ${JSON.stringify(o.hata ?? o.sonHata)} ${JSON.stringify(o.gunluk?.slice(-5))}`);
      await new Promise((c) => setTimeout(c, 300));
    }
  }
  const tablolar = async (): Promise<Nesne[]> => (await api(`/platform/tablolar?projeId=${projeId}`)).tablolar as Nesne[];
  async function isBitsin(): Promise<void> {
    for (const son = Date.now() + 30_000; Date.now() < son; await new Promise((c) => setTimeout(c, 250))) if (!(await api('/platform/tarama/aktif')).is) return;
    throw new Error('tarayıcı işi bitmedi');
  }
  /** Hızlı test: İl + Adres Kodu elle → Gönder → "Kayıt alındı" bitti → kaydet durağı. Oturum kimliği döner. */
  async function hizliTest(ekranAdi: string, il: string, kod: string): Promise<string> {
    await isBitsin();
    const once = uygulama.gonderilenler.length;
    const id = String((await basarili('/platform/hizli-test/baslat', {
      projeId, ortamId, hedef: '/adres-formu/', ekranAdi, izin: 'evet', cumle: 'Gönder\'e bas, "Kayıt alındı" görünsün'
    })).id);
    let o = await bekle(id, ['veri']);
    const alan = (etiket: string): string => String(o.soru.alanlar.find((a: Nesne) => a.etiket === etiket)?.anahtar);
    await basarili('/platform/hizli-test/veri', { id, degerler: { [alan('İl')]: { deger: il, kaynak: 'elle' }, [alan('Adres Kodu')]: { deger: kod, kaynak: 'elle' } } });
    o = await bekle(id, ['karar', 'hataSorusu', 'veri'], 120);
    expect(o.durum, JSON.stringify({ soru: o.soru, gunluk: o.gunluk?.slice(-5) })).toBe('karar');
    expect(uygulama.gonderilenler.slice(once)).toEqual([{ il, kod, kanal: '' }]);
    await basarili('/platform/hizli-test/karar', { id, karar: 'bitir' });
    o = await bekle(id, ['bitis']);
    await basarili('/platform/hizli-test/bitis', { id, etiketler: { ...o.soru.etiketler, 'Kayıt alındı': 'bitti' } });
    await bekle(id, ['kaydet']);
    return id;
  }
  async function kos(senaryoId: string): Promise<Record<string, string> | undefined> {
    const once = uygulama.gonderilenler.length;
    const y = await api('/platform/senaryolar/calistir', { projeId, kosuId: `kosu-${randomUUID()}`, senaryoId, ortamId });
    expect(y.basarili, y.mesaj).toBe(true);
    const sonuc = (await api(`/platform/sonuclar/sonuc?id=${String(y.sonucId)}`)).sonuc as Nesne;
    expect(sonuc.durum, JSON.stringify(sonuc.hataMesaji)).toBe('basarili');
    expect(uygulama.gonderilenler.length).toBe(once + 1);
    return uygulama.gonderilenler.at(-1);
  }

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    klasor = mkdtempSync(join(tmpdir(), 'hizli-mevcut-sutun-uc-'));
    uygulama = new AdresFormu();
    fikstur = await yerelSunucu((i) => yangin.isle(i) ?? uygulama.isle(i));
    const vtYolu = join(klasor, 'platform.db');
    const vt = await veritabaniniHazirla(vtYolu);
    await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
    izinleriAc(vt);
    vt.kapat();
    nobetci = await nobetciBaslat(klasor, vtYolu, { NOBETCI_KAYIT_BASSIZ: '1', NOBETCI_TARAMA_IZINLI_KOKENLER: fikstur.adres, NOBETCI_KAYIT_ZAMAN_ASIMI_SN: '300', NOBETCI_REHBER_OTOMATIK: '0' });
    await basarili('/platform/kasa/ac', { parola: PAROLA });
    projeId = String(((await basarili('/platform/proje/kaydet', { ad: 'Mevcut Sütun Projesi' })).proje as Nesne).id);
    ortamId = String(((await basarili('/platform/ortam/kaydet', { projeId, ad: 'Deneme', tabanUrl: fikstur.adres, varsayilan: true, riskli: false })).ortam as Nesne).id);
    // Projede önceden: "Adres" kayıt tablosu (Adres kodu; satırlar il adları) ve aynı adlı "İl" ekran listesi (iki seçenek).
    await basarili('/platform/tablo/kaydet', { projeId, ad: 'Adres', tur: 'kayit', sutunlar: [{ ad: 'Adres kodu' }], satirlar: ADRES_SATIRLARI.map((r) => ({ ...r, ortamId: null })) });
    await basarili('/platform/tablo/kaydet', { projeId, ad: 'İl', tur: 'liste', sutunlar: [{ ad: 'İl' }], satirlar: [{ ad: 'Ankara', degerler: { 'İl': 'Ankara' } }, { ad: 'İzmir', degerler: { 'İl': 'İzmir' } }] });
    adresId = String(((await tablolar()).find((t) => t.ad === 'Adres') as Nesne).id);
  });
  test.afterAll(async () => {
    nobetci?.surec.kill('SIGTERM');
    await fikstur?.kapat();
    if (klasor) rmSync(klasor, { recursive: true, force: true });
  });

  test('arayüz (1440 px): özette "Mevcut tabloya bağla: Adres › Adres kodu" ve aynı adlı "İl" listesinde Birleştir varsayılan; özet açıkken aynı adlı tablo oluşursa onay özeti yeniler, ikinci onay kaydeder', async () => {
    test.setTimeout(300_000);
    const id = await hizliTest('Adres formu (arayüz)', '06', '06100');
    const tarayici = await korumaliTarayici();
    try {
      const page = await (await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1440, height: 900 } })).newPage();
      const hatalar: string[] = [];
      page.on('pageerror', (e) => hatalar.push(String(e)));
      await page.goto(`/#/hizli-test/ozet/${id}`);
      const ozet = page.locator('.hizli-ozet-karti');
      await expect(ozet.getByRole('heading', { name: /Kayıt özeti/ })).toBeVisible({ timeout: 30_000 });
      const kart = (ad: string) => ozet.locator('.tv-tablo').filter({ has: page.locator('.tv-tablo-ust strong', { hasText: new RegExp(`^${ad}$`) }) });
      // "Adres Kodu": yeni tablo DEĞİL, mevcut sütun önerisi varsayılan seçili.
      const bagla = kart('Adres Kodu').getByRole('radio', { name: /^Mevcut tabloya bağla: Adres › Adres kodu \(4 satır\)/ });
      await expect(bagla).toBeChecked();
      await expect(kart('Adres Kodu')).toContainText('değer “Ankara” satırında var');
      await expect(kart('Adres Kodu').getByRole('radio', { name: 'Yeni tablo olarak yaz' })).not.toBeChecked();
      await expect(kart('Adres Kodu').getByRole('radio', { name: 'Atla (yazma)' })).toBeVisible();
      await expect(ozet.locator('.tv-baglar')).toContainText('Adres → Adres kodu');
      // Aynı adlı ekran listesi "İl": radyolar görünür, Birleştir varsayılan; onay kutusu yok.
      await expect(kart('İl').getByRole('radio', { name: /^Birleştir — \d+ eksik seçenek eklenir/ })).toBeChecked();
      await expect(kart('İl').getByRole('radio', { name: /^Yeni adla yaz/ })).toBeVisible();
      await expect(kart('İl').getByRole('checkbox', { name: /tablosunu yaz/ })).toHaveCount(0);
      // "Kanal" (yeni liste) şu an yeni tablo; özet açıkken aynı adlı tablo oluşur (başka bir kayıt gibi).
      await expect(kart('Kanal').getByRole('checkbox', { name: 'Kanal tablosunu yaz' })).toBeChecked();
      await expect(ozet.getByRole('button', { name: 'Onayla ve kaydet' })).toBeEnabled();
      await expect(ozet.locator('[role=status]').last()).not.toContainText('karar bekleniyor');
      await basarili('/platform/tablo/kaydet', { projeId, ad: 'Kanal', tur: 'liste', sutunlar: [{ ad: 'Kanal' }], satirlar: [{ ad: 'Web', degerler: { Kanal: 'Web' } }] });
      await ozet.getByRole('button', { name: 'Onayla ve kaydet' }).click();
      // Onay hata vermeden durmaz: özet yenilenir, "Kanal" kartında Birleştir seçenekleri (varsayılan) görünür.
      await expect(ozet.locator('.not-kutusu.uyari[role=alert]')).toContainText('Özet yenilendi', { timeout: 30_000 });
      await expect(kart('Kanal').getByRole('radio', { name: /^Birleştir/ })).toBeChecked();
      await expect(kart('Adres Kodu').getByRole('radio', { name: /^Mevcut tabloya bağla/ })).toBeChecked();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
      await ozet.getByRole('button', { name: 'Onayla ve kaydet' }).click();
      await expect(page.getByRole('heading', { name: 'Test kaydedildi' })).toBeVisible({ timeout: 60_000 });
      expect(hatalar).toEqual([]);
    } finally { await tarayici.close(); }
    const t = await tablolar();
    expect(t.map((x) => x.ad).sort()).toEqual(['Adres', 'Kanal', 'İl'].sort());
    // Liste birleşti: mevcut satırlar korunur, eksik seçenekler eklendi.
    expect((t.find((x) => x.ad === 'İl') as Nesne).satirlar.map((r: Nesne) => r.degerler['İl'])).toEqual(['Ankara', 'İzmir', 'Bursa', 'Adana', 'Konya']);
    expect((t.find((x) => x.ad === 'Kanal') as Nesne).satirlar.map((r: Nesne) => r.degerler.Kanal)).toEqual(['Web', 'Mobil']);
    expect((t.find((x) => x.ad === 'Adres') as Nesne).satirlar).toHaveLength(4);
  });

  test('değer tabloda var: "Adres Kodu" tablosu oluşmaz, senaryo "Bursa" satırına satır kimliğiyle bağlanır; normal koşu 16000 gönderir', async () => {
    test.setTimeout(300_000);
    const id = await hizliTest('Adres formu', '16', '16000');
    const oz = (await basarili('/platform/hizli-test/ozet', { id, baslik: 'Adres — Bursa' })).ozet as Nesne;
    const t = (oz.onizleme.tablolar as Nesne[]).find((x) => x.ad === 'Adres Kodu') as Nesne;
    expect(t.bagla[0]).toMatchObject({ ad: 'Adres', kesin: true, eslesme: [{ plan: 'Adres Kodu', hedef: 'Adres kodu', tur: 'birebir' }], mevcutSatir: { ad: 'Bursa' }, eklenecekSatir: 0 });
    expect(t.benzer).toEqual([]);
    expect(oz.secim.tablolar['Adres Kodu']).toEqual({ islem: 'bagla', hedefId: t.bagla[0].id });
    const k = await basarili('/platform/hizli-test/kaydet', { id, baslik: 'Adres — Bursa', secim: oz.secim });
    expect(((k.tablo as Nesne).tablolar as Nesne[]).find((x) => x.tablo === 'Adres')).toMatchObject({ islem: 'bagla', yeni: false, eklenenSatir: 0 });
    const liste = await tablolar();
    expect(liste.some((x) => x.ad === 'Adres Kodu')).toBe(false);
    const adres = liste.find((x) => x.ad === 'Adres') as Nesne;
    expect(adres.satirlar).toHaveLength(4);
    const bursa = adres.satirlar.find((r: Nesne) => r.ad === 'Bursa');
    const sen = ((await api(`/platform/senaryo?id=${String(k.senaryoId)}&ortamId=${ortamId}`)) as Nesne).senaryo as Nesne;
    expect(JSON.stringify(sen.veri)).toContain('${Adres.Adres kodu}');
    expect(sen.tabloSecimleri[`${adres.id}|`]).toEqual({ [SATIR_KIMLIGI]: bursa.id });
    // Ekranın test verisi bağı da mevcut sütuna.
    const bag = (await api(`/platform/ekran/alan-baglari?projeId=${projeId}&ekranId=${String(k.ekranId)}`)) as Nesne;
    expect(Object.values(bag.baglar as Record<string, Nesne>).map((b) => `${liste.find((x) => x.id === b.tablo)?.ad}.${b.sutun}`)).toContain('Adres.Adres kodu');
    expect(await kos(String(k.senaryoId))).toEqual({ il: '16', kod: '16000', kanal: '' });
  });

  test('değer tabloda yok: "Adres" tablosuna seçilen il adıyla ("Konya") yeni satır eklenir, senaryo o satıra bağlanır; normal koşu 42000 gönderir', async () => {
    test.setTimeout(300_000);
    const id = await hizliTest('Adres formu iki', '42', '42000');
    const oz = (await basarili('/platform/hizli-test/ozet', { id, baslik: 'Adres — Konya' })).ozet as Nesne;
    const t = (oz.onizleme.tablolar as Nesne[]).find((x) => x.ad === 'Adres Kodu') as Nesne;
    expect(t.bagla[0]).toMatchObject({ ad: 'Adres', kesin: true, mevcutSatir: null, eklenecekSatir: 1 });
    const k = await basarili('/platform/hizli-test/kaydet', { id, baslik: 'Adres — Konya', secim: oz.secim });
    const liste = await tablolar();
    expect(liste.some((x) => x.ad === 'Adres Kodu')).toBe(false);
    const adres = liste.find((x) => x.ad === 'Adres') as Nesne;
    expect(adres.satirlar.map((r: Nesne) => r.ad)).toEqual(['Ankara', 'İzmir', 'Bursa', 'Adana', 'Konya']);
    const konya = adres.satirlar.find((r: Nesne) => r.ad === 'Konya');
    expect(konya.degerler['Adres kodu']).toBe('42000');
    const sen = ((await api(`/platform/senaryo?id=${String(k.senaryoId)}&ortamId=${ortamId}`)) as Nesne).senaryo as Nesne;
    expect(sen.tabloSecimleri[`${adres.id}|`]).toEqual({ [SATIR_KIMLIGI]: konya.id });
    expect(await kos(String(k.senaryoId))).toEqual({ il: '42', kod: '42000', kanal: '' });
    expect(adresId).toBeTruthy();
  });

  test('7 halkalı zincir (/yangin/?ozel=1, süslü Bina): TEK zincir tablosu, hücreler görünen metin, senaryo kullanıcının satırına satır kimliğiyle; normal koşu Daire dahil aynı değerleri gönderir', async () => {
    test.setTimeout(900_000);
    await isBitsin();
    const id = String((await basarili('/platform/hizli-test/baslat', {
      projeId, ortamId, hedef: '/yangin/?ozel=1', ekranAdi: 'Yangın talebi (tablo)', izin: 'evet', cumle: 'Talep al düğmesine bas, "Talep hazır" görünce bitir'
    })).id);
    let o = await bekle(id, ['veri'], 600);
    const alan = (etiket: string): string => String(o.soru.alanlar.find((a: Nesne) => a.etiket === etiket)?.anahtar);
    const yol: Array<[string, string]> = [['İl', '55'], ['İlçe', '5501'], ['Belde/Köy', '5501-M'], ['Mahalle', '5501-M-1'], ['Cadde/Sokak', '5501-M-1-C1'], ['Bina No', '5501-M-1-C1|B2']];
    // Halkalar sırayla (her seçimden sonra alt liste gelir); son turda Daire + Özel dalının metin alanları.
    for (const [etiket, deger] of yol) {
      await basarili('/platform/hizli-test/veri', { id, degerler: { [alan(etiket)]: { deger, kaynak: 'elle' } } });
      o = await bekle(id, ['veri', 'karar'], 240);
      expect(o.durum, `${etiket}: ${JSON.stringify(o.gunluk?.slice(-4))}`).toBe('veri');
    }
    await basarili('/platform/hizli-test/veri', { id, degerler: {
      [alan('Daire/Kapı No')]: { deger: 'D21', kaynak: 'elle' }, [alan('Doğum Tarihi')]: { deger: '01.01.1990', kaynak: 'elle' }, [alan('T.C. Kimlik No')]: { deger: '10000000146', kaynak: 'elle' }
    } });
    o = await bekle(id, ['karar', 'hataSorusu', 'veri'], 240);
    expect(o.durum, JSON.stringify({ not: o.soru?.not, g: o.gunluk?.slice(-5) })).toBe('karar');
    // Cümledeki düğme tek aday değilse "Şimdi ne yapayım?"da "Talep al"a basılır.
    if (!yangin.talepler.length) {
      const aday = (o.soru.adaylar as Nesne[]).find((a) => a.metin === 'Talep al');
      expect(aday, JSON.stringify(o.soru.adaylar)).toBeTruthy();
      await basarili('/platform/hizli-test/karar', { id, karar: 'bas', secici: aday?.secici });
      o = await bekle(id, ['karar']);
    }
    expect(yangin.talepler.at(-1)).toMatchObject({ tip: 'O', il: '55', bina: '5501-M-1-C1|B2', daire: 'D21' });
    await basarili('/platform/hizli-test/karar', { id, karar: 'bitir' });
    o = await bekle(id, ['bitis']);
    const bitti = Object.keys(o.soru.etiketler).find((m) => m.startsWith('Talep hazır')) as string;
    await basarili('/platform/hizli-test/bitis', { id, etiketler: { ...o.soru.etiketler, [bitti]: 'bitti' } });
    await bekle(id, ['kaydet']);
    const oz = (await basarili('/platform/hizli-test/ozet', { id, baslik: 'Yangın — Özel' })).ozet as Nesne;
    const zt = (oz.onizleme.tablolar as Nesne[]).find((t) => t.zincir) as Nesne;
    expect(zt, JSON.stringify((oz.onizleme.tablolar as Nesne[]).map((t) => t.ad))).toMatchObject({
      ad: 'İl → Daire/Kapı No zinciri', zincir: ['İl', 'İlçe', 'Belde/Köy', 'Mahalle', 'Cadde/Sokak', 'Bina No', 'Daire/Kapı No']
    });
    // Koşullu dal önerisi: Tüzel (Vergi No, Unvan değersiz → veri gerekli).
    expect((oz.senaryolar as Nesne[]).some((x) => x.veriGerekli?.length && /Tüzel/.test(x.baslik) && /görünürlük dalları/.test(x.gerekce))).toBe(true);
    const k = await basarili('/platform/hizli-test/kaydet', { id, baslik: 'Yangın — Özel', secim: oz.secim });
    const t = (await tablolar()).find((x) => x.ad === 'İl → Daire/Kapı No zinciri') as Nesne;
    expect(t.sutunlar.map((c: Nesne) => c.ad)).toEqual(['İl', 'İlçe', 'Belde/Köy', 'Mahalle', 'Cadde/Sokak', 'Bina No', 'Daire/Kapı No']);
    // Hücreler görünen metin (kod yok); kullanıcının satırı tabloda.
    for (const r of t.satirlar as Nesne[]) for (const v of Object.values(r.degerler)) expect(String(v ?? '')).not.toMatch(/\||^\d{4}$|-M-/);
    const kendi = (t.satirlar as Nesne[]).find((r) => r.degerler['Bina No'] === 'No 2' && r.degerler['Daire/Kapı No'] === 'Daire 21' && r.degerler['İl'] === 'DENİZKENT');
    expect(kendi, JSON.stringify(t.satirlar.slice(0, 5))).toBeTruthy();
    const sen = ((await api(`/platform/senaryo?id=${String(k.senaryoId)}&ortamId=${ortamId}`)) as Nesne).senaryo as Nesne;
    expect(sen.tabloSecimleri[`${t.id}|`]).toEqual({ [SATIR_KIMLIGI]: kendi?.id });
    const once = yangin.talepler.length;
    const y = await api('/platform/senaryolar/calistir', { projeId, kosuId: `kosu-${randomUUID()}`, senaryoId: String(k.senaryoId), ortamId });
    expect(y.basarili, y.mesaj).toBe(true);
    const sonuc = (await api(`/platform/sonuclar/sonuc?id=${String(y.sonucId)}`)).sonuc as Nesne;
    expect(sonuc.durum, `${JSON.stringify(sonuc.hataMesaji).slice(0, 300)} istekler=${JSON.stringify(yangin.istekler.slice(-8))}`).toBe('basarili');
    expect(yangin.talepler.slice(once)).toEqual([expect.objectContaining({ tip: 'O', il: '55', ilce: '5501', belde: '5501-M', bina: '5501-M-1-C1|B2', daire: 'D21' })]);
  });
});
