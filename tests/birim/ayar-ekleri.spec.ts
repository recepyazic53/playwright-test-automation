// KORUMA TESTLERİ — kullanıcı kararlarına bağlanan üç davranış:
//  1) SQL adımında beklenen satır sayısı: üst sınır Ayarlar > Koşu > Gelişmiş > "SQL sorgusunda okunan en çok satır" (tek kaynak);
//     kaydederken / doğrularken anlaşılır uyarı, ayar sonradan düşürülürse koşuda sorgu çalışmadan anlaşılır hata.
//  2) Tarama / akış kaydı giriş beklemeleri (Ayarlar > Koşu > Tarama ve akış kaydı): koşudaki giriş ayarlarından ayrı.
//  3) Yedekten yükleme: yedekteki izinler ve riskli seçimleri olduğu gibi geçerli; Nöbetçi açılınca BİR KEZ uyarı penceresi
//     (bayrak sunucuda; kapatılınca kimse için çıkmaz). Yalnız izinleri değiştiren yükleme tetikler.
// Dış siteye istek gitmez: sunucu ve tarayıcı yalnız 127.0.0.1'de, veritabanları geçici klasörde (veri/ klasörüne dokunulmaz).
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import type { Veritabani } from '../../scripts/platform/veritabani/baglanti.mjs';
import { ortamKaydet, projeKaydet, senaryoKaydet, ekranKaydet, veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { KOSU_AYAR_TANIMLARI, kosuAyarlariniKaydet, kosuAyarlariniOku, sqlSatirSiniriOku, varsayilanKosuAyarlari } from '../../scripts/platform/ayarlar/kosu-ayarlari.mjs';
import { SQL_SORGU_SATIR_SINIRI, satirSiniriUyarisi, sqlAdiminiKos, sqlTanimiDogrula, type SqlTanimi } from '../../scripts/platform/sql/sql-adimi.mjs';
import { servisAkisiKaydet } from '../../scripts/platform/servisler/servis-deposu.mjs';
import { akistanKayitEnvanteri, type AkisEnvanteri } from '../../scripts/platform/tarama/akis-tasarimi.mjs';
import type { HamAlan } from '../../scripts/platform/tarama/paket-olusturucu.mjs';
import { taramaTarayiciAyarlari } from '../../scripts/platform/tarama/protokol.mjs';
import { izinDegistir, izinleriOku } from '../../scripts/platform/guvenlik/izinler.mjs';
import { IZIN_TANIMLARI } from '../../scripts/platform/guvenlik/izin-tanimlari.mjs';
import { YEDEK_UYARISI_META, yedekUyarisi, yedekUyarisiniKapat } from '../../scripts/platform/guvenlik/yedek-uyarisi.mjs';
import { yedekIceAktar, yedekOlustur } from '../../scripts/platform/yedek.mjs';
import { iceAktarmaHazirla, iceAktarmaUygula } from '../../scripts/platform/ice-aktarma.mjs';
import { korumaliTarayici, SIRKET_DESENI } from './giris-fikstur';
import { nobetciApi, nobetciBaslat, type Nobetci } from './nobetci-sunucusu';
import { HIZLI_KDF, geciciKlasor } from './platform-ortak';

const EKRAN_KLASORU = process.env.AYAR_EKLERI_EKRAN_KLASORU;
const PAROLA = 'Gecici-Ayar-Ekleri-1';
const HEDEF_PAROLA = 'Gecici-Ayar-Ekleri-Hedef-2';

// ---------------------------------------------------------------------------------------------------------------------------
// 1) SQL beklenen satır sayısı ↔ Ayarlar'daki SQL satır sınırı
// ---------------------------------------------------------------------------------------------------------------------------

const alan = (anahtar: string, etiket: string): HamAlan => ({
  anahtar, tur: 'text', etiket, etiketKaynagi: 'label', kimlik: anahtar.slice(1), ad: null, secici: anahtar, kirilganlik: 'dusuk', adaySeciciler: [anahtar],
  zorunlu: false, devreDisi: false, saltOkunur: false, coklu: false, bolum: { anahtar: 'b', baslik: 'Sipariş' }
});
const ENV: AkisEnvanteri = {
  kip: 'kayit', bicim: 'akis', profil: null, baslik: 'Sipariş', alanlar: [{ alan: alan('#no', 'Sipariş no'), secili: true }],
  dugmeler: [{ secici: '#kaydet', metin: 'Kaydet' }], mesajlar: [], olaylar: [], engellenenler: [], notlar: []
};
const sayim = (deger: unknown) => ({ baglantiId: 'db1', sql: 'SELECT no FROM siparisler', beklenen: { tur: 'satirSayisi', deger } });

test('SQL beklenen satır sayısı: üst sınır Ayarlar\'daki SQL satır sınırından; aşarsa anlaşılır uyarı (arayüz ve sunucu aynı kural)', () => {
  // Varsayılan (ayar verilmezse): ayarın varsayılanı; eski sabit 0–1000 yerine kullanıcının sınırı.
  const varsayilan = KOSU_AYAR_TANIMLARI.find((t) => t.anahtar === 'sqlSatirSiniri');
  expect(varsayilan?.varsayilan).toBe(SQL_SORGU_SATIR_SINIRI);
  expect(varsayilan?.aciklama).toContain('beklenen satır sayısı');
  expect(sqlTanimiDogrula(sayim(1000)).hatalar).toEqual([]);
  expect(sqlTanimiDogrula(sayim(1001)).hatalar).toEqual([
    'Beklenen satır sayısı (1001), Ayarlar\'daki SQL satır sınırından (1000) büyük. Sınırı Ayarlar > Koşu > Gelişmiş koşu davranışı > "SQL sorgusunda okunan en çok satır"dan yükseltin ya da beklenen sayıyı düşürün.'
  ]);
  // Ayar yükseltilince 1000'den büyük beklenen sayı geçerli; düşürülünce sınırı aşan reddedilir.
  expect(sqlTanimiDogrula(sayim(5000), { satirSiniri: 5000 }).hatalar).toEqual([]);
  expect(sqlTanimiDogrula(sayim('50'), { satirSiniri: 50 }).hatalar).toEqual([]);
  expect(sqlTanimiDogrula(sayim(51), { satirSiniri: 50 }).hatalar[0]).toContain('Beklenen satır sayısı (51), Ayarlar\'daki SQL satır sınırından (50) büyük');
  expect(sqlTanimiDogrula(sayim(-1)).hatalar).toEqual(['Beklenen satır sayısı 0 ya da daha büyük bir tam sayı olmalı.']);
  expect(sqlTanimiDogrula(sayim(1.5)).hatalar).toEqual(['Beklenen satır sayısı 0 ya da daha büyük bir tam sayı olmalı.']);
  // Tablo eşitliği: beklenen satırlar da sınırı aşamaz.
  const tablo = { baglantiId: 'db1', sql: 'SELECT no FROM siparisler', beklenen: { tur: 'tabloEsit', sutunlar: ['NO'], satirlar: [['1'], ['2'], ['3']] } };
  expect(sqlTanimiDogrula(tablo, { satirSiniri: 3 }).hatalar).toEqual([]);
  expect(sqlTanimiDogrula(tablo, { satirSiniri: 2 }).hatalar[0]).toContain('Beklenen tablodaki satır sayısı (3), Ayarlar\'daki SQL satır sınırından (2) büyük');
  // Diğer beklenen türleri sınırdan etkilenmez.
  expect(satirSiniriUyarisi({ tur: 'bosDegil' }, 1)).toBeNull();
  // Ekran akışının SQL bloğu (akış tasarımı) aynı kuralla: hata blokta gösterilir.
  const bloklar = (deger: number) => [
    { tur: 'alanlar' as const, ad: 'Sipariş', alanlar: ['#no'], zorunlu: [] },
    { tur: 'aksiyon' as const, dugme: 0, istegeBagli: false },
    { tur: 'sql' as const, ad: 'Sipariş sayısı', sql: sayim(deger) },
    { tur: 'bitir' as const }
  ];
  expect(akistanKayitEnvanteri(ENV, bloklar(20), { satirSiniri: 20 }).hatalar).toEqual([]);
  const h = akistanKayitEnvanteri(ENV, bloklar(21), { satirSiniri: 20 }).hatalar;
  expect(h).toHaveLength(1);
  expect(h[0]).toMatchObject({ blok: 2, mesaj: expect.stringContaining('SQL satır sınırından (20) büyük') });
});

test('SQL: ayar düşürülürse kayıtlı adım koşuda sorgu çalıştırılmadan anlaşılır hatayla kalır; servis akışı kaydı ayarı okur', async () => {
  let cagri = 0;
  const g = {
    adimAdi: 'Sipariş sayısı', coz: () => undefined,
    yurutucu: async () => { cagri++; return { sutunlar: ['NO'], satirlar: [[1]] }; }
  };
  const tanim = sqlTanimiDogrula(sayim(60), { satirSiniri: 100 }).tanim as SqlTanimi;
  const r = await sqlAdiminiKos(tanim, { ...g, satirSiniri: 50 });
  expect(r).toMatchObject({ durum: 'hata', deneme: 0 });
  expect(r.mesaj).toBe('Sipariş sayısı: Beklenen satır sayısı (60), Ayarlar\'daki SQL satır sınırından (50) büyük. Sınırı Ayarlar > Koşu > Gelişmiş koşu davranışı > "SQL sorgusunda okunan en çok satır"dan yükseltin ya da beklenen sayıyı düşürün.');
  expect(cagri).toBe(0);
  // Sınır yeterliyse sorgu çalışır (beklenene uymadığı için Kaldı; sınırla ilgisi yok).
  expect((await sqlAdiminiKos(tanim, { ...g, satirSiniri: 100 })).durum).toBe('basarisiz');
  expect(cagri).toBe(1);

  const klasor = geciciKlasor('ayar-ekleri-sql');
  const vt = await veritabaniniHazirla(join(klasor.yol, 'platform.db'));
  try {
    await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
    const projeId = projeKaydet(vt, { ad: 'Örnek mağaza' });
    const akis = (deger: number) => ({ adimlar: [{ ad: 'Sipariş sayısı', tur: 'sql', sql: sayim(deger) }] });
    expect(sqlSatirSiniriOku(vt)).toBe(1000);
    kosuAyarlariniKaydet(vt, { sqlSatirSiniri: 5 });
    expect(sqlSatirSiniriOku(vt)).toBe(5);
    expect(() => servisAkisiKaydet(vt, { projeId, baslik: 'Sayım', icerik: akis(6) })).toThrow('Ayarlar\'daki SQL satır sınırından (5) büyük');
    const id = servisAkisiKaydet(vt, { projeId, baslik: 'Sayım', icerik: akis(5) });
    // Ayar yükseltilince eski 0–1000 sabiti yok: 2000 kaydedilir.
    kosuAyarlariniKaydet(vt, { sqlSatirSiniri: 5000 });
    expect(servisAkisiKaydet(vt, { id, projeId, baslik: 'Sayım', icerik: akis(2000) })).toBe(id);
    // Ayar düşürülünce aynı akış yeniden kaydedilirken uyarı verir.
    kosuAyarlariniKaydet(vt, { sqlSatirSiniri: 1500 });
    expect(() => servisAkisiKaydet(vt, { id, projeId, baslik: 'Sayım', icerik: akis(2000) })).toThrow('SQL satır sınırından (1500) büyük');
  } finally { vt.kapat(); klasor.temizle(); }
});

// ---------------------------------------------------------------------------------------------------------------------------
// 2) Tarama / akış kaydı giriş beklemeleri (ayrı ayarlar)
// ---------------------------------------------------------------------------------------------------------------------------

test('tarama ve akış kaydı: girişte oturum kontrolü / giriş alanı beklemesi ayrı ayar; varsayılan 15 sn, aralık koşudakiyle aynı', async () => {
  const t = (a: string) => KOSU_AYAR_TANIMLARI.find((x) => x.anahtar === a);
  for (const [tarama, kosu, etiket] of [['taramaOturumKontrolSn', 'oturumKontrolSn', 'Girişte oturum kontrolü'], ['taramaGirisAlanBeklemeSn', 'girisAlanBeklemeSn', 'Girişte giriş alanı beklemesi']] as const) {
    expect(t(tarama)).toMatchObject({ grup: 'Tarama ve akış kaydı', etiket, tur: 'sayi', varsayilan: 15, birim: 'sn', enAz: t(kosu)?.enAz, enCok: t(kosu)?.enCok });
    expect(t(tarama)?.altBolum).toBeUndefined();
    expect(t(tarama)?.env).toBeUndefined(); // koşu alt sürecine gitmez; tarama girdisiyle gider
  }
  expect(varsayilanKosuAyarlari()).toMatchObject({ taramaOturumKontrolSn: 15, taramaGirisAlanBeklemeSn: 15, oturumKontrolSn: 15, girisAlanBeklemeSn: 15 });
  // Girdide yoksa (eski sunucu) bugünkü 15 sn; verilince kullanılır, aralık dışı değer varsayılana düşer.
  expect(taramaTarayiciAyarlari({})).toMatchObject({ oturumKontrolMs: 15_000, girisAlanBeklemeMs: 15_000 });
  expect(taramaTarayiciAyarlari({ tarayici: { oturumKontrolMs: 7_000, girisAlanBeklemeMs: 2_000 } })).toMatchObject({ oturumKontrolMs: 7_000, girisAlanBeklemeMs: 2_000 });
  expect(taramaTarayiciAyarlari({ tarayici: { oturumKontrolMs: 500, girisAlanBeklemeMs: 301_000 } })).toMatchObject({ oturumKontrolMs: 15_000, girisAlanBeklemeMs: 15_000 });
  const klasor = geciciKlasor('ayar-ekleri-tarama');
  const vt = await veritabaniniHazirla(join(klasor.yol, 'platform.db'));
  try {
    await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
    expect(() => kosuAyarlariniKaydet(vt, { taramaGirisAlanBeklemeSn: 0 })).toThrow('1–300');
    expect(() => kosuAyarlariniKaydet(vt, { taramaOturumKontrolSn: 301 })).toThrow('1–300');
    // Tarama ayarı koşunun giriş ayarını değiştirmez (ayrı).
    kosuAyarlariniKaydet(vt, { taramaGirisAlanBeklemeSn: 3, taramaOturumKontrolSn: 9 });
    expect(kosuAyarlariniOku(vt)).toMatchObject({ taramaGirisAlanBeklemeSn: 3, taramaOturumKontrolSn: 9, girisAlanBeklemeSn: 15, oturumKontrolSn: 15 });
  } finally { vt.kapat(); klasor.temizle(); }
});

// ---------------------------------------------------------------------------------------------------------------------------
// 3) Yedekten yükleme uyarısı
// ---------------------------------------------------------------------------------------------------------------------------

const ACIK_IZINLER = ['web-erisimi', 'veritabani-okuma'];
const etiket = (a: string) => IZIN_TANIMLARI.find((t) => t.anahtar === a)?.etiket ?? a;

/** Kaynak: iki izin açık; ortamlar: CANLI (riskli), TEST (riskli değil), ÖN TEST (belirtilmemiş). */
async function kaynakOlustur(yol: string | null): Promise<{ vt: Veritabani; projeId: string }> {
  const vt = await veritabaniniHazirla(yol);
  await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
  const projeId = projeKaydet(vt, { ad: 'Örnek mağaza' });
  ortamKaydet(vt, { projeId, ad: 'TEST', tabanUrl: 'https://test.ornek.invalid', varsayilan: true, ayarlar: { riskli: false } });
  ortamKaydet(vt, { projeId, ad: 'CANLI', tabanUrl: 'https://magaza.ornek.invalid', ayarlar: { riskli: true } });
  ortamKaydet(vt, { projeId, ad: 'ÖN TEST', tabanUrl: 'https://on.ornek.invalid', ayarlar: {} });
  const ekranId = ekranKaydet(vt, { projeId, anahtar: 'sepet', ad: 'Sepet' });
  senaryoKaydet(vt, { projeId, ekranId, baslik: 'Sepete ürün ekle', icerik: { adim: 1 } });
  for (const a of ACIK_IZINLER) izinDegistir(vt, a, true, { onay: true });
  return { vt, projeId };
}

test('yedek uyarısı: tam yüklemede kurulur, izinler ve riskli seçimleri olduğu gibi; kapatılınca silinir; seçmeli aktarma yalnız "izinler" kaydı yazılırsa', async () => {
  const klasor = geciciKlasor('ayar-ekleri-yedek');
  const { vt: kaynak } = await kaynakOlustur(null);
  const yedek = yedekOlustur(kaynak).veri;
  const hedef = await veritabaniniHazirla(join(klasor.yol, 'hedef.db'));
  const secmeli = await veritabaniniHazirla(join(klasor.yol, 'secmeli.db'));
  try {
    // Normal kurulumda (yükleme yok) uyarı yok.
    await kasaOlustur(hedef, HEDEF_PAROLA, { kdf: HIZLI_KDF });
    expect(yedekUyarisi(hedef)).toBeNull();
    // Tam yükleme: veri yedektekiyle değişir; izinler yedektekiyle AYNI (değiştirilmez).
    await yedekIceAktar(hedef, yedek, PAROLA, { mod: 'tamYukle', onay: true, medyaKlasoru: null, guvenlikYedegiKlasoru: join(klasor.yol, 'guvenlik') });
    expect(izinleriOku(hedef)).toEqual(izinleriOku(kaynak));
    const u = yedekUyarisi(hedef);
    expect(u).toMatchObject({ tur: 'tamYukleme' });
    expect(u?.izinler.filter((x) => x.acik).map((x) => x.anahtar)).toEqual(ACIK_IZINLER);
    expect(u?.izinler).toHaveLength(IZIN_TANIMLARI.length);
    expect(u?.ortamlar.map((o) => [o.ad, o.riskli])).toEqual([['CANLI', true], ['ÖN TEST', null], ['TEST', false]]);
    // Bayrak meta tablosunda (yedeğe girmez): yedekten alınan yedekte yok.
    expect(JSON.stringify(yedekOlustur(hedef).manifest)).not.toContain(YEDEK_UYARISI_META);
    expect(yedekUyarisiniKapat(hedef)).toBe(true);
    expect(yedekUyarisi(hedef)).toBeNull();
    expect(yedekUyarisiniKapat(hedef)).toBe(false);

    // Seçmeli içe aktarma (dolu veritabanı): izinler kaydı seçilmezse uyarı yok.
    await kasaOlustur(secmeli, HEDEF_PAROLA, { kdf: HIZLI_KDF });
    projeKaydet(secmeli, { ad: 'Yerel proje' });
    const h1 = await iceAktarmaHazirla(secmeli, yedek, PAROLA);
    const r1 = iceAktarmaUygula(secmeli, h1, { secimler: { projeler: h1.onizleme.varliklar.projeler.yeni.map((x) => x.id) } }, { yapan: 'birim-test' });
    expect(r1.tamYukleme).toBe(false);
    expect(yedekUyarisi(secmeli)).toBeNull();
    expect(izinleriOku(secmeli)['web-erisimi']).toBe(false);
    // "izinler" kaydı seçilip yazılınca izinler değişir → uyarı.
    const h2 = await iceAktarmaHazirla(secmeli, yedek, PAROLA);
    iceAktarmaUygula(secmeli, h2, { secimler: { ayarlar: ['izinler'] } }, { yapan: 'birim-test' });
    expect(izinleriOku(secmeli)['web-erisimi']).toBe(true);
    expect(yedekUyarisi(secmeli)).toMatchObject({ tur: 'secmeli' });
    yedekUyarisiniKapat(secmeli);
    // Aynı izinler yeniden seçilirse (içerik aynı, yazılmaz) uyarı yok.
    const h3 = await iceAktarmaHazirla(secmeli, yedek, PAROLA);
    iceAktarmaUygula(secmeli, h3, { secimler: { ayarlar: ['izinler'] } }, { yapan: 'birim-test' });
    expect(yedekUyarisi(secmeli)).toBeNull();
  } finally {
    kaynak.kapat(); hedef.kapat(); secmeli.kapat(); klasor.temizle();
  }
});

test.describe('yedek uyarısı penceresi (arayüz)', () => {
  test.describe.configure({ mode: 'serial' });
  let klasor: ReturnType<typeof geciciKlasor>;
  let nobetci: Nobetci;
  let tarayici: Browser;
  let yedek: Buffer;
  const hatalar: string[] = [];
  const istekler: string[] = [];

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    klasor = geciciKlasor('ayar-ekleri-arayuz');
    const { vt } = await kaynakOlustur(null);
    yedek = yedekOlustur(vt).veri;
    vt.kapat();
    nobetci = await nobetciBaslat(klasor.yol, join(klasor.yol, 'platform.db'));
    tarayici = await korumaliTarayici();
  });
  test.afterAll(async () => {
    await tarayici?.close();
    nobetci?.surec.kill('SIGTERM');
    klasor?.temizle();
  });
  test.afterEach(() => {
    expect(hatalar, 'sayfa hataları').toEqual([]);
    expect(istekler.filter((u) => SIRKET_DESENI.test(u))).toEqual([]);
    expect(istekler.filter((u) => !u.startsWith(nobetci.adres) && !u.startsWith('data:') && !u.startsWith('blob:'))).toEqual([]);
  });

  const sayfaAc = async (genislik = 1360, yukseklik = 900): Promise<Page> => {
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: genislik, height: yukseklik } });
    baglam.on('request', (r) => { istekler.push(r.url()); });
    const p = await baglam.newPage();
    p.on('pageerror', (e) => hatalar.push(String(e)));
    return p;
  };
  const pencere = (p: Page) => p.locator('dialog.yedek-uyarisi');
  /** Ana düzen çizildi (ana menü görünür); uyarı isteği bitti. */
  const anaSayfa = async (p: Page): Promise<void> => {
    const bekle = p.waitForResponse((r) => r.url().includes('/platform/yedek-uyarisi'));
    await p.goto('/');
    await expect(p.locator('header.ust-cubuk')).toBeVisible();
    await bekle;
  };
  const yukle = async (secim: Record<string, unknown>, dosya: Buffer = yedek): Promise<void> => {
    const r = await fetch(`${nobetci.adres}/platform/yedek/ice-aktar`, {
      method: 'POST', body: new Uint8Array(dosya),
      headers: { 'content-type': 'application/octet-stream', 'x-test-sunucu-token': nobetci.token, 'x-kasa-parola': encodeURIComponent(PAROLA) }
    });
    expect(r.status).toBe(202);
    const isId = String(((await r.json()) as { isId: string }).isId);
    let durum = '';
    for (let i = 0; i < 200 && durum !== 'hazir'; i++) {
      durum = String(((await nobetciApi(nobetci, `/platform/yedek/ice-aktar/${isId}`)).is as { durum: string }).durum);
      if (durum === 'hata') throw new Error('içe aktarma hazırlığı başarısız');
      if (durum !== 'hazir') await new Promise((c) => setTimeout(c, 100));
    }
    expect((await nobetciApi(nobetci, `/platform/yedek/ice-aktar/${isId}/uygula`, secim)).basarili).toBe(true);
  };
  const goruntu = async (p: Page, ad: string): Promise<void> => {
    if (!EKRAN_KLASORU) return;
    mkdirSync(EKRAN_KLASORU, { recursive: true });
    await p.screenshot({ path: join(EKRAN_KLASORU, `${ad}.png`), animations: 'disabled' });
  };
  /** Sayfada ve pencerede yatay taşma yok. */
  const tasmaYok = async (p: Page): Promise<void> => {
    const olcu = await p.evaluate(() => {
      const d = document.querySelector('dialog.yedek-uyarisi');
      const r = d?.getBoundingClientRect();
      return {
        sayfa: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        pencere: d ? d.scrollWidth - d.clientWidth : 0,
        sol: r?.left ?? 0, sag: r ? window.innerWidth - r.right : 0
      };
    });
    expect(olcu.sayfa).toBeLessThanOrEqual(0);
    expect(olcu.pencere).toBeLessThanOrEqual(0);
    expect(olcu.sol).toBeGreaterThanOrEqual(0);
    expect(olcu.sag).toBeGreaterThanOrEqual(0);
  };

  test('tam yükleme sonrası ana sayfada bir kez: açık izinler ve riskli seçimleri; başka tarayıcı da görür; "Tamam" herkes için kapatır', async () => {
    test.setTimeout(120_000);
    await yukle({ tumu: true });
    // Yedekteki izinler olduğu gibi geçerli.
    const izinler = (await nobetciApi(nobetci, '/platform/izinler')).izinler as Record<string, boolean>;
    expect(Object.entries(izinler).filter(([, a]) => a).map(([k]) => k)).toEqual(ACIK_IZINLER);

    const masaustu = await sayfaAc();
    await anaSayfa(masaustu);
    const d = pencere(masaustu);
    await expect(d).toBeVisible();
    await expect(d.getByRole('heading', { name: 'Yedek yüklendi' })).toBeVisible();
    await expect(d.locator('#yedek-uyarisi-metni')).toHaveText(
      `Yedekteki izinler geçerli: ${ACIK_IZINLER.map(etiket).join(', ')} açık; diğerleri kapalı. Ayarlar > İzinler'den gözden geçirin.`);
    await expect(d.locator('.yedek-uyarisi-riskler')).toHaveText(
      'Ortamların türleri (Test / Canlı) de yedektekiyle geçerli. Canlı: CANLI; Test: TEST; türü seçilmemiş (Canlı sayılır): ÖN TEST.');
    await expect(d.getByRole('button', { name: 'Tamam' })).toBeFocused();
    await expect(d.getByRole('button', { name: 'İzinlere git' })).toBeVisible();
    await tasmaYok(masaustu);
    await goruntu(masaustu, 'yedek-uyarisi-masaustu');
    // Esc pencereyi kapatmaz (bilerek bir düğme seçilir).
    await masaustu.keyboard.press('Escape');
    await expect(d).toBeVisible();

    // Başka tarayıcı (ayrı bağlam, 390 px) da görür; taşma yok.
    const telefon = await sayfaAc(390, 844);
    await anaSayfa(telefon);
    await expect(pencere(telefon)).toBeVisible();
    await tasmaYok(telefon);
    await goruntu(telefon, 'yedek-uyarisi-390');

    // "Tamam": bayrak sunucuda silinir; iki tarayıcıda da yeniden açılışta çıkmaz.
    await d.getByRole('button', { name: 'Tamam' }).click();
    await expect(d).toHaveCount(0);
    expect((await nobetciApi(nobetci, '/platform/yedek-uyarisi')).uyari).toBeNull();
    for (const p of [masaustu, telefon]) {
      await anaSayfa(p);
      await expect(pencere(p)).toHaveCount(0);
    }
    await masaustu.context().close();
    await telefon.context().close();
  });

  test('normal açılışta çıkmaz; seçmeli aktarma "izinler" kaydını yazmazsa çıkmaz, yazarsa çıkar; "İzinlere git" kapatıp İzinler\'e götürür', async () => {
    test.setTimeout(120_000);
    const p = await sayfaAc();
    await anaSayfa(p);
    await expect(pencere(p)).toHaveCount(0);
    // Seçmeli: yalnız senaryolar (izinler değişmez) → uyarı yok.
    await yukle({ secimler: { senaryolar: [] } });
    await anaSayfa(p);
    await expect(pencere(p)).toHaveCount(0);
    // Yerelde tüm izinler kapatılır; yedekteki "izinler" kaydı seçilince yazılır → uyarı.
    for (const a of ACIK_IZINLER) expect((await nobetciApi(nobetci, '/platform/izin/degistir', { anahtar: a, acik: false })).basarili).toBe(true);
    await yukle({ secimler: { ayarlar: ['izinler'] } });
    await anaSayfa(p);
    const d = pencere(p);
    await expect(d).toBeVisible();
    await expect(d.locator('.yedek-uyarisi-izinler')).toHaveText(`${ACIK_IZINLER.map(etiket).join(', ')} açık; diğerleri kapalı.`);
    await d.getByRole('button', { name: 'İzinlere git' }).click();
    await expect(d).toHaveCount(0);
    await expect(p).toHaveURL(/#\/ayarlar\/guvenlik\/izinler$/);
    expect((await nobetciApi(nobetci, '/platform/yedek-uyarisi')).uyari).toBeNull();
    await anaSayfa(p);
    await expect(pencere(p)).toHaveCount(0);
    // Açık izin yoksa da bilgi verilir: tüm izinleri kapalı bir yedeğin "izinler" kaydı (yerelde iki izin açık).
    const { vt: kapaliKaynak } = await kaynakOlustur(null);
    for (const a of ACIK_IZINLER) izinDegistir(kapaliKaynak, a, false);
    const kapaliYedek = yedekOlustur(kapaliKaynak).veri;
    kapaliKaynak.kapat();
    await yukle({ secimler: { ayarlar: ['izinler'] } }, kapaliYedek);
    await anaSayfa(p);
    await expect(pencere(p).locator('.yedek-uyarisi-izinler')).toHaveText('Tüm izinler kapalı.');
    await pencere(p).getByRole('button', { name: 'Tamam' }).click();
    await expect(pencere(p)).toHaveCount(0);
    await p.context().close();
  });
});
