// KORUMA TESTLERİ — KURTARMA KURALLARI (Ayarlar > Proje ve ortamlar; scripts/platform/ayarlar/kurtarma-kurallari.mjs): kural modeli
// (doğrulama, kaydet / düzenle / sil, hazır 401 / 403 kuralı), servis tarafı (yanıt alanı → tekrar gönder + N deneme sınırı, HTTP 503 →
// artan bekleme, SOAP Fault, istek süzgeci, token yenileme, bağlantı hatası), çift kayıt koruması (işaretsiz metot tekrar gönderilmez),
// kapsam (servis / metot, ortam), hazır kuralın bugünkü davranışı ve kapatılınca çalışmaması, sayaçlar + Sonuçlar > Özet maddesi,
// içe aktarma ve proje silme. Yalnız 127.0.0.1'deki sahte servis; nötr adlar ve değerler; dışarıya istek yok.
import { createServer } from 'node:net';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import type { Veritabani } from '../../scripts/platform/veritabani/baglanti.mjs';
import { ekranKaydet, ortamKaydet, projeKaydet, veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { servisAkisiKaydet, servisKosulariniListele, servisSenaryosuKaydet } from '../../scripts/platform/servisler/servis-deposu.mjs';
import { servisiKaydet, servisSenaryosuCalistir } from '../../scripts/platform/servisler/servis-islemleri.mjs';
import { oturumlariTemizle, servisAkisiCalistir } from '../../scripts/platform/servisler/servis-akislari.mjs';
import { restServisiKaydet } from '../../scripts/platform/servisler/rest-servisi.mjs';
import {
  HAZIR_YETKI, alanDegeri, beklemeMs, ekranKurallari, hazirYetkiKuraliAcik, kuralDurumuAyarla, kuralKaydet, kuralSil, kurallariListele, kurtarmaEkrani,
  kurtarmaSayaclari, servisKosuluDegerlendir, soapFaultOku, suzgecTutar
} from '../../scripts/platform/ayarlar/kurtarma-kurallari.mjs';
import { farkindalikOnbelleginiTemizle, farkindalikVerisi } from '../../scripts/platform/sonuclar/farkindalik.mjs';
import { yedekOlustur } from '../../scripts/platform/yedek.mjs';
import { iceAktarmaHazirla, iceAktarmaUygula } from '../../scripts/platform/ice-aktarma.mjs';
import { projeKalintilari, projeSilmeOnizlemesi, projeyiSil } from '../../scripts/platform/proje-yonetimi.mjs';
import { HIZLI_KDF, geciciKlasor } from './platform-ortak';
import { yerelSunucu, type FiksturYaniti } from './giris-fikstur';

const json = (veri: unknown, durum = 200): FiksturYaniti => ({ durum, tur: 'application/json', govde: JSON.stringify(veri) });
const FAULT = '<?xml version="1.0"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><s:Fault><faultcode>s:Server</faultcode>'
  + '<faultstring>Sunucu meşgul, geçici hata</faultstring></s:Fault></s:Body></s:Envelope>';
const TAMAM_XML = '<?xml version="1.0"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><Yanit><Durum>0</Durum></Yanit></s:Body></s:Envelope>';

/** Kapalı bir yerel port (bağlantı reddedilir). */
async function kapaliPort(): Promise<number> {
  return new Promise((coz) => {
    const s = createServer();
    s.listen(0, '127.0.0.1', () => { const a = s.address(); const p = typeof a === 'object' && a ? a.port : 9; s.close(() => coz(p)); });
  });
}

test.describe('kurtarma kuralları: model ve servis', () => {
  test.describe.configure({ mode: 'serial' });
  const klasor = geciciKlasor('kurtarma-kurallari');
  let vt: Veritabani;
  let sunucu: Awaited<ReturnType<typeof yerelSunucu>>;
  /** Yol → sıradaki yanıtlar (bitince varsayılan). */
  const kuyruk: Record<string, FiksturYaniti[]> = {};
  const zamanlar: Record<string, number[]> = {};
  const govdeler: Record<string, string[]> = {};
  let token = 1;
  let projeId = '';
  let ortamId = '';
  let ortam2 = '';
  let servisId = '';
  let baskaServis = '';
  let kapaliServis = '';
  const sen: Record<string, string> = {};
  const say = (yol: string): number => (zamanlar[yol] ?? []).length;
  const kos = (senaryoId: string, o = ortamId, s = servisId) => servisSenaryosuCalistir(vt, projeId, { servisId: s, ortamId: o, tur: 'kosu', senaryoId });
  const kural = (g: Record<string, unknown>): string => kuralKaydet(vt, projeId, { tur: 'servis', kapsam: { ogeler: null, ortamlar: null }, ...g });
  const kurtarmaSutunu = (kosuId: string): unknown => JSON.parse(String(vt.tek('SELECT kurtarma_json FROM servis_kosulari WHERE id = ?', [kosuId])?.kurtarma_json ?? 'null'));

  test.beforeAll(async () => {
    sunucu = await yerelSunucu((i) => {
      (zamanlar[i.yol] ??= []).push(Date.now());
      (govdeler[i.yol] ??= []).push(i.govde);
      if (i.yol === '/api/giris') return json({ token: `tok-${token}` });
      const q = kuyruk[i.yol];
      if (q && q.length) return q.shift() as FiksturYaniti;
      if (i.yol === '/api/fault') return { tur: 'text/xml', govde: TAMAM_XML };
      return json({ Durum: '0' });
    });
    vt = await veritabaniniHazirla(join(klasor.yol, 'platform.db'));
    await kasaOlustur(vt, 'Gecici-Kurtarma-1', { kdf: HIZLI_KDF });
    projeId = projeKaydet(vt, { ad: 'Kurtarma projesi' });
    ortamId = ortamKaydet(vt, { projeId, ad: 'TEST', tabanUrl: sunucu.adres, varsayilan: true, ayarlar: { riskli: false } });
    ortam2 = ortamKaydet(vt, { projeId, ad: 'IKINCI', tabanUrl: sunucu.adres, ayarlar: { riskli: false } });
    const uclar = ['durum', 'yogun', 'suzgec', 'kayit', 'giris', 'oturumlu', 'yetkili', 'fault'].map((ad) => ({ ad, metot: ['giris', 'kayit', 'suzgec', 'fault'].includes(ad) ? 'POST' : 'GET', yol: `/api/${ad}` }));
    servisId = restServisiKaydet(vt, projeId, { anahtar: 'deneme-api', ad: 'Deneme API', tabanlar: { [ortamId]: sunucu.adres, [ortam2]: sunucu.adres }, uclar }).id;
    baskaServis = restServisiKaydet(vt, projeId, { anahtar: 'baska-api', ad: 'Başka API', tabanlar: { [ortamId]: sunucu.adres }, uclar: [{ ad: 'durum', metot: 'GET', yol: '/api/durum' }] }).id;
    kapaliServis = restServisiKaydet(vt, projeId, { anahtar: 'kapali-api', ad: 'Kapalı API', tabanlar: { [ortamId]: `http://127.0.0.1:${await kapaliPort()}` }, uclar: [{ ad: 'durum', metot: 'GET', yol: '/api/durum' }] }).id;
    const ekle = (s: string, baslik: string, op: string, metot: string, yol: string, ek: Record<string, unknown> = {}) => servisSenaryosuKaydet(vt, { projeId, servisId: s, baslik, kapsam: 'ikisi', icerik: {
      operasyon: op, govde: '', kontroller: [{ tur: 'durumKodu', deger: '200' }, { tur: 'icerir', deger: '"Durum":"0"' }], http: { metot, yol }, ...ek
    } });
    const yetki = { basliklar: { Authorization: 'Bearer ${akis:Token}' } };
    sen.durum = ekle(servisId, 'Durum', 'durum', 'GET', '/api/durum');
    sen.yogun = ekle(servisId, 'Yoğun', 'yogun', 'GET', '/api/yogun');
    sen.suzgecB = ekle(servisId, 'Süzgeç B', 'suzgec', 'POST', '/api/suzgec', { govde: '{"Kaynak":"B"}', http: { metot: 'POST', yol: '/api/suzgec', icerikTuru: 'application/json' } });
    sen.suzgecA = ekle(servisId, 'Süzgeç A', 'suzgec', 'POST', '/api/suzgec', { govde: '{"Kaynak":"A"}', http: { metot: 'POST', yol: '/api/suzgec', icerikTuru: 'application/json' } });
    sen.kayit = ekle(servisId, 'Kayıt', 'kayit', 'POST', '/api/kayit');
    sen.giris = servisSenaryosuKaydet(vt, { projeId, servisId, baslik: 'Giriş', kapsam: 'ikisi', icerik: { operasyon: 'giris', govde: '', kontroller: [{ tur: 'durumKodu', deger: '200' }], http: { metot: 'POST', yol: '/api/giris' } } });
    sen.oturumlu = ekle(servisId, 'Oturumlu', 'oturumlu', 'GET', '/api/oturumlu', yetki);
    sen.yetkili = ekle(servisId, 'Yetkili', 'yetkili', 'GET', '/api/yetkili', yetki);
    sen.fault = servisSenaryosuKaydet(vt, { projeId, servisId, baslik: 'Fault', kapsam: 'ikisi', icerik: { operasyon: 'fault', govde: '', kontroller: [{ tur: 'durumKodu', deger: '200' }], http: { metot: 'POST', yol: '/api/fault' } } });
    sen.baska = ekle(baskaServis, 'Başka durum', 'durum', 'GET', '/api/durum');
    sen.kapali = ekle(kapaliServis, 'Kapalı durum', 'durum', 'GET', '/api/durum');
    const oturum = servisAkisiKaydet(vt, { projeId, baslik: 'Oturum', tur: 'oturum', icerik: { adimlar: [{ ad: 'Giriş', servisId, senaryoId: sen.giris, okumalar: [{ ad: 'Token', kaynak: 'json', yol: 'token' }] }], omurSaniye: 600 } });
    // Tekrar denenebilir: "kayit" DIŞINDAKİ metotlar (kayıt oluşturan metot işaretsiz kalır).
    servisiKaydet(vt, projeId, { id: servisId, anahtar: 'deneme-api', ad: 'Deneme API', yol: '/', oturumAkisi: oturum, tekrarDenenebilirOperasyonlar: ['durum', 'yogun', 'suzgec', 'oturumlu', 'yetkili', 'fault'] });
    servisiKaydet(vt, projeId, { id: baskaServis, anahtar: 'baska-api', ad: 'Başka API', yol: '/', tekrarDenenebilirOperasyonlar: ['durum'] });
    servisiKaydet(vt, projeId, { id: kapaliServis, anahtar: 'kapali-api', ad: 'Kapalı API', yol: '/', tekrarDenenebilirOperasyonlar: ['durum'] });
  });
  test.afterAll(async () => { vt?.kapat(); await sunucu?.kapat(); klasor.temizle(); });

  test('model: yalnız hazır kural; doğrulama; kaydet / düzenle / sil; ad tekil; tanım kasada şifreli; hazır kural silinemez, kapatılabilir', () => {
    const ilk = kurallariListele(vt, projeId);
    expect(ilk).toHaveLength(1);
    expect(ilk[0]).toMatchObject({ id: HAZIR_YETKI, hazir: HAZIR_YETKI, tur: 'servis', acik: true, kosul: { tur: 'http', kodlar: [401, 403] } });
    expect(() => kuralKaydet(vt, projeId, { ad: 'X' })).toThrow('türünü seçin');
    expect(() => kuralKaydet(vt, projeId, { ad: 'X', tur: 'ekran', kosul: { tur: 'metin', metin: '' }, eylem: { tur: 'yenile' }, sonra: { tur: 'devam' } })).toThrow('Aranan metin boş olamaz');
    expect(() => kuralKaydet(vt, projeId, { ad: 'X', tur: 'ekran', kosul: { tur: 'oge' }, eylem: { tur: 'yenile' }, sonra: { tur: 'devam' } })).toThrow('CSS seçici ya da rol');
    expect(() => kuralKaydet(vt, projeId, { ad: 'X', tur: 'ekran', kosul: { tur: 'metin', metin: 'a' }, eylem: { tur: 'bekle', sn: 0 }, sonra: { tur: 'devam' } })).toThrow('1–300');
    expect(() => kuralKaydet(vt, projeId, { ad: 'X', tur: 'ekran', kosul: { tur: 'metin', metin: 'a' }, eylem: { tur: 'yenile' }, sonra: { tur: 'tekrar', kez: 11 } })).toThrow('1–10');
    expect(() => kural({ ad: 'X', kosul: { tur: 'http', kodlar: '99' }, yapilacak: { tekrarGonder: true } })).toThrow('100–599');
    expect(() => kural({ ad: 'X', kosul: { tur: 'http', kodlar: '503' }, yapilacak: {} })).toThrow('En az bir şey');
    expect(() => kural({ ad: 'X', kosul: { tur: 'alan', yol: 'Durum', islec: 'buyuk', deger: '1' }, yapilacak: { tekrarGonder: true } })).toThrow('işleci seçin');
    expect(() => kural({ ad: 'X', kosul: { tur: 'baglanti' }, yapilacak: { tekrarGonder: true }, kapsam: { ogeler: [], ortamlar: null } })).toThrow('en az bir servis');
    const id = kuralKaydet(vt, projeId, { ad: 'Ekran kuralı', tur: 'ekran', kosul: { tur: 'metin', metin: 'Geçici sorun' }, eylem: { tur: 'yenile' }, sonra: { tur: 'tekrar', kez: 2 }, kapsam: { ogeler: null, ortamlar: [ortamId] } });
    expect(String(vt.tek('SELECT tanim_json FROM kurtarma_kurallari WHERE id = ?', [id])?.tanim_json)).toMatch(/^kasa:v1:/);
    expect(() => kuralKaydet(vt, projeId, { ad: 'ekran KURALI', tur: 'ekran', kosul: { tur: 'girisSayfasi' }, eylem: { tur: 'girisYenile' }, sonra: { tur: 'devam' } })).toThrow('zaten var');
    kuralKaydet(vt, projeId, { id, ad: 'Ekran kuralı (düzenlendi)', tur: 'ekran', kosul: { tur: 'oge', rol: 'dialog', ad: 'Uyarı' }, eylem: { tur: 'pencereKapat' }, sonra: { tur: 'devam' }, kapsam: { ogeler: null, ortamlar: null } });
    const k = kurallariListele(vt, projeId).find((x) => x.id === id);
    expect(k).toMatchObject({ ad: 'Ekran kuralı (düzenlendi)', tur: 'ekran', acik: true, kosul: { tur: 'oge', rol: 'dialog', ad: 'Uyarı' }, eylem: { tur: 'pencereKapat' }, sonra: { tur: 'devam' } });
    expect(ekranKurallari(vt, projeId, ortamId).map((x) => x.id)).toEqual([id]);
    kuralDurumuAyarla(vt, projeId, id, false);
    expect(ekranKurallari(vt, projeId, ortamId)).toEqual([]);
    expect(() => kuralSil(vt, projeId, HAZIR_YETKI)).toThrow('silinemez');
    expect(() => kuralKaydet(vt, projeId, { id: HAZIR_YETKI, ad: 'Y', tur: 'servis' })).toThrow('düzenlenemez');
    kuralDurumuAyarla(vt, projeId, HAZIR_YETKI, false);
    expect(hazirYetkiKuraliAcik(vt, projeId)).toBe(false);
    kuralDurumuAyarla(vt, projeId, HAZIR_YETKI, true);
    expect(hazirYetkiKuraliAcik(vt, projeId)).toBe(true);
    kuralSil(vt, projeId, id);
    expect(kurallariListele(vt, projeId).map((x) => x.id)).toEqual([HAZIR_YETKI]);
  });

  test('saf değerlendiriciler: alan adı / yol, HTTP, Fault, bağlantı, süzgeç, artan bekleme', () => {
    expect(alanDegeri('{"veri":{"Durum":"9999"}}', 'Durum')).toBe('9999');
    expect(alanDegeri('{"veri":{"Durum":"9999"}}', 'veri.Durum')).toBe('9999');
    expect(alanDegeri(TAMAM_XML, '/Envelope/Body/Yanit/Durum')).toBe('0');
    expect(servisKosuluDegerlendir({ tur: 'alan', yol: 'Mesaj', islec: 'icerir', deger: 'TEKRAR deneyiniz' }, { durumKodu: 200, govde: '{"Mesaj":"Lütfen tekrar deneyiniz."}' }))
      .toEqual({ tutar: true, neden: 'Mesaj içerir "TEKRAR deneyiniz"' });
    expect(servisKosuluDegerlendir({ tur: 'http', kodlar: [502, 503] }, { durumKodu: 503, govde: '' })).toEqual({ tutar: true, neden: 'HTTP 503' });
    expect(soapFaultOku(FAULT)).toEqual({ kod: 's:Server', mesaj: 'Sunucu meşgul, geçici hata' });
    expect(servisKosuluDegerlendir({ tur: 'fault', kod: 'server', mesaj: '' }, { durumKodu: 500, govde: FAULT }).tutar).toBe(true);
    expect(servisKosuluDegerlendir({ tur: 'fault', kod: '', mesaj: 'başka' }, { durumKodu: 500, govde: FAULT }).tutar).toBe(false);
    expect(servisKosuluDegerlendir({ tur: 'baglanti' }, { hata: 'Bağlantı kurulamadı: ECONNREFUSED (bağlantı reddedildi)' })).toEqual({ tutar: true, neden: 'bağlantı hatası' });
    expect(servisKosuluDegerlendir({ tur: 'baglanti' }, { hata: 'Yanıt 5 sn içinde gelmedi.' })).toEqual({ tutar: true, neden: 'zaman aşımı' });
    expect(servisKosuluDegerlendir({ tur: 'baglanti' }, { hata: 'Değeri bulunamayan parametre: A.' }).tutar).toBe(false);
    expect(suzgecTutar({ parametre: 'Kaynak', deger: 'A' }, { degerler: { kaynak: 'A' } })).toBe(true);
    expect(suzgecTutar({ parametre: 'Kaynak', deger: 'A' }, { degerler: {}, govde: '{"Kaynak":"B"}' })).toBe(false);
    expect(suzgecTutar({ parametre: 'Kaynak', deger: 'A' }, { degerler: {}, govde: '<a><Kaynak>A</Kaynak></a>' })).toBe(true);
    expect([1, 2, 3].map((d) => beklemeMs({ bekleSn: 2, artanBekleme: true }, d))).toEqual([2000, 4000, 8000]);
    expect([1, 2].map((d) => beklemeMs({ bekleSn: 2, artanBekleme: false }, d))).toEqual([2000, 2000]);
  });

  test('servis: yanıt alanı değeri → isteği tekrar gönder (kurtarıldı notu); N deneme sınırında "yine kaldı"; ara denemeler ayrı kaydedilmez', async () => {
    const id = kural({ ad: 'Geçici hata kodu', kosul: { tur: 'alan', yol: 'Durum', islec: 'esit', deger: '9999' }, yapilacak: { tekrarGonder: true, enCokDeneme: 3 },
      kapsam: { ogeler: [{ servisId, metot: 'durum' }], ortamlar: null } });
    const kayitSayisi = () => servisKosulariniListele(vt, { servisId }).filter((k) => k.senaryoId === sen.durum).length;
    kuyruk['/api/durum'] = [json({ Durum: '9999' })];
    let once = [say('/api/durum'), kayitSayisi()];
    const r = await kos(sen.durum);
    expect(r.durum).toBe('basarili');
    expect(r.kurtarma).toEqual({ kuralId: id, kural: 'Geçici hata kodu', durum: 'kurtarildi', deneme: 2, not: 'kurtarıldı: Durum 9999 → 2. denemede başarılı' });
    expect([say('/api/durum') - once[0], kayitSayisi() - once[1]]).toEqual([2, 1]);
    expect(kurtarmaSutunu(r.kosuId)).toEqual([{ kuralId: id, durum: 'kurtarildi', deneme: 2 }]);
    kuyruk['/api/durum'] = Array.from({ length: 5 }, () => json({ Durum: '9999' }));
    once = [say('/api/durum'), kayitSayisi()];
    const r2 = await kos(sen.durum);
    expect(r2.durum).toBe('basarisiz');
    expect(r2.kurtarma).toMatchObject({ durum: 'kaldi', deneme: 3, not: 'kurtarma denendi, yine kaldı: Durum 9999 → 3 denemede de başarısız' });
    expect([say('/api/durum') - once[0], kayitSayisi() - once[1]]).toEqual([3, 1]);
    kuyruk['/api/durum'] = [];
    // Başarılı çağrıda kural hiç çalışmaz (not yok).
    const r3 = await kos(sen.durum);
    expect([r3.durum, r3.kurtarma]).toEqual(['basarili', undefined]);
  });

  test('servis: HTTP 503 → artan bekleme ile tekrar (1 sn, 2 sn)', async () => {
    kural({ ad: 'Yoğunluk', kosul: { tur: 'http', kodlar: '503, 502' }, yapilacak: { bekleSn: 1, tekrarGonder: true, enCokDeneme: 3, artanBekleme: true }, kapsam: { ogeler: [{ servisId, metot: 'yogun' }], ortamlar: null } });
    kuyruk['/api/yogun'] = [json({ Durum: 'yogun' }, 503), json({ Durum: 'yogun' }, 503)];
    const once = say('/api/yogun');
    const r = await kos(sen.yogun);
    expect(r.durum).toBe('basarili');
    expect(r.kurtarma?.not).toBe('kurtarıldı: HTTP 503 → 3. denemede başarılı');
    const z = (zamanlar['/api/yogun'] ?? []).slice(once);
    expect(z).toHaveLength(3);
    expect(z[1] - z[0]).toBeGreaterThanOrEqual(900);
    expect(z[2] - z[1]).toBeGreaterThanOrEqual(1900);
  });

  test('servis: SOAP Fault kodu / mesajı → tekrar gönder', async () => {
    kural({ ad: 'Sunucu Fault', kosul: { tur: 'fault', kod: 'Server', mesaj: 'geçici' }, yapilacak: { tekrarGonder: true, enCokDeneme: 2 }, kapsam: { ogeler: [{ servisId, metot: 'fault' }], ortamlar: null } });
    kuyruk['/api/fault'] = [{ durum: 500, tur: 'text/xml', govde: FAULT }];
    const once = say('/api/fault');
    const r = await kos(sen.fault);
    expect(r.durum).toBe('basarili');
    expect(r.kurtarma?.not).toBe('kurtarıldı: SOAP Fault Server "geçici" → 2. denemede başarılı');
    expect(say('/api/fault') - once).toBe(2);
  });

  test('servis: istek süzgeci — istekte parametre belirtilen değerde değilse kural çalışmaz', async () => {
    kural({ ad: 'Yalnız A kaynağı', kosul: { tur: 'alan', yol: 'Durum', islec: 'esit', deger: '9999' }, suzgec: { parametre: 'Kaynak', deger: 'A' },
      yapilacak: { tekrarGonder: true, enCokDeneme: 2 }, kapsam: { ogeler: [{ servisId, metot: 'suzgec' }], ortamlar: null } });
    // B kaynağı: koşul tutsa da süzgeç tutmaz → kural çalışmaz (tek istek, not yok).
    kuyruk['/api/suzgec'] = [json({ Durum: '9999' })];
    let once = say('/api/suzgec');
    const b = await kos(sen.suzgecB);
    expect([b.durum, b.kurtarma, say('/api/suzgec') - once]).toEqual(['basarisiz', undefined, 1]);
    // A kaynağı + 9999 → kural çalışır.
    kuyruk['/api/suzgec'] = [json({ Durum: '9999' })];
    once = say('/api/suzgec');
    const a = await kos(sen.suzgecA);
    expect([a.durum, a.kurtarma?.durum, say('/api/suzgec') - once]).toEqual(['basarili', 'kurtarildi', 2]);
    expect(govdeler['/api/suzgec'].slice(-2)).toEqual(['{"Kaynak":"A"}', '{"Kaynak":"A"}']);
  });

  test('servis: token\'ı yenile + tekrar gönder (oturum akışı yeniden alınır, yeni token kullanılır)', async () => {
    kural({ ad: 'Oturum düştü', kosul: { tur: 'http', kodlar: [440] }, yapilacak: { tokenYenile: true, tekrarGonder: true, enCokDeneme: 2 }, kapsam: { ogeler: [{ servisId, metot: 'oturumlu' }], ortamlar: null } });
    oturumlariTemizle();
    expect((await kos(sen.oturumlu)).durum).toBe('basarili');
    token++;
    kuyruk['/api/oturumlu'] = [json({ Durum: 'oturum' }, 440)];
    const once = [say('/api/oturumlu'), say('/api/giris')];
    const r = await kos(sen.oturumlu);
    expect(r.durum).toBe('basarili');
    expect(r.kurtarma?.not).toBe('kurtarıldı: HTTP 440 → 2. denemede başarılı');
    expect(r.oturum?.durum).toBe('yenilendi');
    expect([say('/api/oturumlu') - once[0], say('/api/giris') - once[1]]).toEqual([2, 1]);
    expect(JSON.stringify(r)).not.toMatch(/tok-\d/);
  });

  test('servis: bağlantı hatası → tekrar; en çok N denemede yine kaldı', async () => {
    kural({ ad: 'Bağlantı', kosul: { tur: 'baglanti' }, yapilacak: { tekrarGonder: true, enCokDeneme: 2 }, kapsam: { ogeler: [{ servisId: kapaliServis, metot: null }], ortamlar: null } });
    const r = await kos(sen.kapali, ortamId, kapaliServis);
    expect(r.durum).toBe('hata');
    expect(r.kurtarma).toMatchObject({ durum: 'kaldi', deneme: 2, not: 'kurtarma denendi, yine kaldı: bağlantı hatası → 2 denemede de başarısız' });
  });

  test('çift kayıt koruması: işaretsiz (kayıt oluşturan) metot tekrar gönderilmez ve notu düşer; işaretlenince tekrar gönderilir', async () => {
    kural({ ad: 'Kayıt yoğunluğu', kosul: { tur: 'http', kodlar: [503] }, yapilacak: { tekrarGonder: true, enCokDeneme: 2 }, kapsam: { ogeler: [{ servisId, metot: 'kayit' }], ortamlar: null } });
    kuyruk['/api/kayit'] = [json({ Durum: 'yogun' }, 503)];
    let once = say('/api/kayit');
    const r = await kos(sen.kayit);
    expect(r.durum).toBe('basarisiz');
    expect(r.kurtarma?.durum).toBe('tekrarlanmadi');
    expect(r.kurtarma?.not).toMatch(/^kayıt oluşturan adım tekrar denenmedi: HTTP 503 \("kayit" tekrar denenebilir işaretli değil/);
    expect(say('/api/kayit') - once).toBe(1);
    expect(kurtarmaSutunu(r.kosuId)).toEqual([{ kuralId: expect.any(String), durum: 'tekrarlanmadi', deneme: 1 }]);
    // Bekleme / token yenileme gibi tekrar içermeyen kural işaretsiz metotta da çalışır (istek tekrarlanmaz).
    const bekle = kural({ ad: 'Kayıt sonrası bekle', kosul: { tur: 'http', kodlar: [429] }, yapilacak: { bekleSn: 1 }, kapsam: { ogeler: [{ servisId, metot: 'kayit' }], ortamlar: null } });
    kuyruk['/api/kayit'] = [json({ Durum: 'cok' }, 429)];
    once = say('/api/kayit');
    const r2 = await kos(sen.kayit);
    expect([r2.durum, r2.kurtarma?.durum, r2.kurtarma?.not, say('/api/kayit') - once]).toEqual(['basarisiz', 'denendi', 'kurtarma: HTTP 429 → 1 sn beklendi; istek tekrar gönderilmedi', 1]);
    kuralSil(vt, projeId, bekle);
    // Kullanıcı işaretleyince tekrar gönderilir.
    servisiKaydet(vt, projeId, { id: servisId, anahtar: 'deneme-api', ad: 'Deneme API', yol: '/', tekrarDenenebilirOperasyonlar: ['durum', 'yogun', 'suzgec', 'oturumlu', 'yetkili', 'fault', 'kayit'] });
    kuyruk['/api/kayit'] = [json({ Durum: 'yogun' }, 503)];
    once = say('/api/kayit');
    const r3 = await kos(sen.kayit);
    expect([r3.durum, r3.kurtarma?.durum, say('/api/kayit') - once]).toEqual(['basarili', 'kurtarildi', 2]);
    servisiKaydet(vt, projeId, { id: servisId, anahtar: 'deneme-api', ad: 'Deneme API', yol: '/', tekrarDenenebilirOperasyonlar: ['durum', 'yogun', 'suzgec', 'oturumlu', 'yetkili', 'fault'] });
  });

  test('kapsam: başka servisin / metodun kuralı ve seçili olmayan ortamın kuralı çalışmaz; seçili ortamda çalışır; kapalı kural çalışmaz', async () => {
    const id = kural({ ad: 'Yalnız ikinci ortam', kosul: { tur: 'alan', yol: 'Durum', islec: 'esit', deger: '8888' }, yapilacak: { tekrarGonder: true, enCokDeneme: 2 },
      kapsam: { ogeler: [{ servisId: baskaServis, metot: 'durum' }], ortamlar: [ortam2] } });
    // Deneme API'de (kapsam dışı servis) çalışmaz.
    kuyruk['/api/durum'] = [json({ Durum: '8888' })];
    let r = await kos(sen.durum, ortam2);
    expect([r.durum, r.kurtarma]).toEqual(['basarisiz', undefined]);
    // Başka API TEST ortamında: ortam kapsam dışı.
    kuyruk['/api/durum'] = [json({ Durum: '8888' })];
    r = await kos(sen.baska, ortamId, baskaServis);
    expect([r.durum, r.kurtarma]).toEqual(['basarisiz', undefined]);
    // Kapsam genişletilir: TEST ortamı seçili → çalışır.
    kuralKaydet(vt, projeId, { id, ad: 'Yalnız ikinci ortam', tur: 'servis', kosul: { tur: 'alan', yol: 'Durum', islec: 'esit', deger: '8888' }, yapilacak: { tekrarGonder: true, enCokDeneme: 2 },
      kapsam: { ogeler: [{ servisId: baskaServis, metot: null }], ortamlar: [ortamId, ortam2] } });
    kuyruk['/api/durum'] = [json({ Durum: '8888' })];
    r = await kos(sen.baska, ortamId, baskaServis);
    expect([r.durum, r.kurtarma?.durum]).toEqual(['basarili', 'kurtarildi']);
    // Kapatılınca çalışmaz.
    kuralDurumuAyarla(vt, projeId, id, false);
    kuyruk['/api/durum'] = [json({ Durum: '8888' })];
    r = await kos(sen.baska, ortamId, baskaServis);
    expect([r.durum, r.kurtarma]).toEqual(['basarisiz', undefined]);
    kuyruk['/api/durum'] = [];
  });

  test('hazır 401 / 403 kuralı: açıkken bugünkü davranış (token yenilenir, bir kez tekrar, aynı not); kapatılınca tek istek', async () => {
    // Sahte servis: /api/yetkili son token dışındakini 401 ile reddeder (kuyrukla canlandırılır).
    oturumlariTemizle();
    expect((await kos(sen.yetkili)).durum).toBe('basarili');
    kuyruk['/api/yetkili'] = [json({ Durum: 'yetki' }, 401)];
    let once = [say('/api/yetkili'), say('/api/giris')];
    const r = await kos(sen.yetkili);
    expect(r.durum).toBe('basarili');
    expect(r.yetkiTekrari).toEqual({ ilkDurumKodu: 401, not: '401 alındı, token yenilendi, tekrar denendi' });
    expect(r.kurtarma).toBeUndefined();
    expect([say('/api/yetkili') - once[0], say('/api/giris') - once[1]]).toEqual([2, 1]);
    expect(kurtarmaSutunu(r.kosuId)).toEqual([{ kuralId: HAZIR_YETKI, durum: 'kurtarildi', deneme: 2 }]);
    kuralDurumuAyarla(vt, projeId, HAZIR_YETKI, false);
    kuyruk['/api/yetkili'] = [json({ Durum: 'yetki' }, 403)];
    once = [say('/api/yetkili'), say('/api/giris')];
    const r2 = await kos(sen.yetkili);
    expect([r2.durum, r2.durumKodu, r2.yetkiTekrari]).toEqual(['basarisiz', 403, undefined]);
    expect([say('/api/yetkili') - once[0], say('/api/giris') - once[1]]).toEqual([1, 0]);
    kuralDurumuAyarla(vt, projeId, HAZIR_YETKI, true);
  });

  test('akış adımında kuralın notu adım notunda görünür', async () => {
    const akis = servisAkisiKaydet(vt, { projeId, baslik: 'Durum akışı', icerik: { adimlar: [{ ad: 'Durum', servisId, senaryoId: sen.durum }] } });
    kuyruk['/api/durum'] = [json({ Durum: '9999' })];
    const r = await servisAkisiCalistir(vt, projeId, { akisId: akis, ortamId, tur: 'kosu' });
    expect(r.durum).toBe('basarili');
    expect(r.adimlar[0].not).toBe('kurtarıldı: Durum 9999 → 2. denemede başarılı');
  });

  test('sayaçlar: kural satırında "son 7 günde N kez"; Sonuçlar > Özet > Dikkat kartında kural maddesi', async () => {
    const e = kurtarmaEkrani(vt, projeId);
    const bul = (ad: string) => e.kurallar.find((k) => k.ad === ad);
    expect(bul('Geçici hata kodu')?.son7Gun).toBe(3);
    expect(bul('Yoğunluk')?.son7Gun).toBe(1);
    expect(bul(kurallariListele(vt, projeId)[0].ad)?.son7Gun).toBe(1);
    expect(e.sayacGun).toBe(7);
    expect(e.secenekler.servisler.find((s) => s.id === servisId)?.tekrarDenenebilir).toContain('durum');
    const s = kurtarmaSayaclari(vt, projeId, { bas: new Date(Date.now() - 86_400_000) });
    expect(Object.values(s).reduce((t, x) => t + x.toplam, 0)).toBeGreaterThanOrEqual(10);
    // 8 gün sonrası: sayaç sıfır.
    expect(kurtarmaEkrani(vt, projeId, new Date(Date.now() + 8 * 86_400_000)).kurallar.every((k) => k.son7Gun === 0)).toBe(true);
    farkindalikOnbelleginiTemizle();
    const f = await farkindalikVerisi(vt, projeId, { aralik: { baslangic: null, bitis: null }, onbellek: false });
    const madde = f.kartlar.dikkat.maddeler.find((m) => m.tur === 'kurtarma' && m.ad === 'Geçici hata kodu');
    expect(madde).toEqual({ tur: 'kurtarma', ad: 'Geçici hata kodu', ayrinti: 'Kurtarma kuralı · 3 kez çalıştı · 2 kurtarıldı · 1 yine kaldı', adres: '#/ayarlar/proje' });
    expect(f.kartlar.dikkat.maddeler.some((m) => m.tur === 'kurtarma' && m.ayrinti.includes('tekrar denenmedi'))).toBe(true);
  });
});

test('içe aktarma: kurallar yeni projeye ve mevcut projeye (ekran / ortam / servis eşlemesiyle) gelir, tekrar aktarmada kopya olmaz; proje silme kuralları kaldırır', async () => {
  const kaynakParola = 'Kurtarma-Kaynak-Parola-1';
  const a = await veritabaniniHazirla(null);
  await kasaOlustur(a, kaynakParola, { kdf: HIZLI_KDF });
  const b = await veritabaniniHazirla(null);
  await kasaOlustur(b, 'Kurtarma-Hedef-Parola-2', { kdf: HIZLI_KDF });
  const medya = geciciKlasor('kurtarma-medya');
  try {
    const ap = projeKaydet(a, { ad: 'Kaynak' });
    const ao = ortamKaydet(a, { projeId: ap, ad: 'TEST', tabanUrl: 'http://127.0.0.1:9', varsayilan: true, ayarlar: { riskli: false } });
    const ae = ekranKaydet(a, { projeId: ap, anahtar: 'islem', ad: 'İşlem' });
    const as = restServisiKaydet(a, ap, { anahtar: 'islem-api', ad: 'İşlem API', uclar: [{ ad: 'durum', metot: 'GET', yol: '/durum' }] }).id;
    const ek = kuralKaydet(a, ap, { ad: 'Ekran yenile', tur: 'ekran', kosul: { tur: 'metin', metin: 'Geçici sorun' }, eylem: { tur: 'yenile' }, sonra: { tur: 'tekrar', kez: 1 }, kapsam: { ogeler: [ae], ortamlar: [ao] } });
    kuralKaydet(a, ap, { ad: 'Servis 503', tur: 'servis', kosul: { tur: 'http', kodlar: [503] }, yapilacak: { tekrarGonder: true, enCokDeneme: 2 }, kapsam: { ogeler: [{ servisId: as, metot: 'durum' }], ortamlar: null } });
    kuralDurumuAyarla(a, ap, HAZIR_YETKI, false);
    const ozet = (vt: Veritabani, p: string) => kurallariListele(vt, p).map((k) => ({ ad: k.ad, acik: k.acik, kapsam: k.kapsam }));

    // 1) Yeni proje olarak.
    const h1 = await iceAktarmaHazirla(b, yedekOlustur(a).veri, kaynakParola);
    iceAktarmaUygula(b, h1, { tumu: true }, { yapan: 'birim-test' });
    expect(ozet(b, ap)).toEqual(ozet(a, ap));
    expect(hazirYetkiKuraliAcik(b, ap)).toBe(false);

    // 2) Mevcut projeye: aynı anahtarlı ekran / servis ve aynı adlı ortam → kapsamdaki kimlikler yereldekilerle yazılır.
    const cp = projeKaydet(b, { ad: 'Yerel' });
    const co = ortamKaydet(b, { projeId: cp, ad: 'TEST', tabanUrl: 'http://127.0.0.1:9', varsayilan: true, ayarlar: { riskli: false } });
    const ce = ekranKaydet(b, { projeId: cp, anahtar: 'islem', ad: 'İşlem (yerel)' });
    const cs = restServisiKaydet(b, cp, { anahtar: 'islem-api', ad: 'İşlem API', uclar: [{ ad: 'durum', metot: 'GET', yol: '/durum' }] }).id;
    for (let tekrar = 0; tekrar < 2; tekrar++) {
      const h = await iceAktarmaHazirla(b, yedekOlustur(a).veri, kaynakParola);
      iceAktarmaUygula(b, h, { tumu: true, esleme: { projeler: { [ap]: { hedef: cp } } } }, { yapan: 'birim-test' });
      const liste = kurallariListele(b, cp);
      expect(liste.map((k) => k.ad)).toEqual([kurallariListele(b, cp)[0].ad, 'Ekran yenile', 'Servis 503']);
      expect(liste.find((k) => k.ad === 'Ekran yenile')?.kapsam).toEqual({ ogeler: [ce], ortamlar: [co] });
      expect(liste.find((k) => k.ad === 'Servis 503')?.kapsam).toEqual({ ogeler: [{ servisId: cs, metot: 'durum' }], ortamlar: null });
      expect(Number(b.tek('SELECT COUNT(*) AS n FROM kurtarma_kurallari WHERE proje_id = ?', [cp])?.n)).toBe(3);
    }
    expect(ek).toBeTruthy();

    // 3) Proje silme: önizlemede sayı, silince kural kalmaz; diğer projenin kuralları korunur.
    expect(projeSilmeOnizlemesi(b, cp).sayilar.kurtarmaKurali).toBe(3);
    const r = projeyiSil(b, cp, { medyaKlasoru: medya.yol, yapan: 'birim-test' });
    expect(r.silinen.kurtarmaKurali).toBe(3);
    expect(projeKalintilari(b, cp)).toEqual({});
    expect(Number(b.tek('SELECT COUNT(*) AS n FROM kurtarma_kurallari WHERE proje_id = ?', [cp])?.n)).toBe(0);
    expect(kurallariListele(b, ap).map((k) => k.ad)).toEqual(kurallariListele(a, ap).map((k) => k.ad));
  } finally { a.kapat(); b.kapat(); medya.temizle(); }
});
