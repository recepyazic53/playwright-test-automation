// Karşılaştırma testlerinin ortak fikstürü (spec DEĞİL): geçici veritabanına iki SAHTE ekran koşusu ve iki sahte servis koşusu
// yazar (gerçek Playwright koşusu ya da dış istek YOK). Değerler nötrdür; gizli değer maskelemesi için bir giriş profili parolası
// hata metinlerine bilerek konur.
import { join } from 'node:path';
import type { Veritabani } from '../../scripts/platform/veritabani/baglanti.mjs';
import { ekranKaydet, girisProfiliKaydet, ortamKaydet, projeKaydet, senaryoKaydet } from '../../scripts/platform/veritabani/depo.mjs';
import { kosuKaydet, kosuyuBitir, sonucKaydet } from '../../scripts/platform/veritabani/sonuc-deposu.mjs';
import { servisAkisKosusuKaydet, servisKaydet, servisKosusuKaydet } from '../../scripts/platform/servisler/servis-deposu.mjs';
import { medyaAnahtariniHazirla } from '../../scripts/platform/kasa.mjs';
import { medyaSifrele } from '../../scripts/platform/medya.mjs';

export const GIZLI_PAROLA = 'Cok-Gizli-Parola-9';
export const PNG_1X1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

export type KarsilastirmaFiksturu = {
  projeId: string; baskaProjeId: string; ortamId: string; kosuA: string; kosuB: string; tekilKosu: string;
  senaryoId: string; servisId: string; servisKosuA: string; servisKosuB: string; akisKosuA: string; akisKosuB: string; sonucA1: string; sonucB1: string;
};

/**
 * @param vt kasası açık geçici veritabanı
 * @param vtYolu medya klasörü veritabanının yanındadır (medya/); ekran görüntüsü şifreli yazılır
 */
export async function karsilastirmaVerisiKur(vt: Veritabani, vtYolu: string): Promise<KarsilastirmaFiksturu> {
  const projeId = projeKaydet(vt, { ad: 'Karşılaştırma Projesi' });
  const baskaProjeId = projeKaydet(vt, { ad: 'Başka Proje' });
  const ortamId = ortamKaydet(vt, { projeId, ad: 'TEST', tabanUrl: 'https://test.ornek.invalid/uygulama/', varsayilan: true, ayarlar: { riskli: false } });
  girisProfiliKaydet(vt, { projeId, ad: 'Ana', kullaniciAdi: 'deneme.kullanici', parola: GIZLI_PAROLA });
  const ekranId = ekranKaydet(vt, { projeId, anahtar: 'basvuru', ad: 'Başvuru' });
  // Son sonuç ucu (/platform/senaryo/son-sonuc) için B'deki "Kayıt" sonucu bir senaryoya bağlıdır.
  const senaryoId = senaryoKaydet(vt, { projeId, ekranId, baslik: 'Kayıt', icerik: {} });
  const z = (dk: number): string => new Date(Date.UTC(2026, 8, 20, 9, dk)).toISOString();
  const anahtar = medyaAnahtariniHazirla(vt);
  const gorsel = await medyaSifrele(anahtar, join(vtYolu, '..', 'medya'), Buffer.from(PNG_1X1, 'base64'));
  anahtar.fill(0);
  const medya = [{ tur: 'ekran_goruntusu', ad: 'hata-ani.png', icerikTuru: 'image/png', boyut: gorsel.boyut, dosya: gorsel.dosya }];
  const sonuc = (kosuId: string, baslik: string, durum: string, ek: Record<string, unknown> = {}): string => sonucKaydet(vt, {
    kosuId, projeId, senaryoBaslik: baslik, urunAdi: 'Başvuru', senaryoAnahtari: `basvuru::${baslik}`, durum, testKimligi: `${baslik}-t`, bitis: z(1), sureMs: 1000, ...ek
  }).id;
  const adimlar = (sonDurum: string, ekAdim = false) => [
    { ad: 'Sayfayı aç', durum: 'basarili', sureMs: 200 },
    ...(ekAdim ? [{ ad: 'Çerez uyarısını kapat', durum: 'basarili', sureMs: 50 }] : []),
    { ad: 'Formu doldur', durum: 'basarili', sureMs: 300 },
    { ad: 'Kaydet', durum: sonDurum, sureMs: 400, ...(sonDurum === 'basarisiz' ? { hataMesaji: `Error: kayıt reddedildi (parola=${GIZLI_PAROLA})` } : {}) }
  ];

  // A (önceki, tam): Kayıt geçti, Onay kaldı, Liste geçti, Eski yalnız A'da.
  kosuKaydet(vt, { id: 'kars-a', projeId, ortamId, tur: 'tam', kapsam: 'Genel', baslangic: z(0) });
  const sonucA1 = sonuc('kars-a', 'Kayıt', 'basarili', { adimlar: adimlar('basarili') });
  sonuc('kars-a', 'Onay', 'basarisiz', {
    hataMesaji: `Error: expect(locator).toHaveText(expected) failed\nExpected: "Onaylandı"\nReceived: "Hata: ${GIZLI_PAROLA}"`, adimlar: adimlar('basarisiz'), medya
  });
  sonuc('kars-a', 'Liste', 'basarili', { sureMs: 2000 });
  sonuc('kars-a', 'Eski', 'basarili');
  kosuyuBitir(vt, 'kars-a', { durum: 'tamamlandi', bitis: z(5) });

  // Tekil koşu (kapsam süzgeci için).
  kosuKaydet(vt, { id: 'kars-tekil', projeId, ortamId, tur: 'tekil', baslangic: z(10) });
  sonuc('kars-tekil', 'Kayıt', 'basarili');
  kosuyuBitir(vt, 'kars-tekil', { durum: 'tamamlandi', bitis: z(11) });

  // B (sonraki, tam): Kayıt kaldı (yeni kalan; araya bir adım girdi), Onay düzeldi, Liste geçti (daha hızlı), Yeni yalnız B'de.
  kosuKaydet(vt, { id: 'kars-b', projeId, ortamId, tur: 'tam', kapsam: 'Genel', baslangic: z(20) });
  const sonucB1 = sonuc('kars-b', 'Kayıt', 'basarisiz', {
    senaryoId, hataMesaji: `Error: kayıt reddedildi (parola=${GIZLI_PAROLA}) 4111111111111111`, adimlar: adimlar('basarisiz', true), medya,
    yakalananMesajlar: [{ kaynak: 'konsol', metin: 'Beklenmeyen yanıt: sunucu 500 döndü', sayi: 2 }]
  });
  sonuc('kars-b', 'Onay', 'basarili', { adimlar: adimlar('basarili') });
  sonuc('kars-b', 'Liste', 'basarili', { sureMs: 1500 });
  sonuc('kars-b', 'Yeni', 'basarisiz', { hataMesaji: 'Error: yeni senaryo kaldı' });
  kosuyuBitir(vt, 'kars-b', { durum: 'tamamlandi', bitis: z(26) });

  // Servis koşuları: aynı servis, aynı ortam, iki ayrı koşu (arada 10 dakika). İstek / yanıt gövdesi gizli değer içerir (dönmemeli).
  const servisId = servisKaydet(vt, { projeId, anahtar: 'kayit-servisi', ad: 'Kayıt Servisi', tur: 'rest' });
  const satir = (dk: number, sn: number, baslik: string, durum: 'basarili' | 'basarisiz' | 'hata', kod: number, kontroller: unknown[]): string => servisKosusuKaydet(vt, {
    projeId, servisId, ortamId, tur: 'kosu', durum, baslangic: new Date(Date.UTC(2026, 8, 21, 9, dk, sn)).toISOString(), sureMs: 800, baslik,
    sonuc: { durumKodu: kod, kontroller, istek: `{"parola":"${GIZLI_PAROLA}"}`, yanit: '{"sonuc":"govde-icerigi-gorunmemeli"}', ozet: 'özet' }
  });
  const servisKosuA = `s-${satir(0, 0, 'Kayıt oluştur', 'basarili', 200, [{ ad: 'Durum kodu', tur: 'durumKodu', gecti: true, aciklama: '200' }])}`;
  satir(0, 2, 'Kayıt sorgula', 'basarisiz', 500, [{ ad: 'Durum kodu', tur: 'durumKodu', gecti: false, aciklama: `beklenen 200, gelen 500 (token=${GIZLI_PAROLA})` }]);
  const servisKosuB = `s-${satir(10, 0, 'Kayıt oluştur', 'basarisiz', 400, [
    { ad: 'Durum kodu', tur: 'durumKodu', gecti: false, aciklama: 'beklenen 200, gelen 400' },
    { tur: 'veya', gecti: false, alt: [{ ad: 'Alan: kod', tur: 'alan', gecti: false, aciklama: 'yok' }] }
  ])}`;
  satir(10, 2, 'Kayıt sorgula', 'basarili', 200, [{ ad: 'Durum kodu', tur: 'durumKodu', gecti: true, aciklama: '200' }]);

  // Akış koşuları (aynı akış senaryosu iki kez): adımların istekleri servis koşularına karışmaz (akışın adımıdır).
  const akisKosusu = (gun: number, ikinciDurum: 'basarili' | 'hata'): string => {
    const t = (sn: number) => new Date(Date.UTC(2026, 8, gun, 9, 0, sn)).toISOString();
    const istek = (sn: number, baslik: string, durum: 'basarili' | 'hata', kod: number) => servisKosusuKaydet(vt, {
      projeId, servisId, ortamId, tur: 'kosu', durum, baslangic: t(sn), sureMs: 300, baslik,
      sonuc: { durumKodu: kod, kontroller: [{ ad: 'Durum kodu', tur: 'durumKodu', gecti: kod === 200, aciklama: String(kod) }] }
    });
    const bir = istek(0, 'Giriş', 'basarili', 200);
    const iki = istek(1, 'Kayıt', ikinciDurum, ikinciDurum === 'basarili' ? 200 : 503);
    return `a-${servisAkisKosusuKaydet(vt, {
      projeId, ortamId, tur: 'kosu', durum: ikinciDurum === 'basarili' ? 'basarili' : 'hata', baslangic: t(0), sureMs: 700, baslik: 'Kayıt akışı senaryosu',
      sonuc: { ortam: 'TEST', ozet: '', adimlar: [
        { no: 1, ad: 'Giriş', servis: 'Kayıt Servisi', senaryo: 'Giriş', durum: 'basarili', sureMs: 300, kosuId: bir },
        { no: 2, ad: 'Kayıt', servis: 'Kayıt Servisi', senaryo: 'Kayıt', durum: ikinciDurum, sureMs: 300, kosuId: iki, ...(ikinciDurum === 'hata' ? { neden: 'HTTP 503' } : {}) }
      ] }
    })}`;
  };
  const akisKosuA = akisKosusu(22, 'basarili');
  const akisKosuB = akisKosusu(23, 'hata');
  return { projeId, baskaProjeId, ortamId, kosuA: 'kars-a', kosuB: 'kars-b', tekilKosu: 'kars-tekil', senaryoId, servisId, servisKosuA, servisKosuB, akisKosuA, akisKosuB, sonucA1, sonucB1 };
}
