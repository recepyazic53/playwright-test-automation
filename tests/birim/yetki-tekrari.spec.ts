// KORUMA TESTLERİ — yetki hatasında (HTTP 401 / 403) tekrar: akışın "Yetki hatasında" seçimi, "Genel ayar" ise Ayarlar > Koşu (varsayılan
// "Token'ı yenile, bir kez tekrar dene"). Kapalıyken tek istek ve normal sonuç; açıkken oturum akışı / akıştaki token adımı yeniden çalışır, istek BİR KEZ
// tekrarlanır, raporda not ("401 alındı, token yenilendi, tekrar denendi"), ilk deneme ayrı kayıt olmaz; ikinci deneme de reddedilirse
// normal hata. Bu ayardan önce kaydedilmiş oturum akışı (alan yok) o zamanki davranışı (bir kez yenile) korur. Yalnız 127.0.0.1.
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { kasaOlustur, sifrele } from '../../scripts/platform/kasa.mjs';
import type { Veritabani } from '../../scripts/platform/veritabani/baglanti.mjs';
import { ortamKaydet, projeKaydet, veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import {
  servisAkisiGetir, servisAkisiKaydet, servisKosulariniListele, servisSenaryosuKaydet, yetkiHatasiSecimi
} from '../../scripts/platform/servisler/servis-deposu.mjs';
import { servisiKaydet, servisSenaryosuCalistir } from '../../scripts/platform/servisler/servis-islemleri.mjs';
import { oturumlariTemizle, servisAkisiCalistir } from '../../scripts/platform/servisler/servis-akislari.mjs';
import { restServisiKaydet } from '../../scripts/platform/servisler/rest-servisi.mjs';
import { kosuAyarlariniKaydet, kosuAyarlariniOku } from '../../scripts/platform/ayarlar/kosu-ayarlari.mjs';
import { HIZLI_KDF, geciciKlasor } from './platform-ortak';
import { sahteMagaza, type SahteMagaza } from './sozlesme-fikstur';

const NOT = '401 alındı, token yenilendi, tekrar denendi';

test.describe('yetki hatasında tekrar', () => {
  test.describe.configure({ mode: 'serial' });
  const klasor = geciciKlasor('yetki-tekrari');
  let vt: Veritabani;
  let m: SahteMagaza;
  let projeId = '';
  let ortamId = '';
  let servisId = '';
  let giris = '';
  let guvenli = '';
  let hep401 = '';
  let hep403 = '';
  let oturum = '';
  const oturumIcerigi = (ek: Record<string, unknown> = {}) => ({ adimlar: [{ ad: 'Giriş', servisId, senaryoId: giris, okumalar: [{ ad: 'Token', kaynak: 'json', yol: 'token' }] }], omurSaniye: 600, ...ek });
  const kos = (senaryoId: string) => servisSenaryosuCalistir(vt, projeId, { servisId, ortamId, tur: 'dene', senaryoId });
  /** Token başka yerden yenilendi (sunucu eskisini reddeder). */
  const tokenEskit = () => { m.durum.token++; };
  /** Güvenli senaryosunun koşu kayıtları (oturum akışının giriş adımı ayrıca kaydedilir). */
  const guvenliKayitlari = () => servisKosulariniListele(vt, { servisId }).filter((k) => k.senaryoId === guvenli).length;

  test.beforeAll(async () => {
    m = await sahteMagaza();
    vt = await veritabaniniHazirla(join(klasor.yol, 'platform.db'));
    await kasaOlustur(vt, 'Gecici-Yetki-1', { kdf: HIZLI_KDF });
    projeId = projeKaydet(vt, { ad: 'Yetki projesi' });
    ortamId = ortamKaydet(vt, { projeId, ad: 'TEST', tabanUrl: m.adres, varsayilan: true, ayarlar: { riskli: false } });
    servisId = restServisiKaydet(vt, projeId, { anahtar: 'magaza-api', ad: 'Magaza API', tabanlar: { [ortamId]: m.adres }, uclar: [
      { ad: 'giris', metot: 'POST', yol: '/api/giris' }, { ad: 'guvenli', metot: 'GET', yol: '/api/guvenli' }, { ad: 'hep401', metot: 'GET', yol: '/api/hep401' }, { ad: 'hep403', metot: 'GET', yol: '/api/hep403' }
    ] }).id;
    const senaryo = (baslik: string, op: string, yol: string, metot = 'GET', basliklar?: Record<string, string>) => servisSenaryosuKaydet(vt, { projeId, servisId, baslik, kapsam: 'ikisi', icerik: {
      operasyon: op, govde: '', kontroller: [{ tur: 'durumKodu', deger: '200' }], http: { metot, yol }, ...(basliklar ? { basliklar } : {})
    } });
    const yetki = { Authorization: 'Bearer ${akis:Token}' };
    giris = senaryo('Giriş', 'giris', '/api/giris', 'POST');
    guvenli = senaryo('Güvenli', 'guvenli', '/api/guvenli', 'GET', yetki);
    hep401 = senaryo('Hep 401', 'hep401', '/api/hep401', 'GET', yetki);
    hep403 = senaryo('Hep 403', 'hep403', '/api/hep403', 'GET', yetki);
    oturum = servisAkisiKaydet(vt, { projeId, baslik: 'Oturum', tur: 'oturum', icerik: oturumIcerigi() });
    servisiKaydet(vt, projeId, { id: servisId, anahtar: 'magaza-api', ad: 'Magaza API', yol: '/', oturumAkisi: oturum });
  });
  test.afterAll(async () => { vt?.kapat(); await m?.kapat(); klasor.temizle(); });

  test('varsayılan: yeni oturum akışı "genel", Ayarlar > Koşu varsayılanı "Token\'ı yenile, bir kez tekrar dene"', async () => {
    expect(servisAkisiGetir(vt, oturum)!.icerik.yetkiHatasinda).toBe('genel');
    expect(kosuAyarlariniOku(vt).yetkiHatasinda).toBe('yenileVeTekrar');
    oturumlariTemizle();
    await kos(guvenli);
    tokenEskit();
    const o = { guvenli: m.sayi('/api/guvenli'), giris: m.sayi('/api/giris') };
    const r = await kos(guvenli);
    expect(r.durum).toBe('basarili');
    expect(r.yetkiTekrari?.not).toBe(NOT);
    expect([m.sayi('/api/guvenli') - o.guvenli, m.sayi('/api/giris') - o.giris]).toEqual([2, 1]);
  });

  test('Ayarlar > Koşu "Tekrar deneme" → 401 sonrası tek istek, normal sonuç', async () => {
    kosuAyarlariniKaydet(vt, { yetkiHatasinda: 'tekrarYok' });
    expect(servisAkisiGetir(vt, oturum)!.icerik.yetkiHatasinda).toBe('genel');
    oturumlariTemizle();
    expect((await kos(guvenli)).durum).toBe('basarili');
    tokenEskit();
    const once = { guvenli: m.sayi('/api/guvenli'), giris: m.sayi('/api/giris'), kayit: guvenliKayitlari() };
    const r = await kos(guvenli);
    expect(r.durum).toBe('basarisiz');
    expect(r.durumKodu).toBe(401);
    expect(r.yetkiTekrari).toBeUndefined();
    expect(r.oturum?.durum).toBe('onbellek');
    expect([m.sayi('/api/guvenli') - once.guvenli, m.sayi('/api/giris') - once.giris]).toEqual([1, 0]);
    expect(guvenliKayitlari()).toBe(once.kayit + 1);
  });

  test('Ayarlar > Koşu "Token\'ı yenile, bir kez tekrar dene": oturum yeniden alınır, istek bir kez tekrarlanır, raporda not', async () => {
    kosuAyarlariniKaydet(vt, { yetkiHatasinda: 'yenileVeTekrar' });
    oturumlariTemizle();
    await kos(guvenli);
    tokenEskit();
    const once = { guvenli: m.sayi('/api/guvenli'), giris: m.sayi('/api/giris'), kayit: guvenliKayitlari() };
    const r = await kos(guvenli);
    expect(r.durum).toBe('basarili');
    expect(r.yetkiTekrari).toEqual({ ilkDurumKodu: 401, not: NOT });
    expect(r.oturum?.durum).toBe('yenilendi');
    expect([m.sayi('/api/guvenli') - once.guvenli, m.sayi('/api/giris') - once.giris]).toEqual([2, 1]);
    // İlk deneme ayrı sonuç değil: tek kayıt, notuyla.
    expect(guvenliKayitlari()).toBe(once.kayit + 1);
    expect(JSON.stringify(r)).not.toMatch(/tok-\d/);
    // İkinci deneme de 401 / 403: yeniden denenmez, normal sonuç (kontrol kalır) + not.
    for (const [id, kod, yol] of [[hep401, 401, '/api/hep401'], [hep403, 403, '/api/hep403']] as const) {
      const o = { yol: m.sayi(yol), giris: m.sayi('/api/giris') };
      const h = await kos(id);
      expect(h.durum).toBe('basarisiz');
      expect(h.durumKodu).toBe(kod);
      expect(h.yetkiTekrari?.not).toBe(`${kod} alındı, token yenilendi, tekrar denendi; tekrar da ${kod} döndü`);
      expect([m.sayi(yol) - o.yol, m.sayi('/api/giris') - o.giris]).toEqual([2, 1]);
    }
    kosuAyarlariniKaydet(vt, { yetkiHatasinda: 'tekrarYok' });
  });

  test('akışın seçimi genel ayarı ezer (her iki yönde)', async () => {
    servisAkisiKaydet(vt, { id: oturum, projeId, baslik: 'Oturum', tur: 'oturum', icerik: oturumIcerigi({ yetkiHatasinda: 'yenileVeTekrar' }) });
    oturumlariTemizle();
    await kos(guvenli);
    tokenEskit();
    expect((await kos(guvenli)).yetkiTekrari?.not).toBe(NOT);
    kosuAyarlariniKaydet(vt, { yetkiHatasinda: 'yenileVeTekrar' });
    servisAkisiKaydet(vt, { id: oturum, projeId, baslik: 'Oturum', tur: 'oturum', icerik: oturumIcerigi({ yetkiHatasinda: 'tekrarYok' }) });
    // Seçim verilmeden yeniden kaydetmek kayıtlı seçimi korur.
    servisAkisiKaydet(vt, { id: oturum, projeId, baslik: 'Oturum', tur: 'oturum', icerik: oturumIcerigi() });
    expect(servisAkisiGetir(vt, oturum)!.icerik.yetkiHatasinda).toBe('tekrarYok');
    oturumlariTemizle();
    await kos(guvenli);
    tokenEskit();
    const o = m.sayi('/api/guvenli');
    const r = await kos(guvenli);
    expect([r.durum, r.yetkiTekrari, m.sayi('/api/guvenli') - o]).toEqual(['basarisiz', undefined, 1]);
    kosuAyarlariniKaydet(vt, { yetkiHatasinda: 'tekrarYok' });
    expect(() => servisAkisiKaydet(vt, { id: oturum, projeId, baslik: 'Oturum', tur: 'oturum', icerik: oturumIcerigi({ yetkiHatasinda: 'bazen' }) })).toThrow('yetkiHatasinda');
  });

  test('bu ayardan önce kaydedilmiş oturum akışı (alan yok): o zamanki davranış — bir kez yenilenip tekrar denenir', async () => {
    const eski = { ...servisAkisiGetir(vt, oturum)!.icerik };
    delete eski.yetkiHatasinda;
    vt.calistir('UPDATE servis_akislari SET icerik_json = ? WHERE id = ?', [sifrele(vt, JSON.stringify(eski)), oturum]);
    const a = servisAkisiGetir(vt, oturum)!;
    expect(a.icerik.yetkiHatasinda).toBeUndefined();
    expect(yetkiHatasiSecimi(a)).toBe('yenileVeTekrar');
    expect(yetkiHatasiSecimi({ tur: 'akis', icerik: {} })).toBe('genel');
    oturumlariTemizle();
    await kos(guvenli);
    tokenEskit();
    expect((await kos(guvenli)).yetkiTekrari?.not).toBe(NOT);
    // Seçim verilmeden yeniden kaydedilince o davranış açıkça yazılır.
    servisAkisiKaydet(vt, { id: oturum, projeId, baslik: 'Oturum', tur: 'oturum', icerik: oturumIcerigi() });
    expect(servisAkisiGetir(vt, oturum)!.icerik.yetkiHatasinda).toBe('yenileVeTekrar');
    servisiKaydet(vt, projeId, { id: servisId, anahtar: 'magaza-api', ad: 'Magaza API', yol: '/', oturumAkisi: null });
  });

  test('akıştaki token adımı: açıkken 401 sonrası token adımı yeniden çalışır, adım bir kez tekrarlanır, adımda not; kapalıyken tek istek', async () => {
    const icerik = (yetkiHatasinda?: string) => ({ adimlar: [
      { ad: 'Giriş', servisId, senaryoId: giris, okumalar: [{ ad: 'Token', kaynak: 'json', yol: 'token' }] },
      { ad: 'Güvenli', servisId, senaryoId: guvenli }
    ], ...(yetkiHatasinda ? { yetkiHatasinda } : {}) });
    kosuAyarlariniKaydet(vt, { yetkiHatasinda: 'tekrarYok' });
    const kapali = servisAkisiKaydet(vt, { projeId, baslik: 'Akış (genel)', icerik: icerik() });
    expect(servisAkisiGetir(vt, kapali)!.icerik).not.toHaveProperty('yetkiHatasinda');   // akışta "genel" yazılmaz
    m.durum.reddet = 1;
    let o = { guvenli: m.sayi('/api/guvenli'), giris: m.sayi('/api/giris') };
    const r1 = await servisAkisiCalistir(vt, projeId, { akisId: kapali, ortamId, tur: 'dene' });
    expect(r1.adimlar.map((a) => a.durum)).toEqual(['basarili', 'basarisiz']);
    expect(r1.adimlar[1].not).toBeUndefined();
    expect([m.sayi('/api/guvenli') - o.guvenli, m.sayi('/api/giris') - o.giris]).toEqual([1, 1]);
    const acik = servisAkisiKaydet(vt, { projeId, baslik: 'Akış (yenile)', icerik: icerik('yenileVeTekrar') });
    m.durum.reddet = 1;
    o = { guvenli: m.sayi('/api/guvenli'), giris: m.sayi('/api/giris') };
    const r2 = await servisAkisiCalistir(vt, projeId, { akisId: acik, ortamId, tur: 'dene' });
    expect(r2.durum).toBe('basarili');
    expect(r2.adimlar.map((a) => a.durum)).toEqual(['basarili', 'basarili']);
    expect(r2.adimlar[1].not).toBe(NOT);
    expect([m.sayi('/api/guvenli') - o.guvenli, m.sayi('/api/giris') - o.giris]).toEqual([2, 2]);
    // Yenilenen token tekrarda kullanıldı (son token); kayıtlarda token yok.
    expect(m.istekler.filter((x) => x.yol === '/api/guvenli').at(-1)!.yetki).toBe(`Bearer tok-${m.durum.token}`);
    expect(JSON.stringify(r2)).not.toMatch(/tok-\d/);
    // İkinci deneme de reddedilirse adım kalır (tek tekrar).
    m.durum.reddet = 2;
    o = { guvenli: m.sayi('/api/guvenli'), giris: m.sayi('/api/giris') };
    const r3 = await servisAkisiCalistir(vt, projeId, { akisId: acik, ortamId, tur: 'dene' });
    expect(r3.adimlar.map((a) => a.durum)).toEqual(['basarili', 'basarisiz']);
    expect(r3.adimlar[1].not).toBe(`${NOT}; tekrar da 401 döndü`);
    expect([m.sayi('/api/guvenli') - o.guvenli, m.sayi('/api/giris') - o.giris]).toEqual([2, 2]);
  });
});
