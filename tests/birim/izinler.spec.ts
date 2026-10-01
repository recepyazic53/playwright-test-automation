// KORUMA TESTLERİ — Ayarlar > İzinler. Her izin varsayılan KAPALI (yeni ve mevcut veritabanı); kapalı izne tabi işlem sunucuda
// 403 IZIN_KAPALI ile reddedilir ve sahte hedefe (127.0.0.1) hiçbir istek gitmez; izin açılınca işlem yapılır. Riskli ortamda açık
// onay (canliOnay), yasak adresler (servis / WSDL / öner), giriş bilgisinin köken denetimi, planlı koşuda "izin kapalı" kaydı,
// bildirim aboneliğinin varsayılan kapalı olması, izin değişikliği kaydı ve arayüz (uyarı + "İzinlere git", "?" açıklamaları,
// masaüstü + 390 px ekran görüntüsü, taşma yok). Dışarıya istek yok: tüm hedefler 127.0.0.1 ya da route ile yakalanan sahte köken.
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, expect, test, type Browser } from '@playwright/test';
import { acikAnahtar, kasaAc, kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { ortamKaydet, projeKaydet, veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { IZIN_ANAHTARLARI, IZIN_TANIMLARI, izinMesaji } from '../../scripts/platform/guvenlik/izin-tanimlari.mjs';
import { IzinHatasi, izinDegisiklikleri, izinDegistir, izinGerekli, izinleriOku } from '../../scripts/platform/guvenlik/izinler.mjs';
import { denetlenenUclar, gerekenIzinler, kapaliIzinler } from '../../scripts/platform/guvenlik/uc-denetimi.mjs';
import { riskliOrtamMi } from '../../scripts/platform/guvenlik/ortam-riski.mjs';
import { yasakAdresleriKaydet } from '../../scripts/platform/guvenlik/yasak-adresler.mjs';
import { girisTarifiKaydet } from '../../scripts/platform/giris/tarif-deposu.mjs';
import { girisKokenleri } from '../../scripts/platform/giris/tarif.mjs';
import { baglantiKaydet } from '../../scripts/platform/entegrasyonlar/depo.mjs';
import { veritabaniKaydet } from '../../scripts/platform/sql/veritabanlari.mjs';
import { httpIstegi } from '../../scripts/platform/servisler/soap-istemcisi.mjs';
import { yasakDesenleri } from '../../scripts/platform/senaryolar/model-kosusu.mjs';
import { zamanliKosuyuYurut } from '../../scripts/platform/zamanlama/zamanlayici.mjs';
import type { Kural } from '../../scripts/platform/zamanlama/kurallar.mjs';
import { girisProfiliKaydet } from '../../scripts/platform/veritabani/depo.mjs';
import { GirisHatasi, girisYap, tarifiHazirla } from '../support/giris-motoru';
import { hataMi, platformOkuyucusunuCalistir, type PlatformGirisBilgisi } from '../support/platform-veri';
import { korumaliBaglam, korumaliTarayici, yerelSunucu } from './giris-fikstur';
import { nobetciApi, nobetciBaslat, type Nobetci } from './nobetci-sunucusu';
import { HIZLI_KDF, geciciKlasor } from './platform-ortak';
import { ornekGirisTarifi } from './model-fikstur';

type Nesne = Record<string, any>;

test('izin tanımları tek kaynak: 10 izin, her birinde yapabilecekleri / yerler / işlemler dolu; uç eşlemesi tanımlardan', () => {
  expect(IZIN_ANAHTARLARI).toEqual(['web-erisimi', 'servis-istekleri', 'veritabani-okuma', 'veritabani-yazma', 'canli-ortam', 'giris-bilgisi',
    'dis-gonderim', 'arka-plan', 'sistem-degisikligi', 'guvenlik-gevsetme']);
  for (const t of IZIN_TANIMLARI) {
    expect(t.etiket.length, t.anahtar).toBeGreaterThan(3);
    expect(t.yapabilecekleri.length, `${t.anahtar} yapabilecekleri`).toBeGreaterThan(0);
    expect(t.yerler.length, `${t.anahtar} yerler`).toBeGreaterThan(0);
    expect(t.islemler.length, `${t.anahtar} işlemler`).toBeGreaterThan(0);
    expect(t.risk && t.kapaliyken).toBeTruthy();
  }
  const uclar = denetlenenUclar();
  for (const u of ['/platform/senaryolar/calistir', '/platform/senaryo/dene', '/platform/tarama/baslat', '/platform/giris-tarifi/oner', '/platform/servis/erisim',
    '/platform/servis/sema/yenile', '/platform/servis/senaryo/dene', '/platform/servis/is/baslat', '/platform/servis/kos', '/platform/servis/rest/dene',
    '/platform/servis-akisi/dene', '/platform/servis-akisi/kos', '/platform/entegrasyon/dene', '/platform/entegrasyon/hata-kaydi/ac', '/platform/entegrasyon/kaydet',
    '/platform/zamanlama/tercih', '/platform/servis/kaydet', '/platform/servis/rest/kaydet']) expect(uclar.has(u), u).toBe(true);
  expect(izinMesaji('web-erisimi')).toBe('Bu işlem için Ayarlar > İzinler\'de "Web uygulamasına erişim" iznini açmalısınız.');
  // Riskli ortam tek tanım, kullanıcı seçimi (ayrıntı: ortam-riski.spec.ts); belirtilmemiş = riskli.
  expect(riskliOrtamMi({ ad: 'TEST', varsayilan: true, ayarlar: { riskli: false } })).toBe(false);
  expect(riskliOrtamMi({ ad: 'TEST', varsayilan: true, ayarlar: {} })).toBe(true);
  expect(riskliOrtamMi({ ad: 'TEST', varsayilan: true, canli: true })).toBe(true);
  expect(girisKokenleri('https://a.ornek.invalid/uygulama/', { girisAdresi: '/giris' })).toEqual(['https://a.ornek.invalid']);
  expect(girisKokenleri('https://a.ornek.invalid', { girisAdresi: 'https://sso.ornek.invalid/giris' })).toEqual(['https://a.ornek.invalid', 'https://sso.ornek.invalid']);
});

test('varsayılan kapalı (yeni ve mevcut veritabanı); açmak onay ister, kapatmak serbest; kasada şifreli; değişiklik geçmişe yazılır', async () => {
  const klasor = geciciKlasor('izin-varsayilan');
  try {
    const yol = join(klasor.yol, 'platform.db');
    const parola = randomBytes(18).toString('base64url');
    let vt = await veritabaniniHazirla(yol);
    await kasaOlustur(vt, parola, { kdf: HIZLI_KDF });
    expect(Object.values(izinleriOku(vt)).every((x) => x === false)).toBe(true);
    // "Mevcut kurulum": başka ayarları olan, izin kaydı olmayan veritabanı yeniden açılır → yine hepsi kapalı.
    yasakAdresleriKaydet(vt, ['*.ornek-yasak.invalid']);
    vt.kapat();
    vt = await veritabaniniHazirla(yol);
    expect(Object.values(izinleriOku(vt)).every((x) => x === false)).toBe(true); // kasa kilitli: hepsi kapalı
    await kasaAc(vt, parola);
    expect(izinleriOku(vt)).toEqual(Object.fromEntries(IZIN_ANAHTARLARI.map((a) => [a, false])));
    expect(() => izinGerekli(vt, 'web-erisimi')).toThrow(IzinHatasi);

    expect(() => izinDegistir(vt, 'web-erisimi', true)).toThrow(/onaylamalısınız/);
    expect(() => izinDegistir(vt, 'yok-boyle', true, { onay: true })).toThrow(/Bilinmeyen izin/);
    expect(izinDegistir(vt, 'web-erisimi', true, { onay: true })).toMatchObject({ degisti: true, izinler: { 'web-erisimi': true, 'canli-ortam': false } });
    expect(izinDegistir(vt, 'web-erisimi', true, { onay: true }).degisti).toBe(false);
    expect(izinDegistir(vt, 'web-erisimi', false).izinler['web-erisimi']).toBe(false); // kapatma onaysız
    izinDegistir(vt, 'dis-gonderim', true, { onay: true });
    expect(String(vt.tek("SELECT deger_json FROM ayarlar WHERE anahtar = 'izinler'")?.deger_json)).toMatch(/^kasa:v1:/);
    const gecmis = izinDegisiklikleri(vt);
    expect(gecmis.map((g) => [g.izin, g.acik])).toEqual([['dis-gonderim', true], ['web-erisimi', false], ['web-erisimi', true]]);
    expect(gecmis[0]).toMatchObject({ etiket: 'Dış gönderim', yapan: expect.stringContaining('@') });
    vt.kapat();
  } finally {
    klasor.temizle();
  }
});

test('koşullu izinler: riskli ortam + açık onay, giriş tarifi, yalnız okumayı kapatma, tercihler, TLS; bildirim aboneliği varsayılan kapalı', async () => {
  const klasor = geciciKlasor('izin-kosul');
  try {
    const vt = await veritabaniniHazirla(join(klasor.yol, 'platform.db'));
    await kasaOlustur(vt, 'Gecici-Izin-Kosul-1', { kdf: HIZLI_KDF });
    const projeId = projeKaydet(vt, { ad: 'İzin' });
    const test_ = ortamKaydet(vt, { projeId, ad: 'TEST', tabanUrl: 'http://127.0.0.1:9', varsayilan: true, ayarlar: { riskli: false } });
    const canli = ortamKaydet(vt, { projeId, ad: 'CANLI', tabanUrl: 'http://127.0.0.1:9', ayarlar: { canli: true } });
    const hazirlik = ortamKaydet(vt, { projeId, ad: 'HAZIRLIK', tabanUrl: 'http://127.0.0.1:9' });
    expect(gerekenIzinler(vt, '/platform/senaryolar/calistir', { projeId, ortamId: test_, senaryoId: 'yok' })).toMatchObject({ izinler: ['web-erisimi'], canliOnayGerekli: false });
    for (const o of [canli, hazirlik]) {
      expect(gerekenIzinler(vt, '/platform/senaryolar/calistir', { projeId, ortamId: o, senaryoId: 'yok' })).toMatchObject({ izinler: ['web-erisimi', 'canli-ortam'], canliOnayGerekli: true });
    }
    expect(gerekenIzinler(vt, '/platform/tarama/baslat', { projeId, ortamId: test_ }).izinler).toEqual(['web-erisimi']);
    girisTarifiKaydet(vt, projeId, test_, ornekGirisTarifi());
    expect(gerekenIzinler(vt, '/platform/tarama/baslat', { projeId, ortamId: test_ }).izinler).toEqual(['web-erisimi', 'giris-bilgisi']);
    expect(gerekenIzinler(vt, '/platform/tarama/baslat', { projeId, ortamId: test_, girissiz: true }).izinler).toEqual(['web-erisimi']);
    expect(gerekenIzinler(vt, '/platform/entegrasyon/kaydet', { projeId, tur: 'veritabani', alanlar: { yalnizOkuma: false } }).izinler).toEqual(['veritabani-yazma']);
    expect(gerekenIzinler(vt, '/platform/entegrasyon/kaydet', { projeId, tur: 'veritabani', alanlar: { yalnizOkuma: true } }).izinler).toEqual([]);
    expect(gerekenIzinler(vt, '/platform/entegrasyon/dene', { projeId, tur: 'webhook' }).izinler).toEqual(['dis-gonderim']);
    expect(gerekenIzinler(vt, '/platform/entegrasyon/dene', { projeId, tur: 'veritabani' }).izinler).toEqual(['veritabani-okuma']);
    expect(gerekenIzinler(vt, '/platform/zamanlama/tercih', { ad: 'kilitliyken', acik: true }).izinler).toEqual(['arka-plan']);
    expect(gerekenIzinler(vt, '/platform/zamanlama/tercih', { ad: 'dpapi', acik: true }).izinler).toEqual(['sistem-degisikligi']);
    expect(gerekenIzinler(vt, '/platform/zamanlama/tercih', { ad: 'oturumAcilisi', acik: false }).izinler).toEqual([]); // kapatmak serbest
    expect(gerekenIzinler(vt, '/platform/servis/erisim', { projeId, ortamId: test_, tlsDogrulama: false }).izinler).toEqual(['servis-istekleri', 'guvenlik-gevsetme']);
    expect(gerekenIzinler(vt, '/platform/servis/kaydet', { projeId, tlsDogrulama: false }).izinler).toEqual(['guvenlik-gevsetme']);
    expect(gerekenIzinler(vt, '/platform/servis/kaydet', { projeId, tlsDogrulama: true }).izinler).toEqual([]);
    expect(kapaliIzinler(vt, '/platform/servis-akisi/kos', { projeId, ortamId: canli, icerik: { adimlar: [{ tur: 'sql' }] } }))
      .toEqual(['servis-istekleri', 'canli-ortam', 'veritabani-okuma']);
    // CANLI ortamda eskiden kesin yasak olan istekler: artık canlı ortam izni + açık onay (tek mekanizma).
    for (const yol of ['/platform/servis/erisim', '/platform/servis/sema/yenile', '/platform/servis/rest/dene', '/platform/servis/senaryo/dene', '/platform/servis-akisi/dene']) {
      expect(gerekenIzinler(vt, yol, { projeId, ortamId: canli }), yol).toMatchObject({ canliOnayGerekli: true, ortamAdi: 'CANLI' });
      expect(gerekenIzinler(vt, yol, { projeId, ortamId: canli }).izinler, yol).toContain('canli-ortam');
      expect(gerekenIzinler(vt, yol, { projeId, ortamId: test_ }), yol).toMatchObject({ canliOnayGerekli: false });
    }
    // Veritabanı bağlantısını dene: bağlantı bir CANLI ortamın veritabanı eşlemesindeyse CANLI onayı gerekir.
    const db = baglantiKaydet(vt, projeId, { tur: 'veritabani', ad: 'Canlı DB', alanlar: { surucu: 'postgres', sunucu: '127.0.0.1', veritabani: 'uyg', kullanici: 'okur', parola: 'x' } }) as { id: string };
    const dbTest = baglantiKaydet(vt, projeId, { tur: 'veritabani', ad: 'Test DB', alanlar: { surucu: 'postgres', sunucu: '127.0.0.1', veritabani: 'uyg', kullanici: 'okur', parola: 'x' } }) as { id: string };
    expect(gerekenIzinler(vt, '/platform/entegrasyon/dene', { projeId, id: db.id })).toMatchObject({ izinler: ['veritabani-okuma'], canliOnayGerekli: false });
    veritabaniKaydet(vt, projeId, { ad: 'Uygulama', eslemeler: { [canli]: db.id, [test_]: dbTest.id } });
    expect(gerekenIzinler(vt, '/platform/entegrasyon/dene', { projeId, id: db.id })).toMatchObject({ izinler: ['canli-ortam', 'veritabani-okuma'], canliOnayGerekli: true, ortamAdi: 'CANLI' });
    expect(gerekenIzinler(vt, '/platform/entegrasyon/dene', { projeId, id: dbTest.id })).toMatchObject({ canliOnayGerekli: false });
    // Yeni bildirim bağlantısında olay aboneliği varsayılan KAPALI.
    const b = baglantiKaydet(vt, projeId, { tur: 'webhook', ad: 'Kanal', alanlar: { adres: 'http://127.0.0.1:9/kanca', bicim: 'sohbet' } }) as { olaylar: string[] };
    expect(b.olaylar).toEqual([]);
    vt.kapat();
  } finally {
    klasor.temizle();
  }
});

test('yasak adres servis isteklerinde (SOAP / REST / WSDL): istek hiç gönderilmez', async () => {
  const hedef = await yerelSunucu(() => ({ govde: 'ok' }));
  try {
    const desen = yasakDesenleri('127.0.0.*');
    await expect(httpIstegi({ adres: `${hedef.adres}/Servis?wsdl`, yasakDesenleri: desen })).rejects.toThrow(/yasaklı adres kalıbına \("127\.0\.0\.\*"\)/);
    expect(hedef.istekler).toEqual([]);
    expect((await httpIstegi({ adres: `${hedef.adres}/Servis?wsdl`, yasakDesenleri: [] })).durumKodu).toBe(200);
    expect(hedef.istekler).toEqual(['GET /Servis']);
  } finally {
    await hedef.kapat();
  }
});

test('planlı koşu: arka plan izni kapalıysa atlanır; web erişimi kapalıysa senaryo atlanır ve "izin kapalı: X" kayda geçer', async () => {
  const klasor = geciciKlasor('izin-zamanlama');
  try {
    const vt = await veritabaniniHazirla(join(klasor.yol, 'platform.db'));
    await kasaOlustur(vt, 'Gecici-Izin-Zaman-1', { kdf: HIZLI_KDF });
    const projeId = projeKaydet(vt, { ad: 'Z' });
    const ortamId = ortamKaydet(vt, { projeId, ad: 'TEST', tabanUrl: 'http://127.0.0.1:9', varsayilan: true, ayarlar: { riskli: false } });
    const kural = { id: 'k1', projeId, ad: 'Gece', ortamId, kapsam: { senaryolar: 'tum', ekranIdleri: [], servisAkisIdleri: [] }, canliOnay: false } as unknown as Kural;
    const cagrilar: string[] = [];
    const bag = {
      senaryolar: () => [{ id: 's1', baslik: 'Senaryo 1', ekranId: null, kosuyaDahil: true }],
      senaryoCalistir: async (_v: unknown, g: Record<string, unknown>) => { cagrilar.push(String(g.senaryoId)); return { govde: { basarili: true, durum: 'passed' } }; }
    };
    const r1 = await zamanliKosuyuYurut(vt, kural, 'zamanli-1', bag);
    expect(r1).toMatchObject({ durum: 'atlandi', kosuId: null });
    expect(r1.mesaj).toContain('izin kapalı: Arka plan çalışması');
    izinDegistir(vt, 'arka-plan', true, { onay: true });
    const r2 = await zamanliKosuyuYurut(vt, kural, 'zamanli-2', bag);
    expect(r2.durum).toBe('atlandi');
    expect(r2.mesaj).toContain('izin kapalı: Web uygulamasına erişim');
    expect(cagrilar).toEqual([]);
    izinDegistir(vt, 'web-erisimi', true, { onay: true });
    const r3 = await zamanliKosuyuYurut(vt, kural, 'zamanli-3', bag);
    expect(r3).toMatchObject({ durum: 'tamamlandi', kosuId: 'zamanli-3' });
    expect(cagrilar).toEqual(['s1']);
    vt.kapat();
  } finally {
    klasor.temizle();
  }
});

test('veri okuyucu: giriş bilgisi izni kapalıyken koşucuya parola / TOTP / gizli ek alan verilmez; açıkken verilir', async () => {
  test.setTimeout(120_000);
  const klasor = geciciKlasor('izin-veri-oku');
  try {
    const yol = join(klasor.yol, 'platform.db');
    const vt = await veritabaniniHazirla(yol);
    await kasaOlustur(vt, 'Gecici-Izin-Veri-1', { kdf: HIZLI_KDF });
    const projeId = projeKaydet(vt, { ad: 'V' });
    const ortamId = ortamKaydet(vt, { projeId, ad: 'TEST', tabanUrl: 'http://127.0.0.1:9', varsayilan: true, ayarlar: { riskli: false } });
    girisProfiliKaydet(vt, { projeId, ortamId, ad: 'P', kullaniciAdi: 'kisi', parola: 'Izin-Parola-77', ekAlanlar: [{ ad: 'pin', gizli: true, deger: 'PIN-IZIN-4321' }, { ad: 'firma', deger: 'F1' }] });
    const anahtar = acikAnahtar(vt).toString('base64url');
    const oku = () => {
      const d = platformOkuyucusunuCalistir(['genel', '--proje', projeId, '--ortam-id', ortamId], { PLATFORM_VERITABANI: yol, PLATFORM_KASA_ANAHTARI: anahtar });
      if (hataMi(d)) throw new Error(d.hata);
      return d as { giris: PlatformGirisBilgisi; izinler: Record<string, boolean> };
    };
    const kapali = oku();
    expect(kapali.izinler['giris-bilgisi']).toBe(false);
    expect(kapali.giris).toMatchObject({ kullaniciAdi: 'kisi', parola: null, ekAlanlar: { firma: 'F1' } });
    expect(JSON.stringify(kapali)).not.toContain('Izin-Parola-77');
    expect(JSON.stringify(kapali)).not.toContain('PIN-IZIN-4321');
    izinDegistir(vt, 'giris-bilgisi', true, { onay: true });
    const acik = oku();
    expect(acik.giris).toMatchObject({ parola: 'Izin-Parola-77', ekAlanlar: { pin: 'PIN-IZIN-4321', firma: 'F1' } });
    vt.kapat();
  } finally {
    klasor.temizle();
  }
});

test('giriş bilgisi köken denetimi: giriş sayfası başka kökene yönlenirse parola yazılmaz (KOKEN_UYUSMAZ)', async () => {
  const A = 'https://giris-a.invalid';
  const B = 'https://baska-b.invalid';
  const form = '<!doctype html><html><body><form><input id="k"><input id="p" type="password"><button type="submit">Giriş</button></form></body></html>';
  const tarayici = await korumaliTarayici();
  try {
    const { baglam } = await korumaliBaglam(tarayici, {
      // Ortamın giriş sayfası kullanıcıyı başka bir siteye (farklı köken) yönlendirir.
      [A]: (i) => (i.yol === '/giris'
        ? { tur: 'text/html', govde: `<!doctype html><html><head><script>location.replace('${B}/giris')</script></head><body></body></html>` }
        : { tur: 'text/html', govde: form }),
      [B]: () => ({ tur: 'text/html', govde: form })
    }, { baseURL: A });
    const tarif = tarifiHazirla({
      kullaniciAlani: '#k', parolaAlani: '#p', gonderDugmesi: 'button[type="submit"]', basariGostergesi: { tur: 'url', deger: '/ana$' },
      hataGostergeleri: [], girisAdresi: '/giris', zamanAsimiSn: 5
    });
    const kimlik = { kullaniciAdi: 'kisi', parola: 'Koken-Parola-9', totpGizli: null, sabitKod: null, smsKipi: null };
    const page = await baglam.newPage();
    const hata = await girisYap(page, tarif, kimlik, { izinliKokenler: girisKokenleri(A, tarif), alanBeklemeMs: 3000 }).then(() => null, (h: unknown) => h);
    expect(hata).toBeInstanceOf(GirisHatasi);
    expect((hata as GirisHatasi).kod).toBe('KOKEN_UYUSMAZ');
    expect((hata as GirisHatasi).message).not.toContain('Koken-Parola-9');
    expect(new URL(page.url()).origin).toBe(B);
    expect(await page.locator('#k').inputValue()).toBe('');
    expect(await page.locator('#p').inputValue()).toBe('');
    await baglam.close();
  } finally {
    await tarayici.close();
  }
});

test.describe('sunucu: kapalı izin 403 IZIN_KAPALI, işlem yapılmaz; açılınca yapılır (127.0.0.1)', () => {
  test.describe.configure({ mode: 'serial' });
  const PAROLA = `Gecici-Izin-${randomBytes(6).toString('hex')}`;
  let klasor = '';
  let nobetci: Nobetci;
  let hedef: Awaited<ReturnType<typeof yerelSunucu>>;
  let tarayici: Browser;
  let projeId = '';
  let test_ = '';
  let canli = '';
  const api = (yol: string, govde?: Nesne) => nobetciApi(nobetci, yol, govde) as Promise<Nesne>;
  const ham = async (yol: string, govde: Nesne): Promise<{ durum: number; y: Nesne }> => {
    const r = await fetch(`${nobetci.adres}${yol}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...govde, token: nobetci.token }) });
    return { durum: r.status, y: (await r.json()) as Nesne };
  };
  const ac = async (anahtar: string) => expect((await api('/platform/izin/degistir', { anahtar, acik: true, onay: true })).basarili).toBe(true);

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    hedef = await yerelSunucu((i) => (i.yol.endsWith('/kanca') ? { govde: 'ok' } : { durum: 404, govde: 'yok' }));
    klasor = mkdtempSync(join(tmpdir(), 'izin-sunucu-'));
    const vtYolu = join(klasor, 'platform.db');
    const vt = await veritabaniniHazirla(vtYolu);
    await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
    projeId = projeKaydet(vt, { ad: 'İzin sunucusu' });
    test_ = ortamKaydet(vt, { projeId, ad: 'TEST', tabanUrl: hedef.adres, varsayilan: true, ayarlar: { riskli: false } });
    canli = ortamKaydet(vt, { projeId, ad: 'CANLI', tabanUrl: hedef.adres, ayarlar: { canli: true } });
    vt.kapat();
    nobetci = await nobetciBaslat(klasor, vtYolu, {});
    expect((await api('/platform/kasa/ac', { parola: PAROLA })).basarili).toBe(true);
    tarayici = await chromium.launch();
  });
  test.afterAll(async () => {
    await tarayici?.close();
    nobetci?.surec.kill('SIGTERM');
    await hedef?.kapat();
    if (klasor) rmSync(klasor, { recursive: true, force: true });
  });

  test('her izin kapalıyken ilgili uç 403 IZIN_KAPALI döner ve sahte hedefe istek gitmez; izin açılınca işlem yapılır', async () => {
    const durum = await api('/platform/izinler');
    expect(Object.values(durum.izinler as Record<string, boolean>).every((x) => !x)).toBe(true);
    const kapali: Array<[string, string, Nesne]> = [
      ['web-erisimi', '/platform/senaryolar/calistir', { projeId, ortamId: test_, senaryoId: 'yok', kosuId: 'k1' }],
      ['web-erisimi', '/platform/senaryo/dene', { projeId, ortamId: test_, ekranId: 'yok', kosuId: 'k2', veri: {} }],
      ['web-erisimi', '/platform/tarama/baslat', { projeId, ortamId: test_, ekranAdi: 'Yeni', hedef: '/', onay: true }],
      ['web-erisimi', '/platform/giris-tarifi/oner', { projeId, ortamId: test_, onay: true }],
      ['servis-istekleri', '/platform/servis/erisim', { projeId, ortamId: test_, yol: '/Servis' }],
      ['servis-istekleri', '/platform/servis/rest/dene', { projeId, ortamId: test_, uc: { ad: 'U', metot: 'GET', yol: '/x' } }],
      ['servis-istekleri', '/platform/servis-akisi/dene', { projeId, ortamId: test_, icerik: { adimlar: [] } }],
      ['veritabani-okuma', '/platform/entegrasyon/dene', { projeId, tur: 'veritabani', alanlar: { surucu: 'postgres', sunucu: '127.0.0.1' }, onay: true }],
      ['dis-gonderim', '/platform/entegrasyon/dene', { projeId, tur: 'webhook', alanlar: { adres: `${hedef.adres}/kanca`, bicim: 'sohbet' }, onay: true }],
      ['dis-gonderim', '/platform/entegrasyon/hata-kaydi/ac', { projeId, sonucId: 'yok', baglantiId: 'yok', onay: true }],
      ['veritabani-yazma', '/platform/entegrasyon/kaydet', { projeId, tur: 'veritabani', ad: 'Db', alanlar: { surucu: 'postgres', sunucu: '127.0.0.1', yalnizOkuma: false } }],
      ['arka-plan', '/platform/zamanlama/tercih', { ad: 'kilitliyken', acik: true, onay: true }],
      ['sistem-degisikligi', '/platform/zamanlama/tercih', { ad: 'oturumAcilisi', acik: true, onay: true }]
    ];
    for (const [izin, yol, govde] of kapali) {
      const r = await ham(yol, govde);
      expect(r, `${yol}`).toMatchObject({ durum: 403, y: { basarili: false, kod: 'IZIN_KAPALI', izin, mesaj: izinMesaji(izin) } });
    }
    expect(hedef.istekler, 'kapalı izinle hiçbir istek gitmemeli').toEqual([]);

    // Açılınca yapılır: WSDL isteği ve webhook bildirimi sahte hedefe gider.
    await ac('servis-istekleri');
    const erisim = await ham('/platform/servis/erisim', { projeId, ortamId: test_, yol: '/Servis' });
    expect(erisim.durum).toBe(200);
    expect(hedef.istekler).toEqual(['GET /Servis']);
    // TLS doğrulamasını kapatmak ayrıca "Güvenlik gevşetme" ister.
    expect(await ham('/platform/servis/erisim', { projeId, ortamId: test_, yol: '/Servis', tlsDogrulama: false })).toMatchObject({ durum: 403, y: { izin: 'guvenlik-gevsetme' } });
    // Yasak adres (NOBETCI_YASAK_ADRESLER="*yasak-ornek*"): WSDL isteği gönderilmez.
    const yasak = await ham('/platform/servis/erisim', { projeId, ortamId: test_, yol: '/Servis', tabanlar: { [test_]: 'http://portal.yasak-ornek.invalid' } });
    expect(yasak.y).toMatchObject({ basarili: true, erisilebilir: false, mesaj: expect.stringMatching(/yasaklı adres kalıbına/) });
    await ac('dis-gonderim');
    const dene = await ham('/platform/entegrasyon/dene', { projeId, tur: 'webhook', alanlar: { adres: `${hedef.adres}/kanca`, bicim: 'sohbet' }, onay: true });
    expect(dene.durum).toBe(200);
    expect(hedef.istekler).toEqual(['GET /Servis', 'POST /kanca']);
    await ac('veritabani-okuma');
    expect(await ham('/platform/entegrasyon/kaydet', { projeId, tur: 'veritabani', ad: 'Db', alanlar: { surucu: 'postgres', sunucu: '127.0.0.1', yalnizOkuma: false } }))
      .toMatchObject({ durum: 403, y: { izin: 'veritabani-yazma' } });
    await ac('veritabani-yazma');
    expect((await ham('/platform/entegrasyon/kaydet', { projeId, tur: 'veritabani', ad: 'Db', alanlar: { surucu: 'postgres', sunucu: '127.0.0.1', yalnizOkuma: false, zamanAsimiSn: 30, tls: 'kapali' } })).durum).toBe(200);
    // "Kilitliyken de çalışsın": izin + onay.
    await ac('arka-plan');
    expect((await ham('/platform/zamanlama/tercih', { ad: 'kilitliyken', acik: true })).y.mesaj).toMatch(/riski onaylamalısınız/);
    expect((await ham('/platform/zamanlama/tercih', { ad: 'kilitliyken', acik: true, onay: true })).durum).toBe(200);
    expect((await ham('/platform/zamanlama/tercih', { ad: 'kilitliyken', acik: false })).durum).toBe(200);
  });

  test('CANLI ortam: izin + her işlemde açık onay (canliOnay) — koşu, tarama, öner, servis erişim / şema / REST Dene / Dene; "Varsayılanları öner" onay ve yasak adres ister', async () => {
    await ac('web-erisimi');
    // Test ortamında izin yeter (senaryo yoksa işleyici 404 "bulunamadı" — denetimden geçti).
    expect(await ham('/platform/senaryolar/calistir', { projeId, ortamId: test_, senaryoId: 'yok', kosuId: 'k3' })).toMatchObject({ durum: 404 });
    expect(await ham('/platform/senaryolar/calistir', { projeId, ortamId: canli, senaryoId: 'yok', kosuId: 'k4' })).toMatchObject({ durum: 403, y: { izin: 'canli-ortam' } });
    await ac('canli-ortam');
    expect(await ham('/platform/senaryolar/calistir', { projeId, ortamId: canli, senaryoId: 'yok', kosuId: 'k5' })).toMatchObject({ durum: 409, y: { kod: 'CANLI_ONAY_GEREKLI' } });
    expect(await ham('/platform/senaryolar/calistir', { projeId, ortamId: canli, senaryoId: 'yok', kosuId: 'k6', canliOnay: true })).toMatchObject({ durum: 404 });
    expect(await ham('/platform/tarama/baslat', { projeId, ortamId: canli, ekranAdi: 'Yeni', hedef: '/', onay: true })).toMatchObject({ durum: 409, y: { kod: 'CANLI_ONAY_GEREKLI' } });
    // Öner: onay yoksa, yasak adreste tarayıcı açılmadan red.
    expect((await ham('/platform/giris-tarifi/oner', { projeId, ortamId: test_ })).y.mesaj).toMatch(/onaylayın/);
    expect((await ham('/platform/giris-tarifi/oner', { projeId, ortamId: test_, onay: true, girisAdresi: 'http://portal.yasak-ornek.invalid/giris' })).y.mesaj)
      .toMatch(/yasaklı adres kalıbına \("\*yasak-ornek\*"\)/);
    expect(await ham('/platform/giris-tarifi/oner', { projeId, ortamId: canli, onay: true })).toMatchObject({ durum: 409, y: { kod: 'CANLI_ONAY_GEREKLI', ortamAdi: 'CANLI' } });
    // Servis istekleri (eskiden CANLI'da kesin yasak): artık onayla yapılabilir; onaysız 409 ve hedefe istek gitmez.
    await ac('servis-istekleri');
    const onceServis = hedef.istekler.length;
    for (const [yol, g] of /** @type {Array<[string, Nesne]>} */ ([
      ['/platform/servis/erisim', { projeId, ortamId: canli, yol: '/Servis' }],
      ['/platform/servis/sema/yenile', { projeId, ortamId: canli, servisId: 'yok' }],
      ['/platform/servis/rest/dene', { projeId, ortamId: canli, uc: { ad: 'a', metot: 'GET', yol: '/Servis' } }],
      ['/platform/servis/senaryo/dene', { projeId, ortamId: canli, servisId: 'yok' }],
      ['/platform/servis-akisi/dene', { projeId, ortamId: canli, icerik: { adimlar: [] } }]
    ] as Array<[string, Nesne]>)) {
      expect(await ham(yol, g), yol).toMatchObject({ durum: 409, y: { kod: 'CANLI_ONAY_GEREKLI' } });
    }
    expect(hedef.istekler.length, 'onaysız CANLI isteği hedefe gitmedi').toBe(onceServis);
    // Onayla: erişim kontrolü CANLI ortamda yapılır (eskiden "yalnızca test ortamında" reddi).
    expect(await ham('/platform/servis/erisim', { projeId, ortamId: canli, yol: '/Servis', canliOnay: true })).toMatchObject({ durum: 200 });
    expect(hedef.istekler.length).toBe(onceServis + 1);
    // İzin değişiklikleri kayıtta (kim / ne zaman / hangi izin).
    const { degisiklikler } = await api('/platform/izinler');
    expect((degisiklikler as Nesne[]).find((d) => d.izin === 'canli-ortam')).toMatchObject({ izin: 'canli-ortam', acik: true, etiket: 'Canlı ortamda çalıştırma' });
    expect((await ham('/platform/izin/degistir', { anahtar: 'giris-bilgisi', acik: true })).y.mesaj).toMatch(/onaylamalısınız/);
    expect(hedef.istekler.filter((x) => !['GET /Servis', 'POST /kanca'].includes(x))).toEqual([]);
  });

  test('arayüz: kapalı izin uyarısı + "İzinlere git"; Ayarlar > İzinler "?" açıklamaları (tıkla / klavye / Esc); masaüstü ve 390 px taşma yok', async ({}, testInfo) => {
    test.setTimeout(120_000);
    await api('/platform/izin/degistir', { anahtar: 'web-erisimi', acik: false });
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1360, height: 900 } });
    const page = await baglam.newPage();
    const hatalar: string[] = [];
    page.on('pageerror', (e) => hatalar.push(String(e)));
    await page.goto('/#/ayarlar/izinler');
    const satirlar = page.locator('.izin-satiri');
    await expect(satirlar).toHaveCount(IZIN_TANIMLARI.length);

    // Kapalı izne tabi işlem → ortak uyarı + "İzinlere git" (izin satırına odak).
    // api() pencere kapanana kadar bekler (izin verilirse isteği yeniden dener): çağrı beklenmeden başlatılır.
    await page.evaluate(() => {
      void import('/arayuz/ortak.js' as string).then((m) => m.api('/platform/senaryolar/calistir', { govde: { projeId: 'p', ortamId: 'o', senaryoId: 's', kosuId: 'k' } })).catch(() => { /* beklenen */ });
    });
    const uyari = page.getByRole('dialog', { name: 'İzin gerekli' });
    await expect(uyari).toBeVisible();
    await expect(uyari).toContainText(izinMesaji('web-erisimi'));
    await uyari.getByRole('button', { name: 'İzinlere git' }).click();
    await expect(page).toHaveURL(/#\/ayarlar\/izinler\/web-erisimi$/);
    const webSatiri = page.locator('.izin-satiri[data-izin="web-erisimi"]');
    await expect(webSatiri).toHaveClass(/vurgulu/);
    await expect(webSatiri.getByRole('switch')).toBeFocused();

    // Her izinde "?" açılır / kapanır; içerik tanımdan (üç liste dolu).
    for (const t of IZIN_TANIMLARI) {
      const satir = page.locator(`.izin-satiri[data-izin="${t.anahtar}"]`);
      const soru = satir.getByRole('button', { name: `"${t.etiket}" izni ne yapar?` });
      await expect(soru).toHaveAttribute('aria-expanded', 'false');
      await soru.click();
      await expect(soru).toHaveAttribute('aria-expanded', 'true');
      const panel = page.locator(`#${await soru.getAttribute('aria-controls')}`);
      await expect(panel).toBeVisible();
      await expect(panel.locator('ul').nth(0).locator('li')).toHaveCount(t.yapabilecekleri.length);
      await expect(panel.locator('ul').nth(1).locator('li')).toHaveCount(t.yerler.length);
      await expect(panel.locator('ul').nth(2).locator('li')).toHaveCount(t.islemler.length);
      await expect(panel).toContainText(t.risk);
      await soru.focus();
      await page.keyboard.press('Escape');
      await expect(panel).toBeHidden();
      await expect(soru).toHaveAttribute('aria-expanded', 'false');
      await expect(soru).toBeFocused();
      await page.keyboard.press('Enter'); // klavyeyle açılır
      await expect(panel).toBeVisible();
      await page.keyboard.press('Escape');
    }

    // Anahtarla açma: onay penceresi (ne yapar / riski) → Açık; son değişikliklerde görünür.
    await webSatiri.getByRole('switch').click();
    const onay = page.getByRole('dialog', { name: /"Web uygulamasına erişim" izni açılsın mı\?/ });
    await expect(onay).toContainText(IZIN_TANIMLARI[0].risk);
    await onay.getByRole('button', { name: 'İzni aç' }).click();
    await expect(webSatiri.getByRole('switch')).toBeChecked();
    await expect(page.locator('.izin-gecmisi li').first()).toContainText('Web uygulamasına erişim');

    // Ekran görüntüleri: masaüstü ve 390 px (bir açıklama açık); yatay taşma yok.
    await page.locator('.izin-satiri[data-izin="giris-bilgisi"]').getByRole('button', { name: /izni ne yapar/ }).click();
    const tasma = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(await tasma()).toBeLessThanOrEqual(0);
    await page.screenshot({ path: testInfo.outputPath('izinler-masaustu.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(300);
    expect(await tasma()).toBeLessThanOrEqual(0);
    for (const s of await page.locator('.izin-satiri').all()) {
      const k = await s.boundingBox();
      expect((k?.x ?? 0) + (k?.width ?? 0)).toBeLessThanOrEqual(390);
    }
    await page.screenshot({ path: testInfo.outputPath('izinler-390.png'), fullPage: true });
    await testInfo.attach('izinler-masaustu', { path: testInfo.outputPath('izinler-masaustu.png'), contentType: 'image/png' });
    await testInfo.attach('izinler-390', { path: testInfo.outputPath('izinler-390.png'), contentType: 'image/png' });
    expect(hatalar).toEqual([]);
    await baglam.close();
  });

  test('arayüz: "İzin ver ve devam et" izni açar ve işlemi BİR KEZ yeniden dener; ardışık iki izin; canlı onayı yine istenir; kasa kilitliyken düğme yok', async ({}, testInfo) => {
    test.setTimeout(120_000);
    for (const a of ['servis-istekleri', 'guvenlik-gevsetme', 'canli-ortam']) await api('/platform/izin/degistir', { anahtar: a, acik: false });
    await ac('web-erisimi');
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1360, height: 900 } });
    const page = await baglam.newPage();
    const hatalar: string[] = [];
    page.on('pageerror', (e) => hatalar.push(String(e)));
    await page.goto('/#/ayarlar/izinler');
    await expect(page.locator('.izin-satiri').first()).toBeVisible();
    const baslat = (yol: string, govde: Nesne) => page.evaluate(({ yol, govde }) => {
      (window as unknown as { __sonuc: Promise<unknown> }).__sonuc = import('/arayuz/ortak.js' as string)
        .then((m) => m.api(yol, { govde }))
        .then((r: unknown) => ({ ok: true, r }), (e: { message: string; kod?: string }) => ({ ok: false, mesaj: e.message, kod: e.kod }));
    }, { yol, govde });
    const sonuc = () => page.evaluate(() => (window as unknown as { __sonuc: Promise<Nesne> }).__sonuc);
    const pencere = page.getByRole('dialog', { name: 'İzin gerekli' });
    const tanim = (a: string) => IZIN_TANIMLARI.find((t) => t.anahtar === a) as (typeof IZIN_TANIMLARI)[number];

    // 1) Tek izin: pencere iznin ne yaptığını ve riskini gösterir; "İzin ver ve devam et" → izin açık, geçmişte kayıt, istek BİR kez.
    const onceki = hedef.istekler.length;
    await baslat('/platform/servis/erisim', { projeId, ortamId: test_, yol: '/Servis' });
    await expect(pencere).toContainText(izinMesaji('servis-istekleri'));
    await expect(pencere).toContainText(tanim('servis-istekleri').risk);
    await expect(pencere.getByRole('button')).toHaveText(['Kapat', 'İzinlere git', 'İzin ver ve devam et']);
    await page.waitForTimeout(400);
    await page.screenshot({ path: testInfo.outputPath('izin-penceresi-masaustu.png') });
    await pencere.getByRole('button', { name: 'İzin ver ve devam et' }).click();
    expect(await sonuc()).toMatchObject({ ok: true, r: { basarili: true } });
    expect(hedef.istekler.length - onceki, 'işlem bir kez yapıldı').toBe(1);
    expect(((await api('/platform/izinler')).izinler as Record<string, boolean>)['servis-istekleri']).toBe(true);
    const { kayitlar } = await api('/platform/gecmis?varlikTuru=izin&varlikId=servis-istekleri');
    expect((kayitlar as Nesne[]).at(-1)).toMatchObject({ aciklama: 'açıldı (izin penceresinden)' });

    // 2) İki izin gereken işlem: ardışık iki pencere (önce servis istekleri, sonra güvenlik gevşetme); sonunda tek istek.
    await api('/platform/izin/degistir', { anahtar: 'servis-istekleri', acik: false });
    const once2 = hedef.istekler.length;
    await baslat('/platform/servis/erisim', { projeId, ortamId: test_, yol: '/Servis', tlsDogrulama: false });
    await expect(pencere).toContainText(izinMesaji('servis-istekleri'));
    await pencere.getByRole('button', { name: 'İzin ver ve devam et' }).click();
    await expect(pencere).toContainText(izinMesaji('guvenlik-gevsetme'));
    await pencere.getByRole('button', { name: 'İzin ver ve devam et' }).click();
    expect(await sonuc()).toMatchObject({ ok: true });
    expect(hedef.istekler.length - once2).toBe(1);

    // 3) Kapat: izin açılmaz, hata çağırana döner (işlem yapılmaz).
    await api('/platform/izin/degistir', { anahtar: 'servis-istekleri', acik: false });
    const once3 = hedef.istekler.length;
    await baslat('/platform/servis/erisim', { projeId, ortamId: test_, yol: '/Servis' });
    await pencere.getByRole('button', { name: 'Kapat' }).click();
    expect(await sonuc()).toMatchObject({ ok: false, kod: 'IZIN_KAPALI' });
    expect(hedef.istekler.length).toBe(once3);

    // 4) CANLI ortam: izin açılsa da canlı onayı atlanmaz — yeniden denemede 409 → tek tip "CANLI ortam" penceresi; Vazgeç → hata çağırana döner.
    await page.setViewportSize({ width: 390, height: 844 });
    await baslat('/platform/senaryolar/calistir', { projeId, ortamId: canli, senaryoId: 'yok', kosuId: 'k-izin-penceresi' });
    await expect(pencere).toContainText('İzin açılsa da CANLI ortama istek atan her işlem ayrıca onay ister.');
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
    const altKutu = await pencere.locator('.diyalog-alt').boundingBox();
    for (const d of await pencere.locator('.diyalog-alt button').all()) { const k = await d.boundingBox(); expect(k && altKutu && k.x >= altKutu.x && k.x + k.width <= altKutu.x + altKutu.width + 1).toBe(true); }
    await page.waitForTimeout(400);
    await page.screenshot({ path: testInfo.outputPath('izin-penceresi-390.png') });
    await pencere.getByRole('button', { name: 'İzin ver ve devam et' }).click();
    const canliPencere = page.getByRole('dialog', { name: 'CANLI ortam' });
    await expect(canliPencere).toContainText('Bu işlem CANLI (CANLI) ortamında yapılacak; istekler gerçek sisteme gider. Emin misiniz?');
    await expect(canliPencere.getByRole('button')).toHaveText(['Vazgeç', 'Evet, devam et']);
    await canliPencere.getByRole('button', { name: 'Vazgeç' }).click();
    expect(await sonuc()).toMatchObject({ ok: false, kod: 'CANLI_ONAY_GEREKLI' });
    expect(((await api('/platform/izinler')).izinler as Record<string, boolean>)['canli-ortam']).toBe(true);

    // 5) Kasa kilitliyken düğme yok (Kapat + İzinlere git; kilidi açma notu).
    await api('/platform/kasa/kilitle', {});
    await page.evaluate(() => { void import('/arayuz/ortak.js' as string).then((m) => m.izinUyarisiGoster('web-erisimi', 'Deneme')); });
    await expect(pencere).toContainText('Kasa kilitli');
    await expect(pencere.getByRole('button', { name: 'İzin ver ve devam et' })).toHaveCount(0);
    await pencere.getByRole('button', { name: 'Kapat' }).click();
    expect((await api('/platform/kasa/ac', { parola: PAROLA })).basarili).toBe(true);
    expect(hatalar).toEqual([]);
    await baglam.close();
  });
});
