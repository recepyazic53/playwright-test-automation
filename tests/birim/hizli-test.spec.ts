// UÇTAN UCA (yerel) — HIZLI TEST SİHİRBAZI: adres + ortam + izin → keşif (basmadan) → veri durağı (Doldur / elle) → adım adım (çok aşamalı
// eylem; izin kipleri) → bitiş koşulu (etiketler) → doğrulama koşusu sorusu → ekran modeli + senaryo. Kaydedilen senaryo Nöbetçi'nin
// normal koşu ucundan (model-senaryolari.spec.ts) koşar: Bitti'de başarılı, Hata'da ve zaman aşımında başarısız.
// Görünür tarayıcı testte başsızdır (NOBETCI_KAYIT_BASSIZ); "Başka düğmeye bas" yerel uzaktan hata ayıklama portundan sürülür.
//
// Güvenlik: şirket sitesine HİÇBİR istek gitmez — ortamın adresi 127.0.0.1'deki sahte çok aşamalı formdur (hizli-test-fikstur.ts),
// tarayıcı yalnızca bu kökene bağlanabilir (NOBETCI_TARAMA_IZINLI_KOKENLER; DNS kapalı). Geçici veritabanı ve ayrı Nöbetçi örneği;
// veri/ klasörüne dokunulmaz. Değerler uydurmadır; hiçbir alan için değer ÜRETİLMEZ (elle ya da tablodan).
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, expect, test, type Browser, type Page } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import {
  basmaKarari, beklemeMetniMi, ornekDegeri, bitisKosulu, bitisiUygula, canliOnayMetni, cumleyiOku, sabitKisim, sayfaUyarisi, tekAday, varsayilanEtiketler
} from '../../scripts/platform/hizli-test/akis.mjs';
import { korumaliTarayici, yerelSunucu } from './giris-fikstur';
import { HizliTestUygulamasi } from './hizli-test-fikstur';
import { bosPort, nobetciApi, nobetciBaslat, type Nobetci, type Yanit } from './nobetci-sunucusu';
import { HIZLI_KDF, izinleriAc } from './platform-ortak';

type Nesne = Record<string, any>;
const PAROLA = `Gecici-Hizli-${randomBytes(6).toString('hex')}`;

let nobetci: Nobetci;
let uygulama: HizliTestUygulamasi;
let fikstur: Awaited<ReturnType<typeof yerelSunucu>>;
let klasor = '';
let cdpPortu = 0;
let projeId = '';
let ortamId = '';
let canliOrtamId = '';
/** Başarılı zincirle kaydedilen senaryo (normal koşu testleri). */
let kayitli: { ekranId: string; senaryoId: string } | null = null;

const api = (yol: string, govde?: Nesne): Promise<Yanit> => nobetciApi(nobetci, yol, govde);
async function basarili(yol: string, govde: Nesne): Promise<Yanit> {
  const y = await api(yol, govde);
  expect(y.basarili, `${yol}: ${y.mesaj ?? ''} ${JSON.stringify(y).slice(0, 400)}`).toBe(true);
  return y;
}
/** Oturum durumu. Keşif toplu sorusu (sayfadaki emin olunmayan düğmeler) bu testin konusu değil: "Hiçbirine basma" ile geçilir. */
const oturum = async (id: string): Promise<Nesne> => {
  for (;;) {
    const o = (await api(`/platform/hizli-test/durum?id=${id}`)).oturum as Nesne;
    if (o?.durum !== 'kesifOnay') return o;
    await api('/platform/hizli-test/onay', { id, cevap: false });
  }
};
/** Oturum verilen durumlardan birine gelene kadar bekler (hata / iptal olursa açık hata). */
async function bekle(id: string, durumlar: string[], sn = 90): Promise<Nesne> {
  const son = Date.now() + sn * 1000;
  for (;;) {
    const o = await oturum(id);
    if (durumlar.includes(o.durum)) return o;
    if (['hata', 'iptal'].includes(o.durum) || Date.now() > son) throw new Error(`beklenen ${durumlar.join('/')}, olan ${o.durum}: ${JSON.stringify(o.hata ?? o.sonHata)} ${JSON.stringify(o.is)}`);
    await new Promise((c) => setTimeout(c, 250));
  }
}
const deger = (d: string | boolean, kaynak = 'elle'): Nesne => ({ deger: d, kaynak });
/** Süren tarayıcı işi bitene kadar (bir sonraki oturum başlayabilsin). */
async function isBitsin(): Promise<void> {
  for (const son = Date.now() + 30_000; Date.now() < son; await new Promise((c) => setTimeout(c, 250))) {
    if (!(await api('/platform/tarama/aktif')).is) return;
  }
  throw new Error('tarayıcı işi bitmedi');
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  test.setTimeout(120_000);
  klasor = mkdtempSync(join(tmpdir(), 'hizli-test-'));
  uygulama = new HizliTestUygulamasi();
  fikstur = await yerelSunucu(uygulama.isle);
  const vtYolu = join(klasor, 'platform.db');
  const vt = await veritabaniniHazirla(vtYolu);
  await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
  izinleriAc(vt);
  vt.kapat();
  cdpPortu = await bosPort();
  nobetci = await nobetciBaslat(klasor, vtYolu, {
    NOBETCI_KAYIT_BASSIZ: '1', NOBETCI_KAYIT_CDP_PORTU: String(cdpPortu), NOBETCI_TARAMA_IZINLI_KOKENLER: fikstur.adres, NOBETCI_KAYIT_ZAMAN_ASIMI_SN: '300', NOBETCI_REHBER_OTOMATIK: '0'
  });
  await basarili('/platform/kasa/ac', { parola: PAROLA });
  projeId = String(((await basarili('/platform/proje/kaydet', { ad: 'Hızlı Test Projesi' })).proje as Nesne).id);
  ortamId = String(((await basarili('/platform/ortam/kaydet', { projeId, ad: 'Deneme', tabanUrl: fikstur.adres, varsayilan: true, riskli: false })).ortam as Nesne).id);
  canliOrtamId = String(((await basarili('/platform/ortam/kaydet', { projeId, ad: 'Canlı kopya', tabanUrl: fikstur.adres, riskli: true })).ortam as Nesne).id);
  // "Doldur" için test verisi tablosu (uydurma kişi).
  await basarili('/platform/tablo/kaydet', {
    projeId, ad: 'Kişi', tur: 'kayit', sutunlar: [{ ad: 'Ad soyad' }], satirlar: [{ ad: 'Deneme', degerler: { 'Ad soyad': 'Deneme Kişi' } }]
  });
});

test.afterAll(async () => {
  nobetci?.surec.kill('SIGTERM');
  await fikstur?.kapat();
  if (klasor) rmSync(klasor, { recursive: true, force: true });
});

test.describe('saf kurallar', () => {
  test('sayfa uyarısı: istenen yerine başka sayfa açıldıysa uyarır (yol karşılaştırılır; sondaki / ve sorgu yok sayılır)', () => {
    expect(sayfaUyarisi('/is/hedef/', '/is/hedef')).toBeNull();
    expect(sayfaUyarisi('/is/hedef', '/is/hedef?x=1')).toBeNull();
    expect(sayfaUyarisi('/is/hedef/', '/')).toMatch(/İstediğiniz sayfa \(\/is\/hedef\) açılmadı: site \/ sayfasına yönlendirdi/);
    expect(sayfaUyarisi('', '/x')).toBeNull();
  });

  test('cümle kalıpla okunur (YZ yok): tırnaklı metin mesaj, "…e bas" düğme; anlaşılmayan yok sayılır', () => {
    expect(cumleyiOku('Formu doldur, Hesapla\'ya bas, "İşlem hazır" mesajını doğrula.')).toEqual({ mesajlar: ['İşlem hazır'], dugmeler: ['Hesapla'] });
    expect(cumleyiOku('“Onayla” düğmesine tıkla; “Başvurunuz alındı” görünsün')).toEqual({ mesajlar: ['Başvurunuz alındı'], dugmeler: ['Onayla'] });
    expect(cumleyiOku('bir şeyler yap')).toEqual({ mesajlar: [], dugmeler: [] });
    expect(cumleyiOku(undefined)).toEqual({ mesajlar: [], dugmeler: [] });
  });
  test('cümle normal Türkçeyle okunur: çekim ekleri, düğme sözcükleri, tırnaksız mesaj, çoklu cümle (YZ yok, uydurma yok)', () => {
    // Düğme: fiil çekimleri ve ekler.
    for (const c of ['Hesapla butonuna tıkla', 'Hesapla düğmesine basıyorum', "Hesapla'ya bas", 'Hesaplaya basacağım', 'Hesapla tuşuna tıklayacağım', 'Hesapla butonunu görünce tıkla']) {
      expect(cumleyiOku(c).dugmeler, c).toEqual(['Hesapla']);
    }
    expect(cumleyiOku('Toplam Hesapla düğmesine tıkla').dugmeler).toEqual(['Hesapla']);
    expect(cumleyiOku('Doldur Hesapla\'ya bas').dugmeler).toEqual(['Hesapla']);
    expect(cumleyiOku('"Toplam Hesapla" düğmesine tıklıyorum').dugmeler).toEqual(['Toplam Hesapla']);
    // Mesaj: tırnaksız ifadeler.
    expect(cumleyiOku('Başvurunuz alındı yazısını görünce bitir').mesajlar).toEqual(['Başvurunuz alındı']);
    expect(cumleyiOku('Başvurunuz alındı mesajını görürsem testi bitir').mesajlar).toEqual(['Başvurunuz alındı']);
    expect(cumleyiOku('Ekranda Toplam tutarı hesaplandı yazısı gelmeli').mesajlar).toEqual(['Toplam tutarı hesaplandı']);
    expect(cumleyiOku('teşekkürler görünce bitir').mesajlar).toEqual(['teşekkürler']);
    // Çoklu cümle: ".", ",", "sonra", "ardından", "ve" ile ayrılır.
    expect(cumleyiOku('Formu doldur ve Hesapla\'ya bas sonra Toplam tutarı hesaplandı mesajı gelmeli')).toEqual({ mesajlar: ['Toplam tutarı hesaplandı'], dugmeler: ['Hesapla'] });
    expect(cumleyiOku('Hesapla düğmesine basacağım, ardından Başvurunuz alındı yazısı çıkınca bitir.')).toEqual({ mesajlar: ['Başvurunuz alındı'], dugmeler: ['Hesapla'] });
    expect(cumleyiOku('Formu doldur. Kaydet butonuna bas. Başarıyla kaydedildi yazısı gelmeli')).toEqual({ mesajlar: ['Başarıyla kaydedildi'], dugmeler: ['Kaydet'] });
    // Anlaşılmayan yok sayılır; düğme adı mesaj sayılmaz.
    expect(cumleyiOku('Formu doldur ve bir bakalım')).toEqual({ mesajlar: [], dugmeler: [] });
    expect(cumleyiOku('Bu butona bas').dugmeler).toEqual([]);
    expect(cumleyiOku('"Onayla" düğmesine tıkla').mesajlar).toEqual([]);
    // Aday adı yazılandan uzunsa (ya da kısaysa) tek aday eşleşir; belirsizse eşleşmez.
    const adaylar = [{ secici: 'a', metin: 'Toplam Hesapla' }, { secici: 'b', metin: 'Temizle' }];
    expect(tekAday(adaylar, ['Hesapla'])?.secici).toBe('a');
    expect(tekAday([...adaylar, { secici: 'c', metin: 'Yeniden Hesapla' }], ['Hesapla'])).toBeNull();
  });
  test('basma kararı: Hayır basmaz, Bana sor her zaman sorar, Evet tek adayda basar / çok adayda sorar', () => {
    expect(basmaKarari({ izin: 'hayir', adaySayisi: 1, kullaniciSecti: true })).toBe('basma');
    expect(basmaKarari({ izin: 'sor', adaySayisi: 1, kullaniciSecti: true })).toBe('sor');
    expect(basmaKarari({ izin: 'evet', adaySayisi: 1 })).toBe('bas');
    expect(basmaKarari({ izin: 'evet', adaySayisi: 3 })).toBe('sor');
    expect(basmaKarari({ izin: 'evet', adaySayisi: 3, kullaniciSecti: true })).toBe('bas');
    // Modeli güncellerken kayıt oluşturabilecek düğmeye "evet" izninde de sorulur.
    expect(basmaKarari({ izin: 'evet', adaySayisi: 1, kullaniciSecti: true, sormadanBasma: true })).toBe('sor');
    expect(basmaKarari({ izin: 'hayir', adaySayisi: 1, sormadanBasma: true })).toBe('basma');
    const adaylar = [{ secici: 'a', metin: 'Hesapla' }, { secici: 'b', metin: 'Temizle' }];
    expect(tekAday(adaylar, ['hesapla'])?.secici).toBe('a');
    expect(tekAday(adaylar, [])).toBeNull();
    expect(canliOnayMetni('evet')).toBe('CANLI ortamda düğmelere basılacak, kayıt oluşabilir.');
  });
  test('örnek senaryo değeri: model alanı seçici + çerçeveyle eşlenir; tablo başvurusu tablo kaynağı; nesne / boş değer alınmaz', () => {
    const model = { adimlar: [{ bolumler: [{ alanlar: [
      { yapilandirma: 'senaryo', konum: { secici: '#ad' }, eslesme: { senaryo: 'adSoyad' } },
      { yapilandirma: 'senaryo', konum: { secici: '#tip', cerceve: ['#f'] }, eslesme: { senaryo: 'tip' } },
      { yapilandirma: 'senaryo', konum: { secici: '#onay' }, eslesme: { senaryo: 'onay' } }
    ] }] }] };
    const veri = { adSoyad: '${Kişi.Ad soyad}', tip: 'kurumsal', onay: true, beklenen: { tip: 'hata' } };
    expect(ornekDegeri(model, { anahtar: 'a', secici: '#ad' }, veri)).toEqual({ deger: '${Kişi.Ad soyad}', kaynak: 'tablo' });
    expect(ornekDegeri(model, { anahtar: 't', secici: '#tip', cerceve: ['#f'] }, veri)).toEqual({ deger: 'kurumsal', kaynak: 'elle' });
    expect(ornekDegeri(model, { anahtar: 't', secici: '#tip' }, veri)).toBeNull();
    expect(ornekDegeri(model, { anahtar: 'o', secici: '#onay' }, veri)).toEqual({ deger: true, kaynak: 'elle' });
    expect(ornekDegeri(model, { anahtar: 'y', secici: '#yeni' }, veri)).toBeNull();
    expect(ornekDegeri(model, { anahtar: 'a', secici: '#ad' }, {})).toBeNull();
    // Radyo: modelde input[name="X"], okumada input[type="radio"][name="X"] (aday seçiciler denenir); değer yazıysa sayfadaki değere çevrilir.
    const radyoModel = { adimlar: [{ bolumler: [{ alanlar: [{ yapilandirma: 'senaryo', konum: { secici: 'input[name="Renewal"]' }, eslesme: { senaryo: 'islemTipi' } }] }] }] };
    const radyo = { anahtar: 'radyo:Renewal', secici: 'input[type="radio"][name="Renewal"]', adaySeciciler: ['input[type="radio"][name="Renewal"]', 'input[name="Renewal"]'], radyolar: [{ deger: 'false', metin: 'Yeni İş' }, { deger: 'true', metin: 'Yenileme' }] };
    expect(ornekDegeri(radyoModel, radyo, { islemTipi: 'false' })).toEqual({ deger: 'false', kaynak: 'elle' });
    expect(ornekDegeri(radyoModel, radyo, { islemTipi: 'YENİ İŞ' })).toEqual({ deger: 'false', kaynak: 'elle' });
    expect(ornekDegeri(radyoModel, { ...radyo, adaySeciciler: [] }, { islemTipi: 'false' })).toBeNull();
  });

  test('bitiş etiketlerinin varsayılanı: son basıştan sonraki metin Bitti, bekleme Devam, hata kutusu Hata', () => {
    expect(beklemeMetniMi('Hesaplanıyor…')).toBe(true);
    expect(beklemeMetniMi('Lütfen bekleyin')).toBe(true);
    expect(beklemeMetniMi('Başvurunuz alındı')).toBe(false);
    const e = varsayilanEtiketler([
      { metin: 'Hesaplanıyor…', tur: 'normal', basis: 1 }, { metin: 'Tutar: 1.250,00 TL', tur: 'normal', basis: 1 },
      { metin: 'Zorunlu alan: Ödeme şekli', tur: 'hata', basis: 2 }, { metin: 'Başvurunuz alındı. Başvuru no: 4701', tur: 'basari', basis: 2 }
    ], 2);
    expect(e).toEqual({ 'Hesaplanıyor…': 'devam', 'Tutar: 1.250,00 TL': null, 'Zorunlu alan: Ödeme şekli': 'hata', 'Başvurunuz alındı. Başvuru no: 4701': 'bitti' });
    expect(sabitKisim('Başvurunuz alındı. Başvuru no: 4701')).toBe('Başvurunuz alındı. Başvuru no:');
    const b = bitisKosulu({ etiketler: e, adres: null });
    expect(b).toMatchObject({ bitti: ['Başvurunuz alındı. Başvuru no:'], hata: ['Zorunlu alan: Ödeme şekli'], devam: ['Hesaplanıyor…'], hatalar: [] });
    expect(bitisKosulu({ etiketler: {}, adres: null }).hatalar).toEqual(['En az bir metni “Bitti” etiketleyin (ya da “Adres şu olursa bitti”yi yazın).']);
    // Model: bitiş koşulu geriye uyumlu, isteğe bağlı alan (doğrulayıcıdan geçer).
    const model: Nesne = { adimlar: [{ id: 'form', kosu: { aksiyonlar: [{ tur: 'tikla', secici: '#a' }] } }], bilinmeyenler: ['Başarı göstergesi seçilmedi: x'] };
    bitisiUygula(model, { bitti: ['Başvurunuz alındı'], devam: ['Hesaplanıyor…'], adres: '/tamam' });
    expect(model.adimlar[0].kosu).toMatchObject({
      basariGostergesi: { tur: 'veya', secenekler: [{ tur: 'metin', deger: 'Başvurunuz alındı' }, { tur: 'url', deger: '/tamam' }] }, bitisKosulu: { devam: ['Hesaplanıyor…'] }, zamanAsimiSn: 60
    });
    expect(model.bilinmeyenler).toEqual([]);
  });
});

test('Evet izni: keşif basmaz; veri durağı (Doldur + elle, koşullu alan); çok aşamalı zincir; bitiş; doğrulama; kaydet; hazırlık ✓', async () => {
  test.setTimeout(240_000);
  const once = { h: uygulama.hesaplamalar.length, o: uygulama.onaylar.length };
  const b = await basarili('/platform/hizli-test/baslat', {
    projeId, ortamId, hedef: '/basvuru/', ekranAdi: 'Başvuru formu', izin: 'evet', cumle: 'Formu doldur, Hesapla\'ya bas, "Başvurunuz alındı" görünsün'
  });
  const id = String(b.id);
  let o = await bekle(id, ['veri']);
  // Keşif hiçbir düğmeye basmadı.
  expect(uygulama.hesaplamalar.length).toBe(once.h);
  expect(o.cumle).toEqual({ mesajlar: ['Başvurunuz alındı'], dugmeler: ['Hesapla'] });
  // Kanal sayfada hazır (Web seçili) gelir: listede vardır ama hazır işaretli (arayüz sormaz, sunucu zorunlu-eksik saymaz).
  expect(o.soru.alanlar.map((a: Nesne) => [a.etiket, a.zorunlu, a.hazir])).toEqual([['Ad soyad', true, false], ['Müşteri tipi', true, false], ['Vergi no', true, false], ['Kanal', false, true]]);
  // Seçim keşfi: ilk açılışta alanlar boşken seçimler tek tek denendi; "Vergi no" yalnız Müşteri tipi = kurumsal olunca görünen koşullu alan
  // olarak (kontrol alanının hemen sonrasında) listelenir. Keşif sayfayı ilk durumuna geri getirdi (Kanal hâlâ Web).
  expect(o.soru.alanlar.find((a: Nesne) => a.etiket === 'Vergi no')).toMatchObject({ kosul: { secim: o.soru.alanlar.find((a: Nesne) => a.etiket === 'Müşteri tipi').anahtar, degerler: ['kurumsal'], metin: 'Müşteri tipi: Kurumsal' } });
  expect(o.soru.alanlar.find((a: Nesne) => a.etiket === 'Kanal')).toMatchObject({ mevcut: 'Web', etiketBulundu: true });
  // Zorunlu alan boşken ilerlenmez (akış tamamlanmadan bitmez).
  expect(await api('/platform/hizli-test/veri', { id, degerler: { '#adSoyad': deger('${Kişi.Ad soyad}', 'tablo') } })).toMatchObject({ basarili: false, kod: 'EKSIK' });
  // Doldurma sırası kullanıcının verdiği sıradır: "sira" ile ters çevrilince adımın alan sırası değişir (eksik hatasına rağmen korunur).
  const anahtarlar = o.soru.alanlar.map((a: Nesne) => String(a.anahtar));
  expect(await api('/platform/hizli-test/veri', { id, degerler: {}, sira: [...anahtarlar].reverse() })).toMatchObject({ basarili: false, kod: 'EKSIK' });
  o = await bekle(id, ['veri']);
  expect(o.soru.alanlar.map((a: Nesne) => String(a.anahtar))).toEqual([...anahtarlar].reverse());
  const alan = (etiket: string): string => String(o.soru.alanlar.find((a: Nesne) => a.etiket === etiket).anahtar);
  // Koşullu "Vergi no" keşifle zaten biliniyor: Kurumsal seçilecekse aynı veri durağında sorulur (yeni alan turu gerekmez).
  await basarili('/platform/hizli-test/veri', { id, degerler: { [alan('Ad soyad')]: deger('${Kişi.Ad soyad}', 'tablo'), [alan('Müşteri tipi')]: deger('kurumsal'), [alan('Vergi no')]: deger('1111111111') } });
  // Evet + cümlede "Hesapla" → tek aday: basılır; sonra fark ve "Şimdi ne yapayım?".
  o = await bekle(id, ['veri']);
  expect(uygulama.hesaplamalar.at(-1)).toEqual({ tip: 'kurumsal', vergi: '1111111111' });
  const fark = o.adimlar[0].fark;
  expect(fark.beklemeMetinleri).toContain('Hesaplanıyor…');
  expect(fark.yeniMetinler.map((m: Nesne) => m.metin)).toContain('Tutar: 2.500,00 TL');
  expect(fark.yeniAlanlar).toEqual(['Ödeme şekli']);
  expect(fark.yeniDugmeler).toContain('Onayla');
  expect(o.goruntu).toMatch(/^\/9j\//);
  expect(o.soru.alanlar.map((a: Nesne) => [a.etiket, a.zorunlu, a.yeni])).toEqual([['Ödeme şekli', false, true]]);
  const odeme = String(o.soru.alanlar[0].anahtar);
  expect(uygulama.onaylar.length).toBe(once.o);
  // Hata yolu: Ödeme şekli boş bırakılır (sayfa işaretlememiş), Onayla'ya basılır → "Zorunlu alan" → "Bu bir hata mı?"
  await basarili('/platform/hizli-test/veri', { id, degerler: {} });
  // İkinci adım: birden çok aday (Onayla, Temizle, Geri…) → "Şimdi ne yapayım?"; bitirilebilir (bir basış oldu).
  o = await bekle(id, ['karar']);
  expect(o.soru.bitirilebilir).toBe(true);
  const onayla = o.soru.adaylar.find((a: Nesne) => a.metin === 'Onayla');
  expect(onayla).toBeTruthy();
  await basarili('/platform/hizli-test/karar', { id, karar: 'bas', secici: onayla.secici });
  o = await bekle(id, ['hataSorusu']);
  expect(o.soru).toEqual({ tur: 'hata', metinler: ['Zorunlu alan: Ödeme şekli'] });
  expect(uygulama.onaylar.length).toBe(once.o);
  // "Bu bir hata": aynı adımın veri durağı; değer girilip yeniden basılır.
  await basarili('/platform/hizli-test/hata-cevabi', { id, cevap: 'hata' });
  o = await bekle(id, ['veri']);
  await basarili('/platform/hizli-test/veri', { id, degerler: { [odeme]: deger('kart') } });
  o = await bekle(id, ['karar']);
  await basarili('/platform/hizli-test/karar', { id, karar: 'bas', secici: onayla.secici });
  o = await bekle(id, ['karar']);
  expect(uygulama.onaylar.length).toBe(once.o + 1);
  expect(o.adimlar[1].fark.yeniMetinler.map((m: Nesne) => m.metin)).toContain('Başvurunuz alındı. Başvuru no: 4701');
  expect(o.adimlar[1].fark.beklemeMetinleri).toContain('Gönderiliyor…');
  // Burada bitir → bitiş etiketleri (varsayılan: son basış Bitti, bekleme Devam).
  await basarili('/platform/hizli-test/karar', { id, karar: 'bitir' });
  o = await bekle(id, ['bitis']);
  const et = o.soru.etiketler as Record<string, string | null>;
  expect(et['Başvurunuz alındı. Başvuru no: 4701']).toBe('bitti');
  expect(et['Hesaplanıyor…']).toBe('devam');
  expect(et['Gönderiliyor…']).toBe('devam');
  expect(et['Tutar: 2.500,00 TL']).toBeNull();
  expect(et['Zorunlu alan: Ödeme şekli']).toBe('hata');
  // Görülmeyen metne etiket verilemez; Bitti olmadan kaydedilemez.
  expect(await api('/platform/hizli-test/bitis', { id, etiketler: { 'Uydurma mesaj': 'bitti' } })).toMatchObject({ basarili: false, kod: 'BITIS' });
  o = await bekle(id, ['bitis']);
  // "Sayfayı yeniden tara": ekrandaki güncel mesajlar görülenlere eklenir, verilen etiketler korunur, adım aynı kalır.
  const gorulenSayisi = o.soru.gorulenler.length;
  await basarili('/platform/hizli-test/yeniden-tara', { id, etiketler: { 'Başvurunuz alındı. Başvuru no: 4701': 'bitti' } });
  o = await bekle(id, ['bitis']);
  expect(o.soru.gorulenler.length).toBeGreaterThanOrEqual(gorulenSayisi);
  expect(o.soru.etiketler['Başvurunuz alındı. Başvuru no: 4701']).toBe('bitti');
  await basarili('/platform/hizli-test/bitis', { id, etiketler: { ...o.soru.etiketler, 'Başvurunuz alındı. Başvuru no: 4701': 'bitti' } });
  o = await bekle(id, ['kaydet']);
  expect(o.soru).toMatchObject({ dogrulanabilir: true, dogrulama: null, ozet: { bitis: { bitti: ['Başvurunuz alındı. Başvuru no:'], hata: ['Zorunlu alan: Ödeme şekli'], devam: ['Hesaplanıyor…', 'Gönderiliyor…'] } } });
  // H3: baştan sona doğrulama koşusu (yeni kayıt oluşur: onaylar +1).
  await basarili('/platform/hizli-test/dogrula', { id });
  o = await bekle(id, ['kaydet'], 120);
  expect(o.soru.dogrulama, JSON.stringify(o.soru.dogrulama)).toMatchObject({ durum: 'basarili' });
  expect(uygulama.onaylar.length).toBe(once.o + 2);
  // ÖZET (yazmadan): tablolar, birleştirme kararı (yeni tablo → "yeni"), bağlantılar ve senaryo önerileri.
  const oz = (await basarili('/platform/hizli-test/ozet', { id, baslik: 'Başvuru formu — kurumsal' })).ozet as Nesne;
  const ozTablolar = (oz.onizleme.tablolar as Nesne[]).map((t) => t.ad).sort();
  // Değer yazılmayan seçim (Kanal: sayfada hazır) tablo olarak önerilmez (yalnız senaryo önerileri için tutulur).
  expect(ozTablolar).toEqual(['Kişi bilgileri', 'Müşteri tipi', 'Ödeme şekli']);
  expect(oz.secim.tablolar['Kişi bilgileri']).toEqual({ islem: 'yeni' });
  expect((oz.onizleme.tablolar as Nesne[]).every((t) => t.mevcut === null)).toBe(true);
  expect(oz.onizleme.baglantilar.length).toBeGreaterThanOrEqual(3);
  expect(oz.senaryolar[0]).toMatchObject({ indeks: 0, baslik: 'Başvuru formu — kurumsal', varsayilanSecili: true });
  // Öneri: Müşteri tipi "Bireysel" (Kurumsal'ın açtığı Vergi no gerekmez) diğer seçimlerin başka değerleriyle birlikte denenir.
  const alternatif = (oz.senaryolar as Nesne[]).find((x) => (x.alt?.degisiklikler as Nesne[] | undefined)?.some((d) => d.etiket === 'Müşteri tipi'));
  expect((alternatif?.alt.degisiklikler as Nesne[]).find((d) => d.etiket === 'Müşteri tipi')).toMatchObject({ deger: 'Bireysel' });
  // Özet hiçbir şey yazmaz.
  expect(((await api(`/platform/tablolar?projeId=${projeId}`)).tablolar as Nesne[]).some((t) => t.ad === 'Kişi bilgileri')).toBe(false);
  const k = await basarili('/platform/hizli-test/kaydet', { id, baslik: 'Başvuru formu — kurumsal', secim: oz.secim, senaryoIndeksleri: [alternatif?.indeks] });
  expect(k).toMatchObject({ kaydedildi: true, dogrulandi: true });
  expect((k.ekSenaryolar as Nesne[]).map((x) => x.baslik)).toEqual([alternatif?.baslik]);
  // Hazırlık kontrolü: tüm satırlar ✓ (çalıştırılabilir).
  expect(k.hazirlik).toMatchObject({ calistirilabilir: true, nedenler: [] });
  expect((k.hazirlik as Nesne).maddeler.filter((m: Nesne) => m.durum === 'eksik')).toEqual([]);
  kayitli = { ekranId: String(k.ekranId), senaryoId: String(k.senaryoId) };
  await isBitsin();
  // Model: bitiş koşulu son adımda, Hata metinleri uyarı; senaryo içeriğinde izin ve bitiş.
  const ekran = (await api(`/platform/ekran?projeId=${projeId}&id=${kayitli.ekranId}`)) as Nesne;
  const model = ekran.model as Nesne;
  expect(model.adimlar).toHaveLength(2);
  expect(model.adimlar[0].kosu).toMatchObject({ aksiyonlar: [{ tur: 'tikla', aciklama: 'Hesapla' }], uyarilar: [{ metin: 'Zorunlu alan: Ödeme şekli' }] });
  const son = model.adimlar[model.adimlar.length - 1];
  expect(son.kosu).toMatchObject({
    aksiyonlar: [{ tur: 'tikla', aciklama: 'Onayla' }], bitisKosulu: { devam: ['Hesaplanıyor…', 'Gönderiliyor…'] },
    basariGostergesi: { tur: 'metin', deger: 'Başvurunuz alındı. Başvuru no:' }, uyarilar: [{ metin: 'Zorunlu alan: Ödeme şekli' }], zamanAsimiSn: 60
  });
  // Koşullu alan: Vergi no, Müşteri tipi = Kurumsal seçilince görünür (okumalardan çıkarıldı).
  const vergiAlani = model.adimlar[0].bolumler.flatMap((x: Nesne) => x.alanlar).find((x: Nesne) => x.konum?.secici === '#vergiNo');
  expect(vergiAlani?.gorunurluk).toBeTruthy();
  const s = (await api(`/platform/senaryo?id=${kayitli.senaryoId}&ortamId=${ortamId}`)) as Nesne;
  expect(JSON.stringify(s)).toContain('${Kişi.Ad soyad}');
  // Elle yazılan değerler test verisi tablolarına, anlamlı gruplara ayrılarak alındı (tek tablo değil): kişi alanı "Kişi bilgileri",
  // diğer her alan kendi başlığıyla kendi tablosunda; alanlar ekranın Test verisi bölümünde ilgili tabloya bağlandı.
  const kTablo = k.tablo as { tablolar: Array<{ tablo: string; sutunSayisi: number; yeni: boolean }>; baglanan: number };
  expect(kTablo.tablolar.map((t) => t.tablo).sort()).toEqual(['Kişi bilgileri', 'Müşteri tipi', 'Ödeme şekli']);
  expect(kTablo.baglanan).toBeGreaterThanOrEqual(3);
  const tablolar = (await api(`/platform/tablolar?projeId=${projeId}`)).tablolar as Nesne[];
  const kisiTablosu = tablolar.find((t: Nesne) => t.ad === 'Kişi bilgileri');
  expect(kisiTablosu?.sutunlar.map((x: Nesne) => x.ad)).toEqual(['Vergi no']);
  expect(kisiTablosu?.satirlar).toHaveLength(1);
  const musteriTablosu = tablolar.find((t: Nesne) => t.ad === 'Müşteri tipi');
  expect(musteriTablosu?.sutunlar.map((x: Nesne) => x.ad)).toEqual(['Müşteri tipi']);
  // Seçim alanı: tabloya seçilen değil TÜM seçenekler yazıldı (liste tablosu); senaryo seçilen satıra sabitlenir (koşuda Kurumsal).
  expect(musteriTablosu?.satirlar.map((r: Nesne) => r.degerler['Müşteri tipi'])).toEqual(['Bireysel', 'Kurumsal']);
  expect(tablolar.find((t: Nesne) => t.ad === 'Ödeme şekli')?.satirlar.map((r: Nesne) => r.degerler['Ödeme şekli'])).toEqual(['Kredi kartı', 'Havale']);
  expect(JSON.stringify(s)).toContain('${Kişi bilgileri.Vergi no}');
  const bag = (await api(`/platform/ekran/alan-baglari?projeId=${projeId}&ekranId=${kayitli.ekranId}`)) as Nesne;
  const baglar = Object.values(bag.baglar as Record<string, Nesne>);
  // Sayfada hazır gelen "Kanal" da modelde (değersiz) olduğu için kendi liste tablosuna bağlanır (yetim tablo kalmaz).
  expect(baglar.map((b) => `${tablolar.find((t: Nesne) => t.id === b.tablo)?.ad}.${b.sutun}`).sort()).toEqual(['Kişi bilgileri.Vergi no', 'Müşteri tipi.Müşteri tipi', 'Ödeme şekli.Ödeme şekli']);
});

test('kaydedilen senaryo normal koşuda (model-senaryolari.spec.ts) aynı zinciri yürütür ve Bitti\'de başarılı olur', async () => {
  test.setTimeout(240_000);
  expect(kayitli).not.toBeNull();
  const once = uygulama.onaylar.length;
  const y = await api('/platform/senaryolar/calistir', { projeId, kosuId: `kosu-${randomUUID()}`, senaryoId: kayitli?.senaryoId, ortamId });
  expect(y.basarili, y.mesaj).toBe(true);
  const sonuc = (await api(`/platform/sonuclar/sonuc?id=${String(y.sonucId)}`)).sonuc as Nesne;
  expect(sonuc.durum, JSON.stringify(sonuc.hataMesaji)).toBe('basarili');
  expect(uygulama.hesaplamalar.at(-1)).toEqual({ tip: 'kurumsal', vergi: '1111111111' });
  expect(uygulama.onaylar.length).toBe(once + 1);
});

test('normal koşu: Hata metni görünürse başarısız, hiçbir bitiş mesajı görünmezse "Bitiş mesajı görülmedi" ile başarısız', async () => {
  test.setTimeout(300_000);
  expect(kayitli).not.toBeNull();
  try {
    uygulama.kip = 'hata';
    const h = await api('/platform/senaryolar/calistir', { projeId, kosuId: `kosu-${randomUUID()}`, senaryoId: kayitli?.senaryoId, ortamId });
    const hs = (await api(`/platform/sonuclar/sonuc?id=${String(h.sonucId)}`)).sonuc as Nesne;
    expect(hs.durum).toBe('basarisiz');
    expect(JSON.stringify(hs.hataMesaji)).toContain('Zorunlu alan: Ödeme şekli');
    uygulama.kip = 'sessiz';
    const z = await api('/platform/senaryolar/calistir', { projeId, kosuId: `kosu-${randomUUID()}`, senaryoId: kayitli?.senaryoId, ortamId });
    const zs = (await api(`/platform/sonuclar/sonuc?id=${String(z.sonucId)}`)).sonuc as Nesne;
    expect(zs.durum).toBe('basarisiz');
    expect(JSON.stringify(zs.hataMesaji)).toContain('Bitiş mesajı görülmedi');
  } finally {
    uygulama.kip = 'normal';
  }
});

/** Hızlı test tarayıcısına (başsız, alt süreç) bağlanıp başvuru sayfasını bulur. */
async function hizliSayfa(yol = '/basvuru/'): Promise<{ tarayici: Browser; sayfa: Page }> {
  const son = Date.now() + 60_000;
  let tarayici: Browser | null = null;
  while (!tarayici) {
    try { tarayici = await chromium.connectOverCDP(`http://127.0.0.1:${cdpPortu}`); } catch {
      if (Date.now() > son) throw new Error('Nöbetçi taraması tarayıcısına bağlanılamadı');
      await new Promise((c) => setTimeout(c, 250));
    }
  }
  for (;;) {
    const sayfa = tarayici.contexts().flatMap((b) => b.pages()).find((p) => p.url().includes(yol));
    if (sayfa) return { tarayici, sayfa };
    if (Date.now() > son) throw new Error('başvuru sayfası bulunamadı');
    await new Promise((c) => setTimeout(c, 250));
  }
}

test('doldururken sayfa hata gösterirse sessizce ilerlenmez: "Bu bir hata mı?" sorulur; önemsiz denince devam edilir', async () => {
  test.setTimeout(200_000);
  await isBitsin();
  const id = String((await basarili('/platform/hizli-test/baslat', { projeId, ortamId, hedef: '/basvuru/', ekranAdi: 'Doldurma uyarısı', izin: 'sor' })).id);
  let o = await bekle(id, ['veri']);
  const alan = (etiket: string): string => String(o.soru.alanlar.find((a: Nesne) => a.etiket === etiket).anahtar);
  await basarili('/platform/hizli-test/veri', { id, degerler: { [alan('Ad soyad')]: deger('HATALI'), [alan('Müşteri tipi')]: deger('bireysel') } });
  o = await bekle(id, ['hataSorusu']);
  expect(o.soru).toEqual({ tur: 'hata', metinler: ['Zorunlu alan: Ad soyad geçersiz'] });
  await basarili('/platform/hizli-test/hata-cevabi', { id, cevap: 'onemsiz' });
  o = await bekle(id, ['karar']);
  expect(o.soru.tur).toBe('karar');
  await basarili('/platform/hizli-test/iptal', { id });
});

test('sayfa doldurulan alanı sonradan silerse (yeniden çizim) boş kalan alan yeniden doldurulur; düğme dolu alanla basılır', async () => {
  test.setTimeout(200_000);
  await isBitsin();
  const once = uygulama.hesaplamalar.length;
  const id = String((await basarili('/platform/hizli-test/baslat', { projeId, ortamId, hedef: '/basvuru/', ekranAdi: 'Silinen alan', izin: 'evet', cumle: 'Hesapla\'ya bas' })).id);
  let o = await bekle(id, ['veri']);
  const alan = (etiket: string): string => String(o.soru.alanlar.find((a: Nesne) => a.etiket === etiket).anahtar);
  await basarili('/platform/hizli-test/veri', { id, degerler: { [alan('Ad soyad')]: deger('SILINIR'), [alan('Müşteri tipi')]: deger('bireysel') } });
  // Ad soyad silinseydi Hesapla "Zorunlu alan: Ad soyad" verirdi (hata sorusu); yeniden doldurulunca hesaplanır ve yeni alan (Ödeme şekli) sorulur.
  o = await bekle(id, ['veri', 'hataSorusu']);
  expect(o.durum, JSON.stringify(o.soru)).toBe('veri');
  expect(uygulama.hesaplamalar.length).toBe(once + 1);
  await basarili('/platform/hizli-test/iptal', { id });
});

test('seçim keşfi: varsayılan seçili radyonun diğer değerinde beliren alanlar ve onun içindeki (iç içe) koşullu alan ilk açılışta bulunur; sayfa ilk durumuna döner', async () => {
  test.setTimeout(200_000);
  await isBitsin();
  const id = String((await basarili('/platform/hizli-test/baslat', { projeId, ortamId, hedef: '/kosullu/', ekranAdi: 'Koşullu alanlar', izin: 'sor' })).id);
  const o = await bekle(id, ['veri']);
  const alanlar = o.soru.alanlar as Nesne[];
  const bul = (etiket: string): Nesne => alanlar.find((a) => a.etiket === etiket) as Nesne;
  const ana = alanlar.find((a) => a.tur === 'radio') as Nesne;
  expect(ana, JSON.stringify(alanlar.map((a) => a.etiket))).toBeTruthy();
  // X (varsayılan) altında A, B; Y altında C, D ve "Ek bilgi"; "Ek bilgi" işaretlenince F (2. düzey).
  for (const e of ['Alan A', 'Alan B']) expect(bul(e).kosul, e).toMatchObject({ secim: ana.anahtar, degerler: ['x'] });
  for (const e of ['Alan C', 'Alan D', 'Ek bilgi']) expect(bul(e).kosul, e).toMatchObject({ secim: ana.anahtar, degerler: ['y'] });
  expect(bul('Alan F').kosul).toMatchObject({ secim: bul('Ek bilgi').anahtar, degerler: ['true'] });
  expect(bul('Alan A').kosul.metin).toBe('Ana seçim: X');
  // Sayfa ilk durumuna döndü: radyo X seçili, Alan A / B görünür (mevcut değer korunur), Y'nin alanları gizli.
  const tarayici = await hizliSayfa('/kosullu/');
  try {
    const durum = await tarayici.sayfa.evaluate(() => ({ ana: (document.querySelector('input[name=ana]:checked') as HTMLInputElement).value, gx: !(document.getElementById('gx') as HTMLElement).hidden, gy: !(document.getElementById('gy') as HTMLElement).hidden }));
    expect(durum).toEqual({ ana: 'x', gx: true, gy: false });
  } finally { await tarayici.tarayici.close(); }
  await basarili('/platform/hizli-test/iptal', { id });
});

/**
 * Kayıt formu (/kayit/: tuş bekleyen telefon maskesi, alandan çıkınca silen sayfa, takvim penceresi, TC sorgusu) için baştan sona hızlı test:
 * veri durağı (verilen sırayla) → Nöbetçi doldurur ve "Hesapla"ya basar → bitiş → doğrulama koşusu → kaydet.
 */
async function kayitHizliTesti(ekranAdi: string, baslik: string, degerler: Record<string, string>, sira: string[] | null): Promise<{ ekranId: string; senaryoId: string; kayit: Nesne }> {
  const once = uygulama.kayitlar.length;
  const id = String((await basarili('/platform/hizli-test/baslat', {
    projeId, ortamId, hedef: '/kayit/?sifirla=tc', ekranAdi, izin: 'evet', cumle: 'Hesapla\'ya bas, "Kayıt alındı" görünsün'
  })).id);
  let o = await bekle(id, ['veri']);
  const alan = (etiket: string): string => String(o.soru.alanlar.find((a: Nesne) => a.etiket === etiket).anahtar);
  // Sayfa sırası: ülke, D.TARİHİ, telefon, TC (Ödeyen radyosu sayfada hazır: sorulmaz).
  expect(o.soru.alanlar.filter((a: Nesne) => !a.hazir).map((a: Nesne) => a.etiket)).toEqual(['Gidilecek ülke', 'D.TARİHİ', 'TELEFON', 'TC KİMLİK NO']);
  await basarili('/platform/hizli-test/veri', {
    id, degerler: Object.fromEntries(Object.entries(degerler).map(([e, v]) => [alan(e), deger(v)])), ...(sira ? { sira: sira.map(alan) } : {})
  });
  // Evet + cümlede "Hesapla": doldurulur ve basılır; sayfa telefonu sildiyse yeniden yazılır (aksi halde "Telefon numarası zorunludur").
  o = await bekle(id, ['karar', 'hataSorusu', 'veri'], 120);
  expect(o.durum, JSON.stringify({ soru: o.soru, hatalar: o.alanHatalari, gunluk: o.gunluk })).toBe('karar');
  expect(uygulama.kayitlar.length).toBe(once + 1);
  const kayit = uygulama.kayitlar.at(-1) as Nesne;
  await basarili('/platform/hizli-test/karar', { id, karar: 'bitir' });
  o = await bekle(id, ['bitis']);
  await basarili('/platform/hizli-test/bitis', { id, etiketler: { ...o.soru.etiketler, 'Kayıt alındı': 'bitti' } });
  o = await bekle(id, ['kaydet']);
  await basarili('/platform/hizli-test/dogrula', { id });
  o = await bekle(id, ['kaydet'], 120);
  expect(o.soru.dogrulama, JSON.stringify(o.soru.dogrulama)).toMatchObject({ durum: 'basarili' });
  expect(uygulama.kayitlar.length).toBe(once + 2); // doğrulama koşusu da kaydı gönderdi
  const k = await basarili('/platform/hizli-test/kaydet', { id, baslik });
  return { ekranId: String(k.ekranId), senaryoId: String(k.senaryoId), kayit };
}

const tabloAdlari = async (): Promise<Nesne[]> => (await api(`/platform/tablolar?projeId=${projeId}`)).tablolar as Nesne[];

test('kayıt formu: telefon maskesi + alandan çıkınca silen sayfa + sonradan sıfırlanan alan; varsayılan (sayfa) sırasıyla doldurulur, değerler doğru gider', async () => {
  test.setTimeout(300_000);
  await isBitsin();
  const r = await kayitHizliTesti('Kayıt formu bir', 'Kayıt bir', { 'Gidilecek ülke': 'FR', 'D.TARİHİ': '13.04.1998', TELEFON: '5426502153', 'TC KİMLİK NO': '45520772518' }, null);
  // Telefon tuşlanarak yazıldı (maske biçimledi), TC sorgusu telefonu sildiyse yeniden yazıldı; hiçbir değer eksik / hatalı değil.
  expect(r.kayit).toMatchObject({ ulke: 'FR', odeyen: 'kendisi', dogum: '13.04.1998', tel: '(542) 650-2153', tc: '45520772518' });
  // Alanlar sayfa sırasıyla dolduruldu.
  expect(r.kayit.sira).toEqual(['ulke', 'dogum', 'tel', 'tc']);
  // Test verisi tabloları: kişi alanları tek tabloda, seçim alanı kendi liste tablosunda (TÜM seçenekler), her alan ekranda bağlı.
  const tablolar = await tabloAdlari();
  const kisi = tablolar.find((t: Nesne) => t.ad === 'Kişi bilgileri') as Nesne;
  // ("Kişi bilgileri" önceki testlerden varsa birleşir: kendi sütunları ve satırı eklenir.)
  expect(kisi.sutunlar.map((x: Nesne) => x.ad)).toEqual(expect.arrayContaining(['Doğum tarihi', 'Telefon', 'Kimlik no']));
  expect(kisi.satirlar.map((x: Nesne) => x.ad)).toContain('Kayıt bir');
  const ulke = tablolar.find((t: Nesne) => t.ad === 'Gidilecek ülke') as Nesne;
  expect(ulke.satirlar.map((x: Nesne) => x.degerler['Gidilecek ülke'])).toEqual(['A.B.D', 'Fransa', 'Almanya']);
  const bag = (await api(`/platform/ekran/alan-baglari?projeId=${projeId}&ekranId=${r.ekranId}`)) as Nesne;
  expect(Object.values(bag.baglar as Record<string, Nesne>).map((b) => `${tablolar.find((t: Nesne) => t.id === b.tablo)?.ad}.${b.sutun}`).sort())
    .toEqual(['Gidilecek ülke.Gidilecek ülke', 'Kişi bilgileri.Doğum tarihi', 'Kişi bilgileri.Kimlik no', 'Kişi bilgileri.Telefon']); // hazır gelen Ödeyen radyosu tabloya bağlanmaz (senaryoda seçilir)
  // Senaryolardan yeniden başlat ("Testi koş"): aynı değerler, tablodan çözülerek, telefon dahil.
  const y = await api('/platform/senaryolar/calistir', { projeId, kosuId: `kosu-${randomUUID()}`, senaryoId: r.senaryoId, ortamId });
  expect(y.basarili, y.mesaj).toBe(true);
  const sonuc = (await api(`/platform/sonuclar/sonuc?id=${String(y.sonucId)}`)).sonuc as Nesne;
  expect(sonuc.durum, JSON.stringify(sonuc.hataMesaji)).toBe('basarili');
  expect(uygulama.kayitlar.at(-1)).toMatchObject({ ulke: 'FR', odeyen: 'kendisi', dogum: '13.04.1998', tel: '(542) 650-2153', tc: '45520772518' });
});

test('kayıt formu: kullanıcının verdiği doldurma sırası izlenir (telefon en sonda); aynı adlı tablolar birleşir (yeni tablo açılmaz), satır eklenir, senaryolar kendi satırını kullanır', async () => {
  test.setTimeout(400_000);
  await isBitsin();
  const onceTablolar = await tabloAdlari();
  expect(onceTablolar.filter((t: Nesne) => t.ad === 'Kişi bilgileri')).toHaveLength(1); // önceki testten
  const onceKisiSatirSayisi = (onceTablolar.find((t: Nesne) => t.ad === 'Kişi bilgileri') as Nesne).satirlar.length;
  const r = await kayitHizliTesti('Kayıt formu iki', 'Kayıt iki', { 'Gidilecek ülke': 'DE', 'D.TARİHİ': '01.02.1990', TELEFON: '5551112233', 'TC KİMLİK NO': '10000000146' },
    ['TC KİMLİK NO', 'Gidilecek ülke', 'D.TARİHİ', 'TELEFON']);
  expect(r.kayit).toMatchObject({ ulke: 'DE', dogum: '01.02.1990', tel: '(555) 111-2233', tc: '10000000146' });
  // Sıra: TC, ülke, D.TARİHİ, telefon (kullanıcının sırası; telefon en son ve TC sorgusundan etkilenmedi).
  expect(r.kayit.sira).toEqual(['tc', 'ulke', 'dogum', 'tel']);
  // Tablolar: aynı adlı tablo var → birleşti (yeni tablo açılmadı): sütunlar aynı, satırlar 2; seçim listesi yeniden yazılmadı (3 seçenek).
  const tablolar = await tabloAdlari();
  expect(tablolar.filter((t: Nesne) => t.ad === 'Kişi bilgileri')).toHaveLength(1);
  expect(tablolar.filter((t: Nesne) => t.ad === 'Gidilecek ülke')).toHaveLength(1);
  expect(tablolar.length).toBe(onceTablolar.length);
  const kisi = tablolar.find((t: Nesne) => t.ad === 'Kişi bilgileri') as Nesne;
  expect(kisi.sutunlar.map((x: Nesne) => x.ad)).toEqual(expect.arrayContaining(['Doğum tarihi', 'Telefon', 'Kimlik no']));
  expect(new Set(kisi.sutunlar.map((x: Nesne) => x.ad)).size).toBe(kisi.sutunlar.length); // tekrar eden sütun yok
  expect(kisi.satirlar).toHaveLength(onceKisiSatirSayisi + 1); // yalnız bu senaryonun satırı eklendi
  expect(kisi.satirlar.map((x: Nesne) => x.ad)).toEqual(expect.arrayContaining(['Kayıt bir', 'Kayıt iki']));
  const ulke = tablolar.find((t: Nesne) => t.ad === 'Gidilecek ülke') as Nesne;
  expect(ulke.satirlar).toHaveLength(3);
  // Kaydedilen senaryo da bu sırayla doldurur ve KENDİ satırını kullanır (ilk senaryo hâlâ ilk satırını).
  const y = await api('/platform/senaryolar/calistir', { projeId, kosuId: `kosu-${randomUUID()}`, senaryoId: r.senaryoId, ortamId });
  expect(y.basarili, y.mesaj).toBe(true);
  expect(uygulama.kayitlar.at(-1)).toMatchObject({ ulke: 'DE', dogum: '01.02.1990', tel: '(555) 111-2233', tc: '10000000146', sira: ['tc', 'ulke', 'dogum', 'tel'] });
});

/**
 * /maskeli/ gönderiminin kanıtları: maskeli alanlar hiçbir zaman "yaz-sil-yaz" yapmadı (değer geçmişinde boşalma yok, her değer bir
 * öncekinin uzantısı), keyup sorgusu (11 hane) bir kez tetiklendi ve adı doldurdu, alanlar kısa sürede doldu (uzun yoklamaya rağmen).
 */
function maskeliKaniti(k: Nesne, ad: string): void {
  expect(k, ad).toMatchObject({ dogum: '13.04.1998', tel: '(542) 650-2153', tc: '45520772518', ad: 'D*** K***', sorgular: 1 });
  for (const alan of ['dogum', 'tel', 'tc']) {
    const g = k.gecmis[alan] as string[];
    expect(g, `${ad} ${alan} geçmişi`).not.toContain('');
    g.forEach((v, i) => { if (i) expect(v.replace(/\D/g, '').startsWith(g[i - 1].replace(/\D/g, '')), `${ad} ${alan}: ${JSON.stringify(g)}`).toBe(true); });
  }
  // Üç alan (ilk girdiden Gönder'e): alan başı 3 sn'den az (uzun yoklama beklenmez).
  expect(k.dolumMs, `${ad} doldurma süresi`).toBeGreaterThan(0);
  expect(k.dolumMs, `${ad} doldurma süresi`).toBeLessThan(9_000);
}

test('maskeli alanlar ve uzun yoklama: gerçek tuşlarla yazılır (yaz-sil-yaz yok), 11 hanede sorgu tetiklenir, alan başı bekleme kısa; doğrulama koşusu adım adım izlenir; normal koşu aynı', async () => {
  test.setTimeout(300_000);
  await isBitsin();
  const once = uygulama.maskeliKayitlar.length;
  const id = String((await basarili('/platform/hizli-test/baslat', { projeId, ortamId, hedef: '/maskeli/', ekranAdi: 'Maskeli form', izin: 'sor' })).id);
  let o = await bekle(id, ['veri'], 120);
  const alan = (etiket: string): string => String(o.soru.alanlar.find((a: Nesne) => a.etiket === etiket).anahtar);
  const bas = Date.now();
  await basarili('/platform/hizli-test/veri', { id, degerler: { [alan('Doğum tarihi')]: deger('13.04.1998'), [alan('Telefon')]: deger('5426502153'), [alan('T.C. kimlik no')]: deger('45520772518') } });
  o = await bekle(id, ['karar', 'veri', 'hataSorusu'], 120);
  const dolumSn = (Date.now() - bas) / 1000;
  expect(o.durum, JSON.stringify({ soru: o.soru, gunluk: o.gunluk })).toBe('karar');
  // Uzun yoklama (20 sn açık) varken üç alan: eskiden alan başına 15 sn beklenirdi.
  expect(dolumSn, 'doldurma turu (sn)').toBeLessThan(15);
  // Hızlı test tarayıcısında: sorgu tetiklendi, telefonun değer geçmişinde boşalma yok.
  const t = await hizliSayfa('/maskeli/');
  try {
    const d = await t.sayfa.evaluate(() => ({ ad: (document.getElementById('adSoyad') as HTMLInputElement).value, gecmis: (window as unknown as { __gecmis: Record<string, string[]> }).__gecmis }));
    expect(d.ad).toBe('D*** K***');
    expect(d.gecmis.tel).not.toContain('');
    expect(d.gecmis.tel.at(-1)).toBe('(542) 650-2153');
  } finally { await t.tarayici.close(); }
  const gonder = o.soru.adaylar.find((a: Nesne) => a.metin === 'Gönder');
  await basarili('/platform/hizli-test/karar', { id, karar: 'bas', secici: gonder.secici });
  await bekle(id, ['onay']);
  await basarili('/platform/hizli-test/onay', { id, cevap: true });
  o = await bekle(id, ['karar'], 90);
  expect(uygulama.maskeliKayitlar.length).toBe(once + 1);
  maskeliKaniti(uygulama.maskeliKayitlar.at(-1) as Nesne, 'Nöbetçi taraması');
  expect(o.adimlar[0].fark.sureMs, 'basıştan sonra sayfa izleme (ms)').toBeLessThan(10_000);
  await basarili('/platform/hizli-test/karar', { id, karar: 'bitir' });
  o = await bekle(id, ['bitis']);
  await basarili('/platform/hizli-test/bitis', { id, etiketler: { ...o.soru.etiketler, 'Kayıt tamam': 'bitti' } });
  await bekle(id, ['kaydet']);
  // Doğrulama koşusu: adımlar listelenir ve hangi adımda olunduğu ilerledikçe görünür (sürüyor → tamam).
  await basarili('/platform/hizli-test/dogrula', { id });
  const gorulenler: string[] = [];
  const adimDurumlari = new Set<string>();
  for (const son = Date.now() + 120_000; ;) {
    o = await oturum(id);
    if (o.calisiyor) gorulenler.push(String(o.calisiyor));
    for (const [i, x] of (o.dogrulamaAdimlari ?? []).entries()) adimDurumlari.add(`${i}:${x.durum}`);
    if (o.durum === 'kaydet' || Date.now() > son) break;
    await new Promise((c) => setTimeout(c, 100));
  }
  expect(o.soru.dogrulama, JSON.stringify(o.soru.dogrulama)).toMatchObject({ durum: 'basarili' });
  expect(o.dogrulamaAdimlari.map((x: Nesne) => [x.metin, x.durum])).toEqual([['1. 3 alan doldur, sonra “Gönder” bas', 'tamam'], ['Bitiş koşulu', 'tamam']]);
  expect(gorulenler.some((m) => /1\/1\. adım: “(Doğum tarihi|Telefon|T\.C\. kimlik no)” dolduruluyor/.test(m)), JSON.stringify([...new Set(gorulenler)])).toBe(true);
  expect(adimDurumlari.has('0:suruyor'), JSON.stringify([...adimDurumlari])).toBe(true);
  expect(uygulama.maskeliKayitlar.length).toBe(once + 2);
  maskeliKaniti(uygulama.maskeliKayitlar.at(-1) as Nesne, 'doğrulama koşusu');
  // Kaydet ve normal koşu (model-kosucu.ts): aynı ortak yazma kuralı.
  const k = await basarili('/platform/hizli-test/kaydet', { id, baslik: 'Maskeli bir', tabloOlustur: false });
  expect(k.kaydedildi).toBe(true);
  await isBitsin();
  const y = await api('/platform/senaryolar/calistir', { projeId, kosuId: `kosu-${randomUUID()}`, senaryoId: String(k.senaryoId), ortamId });
  expect(y.basarili, y.mesaj).toBe(true);
  const sonuc = (await api(`/platform/sonuclar/sonuc?id=${String(y.sonucId)}`)).sonuc as Nesne;
  expect(sonuc.durum, JSON.stringify(sonuc.hataMesaji)).toBe('basarili');
  expect(uygulama.maskeliKayitlar.length).toBe(once + 3);
  maskeliKaniti(uygulama.maskeliKayitlar.at(-1) as Nesne, 'normal koşu');
});

test('Bana sor: her basıştan önce onay (Hayır → basılmaz); "Başka düğmeye bas" sayfada seçilir (tıklama iletilmez); beklenen uyarı → olumsuz senaryo', async () => {
  test.setTimeout(300_000);
  await isBitsin();
  const once = { h: uygulama.hesaplamalar.length, o: uygulama.onaylar.length };
  const id = String((await basarili('/platform/hizli-test/baslat', { projeId, ortamId, hedef: '/basvuru/', ekranAdi: 'Başvuru formu eksik ödeme', izin: 'sor' })).id);
  let o = await bekle(id, ['veri']);
  const alan = (etiket: string): string => String(o.soru.alanlar.find((a: Nesne) => a.etiket === etiket).anahtar);
  await basarili('/platform/hizli-test/veri', { id, degerler: { [alan('Ad soyad')]: deger('Deneme Kişi'), [alan('Müşteri tipi')]: deger('bireysel') } });
  // Bana sor: tek aday olsa da kendiliğinden basılmaz.
  o = await bekle(id, ['karar']);
  expect(o.soru.bitirilebilir).toBe(false);
  expect(await api('/platform/hizli-test/karar', { id, karar: 'bitir' })).toMatchObject({ basarili: false, kod: 'KARAR' });
  // "Başka bir düğmeye bas…": sayfada tıklanan öğe seçilir, tıklama sayfaya gitmez.
  await basarili('/platform/hizli-test/karar', { id, karar: 'baska' });
  o = await bekle(id, ['secim']);
  const { tarayici, sayfa } = await hizliSayfa();
  try {
    await expect(sayfa.locator('#nobetci-hizli-secim')).toBeAttached();
    await sayfa.click('#hesapla');
  } finally {
    await tarayici.close().catch(() => undefined);
  }
  o = await bekle(id, ['onay']);
  expect(o.soru.dugme).toMatchObject({ metin: 'Hesapla' });
  expect(uygulama.hesaplamalar.length).toBe(once.h);
  // Onay verilmezse basılmaz.
  await basarili('/platform/hizli-test/onay', { id, cevap: false });
  o = await bekle(id, ['karar']);
  expect(uygulama.hesaplamalar.length).toBe(once.h);
  const hesapla = o.soru.adaylar.find((a: Nesne) => a.metin === 'Hesapla');
  await basarili('/platform/hizli-test/karar', { id, karar: 'bas', secici: hesapla.secici });
  o = await bekle(id, ['onay']);
  await basarili('/platform/hizli-test/onay', { id, cevap: true });
  o = await bekle(id, ['veri']);
  expect(uygulama.hesaplamalar.length).toBe(once.h + 1);
  await basarili('/platform/hizli-test/veri', { id, degerler: {} });
  o = await bekle(id, ['karar']);
  await basarili('/platform/hizli-test/karar', { id, karar: 'bas', secici: o.soru.adaylar.find((a: Nesne) => a.metin === 'Onayla').secici });
  o = await bekle(id, ['onay']);
  expect(o.soru.dugme).toMatchObject({ metin: 'Onayla', kayitOlusturabilir: true });
  await basarili('/platform/hizli-test/onay', { id, cevap: true });
  o = await bekle(id, ['hataSorusu']);
  // Beklenen uyarı: olumsuz senaryo (hata mesajı = beklenen sonuç).
  await basarili('/platform/hizli-test/hata-cevabi', { id, cevap: 'uyari' });
  o = await bekle(id, ['bitis']);
  expect(o.soru.olumsuz).toEqual({ mesaj: 'Zorunlu alan: Ödeme şekli' });
  expect(o.soru.etiketler['Zorunlu alan: Ödeme şekli']).toBe('hata');
  await basarili('/platform/hizli-test/bitis', { id, etiketler: o.soru.etiketler, olumsuz: { mesaj: 'Zorunlu alan: Ödeme şekli' } });
  o = await bekle(id, ['kaydet']);
  expect(o.soru.ozet.olumsuz).toEqual({ mesaj: 'Zorunlu alan: Ödeme şekli' });
  await basarili('/platform/hizli-test/dogrula', { id });
  o = await bekle(id, ['kaydet'], 120);
  expect(o.soru.dogrulama, JSON.stringify(o.soru.dogrulama)).toMatchObject({ durum: 'basarili' });
  expect(uygulama.onaylar.length).toBe(once.o);
  const k = await basarili('/platform/hizli-test/kaydet', { id, baslik: 'Ödeme şekli boş' });
  expect(k.hazirlik).toMatchObject({ calistirilabilir: true });
  await isBitsin();
  // Normal koşu: beklenen uyarı görülür → başarılı; kayıt oluşturan istek gitmez.
  const y = await api('/platform/senaryolar/calistir', { projeId, kosuId: `kosu-${randomUUID()}`, senaryoId: k.senaryoId, ortamId });
  const sonuc = (await api(`/platform/sonuclar/sonuc?id=${String(y.sonucId)}`)).sonuc as Nesne;
  expect(sonuc.durum, JSON.stringify(sonuc.hataMesaji)).toBe('basarili');
  expect(uygulama.onaylar.length).toBe(once.o);
});

test('Hayır izni: hiçbir düğmeye basılmaz (sayaçlar 0); düğme ve mesaj adaylardan; doğrulama yok, "doğrulanmadı" kaydedilir', async () => {
  test.setTimeout(180_000);
  await isBitsin();
  const once = { istek: uygulama.istekler.filter((x) => x.includes('/api/')).length, h: uygulama.hesaplamalar.length, o: uygulama.onaylar.length };
  const id = String((await basarili('/platform/hizli-test/baslat', {
    projeId, ortamId, hedef: '/basvuru/', ekranAdi: 'Başvuru formu basılmadan', izin: 'hayir', cumle: 'Hesapla\'ya bas, "Tutar:" görünsün'
  })).id);
  let o = await bekle(id, ['veri']);
  const alan = (etiket: string): string => String(o.soru.alanlar.find((a: Nesne) => a.etiket === etiket).anahtar);
  await basarili('/platform/hizli-test/veri', { id, degerler: { [alan('Ad soyad')]: deger('Deneme Kişi'), [alan('Müşteri tipi')]: deger('bireysel') } });
  o = await bekle(id, ['hayirSecim']);
  expect(o.soru.mesajlar).toEqual(expect.arrayContaining([{ metin: 'Tutar:', tur: 'basari', kaynak: 'cumle' }]));
  const hesapla = o.soru.adaylar.find((a: Nesne) => a.metin === 'Hesapla');
  expect(o.soru.oneri).toBe(hesapla.secici);
  expect(await api('/platform/hizli-test/karar', { id, karar: 'bas', secici: hesapla.secici })).toMatchObject({ basarili: false, kod: 'KARAR' });
  // Mesaj uydurulamaz: yalnız adaylardan.
  expect(await api('/platform/hizli-test/karar', { id, karar: 'bitir', dugme: hesapla.secici, mesajlar: ['Uydurma'] })).toMatchObject({ basarili: false, kod: 'MESAJ' });
  await basarili('/platform/hizli-test/karar', { id, karar: 'bitir', dugme: hesapla.secici, mesajlar: ['Tutar:'] });
  o = await bekle(id, ['bitis']);
  expect(o.soru.etiketler).toMatchObject({ 'Tutar:': 'bitti' });
  await basarili('/platform/hizli-test/bitis', { id, etiketler: o.soru.etiketler });
  o = await bekle(id, ['kaydet']);
  expect(o.soru).toMatchObject({ dogrulanabilir: false, dogrulama: { durum: 'yapilmadi' } });
  expect(await api('/platform/hizli-test/dogrula', { id })).toMatchObject({ basarili: false, kod: 'IZIN' });
  const k = await basarili('/platform/hizli-test/kaydet', { id, baslik: 'Basılmadan' });
  expect(k).toMatchObject({ dogrulandi: false, hazirlik: { calistirilabilir: true } });
  await isBitsin();
  // Siteye tek bir düğme isteği bile gitmedi.
  expect(uygulama.istekler.filter((x) => x.includes('/api/')).length).toBe(once.istek);
  expect(uygulama.hesaplamalar.length).toBe(once.h);
  expect(uygulama.onaylar.length).toBe(once.o);
  const s = (await api(`/platform/senaryo?id=${String(k.senaryoId)}&ortamId=${ortamId}`)) as Nesne;
  expect(JSON.stringify(s)).toContain('"izin":"hayir"');
});

test('CANLI ortam: kilit yok, bir kez açık onay istenir (onaysız tarayıcı açılmaz); onaylıyla başlar', async () => {
  test.setTimeout(120_000);
  await isBitsin();
  const once = uygulama.istekler.length;
  expect(await api('/platform/hizli-test/baslat', { projeId, ortamId: canliOrtamId, hedef: '/basvuru/', ekranAdi: 'Canlı deneme', izin: 'evet' }))
    .toMatchObject({ basarili: false, kod: 'CANLI_ONAY_GEREKLI', mesaj: 'CANLI ortamda düğmelere basılacak, kayıt oluşabilir.' });
  expect(await api('/platform/hizli-test/baslat', { projeId, ortamId: canliOrtamId, hedef: '/basvuru/', ekranAdi: 'Canlı deneme', izin: 'hayir' }))
    .toMatchObject({ basarili: false, kod: 'CANLI_ONAY_GEREKLI', mesaj: 'CANLI ortama bağlanılacak (giriş dahil). Hiçbir düğmeye basılmaz.' });
  expect(uygulama.istekler.length).toBe(once);
  const id = String((await basarili('/platform/hizli-test/baslat', { projeId, ortamId: canliOrtamId, hedef: '/basvuru/', ekranAdi: 'Canlı deneme', izin: 'sor', canliOnay: true })).id);
  const o = await bekle(id, ['veri']);
  expect(o.ortam).toMatchObject({ canli: true });
  await basarili('/platform/hizli-test/iptal', { id });
  expect((await oturum(id)).durum).toBe('iptal');
  await isBitsin();
});

test('başka sitenin tam adresi: kayıtsızsa sorulur (409, hiçbir istek / tarayıcı yok); aynı kökteki tam adres yola ayrılır ve başlar', async () => {
  test.setTimeout(120_000);
  await isBitsin();
  const once = uygulama.istekler.length;
  const y = await api('/platform/hizli-test/baslat', { projeId, ortamId, hedef: 'http://127.0.0.2:9/basvuru/', ekranAdi: 'Başka site', izin: 'sor' });
  expect(y).toMatchObject({ basarili: false, kod: 'TABAN_KAYITLI_DEGIL', koken: 'http://127.0.0.2:9' });
  expect(String(y.mesaj)).toContain('Bu site adresi kayıtlı değil');
  expect((await api('/platform/tarama/aktif')).is ?? null).toBeNull();
  expect(uygulama.istekler.length).toBe(once);
  // Ortamın kendi kökeninde tam adres: yol ayrılır ("/" ile başlayan yol olarak saklanır).
  const id = String((await basarili('/platform/hizli-test/baslat', { projeId, ortamId, hedef: `${fikstur.adres}/basvuru/`, ekranAdi: 'Tam adresli', izin: 'sor' })).id);
  const o = await bekle(id, ['veri']);
  expect(o.hedef).toBe('/basvuru/');
  await basarili('/platform/hizli-test/iptal', { id });
  await isBitsin();
});

test('düzenleme kipi (aynı ekran): yeni model sürümü; kaydetmeden önce farklar ve etkilenen senaryolar onaya sunulur', async () => {
  test.setTimeout(180_000);
  await isBitsin();
  expect(kayitli).not.toBeNull();
  const sec = await api(`/platform/hizli-test/secenekler?projeId=${projeId}&ekranId=${kayitli?.ekranId}`);
  expect(sec.ekran).toMatchObject({ id: kayitli?.ekranId, ad: 'Başvuru formu', urlYolu: '/basvuru/' });
  const id = String((await basarili('/platform/hizli-test/baslat', { projeId, ortamId, hedef: '/basvuru/', ekranId: kayitli?.ekranId, izin: 'hayir', cumle: '"Tutar:"' })).id);
  let o = await bekle(id, ['veri']);
  expect(o.duzenleme).toBe(true);
  const alan = (etiket: string): string => String(o.soru.alanlar.find((a: Nesne) => a.etiket === etiket).anahtar);
  await basarili('/platform/hizli-test/veri', { id, degerler: { [alan('Ad soyad')]: deger('Deneme Kişi'), [alan('Müşteri tipi')]: deger('bireysel') } });
  o = await bekle(id, ['hayirSecim']);
  await basarili('/platform/hizli-test/karar', { id, karar: 'bitir', dugme: o.soru.adaylar.find((a: Nesne) => a.metin === 'Hesapla').secici, mesajlar: ['Tutar:'] });
  o = await bekle(id, ['bitis']);
  await basarili('/platform/hizli-test/bitis', { id, etiketler: o.soru.etiketler });
  await bekle(id, ['kaydet']);
  const surum = async (): Promise<number> => Number(((await api(`/platform/ekran?projeId=${projeId}&id=${kayitli?.ekranId}`)) as Nesne).surum);
  const surumOnce = await surum();
  const senaryoBasliklari = async (): Promise<string[]> => ((await api(`/platform/senaryolar?projeId=${projeId}`)).senaryolar as Nesne[])
    .filter((x) => x.ekranId === kayitli?.ekranId).map((x) => String(x.baslik)).sort();
  const onceSenaryolar = await senaryoBasliklari();
  expect(onceSenaryolar).toContain('Başvuru formu — kurumsal');
  // Aynı başlıklı senaryo varsa üzerine yazmadan önce sorulur: hiçbir şey yazılmadan döner.
  expect(await basarili('/platform/hizli-test/kaydet', { id, baslik: 'Başvuru formu — kurumsal' })).toMatchObject({ senaryoVar: true, baslik: 'Başvuru formu — kurumsal' });
  expect(await surum()).toBe(surumOnce);
  const f = await basarili('/platform/hizli-test/kaydet', { id, baslik: 'Başvuru formu — bireysel' });
  expect(f.onayGerekli).toBe(true);
  expect((f.farklar as Nesne).senaryolar).toEqual(expect.arrayContaining(['Başvuru formu — kurumsal']));
  expect((f.farklar as Nesne).ozet.toplam).toBeGreaterThan(0);
  expect(await surum()).toBe(surumOnce);
  // Arayüz: özet kendi sekmesinde; aynı adlı senaryo için "Üzerine yaz / Yeni adla kaydet / Vazgeç" penceresi.
  const oz = (await basarili('/platform/hizli-test/ozet', { id, baslik: 'Başvuru formu — kurumsal' })).ozet as Nesne;
  expect(oz).toMatchObject({ senaryoVar: true, tercih: { tabloOlustur: true, kosuyaDahil: true } });
  const tarayici = await korumaliTarayici();
  try {
    const page = await (await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1440, height: 900 } })).newPage();
    const hatalar: string[] = [];
    page.on('pageerror', (e) => hatalar.push(String(e)));
    await page.goto(`/#/hizli-test/ozet/${id}`);
    const ozet = page.locator('.hizli-ozet-karti');
    await expect(ozet).toContainText('“Başvuru formu — kurumsal” adlı senaryo bu ekranda zaten var', { timeout: 30_000 });
    for (const r of await ozet.getByRole('radio', { name: /^Birleştir/ }).all()) await r.check();
    await ozet.getByRole('button', { name: 'Farkları onayla ve kaydet' }).click();
    const pencere = page.locator('dialog[open]');
    await expect(pencere.getByRole('heading')).toHaveText('“Başvuru formu — kurumsal” senaryosu var');
    await expect(pencere.getByRole('button')).toHaveText(['Vazgeç', 'Üzerine yaz', 'Yeni adla kaydet']);
    await tasmaYok(page, 'Senaryo var penceresi');
    // Vazgeç: hiçbir şey yazılmaz.
    await pencere.getByRole('button', { name: 'Vazgeç' }).click();
    await expect(pencere).toHaveCount(0);
    expect(await surum()).toBe(surumOnce);
    // Yeni adla kaydet: aynı ad kabul edilmez; yeni adla kaydedilir, eski senaryoya dokunulmaz.
    await ozet.getByRole('button', { name: 'Farkları onayla ve kaydet' }).click();
    await pencere.getByLabel('Yeni ad').fill('Başvuru formu — kurumsal');
    await pencere.getByRole('button', { name: 'Yeni adla kaydet' }).click();
    await expect(pencere.getByRole('alert')).toHaveText('Farklı bir ad yazın.');
    await pencere.getByLabel('Yeni ad').fill('Başvuru formu — bireysel');
    await pencere.getByRole('button', { name: 'Yeni adla kaydet' }).click();
    await expect(page.getByRole('heading', { name: 'Test kaydedildi' })).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('.hizli-soru')).toContainText('senaryo “Başvuru formu — bireysel” kaydedildi');
    expect(hatalar).toEqual([]);
  } finally { await tarayici.close(); }
  expect(await surum()).toBe(surumOnce + 1);
  expect(await senaryoBasliklari()).toEqual([...new Set([...onceSenaryolar, 'Başvuru formu — bireysel'])].sort());
  await isBitsin();
});

test('modeli güncelleme: seçilen örnek senaryonun verileri alanlara dolar (yeniden sorulmaz); başka ekranın senaryosu reddedilir', async () => {
  test.setTimeout(120_000);
  await isBitsin();
  expect(kayitli).not.toBeNull();
  const sec = await api(`/platform/hizli-test/secenekler?projeId=${projeId}&ekranId=${kayitli?.ekranId}`);
  expect((sec.ekran as Nesne).senaryolar).toEqual(expect.arrayContaining([expect.objectContaining({ id: kayitli?.senaryoId })]));
  expect(await api('/platform/hizli-test/baslat', { projeId, ortamId, hedef: '/basvuru/', ekranId: kayitli?.ekranId, izin: 'hayir', ornekSenaryoId: 'yok-boyle-senaryo' }))
    .toMatchObject({ basarili: false });
  const id = String((await basarili('/platform/hizli-test/baslat', { projeId, ortamId, hedef: '/basvuru/', ekranId: kayitli?.ekranId, izin: 'hayir', ornekSenaryoId: kayitli?.senaryoId })).id);
  const o = await bekle(id, ['veri']);
  const alan = (etiket: string): Nesne => o.soru.alanlar.find((a: Nesne) => a.etiket === etiket);
  expect(alan('Ad soyad').deger).toBeTruthy();
  // Senaryodaki tablo başvurusu olduğu gibi gelir (tablo kaynağı).
  expect(alan('Müşteri tipi')).toMatchObject({ deger: '${Müşteri tipi.Müşteri tipi}', kaynak: 'tablo' });
  expect(o.gunluk.map((g: Nesne) => String(g.metin ?? g)).join(' ')).toContain('senaryosundan doldurulur');
  await basarili('/platform/hizli-test/iptal', { id });
  await isBitsin();
});

test('modeli güncelleme sonu: senaryo kaydedilmez, model değişmez; ulaşılmayan adım silindi sayılmaz (sahte fark yok, karşılaştırılmadı notu)', async () => {
  test.setTimeout(180_000);
  await isBitsin();
  expect(kayitli).not.toBeNull();
  const ekranAdresi = `/platform/ekran?projeId=${projeId}&id=${kayitli?.ekranId}`;
  const surumOnce = Number(((await api(ekranAdresi)) as Nesne).surum);
  const modelOnce = ((await api(ekranAdresi)) as Nesne).model as Nesne | null;
  const senaryoSayisi = async (): Promise<number> => ((await api(`/platform/senaryolar?projeId=${projeId}`)).senaryolar as Nesne[]).length;
  const senaryoOnce = await senaryoSayisi();
  // Düzenleme kipinde (modelGuncelleme yok) "farklar" kullanılamaz.
  const id = String((await basarili('/platform/hizli-test/baslat', { projeId, ortamId, hedef: '/basvuru/', ekranId: kayitli?.ekranId, izin: 'hayir', cumle: '"Tutar:"', ornekSenaryoId: kayitli?.senaryoId, modelGuncelleme: true })).id);
  let o = await bekle(id, ['veri']);
  expect(o.modelGuncelleme).toBe(true);
  const alan = (etiket: string): string => String(o.soru.alanlar.find((a: Nesne) => a.etiket === etiket).anahtar);
  await basarili('/platform/hizli-test/veri', { id, degerler: { [alan('Ad soyad')]: deger('Deneme Kişi'), [alan('Müşteri tipi')]: deger('bireysel') } });
  o = await bekle(id, ['hayirSecim']);
  await basarili('/platform/hizli-test/karar', { id, karar: 'bitir', dugme: o.soru.adaylar.find((a: Nesne) => a.metin === 'Hesapla').secici, mesajlar: ['Tutar:'] });
  o = await bekle(id, ['bitis']);
  await basarili('/platform/hizli-test/bitis', { id, etiketler: o.soru.etiketler });
  await bekle(id, ['kaydet']);
  const r = await basarili('/platform/hizli-test/farklar', { id });
  expect(r).toMatchObject({ kaydedildi: true, farklar: true, ekranId: kayitli?.ekranId });
  expect(typeof r.bulguSayisi).toBe('number');
  expect(Number(((await api(ekranAdresi)) as Nesne).surum)).toBe(surumOnce);
  expect(await senaryoSayisi()).toBe(senaryoOnce);
  // Kullanıcı Hesapla'dan sonraki adıma geçmedi: o adım "kaldırılan adım", alanı "taşındı" sayılmaz; karşılaştırılmadı notu.
  // Modelde 1. adımdan sonra adım varsa (bu dosya tek başına koşunca "Hesapla sonrası") onlar karşılaştırılmadı diye not edilir.
  const sonrakiler = ((modelOnce?.adimlar ?? []) as Nesne[]).slice(1).map((x) => String(x.baslik || x.id));
  for (const ad of sonrakiler) expect(String(r.karsilastirilmayan)).toContain(ad);
  // (Önceki testler modeli değiştirmiş olabilir: gerçek farklar kalabilir; ulaşılmayan adım kaynaklı sahte farklar olmamalı.)
  const analiz = (await api(`/platform/ekran/analiz?projeId=${projeId}&id=${kayitli?.ekranId}`)).analiz as (Nesne & { bulgular: Nesne[] }) | null;
  const basliklar = (analiz?.bulgular ?? []).map((b) => String(b.baslik));
  expect(basliklar.filter((b) => /^Kaldırılan adım|^Alan taşındı|^Adım koşu tanımı/.test(b))).toEqual([]);
  await isBitsin();
});

/** Sayfa yatay kaymıyor. */
const tasma = (page: Page): Promise<number> => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
/** 1440 ve 390 px'te taşma yok. */
async function tasmaYok(page: Page, ad: string): Promise<void> {
  for (const genislik of [1440, 390]) {
    await page.setViewportSize({ width: genislik, height: 900 });
    await page.waitForTimeout(150);
    expect(await tasma(page), `${ad} ${genislik}px`).toBeLessThanOrEqual(0);
    // HIZLI_TEST_EKRAN_KLASORU verilirse görüntüler oraya yazılır (inceleme için; üründe yok).
    if (process.env.HIZLI_TEST_EKRAN_KLASORU) await page.screenshot({ path: join(process.env.HIZLI_TEST_EKRAN_KLASORU, `${ad}-${genislik}.png`), fullPage: true });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
}

test('arayüz: #/hizli-test sihirbazı baştan sona (Oluştur menüsü, CANLI onayı, Doldur, Şimdi ne yapayım, bitiş etiketleri, doğrulama sorusu, kaydet); 1440 / 390 px taşma yok', async () => {
  test.setTimeout(300_000);
  await isBitsin();
  // Test kendi içinde bağımsız: "Ad soyad" sütunlu ikinci bir tablo, "Doldur"un tek eşleşmede doğrudan yazmak yerine seçim listesi
  // açmasını sağlar (önceki testlerin tablolarına bağlı kalınmaz).
  await basarili('/platform/tablo/kaydet', {
    projeId, ad: 'Kişi yedek', tur: 'kayit', sutunlar: [{ ad: 'Ad soyad' }], satirlar: [{ ad: 'Yedek', degerler: { 'Ad soyad': 'Yedek Kişi' } }]
  });
  const tarayici = await korumaliTarayici();
  try {
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1440, height: 900 } });
    const page = await baglam.newPage();
    const hatalar: string[] = [];
    page.on('pageerror', (e) => hatalar.push(String(e)));
    await page.goto('/#/sonuclar');
    // Gelişmiş modda Oluştur menüsünden.
    await page.getByRole('button', { name: 'Oluştur menüsü' }).click();
    await page.getByRole('menuitem', { name: /Nöbetçi taraması/ }).click();
    await expect(page).toHaveURL(/#\/hizli-test$/);
    await expect(page.getByRole('heading', { name: 'Nöbetçi taraması', exact: true })).toBeVisible();
    const form = page.locator('form.hizli-baslat');
    await tasmaYok(page, 'Başlat');
    // İzin seçilmeden başlamaz.
    await form.getByLabel('Testin adı').fill('Arayüz başvurusu');
    await form.getByLabel('Sayfa adresi').fill('/basvuru/');
    await form.getByRole('button', { name: 'Başlat' }).click();
    await expect(form.getByRole('alert')).toHaveText('Nöbetçi’nin düğmelere basıp basamayacağını seçin.');
    // CANLI ortam: bir kez onay; Vazgeç → istek yok.
    const once = uygulama.istekler.length;
    await form.getByLabel('Ortam', { exact: true }).selectOption({ label: 'Canlı kopya — CANLI ortam' });
    await form.getByRole('radio', { name: /^Evet/ }).check();
    await form.getByRole('button', { name: 'Başlat' }).click();
    const onay = page.locator('dialog[open]');
    await expect(onay).toContainText('CANLI ortamda düğmelere basılacak, kayıt oluşabilir.');
    await onay.getByRole('button', { name: 'Vazgeç' }).click();
    await expect(page).toHaveURL(/#\/hizli-test$/);
    expect(uygulama.istekler.length).toBe(once);
    await form.getByLabel('Ortam', { exact: true }).selectOption({ label: 'Deneme' });
    await form.getByLabel(/Ne yapılsın/).fill('Hesapla\'ya bas, "Başvurunuz alındı" görünsün');
    await form.getByRole('button', { name: 'Başlat' }).click();
    await expect(page).toHaveURL(/#\/hizli-test\/o\//);
    const soru = page.locator('.hizli-soru');
    // Keşif toplu sorusu (sayfada emin olunmayan düğme varsa): "Hiçbirine basma".
    const veriBasligi = soru.getByRole('heading', { name: 'Devam etmek için veri gerekli' });
    const kesifBasligi = soru.getByRole('heading', { name: 'Keşif için şu düğmelere basılabilir' });
    await expect(veriBasligi.or(kesifBasligi)).toBeVisible({ timeout: 60_000 });
    if (await kesifBasligi.isVisible()) {
      await tasmaYok(page, 'Keşif sorusu');
      await soru.getByRole('button', { name: 'Hiçbirine basma', exact: true }).click();
    }
    // Veri durağı: Doldur (tablodan) + elle.
    await expect(veriBasligi).toBeVisible({ timeout: 60_000 });
    await tasmaYok(page, 'Veri durağı');
    // Sayfada hazır gelen "Kanal" ana listede, sayfadaki sırasıyla, değeri önyazılı ve "sayfada hazır" rozetiyle (değiştirilebilir).
    await expect(soru.locator('.hizli-hazir')).toHaveCount(0);
    const satirKanal = soru.locator('.hizli-alan').filter({ hasText: 'Kanal' });
    await expect(satirKanal.locator('.hizli-hazir-rozet')).toHaveText('sayfada hazır');
    await expect(soru.getByLabel('Kanal', { exact: true })).toHaveValue('web');
    // Doldurma sırası: sayfadaki sırayla listelenir; yukarı / aşağı düğmeleriyle değişir (ilk alanda "yukarı", sonuncuda "aşağı" kapalı).
    const etiketSirasi = soru.locator('.hizli-alan .hizli-alan-baslik label');
    await expect(etiketSirasi).toHaveText([/Ad soyad/, /Müşteri tipi/, /Kanal/]);
    const satirAd = soru.locator('.hizli-alan').filter({ hasText: 'Ad soyad' });
    await expect(satirAd.getByRole('button', { name: 'Yukarı taşı' })).toBeDisabled();
    await expect(satirKanal.getByRole('button', { name: 'Aşağı taşı' })).toBeDisabled();
    await satirAd.getByRole('button', { name: 'Aşağı taşı' }).click();
    await expect(etiketSirasi).toHaveText([/Müşteri tipi/, /Ad soyad/, /Kanal/]);
    // Odak taşınan satırın aynı düğmesinde kalır (ortada: "Aşağı taşı" etkin).
    await expect(satirAd.getByRole('button', { name: 'Aşağı taşı' })).toBeFocused();
    await satirAd.getByRole('button', { name: 'Yukarı taşı' }).click();
    await expect(etiketSirasi).toHaveText([/Ad soyad/, /Müşteri tipi/, /Kanal/]);
    const adAlani = soru.locator('.hizli-alan').filter({ hasText: 'Ad soyad' });
    await adAlani.getByRole('button', { name: 'Doldur', exact: true }).click();
    // Adı uyan sütunlu tablolar ("Kişi", "Kişi yedek" ve varsa önceki testlerin tabloları) listelenir: "Kişi" tablosunun satırı seçilir.
    await adAlani.getByRole('button', { name: 'Deneme — Deneme Kişi' }).click();
    await expect(adAlani.locator('.hizli-tablo-degeri')).toHaveText('${Kişi.Ad soyad}');
    // Seçim keşfi: koşullu "Vergi no" yalnız Müşteri tipi = Kurumsal seçilince açılır (anında, Nöbetçi'de); Bireysel'de kapanır.
    await soru.getByLabel('Müşteri tipi').selectOption('kurumsal');
    // Koşullu alan seçimin altındaki grupta (grup başlığı seçimin şu anki değeri).
    await expect(soru.locator('.hizli-kosul-grubu').filter({ hasText: 'Vergi no' }).locator('.hizli-kosul-grubu-baslik')).toHaveText('“Müşteri tipi: Kurumsal” seçimine göre:');
    await soru.getByLabel('Müşteri tipi').selectOption('bireysel');
    await expect(soru.locator('.hizli-alan').filter({ hasText: 'Vergi no' })).toHaveCount(0);
    await soru.getByLabel('Müşteri tipi').selectOption('bireysel');
    await soru.getByRole('button', { name: 'Devam et', exact: true }).click();
    // Evet + cümlede "Hesapla": basılır; yeni alan için veri durağı.
    await expect(soru.getByRole('heading', { name: 'Adım 2: veri gerekli' })).toBeVisible({ timeout: 60_000 });
    // "Tarayıcıda şu an": sürekli kare akışı (CDP screencast; canli-akis.js) — kutu "Canlı", kareler gelir, son kare zamanı yazılı.
    // Test tarayıcısı başsız (NOBETCI_KAYIT_BASSIZ): "Tarayıcıyı göster" düğmesi yok.
    const canliKutu = page.locator('.hizli-yan .canli-akis');
    await expect(canliKutu).toHaveAttribute('data-durum', 'akis', { timeout: 20_000 });
    await expect(canliKutu.locator('img.canli-akis-karesi')).toBeVisible();
    await expect.poll(async () => Number(await canliKutu.getAttribute('data-kare-sayisi')), { timeout: 10_000 }).toBeGreaterThan(0);
    await expect(canliKutu.locator('.canli-akis-zamani')).toHaveText(/^Son kare \d{2}:\d{2}:\d{2}$/);
    await expect(canliKutu.getByRole('button', { name: 'Tarayıcıyı göster' })).toHaveCount(0);
    await soru.getByLabel('Ödeme şekli').selectOption('havale');
    await soru.getByRole('button', { name: 'Devam et', exact: true }).click();
    await expect(soru.getByRole('heading', { name: 'Şimdi ne yapayım?' })).toBeVisible({ timeout: 60_000 });
    await expect(soru.locator('.hizli-fark')).toContainText('Tutar: 1.250,00 TL');
    await expect(soru.getByLabel('Basılacak düğme')).toHaveValue(/Onayla/);
    await tasmaYok(page, 'Şimdi ne yapayım');
    await soru.getByRole('button', { name: 'Uygula' }).click();
    await expect(soru.getByRole('heading', { name: 'Şimdi ne yapayım?' })).toBeVisible({ timeout: 60_000 });
    await expect(soru.locator('.hizli-fark')).toContainText('Başvurunuz alındı');
    await expect(soru.getByRole('radio', { name: /Burada bitir/ })).toBeChecked();
    await soru.getByRole('button', { name: 'Uygula' }).click();
    // Bitiş koşulu: varsayılan etiketler.
    await expect(soru.getByRole('heading', { name: 'Bitiş koşulu: ne görülünce biter?' })).toBeVisible();
    const satir = (m: string) => soru.locator('.hizli-bitis-satiri').filter({ hasText: m });
    await expect(satir('Başvurunuz alındı').getByRole('radio', { name: 'Bitti' })).toHaveAttribute('aria-checked', 'true');
    await expect(satir('Hesaplanıyor…').getByRole('radio', { name: 'Devam' })).toHaveAttribute('aria-checked', 'true');
    // Seçili "Bitti"ye yeniden tıklamak etiketi kaldırır (Etiketsiz'e döner); tekrar tıklayınca geri gelir. "Etiketsiz" seçilince tek "Bitti"
    // kalmaz → "Devam et" pasif + gerekçe (sunucuya 400 alacak istek gitmez); yeniden "Bitti" seçilince açılır.
    const bitti = satir('Başvurunuz alındı').getByRole('radio', { name: 'Bitti' });
    await bitti.click();
    await expect(bitti).toHaveAttribute('aria-checked', 'false');
    await expect(satir('Başvurunuz alındı').getByRole('radio', { name: 'Etiketsiz' })).toHaveAttribute('aria-checked', 'true');
    await bitti.click();
    await expect(bitti).toHaveAttribute('aria-checked', 'true');
    const bitisIstekleri: string[] = [];
    page.on('request', (r) => { if (r.url().includes('/platform/hizli-test/bitis')) bitisIstekleri.push(r.url()); });
    await satir('Başvurunuz alındı').getByRole('radio', { name: 'Etiketsiz' }).click();
    await expect(bitti).toHaveAttribute('aria-checked', 'false');
    await expect(soru.getByRole('button', { name: 'Devam et', exact: true })).toBeDisabled();
    await expect(soru.locator('#hizli-bitis-eksik')).toContainText('En az bir metni “Bitti” etiketleyin');
    expect(bitisIstekleri).toEqual([]);
    await bitti.click();
    await expect(soru.getByRole('button', { name: 'Devam et', exact: true })).toBeEnabled();
    await tasmaYok(page, 'Bitiş koşulu');
    await soru.getByRole('button', { name: 'Devam et', exact: true }).click();
    // Kaydet: H3 sorusu.
    await expect(soru.getByRole('heading', { name: 'Kaydedilecekler' })).toBeVisible();
    await expect(soru).toContainText('Kaydetmeden önce baştan sona bir doğrulama koşusu yapayım mı?');
    await tasmaYok(page, 'Kaydet');
    // Özet YENİ SEKMEDE kendi adresiyle açılır (sayfanın altına dizilmez); kaydet sekmesi yerinde kalır.
    const oturumId = decodeURIComponent(page.url().split('#/hizli-test/o/')[1]);
    // Test kendi içinde bağımsız: özetin yazacağı tabloların aynı adlısı projede yoksa (test tek başına koşunca) burada açılır; böylece
    // "Birleştir" seçenekleri önceki testlerin tablolarına bağlı kalmadan her koşuda gelir. Özet isteği hiçbir şey yazmaz.
    const planTablolari = (((await basarili('/platform/hizli-test/ozet', { id: oturumId })).ozet as Nesne).onizleme as Nesne).tablolar as Nesne[];
    expect(planTablolari.length).toBeGreaterThan(0);
    for (const t of planTablolari.filter((x) => !x.mevcut)) {
      await basarili('/platform/tablo/kaydet', { projeId, ad: t.ad, tur: t.tur, sutunlar: (t.sutunlar as Nesne[]).map((s) => ({ ad: s.ad })), satirlar: [] });
    }
    const [ozetSekmesi] = await Promise.all([baglam.waitForEvent('page'), soru.getByRole('button', { name: 'Hayır, kaydet' }).click()]);
    ozetSekmesi.on('pageerror', (e) => hatalar.push(String(e)));
    await expect(ozetSekmesi).toHaveURL(new RegExp(`#/hizli-test/ozet/${oturumId}$`));
    await expect(soru.getByRole('heading', { name: 'Kaydedilecekler' })).toBeVisible();
    await expect(soru.locator('.hizli-ozet-karti')).toHaveCount(0);
    // Özet ekranı: hiçbir şey yazılmadan tablolar, senaryo önerileri; onay olmadan kaydedilmez.
    const ozet = ozetSekmesi.locator('.hizli-ozet-karti');
    await expect(ozet.getByRole('heading', { name: /Kayıt özeti/ })).toBeVisible({ timeout: 30_000 });
    await expect(ozet).toContainText('Arayüz başvurusu');
    await expect(ozet.getByRole('region', { name: 'Test verisine yazılacaklar' })).toBeVisible();
    await tasmaYok(ozetSekmesi, 'Özet');
    // Önceki testlerden aynı adlı tablolar var: varsayılan "Birleştir" (yeni satır) seçili gelir, Onayla açıktır; seçim açıkça
    // değiştirilebilir ("Yeni adla yaz" adı boşsa yine kapanır).
    const birlestir = ozet.getByRole('radio', { name: /^Birleştir/ });
    expect(await birlestir.count()).toBeGreaterThan(0);
    for (const r of await birlestir.all()) await expect(r).toBeChecked();
    await expect(ozet).toContainText('Varsayılan: yeni satır olarak birleştir');
    await expect(ozet.getByRole('button', { name: 'Onayla ve kaydet' })).toBeEnabled();
    await ozet.getByRole('radio', { name: /^Atla/ }).first().check();
    await expect(ozet.getByRole('button', { name: 'Onayla ve kaydet' })).toBeEnabled();
    await birlestir.first().check();
    // Aynı özet ikinci sekmede de açık: kayıt ilkinde onaylanınca ikinci sekme görünür olduğunda durumu sorar, "Onayla" kapanır.
    const ikinciSekme = await baglam.newPage();
    await ikinciSekme.goto(`/#/hizli-test/ozet/${encodeURIComponent(oturumId)}`);
    await expect(ikinciSekme.locator('.hizli-ozet-karti')).toBeVisible({ timeout: 30_000 });
    await ozet.getByRole('button', { name: 'Onayla ve kaydet' }).click();
    await expect(ozetSekmesi.getByRole('heading', { name: 'Test kaydedildi' })).toBeVisible({ timeout: 60_000 });
    await ikinciSekme.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await expect(ikinciSekme.getByText('Bu kayıt başka bir sekmede onaylandı')).toBeVisible();
    await expect(ikinciSekme.locator('.hizli-ozet-karti').getByRole('button', { name: /Onayla ve kaydet/ })).toBeDisabled();
    await ikinciSekme.close();
    await ozetSekmesi.close();
    // Kaydet sekmesi de (yoklamayla) kaydedildi durumuna geçer.
    await expect(page.getByRole('heading', { name: 'Test kaydedildi' })).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('.hizli-hazirlik li.eksik')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Akış diyagramında aç' })).toBeVisible();
    await tasmaYok(page, 'Kaydedildi');
    // Gelişmiş modda Basit mod sayfası ("Testlerim") bağlantısı yok; "Senaryolara git" Senaryolar'ı açar.
    await expect(page.getByRole('link', { name: 'Testlerim' })).toHaveCount(0);
    await page.getByRole('link', { name: 'Senaryolara git' }).click();
    await expect(page).toHaveURL(/#\/senaryolar$/);
    // Testlerim: doğrulama koşusu yapılmadan ("Hayır, kaydet") kaydedilen, henüz çalışmamış bu test "Doğrulanmadı" rozetiyle.
    await page.goto('/#/testlerim');
    await expect(page).toHaveURL(/#\/testlerim$/);
    await expect(page.locator('.test-satiri').filter({ hasText: 'Arayüz başvurusu' }).locator('.rozet').filter({ hasText: 'Doğrulanmadı' })).toBeVisible({ timeout: 15_000 });
    expect(hatalar).toEqual([]);
    await baglam.close();
  } finally {
    await tarayici.close();
  }
  await isBitsin();
});
