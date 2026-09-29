// KORUMA TESTLERİ — Planlı koşular (Planlı koşular; üst menü). "Vakti geldi mi" hesabı saf fonksiyondur ve SAHTE saatle doğrulanır;
// tetikleme yolu SAHTE koşucu ile sınanır (gerçek Playwright koşusu, tarayıcı, ağ isteği YOK). Kurallar kasada şifreli saklanır.
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, expect, test, type Browser } from '@playwright/test';
import type { Veritabani } from '../../scripts/platform/veritabani/baglanti.mjs';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { ortamGetir, ortamKaydet, projeKaydet, veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { baglantiKaydet } from '../../scripts/platform/entegrasyonlar/depo.mjs';
import {
  gununZamanlari, oncekiZaman, sonrakiZaman, sonrakiZamanlar, TOLERANS_MS, vadesiGelenZaman, zamanDogrula, zamanMetni, type Zaman
} from '../../scripts/platform/zamanlama/takvim.mjs';
import {
  GECMIS_SINIRI, kuralEtkinlestir, kuralKaydet, kuralSil, kurallariListele, tetiklemeYaz, tumGecmis, type Kural, type Tetikleme
} from '../../scripts/platform/zamanlama/kurallar.mjs';
import { ATLANDI_MESAJI, zamanlayiciOlustur, zamanliKosuyuYurut, type YurutmeBagimliliklari } from '../../scripts/platform/zamanlama/zamanlayici.mjs';
import { servisAkisiKaydet, servisKaydet, servisSenaryosuKaydet } from '../../scripts/platform/servisler/servis-deposu.mjs';
import { izinDegistir } from '../../scripts/platform/guvenlik/izinler.mjs';
import { nobetciApi, nobetciBaslat, type Nobetci } from './nobetci-sunucusu';
import { HIZLI_KDF, geciciKlasor, izinleriAc } from './platform-ortak';

/** Yerel saat (zamanlar bu bilgisayarın saatine göredir). 2026-09-28 Pazartesi. */
const an = (gun: number, saat: number, dakika = 0, saniye = 0) => new Date(2026, 8, gun, saat, dakika, saniye);
const iso = (d: Date | null) => (d ? d.toISOString() : null);

test('takvim: "vakti geldi mi" hesabı (sahte saat) — günlük, haftalık, N saatte bir; kaçan zaman toplu koşulmaz', () => {
  expect(() => zamanDogrula({ tur: 'gunluk', saat: '25:00' })).toThrow('SS:DD');
  expect(() => zamanDogrula({ tur: 'haftalik', saat: '09:00', gunler: [] })).toThrow('En az bir gün');
  expect(() => zamanDogrula({ tur: 'aralik', saatAraligi: 5 })).toThrow('Saat aralığı');
  expect(() => zamanDogrula({ tur: 'cron', ifade: '* * * * *' })).toThrow('Zaman türü');
  expect(zamanDogrula({ tur: 'haftalik', saat: '07:30', gunler: [5, 1, 3, 3, 9], fazla: 1 })).toEqual({ tur: 'haftalik', saat: '07:30', gunler: [1, 3, 5] });

  const gunluk: Zaman = { tur: 'gunluk', saat: '09:00' };
  expect(vadesiGelenZaman(gunluk, an(28, 8, 59), null)).toBeNull();
  expect(iso(vadesiGelenZaman(gunluk, an(28, 9, 0, 20), null))).toBe(an(28, 9).toISOString());
  // Aynı zaman ikinci kez tetiklenmez.
  expect(vadesiGelenZaman(gunluk, an(28, 9, 1), an(28, 9).toISOString())).toBeNull();
  // Tolerans (5 dk) geçtiyse — sunucu kapalıydı / kasa kilitliydi — sonradan koşulmaz; bir sonraki zaman beklenir.
  expect(TOLERANS_MS).toBe(5 * 60 * 1000);
  expect(iso(vadesiGelenZaman(gunluk, an(28, 9, 5), null))).toBe(an(28, 9).toISOString());
  expect(vadesiGelenZaman(gunluk, an(28, 9, 6), null)).toBeNull();
  expect(vadesiGelenZaman(gunluk, an(29, 8, 0), null)).toBeNull();
  expect(iso(sonrakiZaman(gunluk, an(28, 9, 6)))).toBe(an(29, 9).toISOString());
  // Kural kaydedilmeden önceki bir zaman tetiklenmez.
  expect(vadesiGelenZaman(gunluk, an(28, 9, 3), an(28, 9, 2).toISOString())).toBeNull();
  expect(zamanMetni(gunluk)).toBe('Her gün 09:00');

  const haftalik: Zaman = { tur: 'haftalik', saat: '07:30', gunler: [1, 3, 5] };
  expect(iso(sonrakiZaman(haftalik, an(27, 12)))).toBe(an(28, 7, 30).toISOString()); // Pazar → Pazartesi
  expect(iso(sonrakiZaman(haftalik, an(28, 8)))).toBe(an(30, 7, 30).toISOString()); // Pazartesi → Çarşamba
  expect(iso(sonrakiZaman(haftalik, an(2 + 30, 8)))).toBe(an(5 + 30, 7, 30).toISOString()); // Cuma → Pazartesi
  expect(vadesiGelenZaman(haftalik, an(29, 7, 31), null)).toBeNull(); // Salı seçili değil
  expect(iso(vadesiGelenZaman(haftalik, an(30, 7, 31), null))).toBe(an(30, 7, 30).toISOString());
  expect(zamanMetni(haftalik)).toBe('Pzt, Çar, Cum 07:30');
  expect(zamanMetni({ tur: 'haftalik', saat: '06:00', gunler: [1, 2, 3, 4, 5] })).toBe('Hafta içi her gün 06:00');

  const aralik: Zaman = { tur: 'aralik', saatAraligi: 4, baslangic: '00:30' };
  expect(gununZamanlari(aralik, an(28, 0)).map((d) => d.getHours() * 60 + d.getMinutes())).toEqual([30, 270, 510, 750, 990, 1230]);
  expect(iso(vadesiGelenZaman(aralik, an(28, 4, 31), an(28, 0, 30).toISOString()))).toBe(an(28, 4, 30).toISOString());
  expect(iso(oncekiZaman(aralik, an(28, 4, 29)))).toBe(an(28, 0, 30).toISOString());
  expect(iso(sonrakiZaman(aralik, an(28, 20, 31)))).toBe(an(29, 0, 30).toISOString());
  expect(sonrakiZamanlar(aralik, an(28, 23), 3).map(iso)).toEqual([an(29, 0, 30), an(29, 4, 30), an(29, 8, 30)].map(iso));
  expect(zamanMetni(aralik)).toBe('Her 4 saatte bir (00:30, 04:30 …)');
});

/** Sahte koşucu: çağrıları kaydeder; senaryo başlığında "kalan" geçerse başarısız döner. Gerçek koşu başlatmaz. */
function sahteBagimliliklar(senaryolar: Array<{ id: string; baslik: string; ekranId: string | null; kosuyaDahil: boolean; ekranEtkin?: boolean }>) {
  const cagrilar: Array<Record<string, unknown>> = [];
  const bildirimler: Array<{ kosuId: string; baglantiIdleri: string[] }> = [];
  const akislar: Array<{ projeId: string; girdi: unknown }> = [];
  let sonrasi: (() => void) | null = null;
  const bag: Omit<YurutmeBagimliliklari, 'devamMi'> = {
    senaryolar: () => senaryolar,
    senaryoCalistir: async (_vt, govde) => {
      cagrilar.push(govde);
      const s = senaryolar.find((x) => x.id === govde.senaryoId);
      sonrasi?.();
      return { govde: { basarili: true, durum: s && s.baslik.includes('kalan') ? 'failed' : 'passed' } };
    },
    servisAkisiCalistir: async (_vt, projeId, girdi) => { akislar.push({ projeId, girdi }); return { kosuId: 'akis-kosu-1', durum: 'basarili' }; },
    bildir: async (_vt, kosuId, baglantiIdleri) => { bildirimler.push({ kosuId, baglantiIdleri }); }
  };
  return { bag, cagrilar, bildirimler, akislar, herCagridanSonra: (fn: (() => void) | null) => { sonrasi = fn; } };
}

test('kurallar kasada şifreli; canlı ortam onayı; zamanlayıcı SAHTE koşucuyla tetikler, atlar, kaçanı koşmaz, yarıda kalanı yazar', async () => {
  const klasor = geciciKlasor('zamanlama');
  const vt: Veritabani = await veritabaniniHazirla(join(klasor.yol, 'platform.db'));
  try {
    await kasaOlustur(vt, 'Gecici-Zamanlama-1', { kdf: HIZLI_KDF });
    // İzinlerden bağımsız davranış sınanıyor: Ayarlar > İzinler (varsayılan kapalı) açılır.
    izinleriAc(vt);
    const projeId = projeKaydet(vt, { ad: 'Örnek proje' });
    const testOrtami = ortamKaydet(vt, { projeId, ad: 'TEST', tabanUrl: 'https://test.ornek.invalid', varsayilan: true, ayarlar: { riskli: false } });
    const canliOrtam = ortamKaydet(vt, { projeId, ad: 'Ana sistem', tabanUrl: 'https://ana.ornek.invalid', varsayilan: false, ayarlar: { canli: true } });
    const webhook = baglantiKaydet(vt, projeId, { tur: 'webhook', ad: 'Ekip kanalı', alanlar: { adres: 'https://kanal.ornek.invalid/gizli', bicim: 'sohbet' }, olaylar: [] });

    // --- Doğrulama ve canlı ortam onayı ---
    const temel = { ad: 'Sabah tam koşu', ortamId: testOrtami, kapsam: { senaryolar: 'tum' }, zaman: { tur: 'gunluk', saat: '09:00' }, bildirimBaglantiId: webhook.id };
    expect(() => kuralKaydet(vt, projeId, { ...temel, ad: '' })).toThrow('1–80');
    expect(() => kuralKaydet(vt, projeId, { ...temel, kapsam: { senaryolar: 'ekranlar', ekranIdleri: [] } })).toThrow('En az bir ekran');
    expect(() => kuralKaydet(vt, projeId, { ...temel, kapsam: { senaryolar: 'yok' } })).toThrow('Koşulacak bir şey');
    expect(() => kuralKaydet(vt, projeId, { ...temel, bildirimBaglantiId: 'olmayan' })).toThrow('Bildirim bağlantısı');
    expect(() => kuralKaydet(vt, projeId, { ...temel, ad: 'Canlı gece', ortamId: canliOrtam })).toThrow('Canlı ortamda planlı koşuya izin veriyorum');
    const canliKural = kuralKaydet(vt, projeId, { ...temel, ad: 'Canlı gece', ortamId: canliOrtam, canliOnay: true, etkin: false, zaman: { tur: 'haftalik', saat: '02:00', gunler: [6] } });
    expect(canliKural).toMatchObject({ canliOnay: true, etkin: false });

    const kural = kuralKaydet(vt, projeId, temel, { simdi: an(28, 8) });
    expect(kural).toMatchObject({ etkin: true, canliOnay: false, kapsam: { senaryolar: 'tum', ekranIdleri: [], servisAkisIdleri: [] }, tuketilen: an(28, 8).toISOString() });
    expect(() => kuralKaydet(vt, projeId, { ...temel })).toThrow('zaten var');
    // Diskte şifreli (kasa:v1:), ad düz metin olarak görünmez.
    const ham = String(vt.tek("SELECT deger_json FROM ayarlar WHERE anahtar = 'zamanlanmis-kosular'")?.deger_json);
    expect(ham).toMatch(/^kasa:v1:/);
    expect(ham).not.toContain('Sabah tam koşu');

    // --- Zamanlayıcı (sahte saat + sahte koşucu) ---
    let saat = an(28, 8, 59);
    let kilitli = false;
    let mesgul = false;
    const s = sahteBagimliliklar([
      { id: 's1', baslik: 'Giriş geçer', ekranId: 'e1', kosuyaDahil: true, ekranEtkin: true },
      { id: 's2', baslik: 'Ödeme kalan', ekranId: 'e2', kosuyaDahil: true, ekranEtkin: true },
      { id: 's3', baslik: 'Koşuda değil', ekranId: 'e1', kosuyaDahil: false, ekranEtkin: true },
      { id: 's4', baslik: 'Devre dışı ekran', ekranId: 'e3', kosuyaDahil: true, ekranEtkin: false }
    ]);
    const z = zamanlayiciOlustur({
      veritabani: () => (kilitli ? null : vt), mesgulMu: () => mesgul, simdi: () => saat,
      yurut: (db, k, kosuKimligi, devamMi) => zamanliKosuyuYurut(db, k, kosuKimligi, { ...s.bag, devamMi })
    });
    const bekle = async () => { await Promise.all(await z.kontrolEt()); };

    await bekle();
    expect(s.cagrilar).toHaveLength(0);

    saat = an(28, 9, 0, 20);
    const baslayan = await z.kontrolEt();
    expect(baslayan).toHaveLength(1);
    expect(z.suren()).toMatchObject({ kuralId: kural.id, ad: 'Sabah tam koşu' });
    await Promise.all(baslayan);
    expect(z.suren()).toBeNull();
    // "Koşuyu başlat" ile aynı gövde: yalnız "Koşuda" + etkin ekran senaryoları, sırayla, ortak "zamanli-…" koşu kimliği, tam koşu.
    expect(s.cagrilar.map((c) => c.senaryoId)).toEqual(['s1', 's2']);
    const kosuKimligi = String(s.cagrilar[0].kosuKimligi);
    expect(kosuKimligi).toMatch(/^zamanli-[0-9a-f-]{36}$/);
    for (const c of s.cagrilar) expect(c).toMatchObject({ projeId, ortamId: testOrtami, kosuTuru: 'tam', kosuKapsami: 'Genel', kosuKimligi });
    expect(new Set(s.cagrilar.map((c) => c.kosuId)).size).toBe(2);
    expect(s.bildirimler).toEqual([{ kosuId: kosuKimligi, baglantiIdleri: [webhook.id] }]);
    let [g] = kurallariListele(vt, projeId, { simdi: saat }).filter((k) => k.id === kural.id);
    expect(g.sonTetikleme).toMatchObject({ zaman: an(28, 9).toISOString(), durum: 'basarisiz', kosuId: kosuKimligi, ozet: { toplam: 2, basarili: 1, basarisiz: 1, atlanan: 0, hata: 0 } });
    expect(g.sonrakiCalisma).toBe(an(29, 9).toISOString());
    expect(g).toMatchObject({ zamanMetni: 'Her gün 09:00', ortamAdi: 'TEST', riskli: false, bildirimAdi: 'Ekip kanalı' });

    // Aynı zaman ikinci kez tetiklenmez.
    saat = an(28, 9, 1);
    expect(await z.kontrolEt()).toHaveLength(0);

    // Ertesi gün başka bir koşu sürüyor → atlanır, kayıt düşer, koşucu çağrılmaz.
    mesgul = true;
    saat = an(29, 9, 0, 5);
    expect(await z.kontrolEt()).toHaveLength(0);
    mesgul = false;
    [g] = kurallariListele(vt, projeId, { simdi: saat }).filter((k) => k.id === kural.id);
    expect(g.sonTetikleme).toMatchObject({ zaman: an(29, 9).toISOString(), durum: 'atlandi', mesaj: ATLANDI_MESAJI, kosuId: null });
    expect(s.cagrilar).toHaveLength(2);

    // Kasa kilitliyken kaçan zaman, kasa açılınca toplu koşulmaz.
    kilitli = true;
    saat = an(30, 9, 0, 5);
    expect(await z.kontrolEt()).toHaveLength(0);
    kilitli = false;
    saat = an(30, 9, 30);
    expect(await z.kontrolEt()).toHaveLength(0);
    expect(s.cagrilar).toHaveLength(2);
    expect(kurallariListele(vt, projeId, { simdi: saat }).find((k) => k.id === kural.id)?.gecmis).toHaveLength(2);

    // Koşu sırasında kasa kilitlenirse kalan senaryolar başlatılmaz; sonuç kasa açılınca yazılır ("yarıda").
    saat = an(1 + 30, 9, 0, 5);
    s.herCagridanSonra(() => { kilitli = true; });
    await Promise.all(await z.kontrolEt());
    s.herCagridanSonra(null);
    expect(s.cagrilar.map((c) => c.senaryoId)).toEqual(['s1', 's2', 's1']);
    kilitli = false;
    saat = an(1 + 30, 9, 2);
    await bekle();
    [g] = kurallariListele(vt, projeId, { simdi: saat }).filter((k) => k.id === kural.id);
    expect(g.sonTetikleme).toMatchObject({ durum: 'yarida', ozet: { toplam: 1, basarili: 1 } });
    expect(g.sonTetikleme?.mesaj).toContain('yarıda');

    // Ortam sonradan riskli işaretlendi ("Bu ortam riskli mi?" Evet), kuralda canlı onayı yok → koşu başlatılmaz.
    const o = ortamGetir(vt, testOrtami)!;
    ortamKaydet(vt, { id: o.id, projeId, ad: o.ad, tabanUrl: o.tabanUrl, varsayilan: true, ayarlar: { ...o.ayarlar, riskli: true } });
    saat = an(2 + 30, 9, 0, 5);
    await bekle();
    [g] = kurallariListele(vt, projeId, { simdi: saat }).filter((k) => k.id === kural.id);
    expect(g.sonTetikleme).toMatchObject({ durum: 'hata' });
    expect(g.sonTetikleme?.mesaj).toContain('canlı ortam onayı yok');
    expect(s.cagrilar).toHaveLength(3);
    ortamKaydet(vt, { id: o.id, projeId, ad: o.ad, tabanUrl: o.tabanUrl, varsayilan: true, ayarlar: { ...o.ayarlar, riskli: false } });

    // Pasif kural tetiklenmez; yeniden etkinleştirilince pasifken geçen zaman koşulmaz.
    kuralEtkinlestir(vt, projeId, kural.id, false, { simdi: an(3 + 30, 8) });
    saat = an(3 + 30, 9, 0, 5);
    expect(await z.kontrolEt()).toHaveLength(0);
    kuralEtkinlestir(vt, projeId, kural.id, true, { simdi: an(3 + 30, 9, 1) });
    saat = an(3 + 30, 9, 2);
    expect(await z.kontrolEt()).toHaveLength(0);

    // Önceki süreçten "çalışıyor" kalmış tetikleme (sunucu koşu sırasında kapandı) yarıda sayılır.
    const kalinti: Tetikleme = { id: 'kalinti-1', zaman: an(3 + 30, 7).toISOString(), baslangic: an(3 + 30, 7).toISOString(), bitis: null, durum: 'calisiyor', mesaj: '', kosuId: null, ozet: null, akisKosulari: [] };
    tetiklemeYaz(vt, canliKural.id, kalinti);
    await bekle();
    expect(tumGecmis(vt)[canliKural.id][0]).toMatchObject({ id: 'kalinti-1', durum: 'yarida' });

    // Geçmiş kural başına son 20 tetikleme; silinince geçmiş de silinir.
    for (let i = 0; i < 25; i++) tetiklemeYaz(vt, canliKural.id, { ...kalinti, id: `t-${i}`, durum: 'atlandi' });
    expect(tumGecmis(vt)[canliKural.id]).toHaveLength(GECMIS_SINIRI);
    expect(tumGecmis(vt)[canliKural.id][0].id).toBe('t-24');
    kuralSil(vt, projeId, canliKural.id);
    expect(tumGecmis(vt)[canliKural.id]).toBeUndefined();
    expect(kurallariListele(vt, projeId).map((k) => k.id)).toEqual([kural.id]);
  } finally {
    vt.kapat();
    klasor.temizle();
  }
});

test('yalnız servis akışı kapsamı: sahte akış koşucusu çağrılır, senaryo koşmaz, bildirim gitmez', async () => {
  const klasor = geciciKlasor('zamanlama-akis');
  const vt: Veritabani = await veritabaniniHazirla(join(klasor.yol, 'platform.db'));
  try {
    await kasaOlustur(vt, 'Gecici-Zamanlama-2', { kdf: HIZLI_KDF });
    // İzinlerden bağımsız davranış sınanıyor: Ayarlar > İzinler (varsayılan kapalı) açılır.
    izinleriAc(vt);
    const projeId = projeKaydet(vt, { ad: 'Örnek proje' });
    const ortamId = ortamKaydet(vt, { projeId, ad: 'TEST', tabanUrl: 'https://test.ornek.invalid', varsayilan: true, ayarlar: { riskli: false } });
    const s = sahteBagimliliklar([{ id: 's1', baslik: 'Giriş', ekranId: 'e1', kosuyaDahil: true }]);
    const kural: Kural = {
      id: 'k1', projeId, ad: 'Akışlar', ortamId, kapsam: { senaryolar: 'yok', ekranIdleri: [], servisAkisIdleri: ['a1'] },
      zaman: { tur: 'gunluk', saat: '09:00' }, etkin: true, bildirimBaglantiId: 'b1', canliOnay: false, tuketilen: '', olusturulma: '', guncellenme: ''
    };
    const r = await zamanliKosuyuYurut(vt, kural, 'zamanli-deneme', s.bag);
    expect(r).toMatchObject({ durum: 'tamamlandi', kosuId: null, ozet: null, akisKosulari: [{ akisId: 'a1', kosuId: 'akis-kosu-1', durum: 'basarili' }] });
    expect(s.akislar).toEqual([{ projeId, girdi: { akisId: 'a1', ortamId, tur: 'kosu' } }]);
    expect(s.cagrilar).toHaveLength(0);
    expect(s.bildirimler).toHaveLength(0);
    // Seçili ekranlar: yalnız o ekranların "Koşuda" senaryoları, kısmi (tekil) koşu.
    const r2 = await zamanliKosuyuYurut(vt, { ...kural, kapsam: { senaryolar: 'ekranlar', ekranIdleri: ['e1'], servisAkisIdleri: [] } }, 'zamanli-deneme-2', s.bag);
    expect(r2).toMatchObject({ durum: 'tamamlandi', kosuId: 'zamanli-deneme-2' });
    expect(s.cagrilar).toEqual([expect.objectContaining({ senaryoId: 's1', kosuTuru: 'tekil', kosuKimligi: 'zamanli-deneme-2' })]);
    expect(s.cagrilar[0]).not.toHaveProperty('kosuKapsami');
    await expect(zamanliKosuyuYurut(vt, { ...kural, kapsam: { senaryolar: 'ekranlar', ekranIdleri: ['yok'], servisAkisIdleri: [] } }, 'zamanli-3', s.bag)).rejects.toThrow('Koşuda');
  } finally {
    vt.kapat();
    klasor.temizle();
  }
});

test('uçtan uca akışlar: kuralda seçilir (yalnız uçtan uca akış), koşuda sahte koşucuyla çağrılır; izin kapalıysa atlanır ve kayda geçer; riskli ortamda onay kural kaydında', async () => {
  const klasor = geciciKlasor('zamanlama-uctan');
  const vt: Veritabani = await veritabaniniHazirla(join(klasor.yol, 'platform.db'));
  try {
    await kasaOlustur(vt, 'Gecici-Zamanlama-3', { kdf: HIZLI_KDF });
    izinleriAc(vt);
    const projeId = projeKaydet(vt, { ad: 'Örnek proje' });
    const ortamId = ortamKaydet(vt, { projeId, ad: 'Deneme', tabanUrl: 'https://test.ornek.invalid', varsayilan: true, ayarlar: { riskli: false } });
    const riskliOrtam = ortamKaydet(vt, { projeId, ad: 'Ana sistem', tabanUrl: 'https://ana.ornek.invalid', ayarlar: { riskli: true } });
    const servisId = servisKaydet(vt, { projeId, anahtar: 's', ad: 'S', ayarlar: { yol: '/s.asmx' } });
    const senaryoId = servisSenaryosuKaydet(vt, { projeId, servisId, baslik: 'Op', icerik: { operasyon: 'Op', govde: '<x/>', kontroller: [] } });
    const adimlar = [{ ad: 'Op', servisId, senaryoId }];
    const uctan = servisAkisiKaydet(vt, { projeId, baslik: 'Uçtan uca', icerik: { adimlar, uctanUca: true } });
    const servisAkisi = servisAkisiKaydet(vt, { projeId, baslik: 'Servis akışı', icerik: { adimlar } });
    const temel = { ad: 'Gece uçtan uca', ortamId, kapsam: { senaryolar: 'yok', uctanUcaAkisIdleri: [uctan] }, zaman: { tur: 'gunluk', saat: '02:00' } };
    // Yalnız uçtan uca akış seçilebilir; boş kapsam reddedilir; riskli ortamda canlı onayı kural kaydında istenir.
    expect(() => kuralKaydet(vt, projeId, { ...temel, kapsam: { senaryolar: 'yok', uctanUcaAkisIdleri: [servisAkisi] } })).toThrow('uçtan uca akışlardan biri bulunamadı');
    expect(() => kuralKaydet(vt, projeId, { ...temel, kapsam: { senaryolar: 'yok' } })).toThrow('en az bir uçtan uca akış');
    expect(() => kuralKaydet(vt, projeId, { ...temel, ortamId: riskliOrtam })).toThrow('Canlı ortamda planlı koşuya izin veriyorum');
    expect(kuralKaydet(vt, projeId, { ...temel, ad: 'Riskli', ortamId: riskliOrtam, canliOnay: true }).canliOnay).toBe(true);
    const kural = kuralKaydet(vt, projeId, temel);
    expect(kural.kapsam).toEqual({ senaryolar: 'yok', ekranIdleri: [], servisAkisIdleri: [], uctanUcaAkisIdleri: [uctan] });
    expect(kurallariListele(vt, projeId).find((k) => k.id === kural.id)?.kapsam.uctanUcaAkisIdleri).toEqual([uctan]);

    const s = sahteBagimliliklar([]);
    const cagrilar: Array<unknown> = [];
    const bag = { ...s.bag, uctanUcaCalistir: async (_vt: Veritabani, p: string, girdi: { akisId: string; ortamId: string }) => { cagrilar.push({ p, girdi }); return { kosuId: 'uu-kosu-1', durum: 'basarili' }; } };
    const r = await zamanliKosuyuYurut(vt, kural, 'zamanli-uu', bag);
    expect(r).toMatchObject({ durum: 'tamamlandi', kosuId: null, akisKosulari: [{ akisId: uctan, kosuId: 'uu-kosu-1', durum: 'basarili', uctanUca: true }] });
    expect(r.mesaj).toBe('1/1 uçtan uca akış başarılı');
    expect(cagrilar).toEqual([{ p: projeId, girdi: { akisId: uctan, ortamId } }]);
    expect(s.akislar).toHaveLength(0);
    // Ön denetim / koşu hatası: akış "hata" olarak kayda geçer.
    const hatali = await zamanliKosuyuYurut(vt, kural, 'zamanli-uu-2', { ...s.bag, uctanUcaCalistir: async () => { throw new Error('Koşu başlamadı: 1. adım'); } });
    expect(hatali).toMatchObject({ durum: 'basarisiz', akisKosulari: [{ akisId: uctan, durum: 'hata', uctanUca: true }] });
    expect(hatali.mesaj).toContain('Uçtan uca akış: Koşu başlamadı');
    // Arka planda izin kapalı (servis istekleri): akış koşmaz, atlanır ve "izin kapalı" kayda geçer.
    izinDegistir(vt, 'servis-istekleri', false);
    cagrilar.length = 0;
    const atlanan = await zamanliKosuyuYurut(vt, kural, 'zamanli-uu-3', bag);
    expect(atlanan).toMatchObject({ durum: 'atlandi', akisKosulari: [{ akisId: uctan, kosuId: null, durum: 'atlandi', uctanUca: true }] });
    expect(atlanan.mesaj).toContain('izin kapalı');
    expect(cagrilar).toHaveLength(0);
    // Bu alandan önce kaydedilmiş kural (uctanUcaAkisIdleri yok) önceki gibi çalışır.
    const eski: Kural = { ...kural, kapsam: { senaryolar: 'yok', ekranIdleri: [], servisAkisIdleri: ['a1'] } };
    izinleriAc(vt);
    expect((await zamanliKosuyuYurut(vt, eski, 'zamanli-uu-4', bag)).akisKosulari).toEqual([{ akisId: 'a1', kosuId: 'akis-kosu-1', durum: 'basarili' }]);
  } finally {
    vt.kapat();
    klasor.temizle();
  }
});

test.describe('Planlı koşular > Planlı koşular arayüzü', () => {
  const PAROLA = `Gecici-ZamanliUI-${randomBytes(6).toString('hex')}`;
  let nobetci: Nobetci;
  let tarayici: Browser;
  let klasor = '';
  let projeId = '';

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    klasor = mkdtempSync(join(tmpdir(), 'zamanli-ui-'));
    const vtYolu = join(klasor, 'platform.db');
    const vt = await veritabaniniHazirla(vtYolu);
    await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
    // İzinlerden bağımsız davranış sınanıyor: Ayarlar > İzinler (varsayılan kapalı) açılır.
    izinleriAc(vt);
    vt.kapat();
    nobetci = await nobetciBaslat(klasor, vtYolu, {});
    await nobetciApi(nobetci, '/platform/kasa/ac', { parola: PAROLA });
    await nobetciApi(nobetci, '/platform/proje/kaydet', { ad: 'Zamanlama Projesi' });
    projeId = String(((await nobetciApi(nobetci, '/platform/projeler')) as { projeler: Array<{ id: string }> }).projeler[0].id);
    await nobetciApi(nobetci, '/platform/ortam/kaydet', { projeId, ad: 'TEST', tabanUrl: 'https://test.ornek.invalid', varsayilan: true, riskli: false });
    await nobetciApi(nobetci, '/platform/ortam/kaydet', { projeId, ad: 'Ana sistem', tabanUrl: 'https://ana.ornek.invalid', canli: true });
    tarayici = await chromium.launch();
  });
  test.afterAll(async () => {
    await tarayici?.close();
    nobetci?.surec.kill('SIGTERM');
    if (klasor) rmSync(klasor, { recursive: true, force: true });
  });

  test('kural ekle (pasif), canlı ortamda ek onay olmadan kaydedilmez; liste, etkin anahtarı, geçmiş ve onaylı silme; "Şimdi koş" yok', async () => {
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1400, height: 1000 } });
    const page = await baglam.newPage();
    const hatalar: string[] = [];
    page.on('pageerror', (e) => hatalar.push(String(e)));
    await page.goto('/#/planli-kosular');
    const kart = page.getByRole('region', { name: 'Planlı koşu kuralları' });
    await expect(kart.getByText('kaçan zamanlar sonradan toplu koşulmaz')).toBeVisible();
    await expect(kart.getByText('Planlı koşu yok.')).toBeVisible();
    await kart.getByRole('button', { name: 'Planlı koşu ekle' }).click();
    const form = page.getByRole('form', { name: 'Yeni planlı koşu' });
    await form.getByLabel('Ad').fill('Gece tam koşu');
    await form.getByRole('combobox', { name: /^Ortam/ }).selectOption({ label: 'Ana sistem' });
    await expect(form.getByText('Seçilen ortam Canlı', { exact: false })).toBeVisible();
    await form.getByRole('combobox', { name: 'Tekrar' }).selectOption('haftalik');
    await form.getByLabel('Saat', { exact: true }).fill('03:15');
    await expect(form.getByText('Sonraki çalışmalar:', { exact: false })).toBeVisible();
    await form.getByRole('checkbox', { name: 'Etkin', exact: true }).uncheck(); // test sunucusunda gerçek tetikleme olmasın
    await form.getByRole('button', { name: 'Kaydet' }).click();
    await expect(form.getByText('kutusunu işaretleyin', { exact: false })).toBeVisible();
    await form.getByLabel('Canlı ortamda planlı koşuya izin veriyorum').check();
    await form.getByRole('button', { name: 'Kaydet' }).click();
    await expect(form).toBeHidden();
    const satir = kart.getByRole('listitem').filter({ hasText: 'Gece tam koşu' });
    await expect(satir.getByText('Hafta içi her gün 03:15', { exact: false })).toBeVisible();
    await expect(satir.locator('.rozet.hata')).toHaveText('Canlı');
    await expect(satir.getByText('Pasif: çalışmaz.')).toBeVisible();
    await expect(satir.getByText('Henüz çalışmadı.')).toBeVisible();
    await expect(kart.getByRole('button', { name: /Şimdi koş/ })).toHaveCount(0);
    // API: sunucu da canlı onayı ister.
    const red = await nobetciApi(nobetci, '/platform/zamanlanmis-kosu/kaydet', { projeId, kural: { ad: 'X', ortamId: String(((await nobetciApi(nobetci, `/platform/ortamlar?projeId=${projeId}`)) as { ortamlar: Array<{ id: string; ad: string }> }).ortamlar.find((o) => o.ad === 'Ana sistem')?.id), zaman: { tur: 'gunluk', saat: '01:00' } } }) as { mesaj?: string };
    expect(String(red.mesaj)).toContain('Canlı ortamda planlı koşuya izin veriyorum');
    // Etkin anahtarı: etkinleştir → sonraki çalışma görünür; tekrar pasifleştir.
    await satir.getByRole('switch', { name: 'Gece tam koşu: etkin' }).check();
    await expect(satir.getByText('Sonraki çalışma:', { exact: false })).toBeVisible();
    await satir.getByRole('switch', { name: 'Gece tam koşu: etkin' }).uncheck();
    await expect(satir.getByText('Pasif: çalışmaz.')).toBeVisible();
    await satir.getByText('Geçmiş (son 0 tetikleme)').click();
    await expect(satir.getByText('Henüz tetiklenmedi.')).toBeVisible();
    // Onaylı silme.
    await satir.getByRole('button', { name: 'Gece tam koşu: sil' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Sil' }).click();
    await expect(kart.getByText('Planlı koşu yok.')).toBeVisible();
    expect(hatalar).toEqual([]);
    await baglam.close();
  });

  test('uçtan uca akış seçimi: formda ayrı liste, kural satırında görünür; 390 px taşma yok', async () => {
    const r = await nobetciApi(nobetci, '/platform/servis/rest/kaydet', { projeId, anahtar: 'stok', ad: 'Stok', tabanlar: {}, uclar: [{ ad: 'liste', metot: 'GET', yol: '/liste' }], senaryolar: [] }) as { id: string };
    const kayit = await nobetciApi(nobetci, '/platform/uctan-uca/kaydet', { projeId, baslik: 'Stok uçtan uca', kapsam: 'ikisi',
      icerik: { adimlar: [{ id: 'a1', ad: 'Liste', tur: 'operasyon', servisId: r.id, operasyon: 'liste' }] } }) as { id?: string; mesaj?: string };
    expect(kayit.id, String(kayit.mesaj ?? '')).toBeTruthy();
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 390, height: 900 } });
    const page = await baglam.newPage();
    const hatalar: string[] = [];
    page.on('pageerror', (e) => hatalar.push(String(e)));
    await page.goto('/#/planli-kosular');
    const kart = page.getByRole('region', { name: 'Planlı koşu kuralları' });
    await kart.getByRole('button', { name: 'Planlı koşu ekle' }).click();
    const form = page.getByRole('form', { name: 'Yeni planlı koşu' });
    await form.getByLabel('Ad').fill('Gece uçtan uca');
    await form.getByRole('combobox', { name: 'Senaryolar' }).selectOption('yok');
    const liste = form.getByRole('group', { name: 'Uçtan uca akışlar (isteğe bağlı)' });
    await liste.getByRole('checkbox', { name: 'Stok uçtan uca' }).check();
    await form.getByRole('checkbox', { name: 'Etkin', exact: true }).uncheck();
    const genislik = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(genislik).toBeLessThanOrEqual(390);
    await form.getByRole('button', { name: 'Kaydet' }).click();
    await expect(form).toBeHidden();
    await expect(kart.getByRole('listitem').filter({ hasText: 'Gece uçtan uca' }).getByText('Uçtan uca akışlar: Stok uçtan uca', { exact: false })).toBeVisible();
    expect(hatalar).toEqual([]);
    await baglam.close();
  });

  test('kilitliyken çalışma tercihleri: varsayılan kapalı, risk yazılı, onayla açılır; kilitlerken iki seçenek; Windows görevi sorgulanmaz', async () => {
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1400, height: 1000 } });
    const page = await baglam.newPage();
    const hatalar: string[] = [];
    page.on('pageerror', (e) => hatalar.push(String(e)));
    await page.goto('/#/planli-kosular');
    const bolum = page.getByRole('region', { name: 'Kasa kilitliyken ve açılışta' });
    await expect(bolum.getByText('varsayılan olarak kapalıdır', { exact: false })).toBeVisible();
    const a = bolum.getByRole('switch', { name: 'Kasa kilitlense de planlı koşular çalışsın (anahtar yalnız bellekte)' });
    await expect(a).not.toBeChecked();
    if (process.platform === 'win32') {
      await expect(bolum.getByRole('switch', { name: 'Windows oturumuna bağlı otomatik açma (DPAPI)' })).not.toBeChecked();
      await expect(bolum.getByText('Risk: Windows oturumunuzu ele geçiren biri planlı koşuların kullandığı verilere erişebilir.', { exact: false })).toBeVisible();
      // Test sunucusu Windows Görev Zamanlayıcı'yı sorgulamaz (TEST_SUNUCU_WINDOWS_GOREVI_KAPALI=1).
      await expect(bolum.getByText('Görev: sorgulanamadı', { exact: false })).toBeVisible();
    } else {
      await expect(bolum.getByRole('switch', { name: 'Windows oturumuna bağlı otomatik açma (DPAPI)' })).toHaveCount(0);
    }
    // Kilitle: tercih kapalıyken seçim sorulmaz (bugünkü davranış) — burada açmadan önce yalnız tercihi açıyoruz.
    await a.click();
    const diyalog = page.getByRole('dialog');
    await diyalog.getByRole('button', { name: 'Aç' }).click();
    await expect(diyalog.getByText('riski okuduğunuzu onaylayın', { exact: false })).toBeVisible();
    await diyalog.getByLabel('Ne yaptığını ve riskini okudum; açmak istiyorum').check();
    await diyalog.getByRole('button', { name: 'Aç' }).click();
    await expect(bolum.getByRole('switch', { name: 'Kasa kilitlense de planlı koşular çalışsın (anahtar yalnız bellekte)' })).toBeChecked();

    // Üst çubuktaki Kilitle: iki seçenek; "sürsün" → kilit ekranında not.
    await page.getByRole('button', { name: 'Kilitle', exact: true }).click();
    const secim = page.getByRole('dialog', { name: 'Kasayı kilitle' });
    await expect(secim.getByRole('button', { name: 'Tamamen kilitle (anahtarı da sil)' })).toBeVisible();
    await secim.getByRole('button', { name: 'Kilitle (planlı koşular sürsün)' }).click();
    // exact: bu sayfadaki "Kasa kilitliyken ve açılışta" başlığı da alt dizge olarak eşleşir; kilit ekranı başlığı beklenmeli.
    const kilitBasligi = page.getByRole('heading', { name: 'Kasa kilitli', exact: true });
    await expect(kilitBasligi).toBeVisible();
    await expect(page.getByText('Planlı koşular arka planda sürebilir', { exact: false })).toBeVisible();
    expect((await nobetciApi(nobetci, `/platform/ortamlar?projeId=${projeId}`)).kod).toBe('KASA_KILITLI');
    await page.getByRole('textbox', { name: /^Kasa parolası/ }).fill(PAROLA);
    await page.getByRole('button', { name: 'Kilidi aç' }).click();
    await expect(page.getByRole('button', { name: 'Kilitle', exact: true })).toBeVisible();

    // "Tamamen kilitle": bellekteki anahtar da silinir.
    await page.getByRole('button', { name: 'Kilitle', exact: true }).click();
    await page.getByRole('dialog', { name: 'Kasayı kilitle' }).getByRole('button', { name: 'Tamamen kilitle (anahtarı da sil)' }).click();
    await expect(kilitBasligi).toBeVisible();
    await expect(page.getByText('Planlı koşular arka planda sürebilir', { exact: false })).toHaveCount(0);
    expect(((await nobetciApi(nobetci, '/platform/durum')).zamanlama as { anahtarBellekte: boolean }).anahtarBellekte).toBe(false);
    await nobetciApi(nobetci, '/platform/kasa/ac', { parola: PAROLA });
    await nobetciApi(nobetci, '/platform/zamanlama/tercih', { ad: 'kilitliyken', acik: false });
    expect(hatalar).toEqual([]);
    await baglam.close();
  });
});
