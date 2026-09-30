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
  basmaKarari, beklemeMetniMi, bitisKosulu, bitisiUygula, canliOnayMetni, cumleyiOku, sabitKisim, sayfaUyarisi, tekAday, varsayilanEtiketler
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
const oturum = async (id: string): Promise<Nesne> => (await api(`/platform/hizli-test/durum?id=${id}`)).oturum as Nesne;
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
    const adaylar = [{ secici: 'a', metin: 'Hesapla' }, { secici: 'b', metin: 'Temizle' }];
    expect(tekAday(adaylar, ['hesapla'])?.secici).toBe('a');
    expect(tekAday(adaylar, [])).toBeNull();
    expect(canliOnayMetni('evet')).toBe('CANLI ortamda düğmelere basılacak, kayıt oluşabilir.');
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
  expect(o.soru.alanlar.map((a: Nesne) => [a.etiket, a.zorunlu, a.hazir])).toEqual([['Ad soyad', true, false], ['Müşteri tipi', true, false], ['Kanal', false, true]]);
  expect(o.soru.alanlar.find((a: Nesne) => a.etiket === 'Kanal')).toMatchObject({ mevcut: 'Web', etiketBulundu: true });
  // Zorunlu alan boşken ilerlenmez (akış tamamlanmadan bitmez).
  expect(await api('/platform/hizli-test/veri', { id, degerler: { '#adSoyad': deger('${Kişi.Ad soyad}', 'tablo') } })).toMatchObject({ basarili: false, kod: 'EKSIK' });
  const alan = (etiket: string): string => String(o.soru.alanlar.find((a: Nesne) => a.etiket === etiket).anahtar);
  await basarili('/platform/hizli-test/veri', { id, degerler: { [alan('Ad soyad')]: deger('${Kişi.Ad soyad}', 'tablo'), [alan('Müşteri tipi')]: deger('kurumsal') } });
  // Kurumsal seçilince koşullu "Vergi no" belirir: veri durağı yeniden (yeni alan işaretli).
  o = await bekle(id, ['veri']);
  const vergi = o.soru.alanlar.find((a: Nesne) => a.etiket === 'Vergi no');
  expect(vergi).toMatchObject({ zorunlu: true, yeni: true });
  expect(o.soru.alanlar.find((a: Nesne) => a.etiket === 'Ad soyad')).toMatchObject({ deger: '${Kişi.Ad soyad}', kaynak: 'tablo' });
  await basarili('/platform/hizli-test/veri', { id, degerler: { [vergi.anahtar]: deger('1111111111') } });
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
  const k = await basarili('/platform/hizli-test/kaydet', { id, baslik: 'Başvuru formu — kurumsal' });
  expect(k).toMatchObject({ kaydedildi: true, dogrulandi: true });
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
  // Elle yazılan değer (Vergi no) test verisi tablosuna alındı ve senaryo alanı tabloya bağlandı.
  const kTablo = k.tablo as { tablo: string; sutunSayisi: number };
  expect(kTablo).toMatchObject({ tablo: expect.stringContaining('Başvuru formu'), sutunSayisi: 3 });
  const tablo = ((await api(`/platform/tablolar?projeId=${projeId}`)).tablolar as Nesne[]).find((t: Nesne) => t.ad === kTablo.tablo);
  expect(tablo?.sutunlar.map((x: Nesne) => x.ad)).toEqual(['Müşteri tipi', 'Vergi no', 'Ödeme şekli']);
  expect(tablo?.satirlar).toHaveLength(1);
  expect(JSON.stringify(s)).toContain(`\${${kTablo.tablo}.Vergi no}`);
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
async function hizliSayfa(): Promise<{ tarayici: Browser; sayfa: Page }> {
  const son = Date.now() + 60_000;
  let tarayici: Browser | null = null;
  while (!tarayici) {
    try { tarayici = await chromium.connectOverCDP(`http://127.0.0.1:${cdpPortu}`); } catch {
      if (Date.now() > son) throw new Error('hızlı test tarayıcısına bağlanılamadı');
      await new Promise((c) => setTimeout(c, 250));
    }
  }
  for (;;) {
    const sayfa = tarayici.contexts().flatMap((b) => b.pages()).find((p) => p.url().includes('/basvuru/'));
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
  const surumOnce = ((await api(`/platform/ekran?projeId=${projeId}&id=${kayitli?.ekranId}`)) as Nesne).surum;
  const f = await basarili('/platform/hizli-test/kaydet', { id, baslik: 'Başvuru formu — bireysel' });
  expect(f.onayGerekli).toBe(true);
  expect((f.farklar as Nesne).senaryolar).toEqual(expect.arrayContaining(['Başvuru formu — kurumsal']));
  expect((f.farklar as Nesne).ozet.toplam).toBeGreaterThan(0);
  expect(((await api(`/platform/ekran?projeId=${projeId}&id=${kayitli?.ekranId}`)) as Nesne).surum).toBe(surumOnce);
  const k = await basarili('/platform/hizli-test/kaydet', { id, baslik: 'Başvuru formu — bireysel', onay: true });
  expect(k).toMatchObject({ kaydedildi: true, ekranId: kayitli?.ekranId });
  expect(((await api(`/platform/ekran?projeId=${projeId}&id=${kayitli?.ekranId}`)) as Nesne).surum).toBe(Number(surumOnce) + 1);
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
  const tarayici = await korumaliTarayici();
  try {
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1440, height: 900 } });
    const page = await baglam.newPage();
    const hatalar: string[] = [];
    page.on('pageerror', (e) => hatalar.push(String(e)));
    await page.goto('/#/sonuclar');
    // Gelişmiş modda Oluştur menüsünden.
    await page.getByRole('button', { name: 'Oluştur menüsü' }).click();
    await page.getByRole('menuitem', { name: /Hızlı test/ }).click();
    await expect(page).toHaveURL(/#\/hizli-test$/);
    await expect(page.getByRole('heading', { name: 'Hızlı test', exact: true })).toBeVisible();
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
    // Veri durağı: Doldur (tablodan) + elle.
    const soru = page.locator('.hizli-soru');
    await expect(soru.getByRole('heading', { name: 'Devam etmek için veri gerekli' })).toBeVisible({ timeout: 60_000 });
    await tasmaYok(page, 'Veri durağı');
    // Önce analiz: sayfada zaten dolu gelen "Kanal" sorulmaz; değeriyle hazır listesinde durur; "Değiştir" onu sorulanlara taşır.
    await expect(soru.locator('.hizli-alan').filter({ hasText: 'Kanal' })).toHaveCount(0);
    const hazir = soru.locator('.hizli-hazir');
    await expect(hazir.locator('summary')).toContainText('Sayfada hazır gelen 1 değer');
    await hazir.locator('summary').click();
    await expect(hazir.locator('li')).toHaveCount(1);
    await expect(hazir.locator('li')).toContainText('Kanal');
    await expect(hazir.locator('li')).toContainText('Web');
    await tasmaYok(page, 'Veri durağı (hazır liste açık)');
    const adAlani = soru.locator('.hizli-alan').filter({ hasText: 'Ad soyad' });
    await adAlani.getByRole('button', { name: 'Doldur', exact: true }).click();
    // Önceki testlerin kaydettiği otomatik tablolar da adı uyan sütunla listelenir: "Kişi" tablosunun satırı seçilir.
    await adAlani.getByRole('button', { name: 'Deneme — Deneme Kişi' }).click();
    await expect(adAlani.locator('.hizli-tablo-degeri')).toHaveText('${Kişi.Ad soyad}');
    await soru.getByLabel('Müşteri tipi').selectOption('bireysel');
    await soru.getByRole('button', { name: 'Devam et' }).click();
    // Evet + cümlede "Hesapla": basılır; yeni alan için veri durağı.
    await expect(soru.getByRole('heading', { name: 'Adım 2: veri gerekli' })).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('.hizli-yan img.hizli-goruntu')).toBeVisible();
    await soru.getByLabel('Ödeme şekli').selectOption('havale');
    await soru.getByRole('button', { name: 'Devam et' }).click();
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
    await tasmaYok(page, 'Bitiş koşulu');
    await soru.getByRole('button', { name: 'Devam et' }).click();
    // Kaydet: H3 sorusu.
    await expect(soru.getByRole('heading', { name: 'Kaydedilecekler' })).toBeVisible();
    await expect(soru).toContainText('Kaydetmeden önce baştan sona bir doğrulama koşusu yapayım mı?');
    await tasmaYok(page, 'Kaydet');
    await soru.getByRole('button', { name: 'Hayır, kaydet' }).click();
    await expect(page.getByRole('heading', { name: 'Test kaydedildi' })).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('.hizli-hazirlik li.eksik')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Akış diyagramında aç' })).toBeVisible();
    await tasmaYok(page, 'Kaydedildi');
    // Testlerim: Hayır izniyle (basılmadan) kaydedilen, henüz çalışmamış test "Doğrulanmadı" rozetiyle.
    await page.getByRole('link', { name: 'Testlerim' }).click();
    await expect(page.locator('.test-satiri').filter({ hasText: 'Başvuru formu basılmadan' }).locator('.rozet').filter({ hasText: 'Doğrulanmadı' })).toBeVisible();
    expect(hatalar).toEqual([]);
    await baglam.close();
  } finally {
    await tarayici.close();
  }
  await isBitsin();
});
