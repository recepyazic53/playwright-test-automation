// KORUMA TESTLERİ — servis önerilerinin risk verisi (servis-oneri-baglami.mjs → servisOneriGecmisi SQL + şifreli sonuç okuma) GERÇEKÇİ
// kayıtlarla: geçici veritabanına servis koşu kayıt kodunun (servis-deposu.mjs > servisKosusuKaydet) yazdığı biçimde sentetik çalıştırmalar
// (servis-islemleri.mjs > servisSenaryosuCalistir'in sonuç nesnesi: operasyon, ortam, adres, istek, durumKodu, yanitSureMs, kontroller,
// ozet, yanit; bağlantı hatasında yalnız "hata"). Doğrulanan: başarısız senaryolar son 14 günden sayılır; görülen mesajlar (SOAP Fault,
// HTTP 4xx / 5xx JSON mesajı, kontrolleri kalan başarılı yanıttaki açıklama) sayılar "#"a indirgenerek gruplanır ve maskelenir; süre
// sınırı, başka ortam / servis, bağlantı hatası ve olağan başarılı yanıt sayılmaz. Uçtan uca: servisOnerileriniUret önerileri üretir.
// Tarayıcı ve ağ yok; değerler SAHTEDİR.
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import type { Veritabani } from '../../scripts/platform/veritabani/baglanti.mjs';
import { ortamKaydet, projeKaydet, veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { servisKaydet, servisKosusuKaydet, servisSenaryosuKaydet } from '../../scripts/platform/servisler/servis-deposu.mjs';
import { SERVIS_HATA_GUNU, SERVIS_UYARI_GUNU, kayittanMesaj, servisOneriGecmisi, servisOnerileriniUret } from '../../scripts/platform/servisler/servis-oneri-baglami.mjs';
import { HIZLI_KDF } from './platform-ortak';
import { semalar, siparisGovdesi } from './servis-onerileri-fikstur';

const SIMDI = new Date('2026-09-28T10:00:00.000Z');
const once = (gun: number, saat = 0) => new Date(SIMDI.getTime() - gun * 86_400_000 - saat * 3_600_000).toISOString();
const fault = (m: string) => `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><soap:Fault><faultcode>soap:Server</faultcode><faultstring>${m}</faultstring></soap:Fault></soap:Body></soap:Envelope>`;
const yanit = (durum: string, aciklama: string) => `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><SiparisVerResponse xmlns="Ornek"><Durum>${durum}</Durum><StatusDescription>${aciklama}</StatusDescription></SiparisVerResponse></soap:Body></soap:Envelope>`;

test.describe('servis öneri geçmişi (risk sorgusu) gerçekçi koşu kayıtlarıyla', () => {
  test.describe.configure({ mode: 'serial' });
  let klasor = '';
  let vt: Veritabani;
  let projeId = '';
  let ortamId = '';
  let digerOrtam = '';
  let servisId = '';
  let restId = '';
  const s: Record<string, string> = {};

  /** servisSenaryosuCalistir'in yazdığı sonuç biçimi. */
  const kayit = (senaryo: string | null, zaman: string, durum: 'basarili' | 'basarisiz' | 'hata', sonuc: Record<string, unknown>, o = ortamId, srv = servisId) => servisKosusuKaydet(vt, {
    projeId, servisId: srv, senaryoId: senaryo, ortamId: o, tur: 'kosu', durum, baslangic: zaman, sureMs: 120, baslik: 'x',
    sonuc: { operasyon: 'SiparisVer', ortam: 'TEST', ortamTuru: 'test', adres: 'http://127.0.0.1:9/Ornek/servis.asmx', istek: '<x/>', ...sonuc }
  });
  const yanitli = (durumKodu: number, govde: string, ozet: string, gecti: boolean) => ({ durumKodu, yanitSureMs: 80, yanit: govde, ozet,
    kontroller: [{ tur: 'soapHatasiYok', ad: 'SOAP hatası (Fault) yok', gecti, aciklama: gecti ? 'Hata yok' : `SOAP hatası: ${ozet}` }] });

  test.beforeAll(async () => {
    klasor = mkdtempSync(join(tmpdir(), 'servis-oneri-gecmisi-'));
    vt = await veritabaniniHazirla(join(klasor, 'platform.db'));
    await kasaOlustur(vt, `Gecici-${randomBytes(6).toString('hex')}`, { kdf: HIZLI_KDF });
    projeId = projeKaydet(vt, { ad: 'Servis Öneri Projesi' });
    ortamId = ortamKaydet(vt, { projeId, ad: 'TEST', tabanUrl: 'http://127.0.0.1:9', varsayilan: true, ayarlar: { riskli: false } });
    digerOrtam = ortamKaydet(vt, { projeId, ad: 'Diğer', tabanUrl: 'http://127.0.0.1:9', ayarlar: { riskli: false } });
    servisId = servisKaydet(vt, { projeId, anahtar: 'ornek', ad: 'Örnek', tur: 'soap', ayarlar: { yol: '/Ornek/servis.asmx', operasyonlar: [{ ad: 'SiparisVer' }, { ad: 'DurumSor' }], operasyonSemalari: semalar() } });
    restId = servisKaydet(vt, { projeId, anahtar: 'kayit', ad: 'Kayıt', tur: 'rest', ayarlar: { yol: '/', operasyonlar: [{ ad: 'kayitEkle', metot: 'POST', yol: '/kayit' } as never] } });
    const kaydet = (ad: string, degerler: Record<string, string>) => {
      s[ad] = servisSenaryosuKaydet(vt, { projeId, servisId, baslik: ad, icerik: { operasyon: 'SiparisVer', govde: siparisGovdesi(degerler), kontroller: [{ tur: 'soapYaniti' }] } });
    };
    kaydet('A kanalı', { Tutar: '500', Kod: 'ABC', Tip: 'O', Kanal: 'A' });
    kaydet('B kanalı', { Tutar: '900', Kod: 'ABC', Tip: 'T', Kanal: 'B' });

    // SAYILANLAR (bu ortam ya da ortamı bilinmeyen; son 14 gün başarısız / son 90 gün mesaj):
    kayit(s['B kanalı'], once(1), 'basarisiz', yanitli(500, fault('Tutar limiti 900 aşıldı'), 'Tutar limiti 900 aşıldı', false));
    kayit(s['B kanalı'], once(3), 'basarisiz', yanitli(500, fault('Tutar limiti 950 aşıldı'), 'Tutar limiti 950 aşıldı', false), null as never);
    kayit(s['A kanalı'], once(40), 'basarisiz', yanitli(200, yanit('HATA', 'Parola=gizli123 hatalı'), 'Parola=gizli123 hatalı', true));
    kayit(s['A kanalı'], once(2), 'basarili', yanitli(200, yanit('OK', 'Başarılı'), 'Başarılı', true));
    // SAYILMAYANLAR: 20 gün önce başarısız (14 gün dışı ama mesajı 90 gün içinde sayılır), 100 gün önce, başka ortam, başka servis,
    // bağlantı hatası (yanıt yok), 14 gün + 1 saat önce biten başarısız.
    kayit(s['A kanalı'], once(20), 'basarisiz', yanitli(500, fault('Sistem meşgul'), 'Sistem meşgul', false));
    kayit(s['A kanalı'], once(SERVIS_HATA_GUNU, 1), 'basarisiz', yanitli(200, yanit('OK', ''), '', true));
    kayit(s['A kanalı'], once(100), 'basarisiz', yanitli(500, fault('Eski hata'), 'Eski hata', false));
    kayit(s['A kanalı'], once(1), 'basarisiz', yanitli(500, fault('Diğer ortam hatası'), 'Diğer ortam hatası', false), digerOrtam);
    kayit(null, once(1), 'basarisiz', { operasyon: 'kayitEkle', durumKodu: 422, yanit: '{"error":{"message":"Ad çok uzun"}}', ozet: '{"error":{"message":"Ad çok uzun"}}', kontroller: [] }, ortamId, restId);
    kayit(s['A kanalı'], once(1), 'hata', { hata: 'İstek zaman aşımına uğradı (30 sn)' });
  });

  test.afterAll(() => {
    vt?.kapat();
    if (klasor) rmSync(klasor, { recursive: true, force: true });
  });

  test('sorgu: başarısız senaryolar ve görülen mesajlar sayılır; süre sınırı, ortam, servis, bağlantı hatası ve olağan yanıt sayılmaz', () => {
    const g = servisOneriGecmisi(vt, projeId, servisId, ortamId, SIMDI);
    expect(g).toMatchObject({ hataGunu: SERVIS_HATA_GUNU, uyariGunu: SERVIS_UYARI_GUNU });
    expect(g.hatalar).toEqual([{ senaryoId: s['B kanalı'], sayi: 2 }]);
    expect(g.mesajlar).toEqual([
      // Sayılar "#"a indirgenerek gruplanır (en yeni metin kalır); ortamı bilinmeyen kayıt dahil.
      { metin: 'Tutar limiti 900 aşıldı', operasyon: 'SiparisVer', sayi: 2, senaryoIdleri: [s['B kanalı']], hataTuru: 'fault' },
      { metin: 'Sistem meşgul', operasyon: 'SiparisVer', sayi: 1, senaryoIdleri: [s['A kanalı']], hataTuru: 'fault' },
      // Başarılı yanıttaki iş kuralı açıklaması; gizli adlı değer maskelenir.
      { metin: 'Parola=••• hatalı', operasyon: 'SiparisVer', sayi: 1, senaryoIdleri: [s['A kanalı']], hataTuru: 'yanit' }
    ]);
    // REST: HTTP 4xx gövdesindeki JSON mesajı (iç içe error.message).
    expect(servisOneriGecmisi(vt, projeId, restId, ortamId, SIMDI).mesajlar).toEqual([{ metin: 'Ad çok uzun', operasyon: 'kayitEkle', sayi: 1, senaryoIdleri: [], hataTuru: 'http' }]);
  });

  test('kayıttan mesaj: yanıtı olmayan, olağan başarılı ve çok satırlı / uzun metin mesaj sayılmaz', () => {
    expect(kayittanMesaj({ hata: 'bağlantı' }, 'hata', 'soap')).toBeNull();
    expect(kayittanMesaj({ durumKodu: 200, yanit: yanit('OK', 'Başarılı'), ozet: 'Başarılı' }, 'basarili', 'soap')).toBeNull();
    expect(kayittanMesaj({ durumKodu: 500, yanit: 'x', ozet: 'a\nb' }, 'basarisiz', 'soap')).toBeNull();
    expect(kayittanMesaj({ durumKodu: 404, yanit: '{"message":"Kayıt yok"}', ozet: '' }, 'basarisiz', 'rest')).toEqual({ metin: 'Kayıt yok', hataTuru: 'http' });
  });

  test('uçtan uca (okuma): öneriler üretilir; risk ve görülen mesaj; maskeli mesaj eklenemez; hiçbir şey yazılmaz', () => {
    const say = () => Number(vt.tek('SELECT COUNT(*) AS n FROM servis_senaryolari')?.n);
    const onceki = say();
    const r = servisOnerileriniUret(vt, projeId, { servisId, ortamId, operasyon: 'SiparisVer', ustSinir: 100 }, SIMDI);
    expect(r.metotlar).toEqual([{ ad: 'SiparisVer', senaryoSayisi: 2, alanSayisi: 9 }, { ad: 'DurumSor', senaryoSayisi: 0, alanSayisi: 2 }]);
    const uyarilar = r.oneriler.filter((o) => o.tur === 'uyari');
    expect(uyarilar.map((o) => o.baslik).sort()).toEqual(['Hata beklenir: Parola=••• hatalı', 'Hata beklenir: Sistem meşgul', 'Hata beklenir: Tutar limiti 900 aşıldı']);
    expect(uyarilar.find((o) => o.baslik.includes('Parola'))).toMatchObject({ eklenebilir: false });
    expect(r.oneriler.filter((o) => o.tur === 'kombinasyon' && o.neden === 'risk').length).toBeGreaterThan(0);
    expect(say()).toBe(onceki);
  });
});
