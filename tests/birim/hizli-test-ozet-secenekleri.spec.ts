// HIZLI TEST KAYIT ÖZETİ — TABLO KARTININ DÖRT SEÇENEĞİ VE ÇOK PARÇALI ALAN.
//  - Saf kurallar: aynı satırdaki "Ad" + "Ad (2)" kutuları tek alan (tek tablo, tek satır, iki sütun; parça adı teknik ad ipucundan, değer
//    biçiminden ya da "n. kısım"); kişi kavramındaki iki parçalı telefon "Kişi bilgileri"nde iki sütun.
//  - Geçici veritabanı: planYaz — (1) mevcut tabloya elle sütun eşlemesiyle bağla (aynı değerli satır varsa ona sabitlenir), (2) mevcut
//    tabloya yeni sütun olarak ekle (eski satırlar korunur, aynı ad hata), (3) yeni tablo (sütun adı düzenlenir), (4) atla; tek işlem
//    (bir tablo yazılamazsa hiçbiri yazılmaz).
//  - Uçtan uca: geçici veritabanıyla ayrı Nöbetçi + 127.0.0.1'deki sahte form (iki parçalı "Kod" ve iki parçalı telefon). Özette tek
//    tablo / iki sütun, her kartta dört seçenek; "Kod" elle eşlemeyle mevcut tabloya, telefon mevcut tabloya yeni sütun olarak; kayıt
//    sonrası tablolar ve normal koşunun gönderdiği değerler; 1440 / 390 px taşma yok.
// Güvenlik: şirket sitesine HİÇBİR istek gitmez (yalnız 127.0.0.1); veri/ klasörüne ve 5566 portuna dokunulmaz; değerler uydurmadır.
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { projeKaydet, veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { planKur, planOnizle, planYaz, varsayilanSecim } from '../../scripts/platform/hizli-test/kayit-plani.mjs';
import { cokParcaliIsaretle } from '../../scripts/platform/hizli-test/test-verisi-tablosu.mjs';
import { tabloKaydet, tablolariListele } from '../../scripts/platform/tablolar/tablo-deposu.mjs';
import { SATIR_KIMLIGI } from '../../scripts/platform/tablolar/tablo-secimi.mjs';
import { korumaliTarayici, yerelSunucu, type FiksturIstegi, type FiksturYaniti } from './giris-fikstur';
import { nobetciApi, nobetciBaslat, type Nobetci, type Yanit } from './nobetci-sunucusu';
import { HIZLI_KDF, izinleriAc } from './platform-ortak';

type Nesne = Record<string, any>;

/** İki parçalı "Kod" (teknik ad ipucu: seri / no) + iki parçalı telefon (ipucu yok: değer biçimi) + tek parçalı not. */
const ALANLAR = [
  { anahtar: 'k1', tur: 'text', etiket: 'Kod', kimlik: 'kodSeri', enCok: 3 },
  { anahtar: 'k2', tur: 'text', etiket: 'Kod (2)', kimlik: 'kodNo', enCok: 6 },
  { anahtar: 't1', tur: 'tel', etiket: 'Cep Telefonu', kimlik: 'tel1', enCok: 3 },
  { anahtar: 't2', tur: 'tel', etiket: 'Cep Telefonu (2)', kimlik: 'tel2', enCok: 7 },
  { anahtar: 'n', tur: 'text', etiket: 'Not', kimlik: 'not' }
];
const deger = (d: Record<string, string>) => Object.fromEntries(Object.entries(d).map(([k, v]) => [k, { deger: v }]));
const DEGERLER = deger({ k1: 'AB', k2: '123456', t1: '532', t2: '1234567', n: 'deneme' });
const planla = (d = DEGERLER) => planKur({ baslik: 'Parça testi', alanlar: ALANLAR, degerler: d });

test.describe('saf kurallar', () => {
  test('çok parçalı alan: "Kod" + "Kod (2)" tek tablo / tek satır / iki sütun; telefon kişi tablosunda iki sütun; tek parçalı alan kendi tablosu', () => {
    const plan = planla();
    expect(plan.tablolar.map((t) => t.ad)).toEqual(['Kod', 'Kişi bilgileri', 'Not']);
    const kod = plan.tablolar[0];
    expect(kod).toMatchObject({ tur: 'kayit', sutunlar: [{ ad: 'Kod (seri)' }, { ad: 'Kod (numara)' }], satirlar: [{ 'Kod (seri)': 'AB', 'Kod (numara)': '123456' }] });
    expect(kod.alanlar.map((a) => [a.oturumAnahtar, a.sutun])).toEqual([['k1', 'Kod (seri)'], ['k2', 'Kod (numara)']]);
    const kisi = plan.tablolar[1];
    expect(kisi.sutunlar.map((s) => s.ad)).toEqual(['Telefon (kod)', 'Telefon (numara)']);
    expect(kisi.satirlar).toEqual([{ 'Telefon (kod)': '532', 'Telefon (numara)': '1234567' }]);
  });

  test('parça adları: teknik ad ipucu (sondaki sözcük), değer biçimi (kısa rakam baştaysa kod, en uzun sondaysa numara), bulunamazsa "n. kısım"; numarasız ek / araya giren başka etiket kırılmaz', () => {
    const ad = (alanlar: Nesne[], d: Record<string, string> = {}) => cokParcaliIsaretle(alanlar, deger(d)).map((a) => a.parca?.ad ?? null);
    expect(ad([{ anahtar: 'a', etiket: 'X', kimlik: 'xAreaCode' }, { anahtar: 'b', etiket: 'X (2)', kimlik: 'xNumber' }])).toEqual(['alan kodu', 'numara']);
    expect(ad([{ anahtar: 'a', etiket: 'X', ad: 'x_city' }, { anahtar: 'b', etiket: 'X (2)', ad: 'x_no' }])).toEqual(['il kodu', 'numara']);
    expect(ad([{ anahtar: 'a', etiket: 'X', kimlik: 'xKodu' }, { anahtar: 'b', etiket: 'X (2)', kimlik: 'y' }], { a: '12', b: '345678' })).toEqual(['kod', 'numara']);
    expect(ad([{ anahtar: 'a', etiket: 'X', kimlik: 'p' }, { anahtar: 'b', etiket: 'X (2)', kimlik: 'q' }], { a: 'ab', b: 'c1' })).toEqual(['1. kısım', '2. kısım']);
    expect(ad([{ anahtar: 'a', etiket: 'X' }, { anahtar: 'b', etiket: 'X (2)' }, { anahtar: 'c', etiket: 'X (3)' }])).toEqual(['1. kısım', '2. kısım', '3. kısım']);
    // Ek "(3)" ile başlayan / başka adlı / radyo: parça değil.
    expect(ad([{ anahtar: 'a', etiket: 'X' }, { anahtar: 'b', etiket: 'X (3)' }])).toEqual([null, null]);
    expect(ad([{ anahtar: 'a', etiket: 'X' }, { anahtar: 'b', etiket: 'Y (2)' }])).toEqual([null, null]);
    expect(ad([{ anahtar: 'a', etiket: 'X', tur: 'radio' }, { anahtar: 'b', etiket: 'X (2)' }])).toEqual([null, null]);
  });
});

test('planYaz: (1) elle eşlemeyle bağla, (2) yeni sütun olarak ekle, (3) yeni tablo (sütun adı düzenlenir), (4) atla; tek işlem', async () => {
  const k = mkdtempSync(join(tmpdir(), 'hizli-ozet-secenek-'));
  try {
    const vt = await veritabaniniHazirla(join(k, 'p.db'));
    await kasaOlustur(vt, `Gecici-Secenek-${randomBytes(6).toString('hex')}`, { kdf: HIZLI_KDF });
    const p = String(projeKaydet(vt, { ad: 'Plan' }));
    const kayitlarId = tabloKaydet(vt, { projeId: p, ad: 'Kayıtlar', tur: 'kayit', sutunlar: [{ ad: 'Birinci kısım' }, { ad: 'İkinci kısım' }], satirlar: [{ ad: 'Eski', degerler: { 'Birinci kısım': 'ZZ', 'İkinci kısım': '999' } }] });
    const ekId = tabloKaydet(vt, { projeId: p, ad: 'Ek bilgiler', tur: 'kayit', sutunlar: [{ ad: 'Açıklama' }], satirlar: [{ ad: 'Eski', degerler: { 'Açıklama': 'korunur' } }] });
    const tablo = (id: string) => tablolariListele(vt, p).find((t) => t.id === id) as Nesne;
    const plan = planla();
    const on = planOnizle(vt, p, plan, null, {});
    // Önizleme: elle seçim için projenin tabloları (değer yok); otomatik aday yok → varsayılan yeni tablo.
    expect(on.mevcutTablolar.map((x) => x.ad).sort()).toEqual(['Ek bilgiler', 'Kayıtlar']);
    expect(JSON.stringify(on.mevcutTablolar)).not.toContain('korunur');
    expect(varsayilanSecim(on).tablolar).toEqual({ Kod: { islem: 'yeni' }, 'Kişi bilgileri': { islem: 'yeni' }, Not: { islem: 'yeni' } });

    // Tek işlem: bir tablo yazılamazsa (yeni sütun adı tabloda var) hiçbiri yazılmaz.
    const once = JSON.stringify(tablolariListele(vt, p));
    expect(() => planYaz(vt, p, plan, { tablolar: {
      Kod: { islem: 'yeni' }, Not: { islem: 'yeni' },
      'Kişi bilgileri': { islem: 'sutunEkle', hedefId: ekId, sutunAdlari: { 'Telefon (kod)': 'Açıklama', 'Telefon (numara)': 'Numara' } }
    } }, { ekranAdi: 'Form' })).toThrow(/"Ek bilgiler" tablosunda "Açıklama" sütunu zaten var/);
    expect(JSON.stringify(tablolariListele(vt, p))).toBe(once);
    // Elle eşleme kuralları: aynı sütun iki alana seçilemez; olmayan sütun reddedilir.
    expect(() => planYaz(vt, p, plan, { tablolar: { Kod: { islem: 'bagla', hedefId: kayitlarId, eslesme: { 'Kod (seri)': 'Birinci kısım', 'Kod (numara)': 'Birinci kısım' } } } }, { ekranAdi: 'Form' }))
      .toThrow(/iki alana seçildi/);
    expect(() => planYaz(vt, p, plan, { tablolar: { Kod: { islem: 'bagla', hedefId: kayitlarId, eslesme: { 'Kod (seri)': 'Yok' } } } }, { ekranAdi: 'Form' })).toThrow(/sütunu yok/);
    expect(JSON.stringify(tablolariListele(vt, p))).toBe(once);

    // (1) + (2) + (3) + (4) birlikte.
    const yazilan = planYaz(vt, p, plan, { tablolar: {
      Kod: { islem: 'bagla', hedefId: kayitlarId, eslesme: { 'Kod (seri)': 'Birinci kısım', 'Kod (numara)': 'İkinci kısım' } },
      'Kişi bilgileri': { islem: 'sutunEkle', hedefId: ekId, sutunAdlari: { 'Telefon (kod)': 'Alan kodu', 'Telefon (numara)': 'Telefon numarası' } },
      Not: { islem: 'yeni', sutunAdlari: { Not: 'Açıklama metni' } }
    } }, { ekranAdi: 'Form' });
    expect(yazilan.map((y) => [y.planAdi, y.ad, y.islem, y.eklenenSatir, y.eklenenSutun])).toEqual([
      ['Kod', 'Kayıtlar', 'bagla', 1, 0], ['Kişi bilgileri', 'Ek bilgiler', 'sutunEkle', 1, 2], ['Not', 'Not', 'yeni', 1, 1]
    ]);
    const kayitlar = tablo(kayitlarId);
    expect(kayitlar.satirlar.map((r: Nesne) => [r.ad, r.degerler['Birinci kısım'], r.degerler['İkinci kısım']])).toEqual([['Eski', 'ZZ', '999'], ['Parça testi', 'AB', '123456']]);
    expect(yazilan[0].hedef('Kod (numara)')).toBe('İkinci kısım');
    expect(yazilan[0].satirId).toBe(kayitlar.satirlar[1].id);
    // (2): eski satır bozulmaz, yeni hücreleri boş; kaydın değerleri yeni satırda.
    const ek = tablo(ekId);
    expect(ek.sutunlar.map((s: Nesne) => s.ad)).toEqual(['Açıklama', 'Alan kodu', 'Telefon numarası']);
    expect(ek.satirlar[0]).toMatchObject({ ad: 'Eski', degerler: { 'Açıklama': 'korunur' } });
    expect(ek.satirlar[0].degerler['Alan kodu'] ?? null).toBeNull();
    expect(ek.satirlar[1].degerler).toMatchObject({ 'Alan kodu': '532', 'Telefon numarası': '1234567' });
    expect(yazilan[1].hedef('Telefon (numara)')).toBe('Telefon numarası');
    // (3): sütun adı düzenlendi; (4) atla: yazılmayan tablo yok.
    expect(tablolariListele(vt, p).find((t) => t.ad === 'Not')?.sutunlar.map((s) => s.ad)).toEqual(['Açıklama metni']);
    expect(yazilan[2].hedef('Not')).toBe('Açıklama metni');
    expect(tablolariListele(vt, p).map((t) => t.ad).sort()).toEqual(['Ek bilgiler', 'Kayıtlar', 'Not']);

    // Aynı değerlerle yeniden (elle eşleme): satır eklenmez, senaryo mevcut satıra sabitlenir; (4) atla.
    const ikinci = planYaz(vt, p, plan, { tablolar: { Kod: { islem: 'bagla', hedefId: kayitlarId, eslesme: { 'Kod (seri)': 'Birinci kısım', 'Kod (numara)': 'İkinci kısım' } }, 'Kişi bilgileri': { islem: 'atla' }, Not: { islem: 'atla' } } }, { ekranAdi: 'Form' });
    expect(ikinci).toHaveLength(1);
    expect(ikinci[0]).toMatchObject({ islem: 'bagla', eklenenSatir: 0, satirId: kayitlar.satirlar[1].id });
    expect(tablo(kayitlarId).satirlar).toHaveLength(2);
    // Yeni ad başka bir tablonun adıysa hata (hiçbir şey yazılmaz).
    expect(() => planYaz(vt, p, plan, { tablolar: { Not: { islem: 'yeniAd', yeniAd: 'Kayıtlar' } } }, { ekranAdi: 'Form' })).toThrow(/zaten var/);
    vt.kapat();
  } finally { rmSync(k, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------------------------------
// Uçtan uca (Nöbetçi + 127.0.0.1 sahte sayfa)
// ---------------------------------------------------------------------------------------

const FORM = `<h1>Parçalı form</h1>
<div class="satir"><label for="kodSeri">Kod</label> <input id="kodSeri" name="kodSeri" maxlength="3"> <input id="kodNo" name="kodNo" maxlength="6"></div>
<div class="satir"><label for="tel1">Cep Telefonu</label> <input id="tel1" name="tel1" type="tel" maxlength="3"> <input id="tel2" name="tel2" type="tel" maxlength="7"></div>
<p><button type="button" id="gonder">Gönder</button></p>
<div id="sonuc" class="alert alert-success" role="status" hidden></div>
<script>
  document.getElementById('gonder').addEventListener('click', function () {
    var q = ['kodSeri', 'kodNo', 'tel1', 'tel2'].map(function (k) { return k + '=' + encodeURIComponent(document.getElementById(k).value); }).join('&');
    fetch('/api/gonder?' + q).then(function () { var s = document.getElementById('sonuc'); s.textContent = 'Kayıt alındı'; s.hidden = false; });
  });
</script>`;

class ParcaliForm {
  readonly gonderilenler: Array<Record<string, string>> = [];
  isle = (i: FiksturIstegi): FiksturYaniti => {
    if (i.yol === '/parcali-form/' && i.yontem === 'GET') {
      return { tur: 'text/html; charset=utf-8', govde: `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>Parçalı form</title></head><body>${FORM}</body></html>` };
    }
    if (i.yol === '/api/gonder') { this.gonderilenler.push(Object.fromEntries(i.sorgu.entries())); return { tur: 'application/json', govde: '{"tamam":true}' }; }
    return { durum: 404, tur: 'text/plain', govde: 'yok' };
  };
}

const tasma = (page: Page): Promise<number> => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test.describe('uçtan uca', () => {
  test.describe.configure({ mode: 'serial' });
  const PAROLA = `Gecici-Parca-${randomBytes(6).toString('hex')}`;
  let nobetci: Nobetci;
  let uygulama: ParcaliForm;
  let fikstur: Awaited<ReturnType<typeof yerelSunucu>>;
  let klasor = '';
  let projeId = '';
  let ortamId = '';
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

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    klasor = mkdtempSync(join(tmpdir(), 'hizli-ozet-secenek-uc-'));
    uygulama = new ParcaliForm();
    fikstur = await yerelSunucu((i) => uygulama.isle(i));
    const vtYolu = join(klasor, 'platform.db');
    const vt = await veritabaniniHazirla(vtYolu);
    await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
    izinleriAc(vt);
    vt.kapat();
    nobetci = await nobetciBaslat(klasor, vtYolu, { NOBETCI_KAYIT_BASSIZ: '1', NOBETCI_TARAMA_IZINLI_KOKENLER: fikstur.adres, NOBETCI_KAYIT_ZAMAN_ASIMI_SN: '300', NOBETCI_REHBER_OTOMATIK: '0' });
    await basarili('/platform/kasa/ac', { parola: PAROLA });
    projeId = String(((await basarili('/platform/proje/kaydet', { ad: 'Parça Projesi' })).proje as Nesne).id);
    ortamId = String(((await basarili('/platform/ortam/kaydet', { projeId, ad: 'Deneme', tabanUrl: fikstur.adres, varsayilan: true, riskli: false })).ortam as Nesne).id);
    // Projede önceden: adları plan sütunlarına benzemeyen iki kayıt tablosu (elle eşleme / yeni sütun hedefi).
    await basarili('/platform/tablo/kaydet', { projeId, ad: 'Kayıtlar', tur: 'kayit', sutunlar: [{ ad: 'Birinci kısım' }, { ad: 'İkinci kısım' }], satirlar: [{ ad: 'Eski', ortamId: null, degerler: { 'Birinci kısım': 'ZZ', 'İkinci kısım': '999' } }] });
    await basarili('/platform/tablo/kaydet', { projeId, ad: 'Ek bilgiler', tur: 'kayit', sutunlar: [{ ad: 'Açıklama' }], satirlar: [{ ad: 'Eski', ortamId: null, degerler: { 'Açıklama': 'korunur' } }] });
  });
  test.afterAll(async () => {
    nobetci?.surec.kill('SIGTERM');
    await fikstur?.kapat();
    if (klasor) rmSync(klasor, { recursive: true, force: true });
  });

  test('özet: iki parçalı alanlar tek tablo / iki sütun, her kartta dört seçenek; elle eşlemeyle bağla + yeni sütun olarak ekle; normal koşu doğru değerleri gönderir; 1440 / 390 px taşma yok', async () => {
    test.setTimeout(300_000);
    await isBitsin();
    const id = String((await basarili('/platform/hizli-test/baslat', {
      projeId, ortamId, hedef: '/parcali-form/', ekranAdi: 'Parçalı form', izin: 'evet', cumle: 'Gönder\'e bas, "Kayıt alındı" görünsün'
    })).id);
    let o = await bekle(id, ['veri']);
    const etiketler = (o.soru.alanlar as Nesne[]).map((a) => a.etiket);
    expect(etiketler).toEqual(expect.arrayContaining(['Kod', 'Kod (2)', 'Cep Telefonu', 'Cep Telefonu (2)']));
    const alan = (etiket: string): string => String(o.soru.alanlar.find((a: Nesne) => a.etiket === etiket)?.anahtar);
    await basarili('/platform/hizli-test/veri', { id, degerler: {
      [alan('Kod')]: { deger: 'AB', kaynak: 'elle' }, [alan('Kod (2)')]: { deger: '123456', kaynak: 'elle' },
      [alan('Cep Telefonu')]: { deger: '532', kaynak: 'elle' }, [alan('Cep Telefonu (2)')]: { deger: '1234567', kaynak: 'elle' }
    } });
    o = await bekle(id, ['karar', 'hataSorusu', 'veri'], 120);
    expect(o.durum, JSON.stringify({ soru: o.soru, gunluk: o.gunluk?.slice(-5) })).toBe('karar');
    const beklenen = { kodSeri: 'AB', kodNo: '123456', tel1: '532', tel2: '1234567' };
    expect(uygulama.gonderilenler.at(-1)).toEqual(beklenen);
    await basarili('/platform/hizli-test/karar', { id, karar: 'bitir' });
    o = await bekle(id, ['bitis']);
    await basarili('/platform/hizli-test/bitis', { id, etiketler: { ...o.soru.etiketler, 'Kayıt alındı': 'bitti' } });
    await bekle(id, ['kaydet']);
    // Plan: "Kod" tek tablo iki sütun; telefon kişi tablosunda iki sütun.
    const oz = (await basarili('/platform/hizli-test/ozet', { id, baslik: 'Parçalı kayıt' })).ozet as Nesne;
    const planTablolari = oz.onizleme.tablolar as Nesne[];
    expect(planTablolari.map((t) => t.ad).sort()).toEqual(['Kişi bilgileri', 'Kod']);
    expect((planTablolari.find((t) => t.ad === 'Kod') as Nesne).sutunlar.map((s: Nesne) => s.ad)).toEqual(['Kod (seri)', 'Kod (numara)']);
    expect((planTablolari.find((t) => t.ad === 'Kişi bilgileri') as Nesne).sutunlar.map((s: Nesne) => s.ad)).toEqual(['Telefon (kod)', 'Telefon (numara)']);

    const tarayici = await korumaliTarayici();
    try {
      const page = await (await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1440, height: 900 } })).newPage();
      const hatalar: string[] = [];
      page.on('pageerror', (e) => hatalar.push(String(e)));
      await page.goto(`/#/hizli-test/ozet/${id}`);
      const ozet = page.locator('.hizli-ozet-karti');
      await expect(ozet.getByRole('heading', { name: /Kayıt özeti/ })).toBeVisible({ timeout: 30_000 });
      const kart = (ad: string) => ozet.locator('.tv-tablo').filter({ has: page.locator('.tv-tablo-ust strong', { hasText: new RegExp(`^${ad}$`) }) });
      // Her kartta dört seçenek; varsayılan yeni tablo (otomatik aday yok).
      for (const ad of ['Kod', 'Kişi bilgileri']) {
        const grup = kart(ad).getByRole('radiogroup', { name: `${ad}: nereye yazılsın` });
        await expect(grup.getByRole('radio')).toHaveCount(4);
        await expect(grup.getByRole('radio', { name: /^Mevcut tabloya bağla/ })).toBeVisible();
        await expect(grup.getByRole('radio', { name: /^Mevcut tabloya yeni sütun olarak ekle/ })).toBeVisible();
        await expect(grup.getByRole('radio', { name: 'Yeni tablo olarak yaz' })).toBeChecked();
        await expect(grup.getByRole('radio', { name: 'Atla (yazma)' })).toBeVisible();
      }
      await expect(kart('Kod')).toContainText('Bağlanacak alanlar: Kod, Kod (2)');
      const neden = ozet.locator('p[role=status]').last();
      await expect(neden).toContainText('2 tablo yazılır (Kod → yeni tablo; Kişi bilgileri → yeni tablo)');
      // (1) "Kod": tablo seç, her sütun için hedef sütun (elle).
      await kart('Kod').getByLabel('Kod: bağlanacak tablo').selectOption({ label: 'Kayıtlar (2 sütun, 1 satır)' });
      await expect(kart('Kod').getByRole('radio', { name: /^Mevcut tabloya bağla: Kayıtlar/ })).toBeChecked();
      await kart('Kod').getByLabel('Kod (seri) → hedef sütun').selectOption('Birinci kısım');
      await kart('Kod').getByLabel('Kod (numara) → hedef sütun').selectOption('Birinci kısım');
      // Aynı sütun iki alana: onay kapanır, neden yazılır.
      await expect(ozet.getByRole('button', { name: 'Onayla ve kaydet' })).toBeDisabled();
      await expect(neden).toContainText('bir sütun iki alana seçildi');
      await kart('Kod').getByLabel('Kod (numara) → hedef sütun').selectOption('İkinci kısım');
      await expect(kart('Kod').getByRole('radio', { name: /^Mevcut tabloya bağla: Kayıtlar › Birinci kısım, İkinci kısım/ })).toBeChecked();
      // Örnek tablonun başlıkları yazılacak sütun adlarını gösterir.
      await expect(kart('Kod').locator('thead th')).toHaveText(['Birinci kısım', 'İkinci kısım']);
      // (2) Telefon: mevcut tabloya yeni sütun; aynı adlı sütun uyarısı ve "Bu sütuna bağla" önerisi.
      await kart('Kişi bilgileri').getByLabel('Kişi bilgileri: sütun eklenecek tablo').selectOption({ label: 'Ek bilgiler (1 sütun, 1 satır)' });
      await expect(kart('Kişi bilgileri').getByRole('radio', { name: /^Mevcut tabloya yeni sütun olarak ekle: Ek bilgiler \+ Telefon \(kod\), Telefon \(numara\)/ })).toBeChecked();
      const ilkAd = kart('Kişi bilgileri').getByLabel('Telefon (kod): yeni sütun adı');
      await ilkAd.fill('Açıklama');
      await expect(kart('Kişi bilgileri')).toContainText('“Açıklama” sütunu “Ek bilgiler” tablosunda zaten var');
      await expect(kart('Kişi bilgileri').getByRole('button', { name: 'Bu sütuna bağla' })).toBeVisible();
      await expect(ozet.getByRole('button', { name: 'Onayla ve kaydet' })).toBeDisabled();
      await ilkAd.fill('Alan kodu');
      await expect(ozet.getByRole('button', { name: 'Onayla ve kaydet' })).toBeEnabled();
      await expect(ozet.locator('.tv-baglar')).toContainText('Ek bilgiler → Alan kodu');
      await expect(neden).toContainText('2 tablo yazılır (Kod → “Kayıtlar” tablosuna bağlanır; Kişi bilgileri → “Ek bilgiler” tablosuna 2 yeni sütun)');
      // 1440 / 390 px taşma yok (seçenekler ve eşleme açıkken).
      for (const genislik of [1440, 390]) {
        await page.setViewportSize({ width: genislik, height: 900 });
        await page.waitForTimeout(150);
        expect(await tasma(page), `${genislik}px`).toBeLessThanOrEqual(0);
        // HIZLI_TEST_EKRAN_KLASORU verilirse görüntü oraya yazılır (inceleme için).
        if (process.env.HIZLI_TEST_EKRAN_KLASORU) await ozet.screenshot({ path: join(process.env.HIZLI_TEST_EKRAN_KLASORU, `ozet-secenekleri-${genislik}.png`) });
      }
      await page.setViewportSize({ width: 1440, height: 900 });
      await ozet.getByRole('button', { name: 'Onayla ve kaydet' }).click();
      await expect(page.getByRole('heading', { name: 'Test kaydedildi' })).toBeVisible({ timeout: 60_000 });
      expect(hatalar).toEqual([]);
    } finally { await tarayici.close(); }

    // Yeni tablo oluşmadı; "Kayıtlar"a yeni satır, "Ek bilgiler"e iki sütun + yeni satır (eski satır korunur).
    const t = await tablolar();
    expect(t.map((x) => x.ad).sort()).toEqual(['Ek bilgiler', 'Kayıtlar']);
    const kayitlar = t.find((x) => x.ad === 'Kayıtlar') as Nesne;
    expect(kayitlar.satirlar.map((r: Nesne) => [r.degerler['Birinci kısım'], r.degerler['İkinci kısım']])).toEqual([['ZZ', '999'], ['AB', '123456']]);
    const ek = t.find((x) => x.ad === 'Ek bilgiler') as Nesne;
    expect(ek.sutunlar.map((s: Nesne) => s.ad)).toEqual(['Açıklama', 'Alan kodu', 'Telefon (numara)']);
    expect(ek.satirlar[0].degerler).toMatchObject({ 'Açıklama': 'korunur' });
    expect(ek.satirlar[0].degerler['Alan kodu'] ?? null).toBeNull();
    expect(ek.satirlar[1].degerler).toMatchObject({ 'Alan kodu': '532', 'Telefon (numara)': '1234567' });
    // Senaryo tablo başvurularıyla, kendi satırlarına sabitlenmiş; normal koşu aynı değerleri gönderir.
    const senaryolar = (await api(`/platform/senaryolar?projeId=${projeId}&ortamId=${ortamId}`)) as Nesne;
    const s = ((senaryolar.senaryolar ?? []) as Nesne[]).find((x) => x.baslik === 'Parçalı kayıt') as Nesne;
    expect(s, JSON.stringify(senaryolar).slice(0, 300)).toBeTruthy();
    const sen = ((await api(`/platform/senaryo?id=${String(s.id)}&ortamId=${ortamId}`)) as Nesne).senaryo as Nesne;
    const veri = JSON.stringify(sen.veri);
    expect(veri).toContain('${Kayıtlar.Birinci kısım}');
    expect(veri).toContain('${Ek bilgiler.Telefon (numara)}');
    expect(sen.tabloSecimleri[`${kayitlar.id}|`]).toEqual({ [SATIR_KIMLIGI]: kayitlar.satirlar[1].id });
    const once = uygulama.gonderilenler.length;
    const y = await api('/platform/senaryolar/calistir', { projeId, kosuId: `kosu-${randomUUID()}`, senaryoId: String(s.id), ortamId });
    expect(y.basarili, y.mesaj).toBe(true);
    const sonuc = (await api(`/platform/sonuclar/sonuc?id=${String(y.sonucId)}`)).sonuc as Nesne;
    expect(sonuc.durum, JSON.stringify(sonuc.hataMesaji)).toBe('basarili');
    expect(uygulama.gonderilenler.length).toBe(once + 1);
    expect(uygulama.gonderilenler.at(-1)).toEqual(beklenen);
  });
});
