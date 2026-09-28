// PDF raporu testlerinin ortak fikstürü (spec DEĞİL): geçici veritabanına iki dönem boyunca SAHTE ekran ve servis koşuları yazar
// (gerçek Playwright koşusu ya da dış istek YOK). "Şimdi" sabittir (RAPOR_SIMDI); son 14 gün = 15.09–28.09, önceki = 01.09–14.09.
// Beklenen sorun durumları (tek ekran "Başvuru"):
//   Kayıt  › "Kaydet" doğrulama ........ YENİ (bu dönem 3 tam + 1 tekil kalan; önceki yok)
//   Kayıt  › "Giriş: parola=…" hata .... ÇÖZÜLEN (önceki 2; bu dönem senaryo 11 kez geçti)
//   Onay   › "Onayla" zaman aşımı ...... ARTAN (2 → 6; maruziyet 14 / 14)
//   Liste  › "Listele" seçici .......... AZALAN (6 → 1)
//   Rapor  › "Raporla" doğrulama ....... TEKRAR EDEN (geriye bakışta görüldü, ≥ 3 kez geçti, bu dönem 2)
//   Detay  › "Detay aç" doğrulama ...... SÜREGELEN (3 → 3)
//   Filtre › "Filtrele" zaman aşımı .... KARARSIZ (aynı gün G K G K G K)
//   Arama: her koşuda atlanır (ek aksiyon); Silme: koşuya dahil ama hiç koşmaz.
// Tek servis "Kayıt Servisi" (REST): POST /kayit yavaşladı (p95 200 → 450 ms, 29 ölçüm), HTTP 500 (YENİ) + zaman aşımı (YENİ);
// GET /kayit/${id} kontrol hatası ÇÖZÜLEN; bir akış adımı satırı servis sayılarına KARIŞMAZ.
// Gizli değerler (giriş parolası, e-posta, kart numarası, ortam adresi + sorgu dizesi, adım adındaki parola) hata metinlerine
// bilerek konur: rapor HTML'inde ve PDF'te görünmemelidir.
import type { Veritabani } from '../../scripts/platform/veritabani/baglanti.mjs';
import { ekranKaydet, girisProfiliKaydet, ortamKaydet, projeKaydet, senaryoKaydet } from '../../scripts/platform/veritabani/depo.mjs';
import { kosuKaydet, kosuyuBitir, sonucKaydet } from '../../scripts/platform/veritabani/sonuc-deposu.mjs';
import { servisAkisKosusuKaydet, servisAkisiKaydet, servisKaydet, servisKosusuKaydet, servisSenaryosuKaydet } from '../../scripts/platform/servisler/servis-deposu.mjs';

export const RAPOR_SIMDI = new Date(2026, 8, 28, 12, 0);
export const GIZLI_PAROLA = 'Cok-Gizli-Parola-9';
export const ADIM_GIZLISI = 'Adim-Gizli-77';
export const EPOSTA = 'ali.veli@ornek.com';
export const KART = '4111111111111111';
export const ORTAM_ADRESI = 'https://test.ornek.invalid/uygulama/';
export const GOVDE_ICERIGI = 'govde-icerigi-gorunmemeli';
/** HTML / PDF metninde hiç geçmemesi gerekenler. */
export const SIZINTILAR = [GIZLI_PAROLA, ADIM_GIZLISI, 'ali.veli@', KART, '4111 1111', 'test.ornek.invalid', 'oturum=zzz', GOVDE_ICERIGI, 'rapor.kullanici'];

export type RaporFiksturu = {
  projeId: string; baskaProjeId: string; ortamId: string; ekranId: string; servisId: string; akisId: string;
  senaryolar: Record<string, string>; servisSenaryolari: Record<string, string>;
};

/** d. günün (15.09 = 0) saati; önceki dönem için -14 … -1. */
const gunZamani = (gun: number, saat = 9, dk = 0): Date => new Date(2026, 8, 15 + gun, saat, dk);
const iso = (d: Date): string => d.toISOString();

const DOGRULAMA = (beklenen: string): string => `Error: expect(locator).toHaveText(expected) failed\nExpected: "${beklenen}"\nReceived: "Hata: ${EPOSTA} ${KART} (${GIZLI_PAROLA})"`;
const ZAMAN_ASIMI = (dugme: string): string => `TimeoutError: locator.click: Timeout 30000ms exceeded.\nCall log:\n  - waiting for getByRole('button', { name: '${dugme}' })`;
const SECICI = "Error: strict mode violation: getByRole('row') resolved to 3 elements";
const GIRIS = `Error: giriş reddedildi ${ORTAM_ADRESI}giris?oturum=zzz parola=${GIZLI_PAROLA}`;

/** @param vt kasası açık geçici veritabanı */
export function raporVerisiKur(vt: Veritabani): RaporFiksturu {
  const projeId = projeKaydet(vt, { ad: 'Rapor Projesi' });
  const baskaProjeId = projeKaydet(vt, { ad: 'Başka Proje' });
  const ortamId = ortamKaydet(vt, { projeId, ad: 'TEST', tabanUrl: ORTAM_ADRESI, varsayilan: true, ayarlar: { riskli: false } });
  girisProfiliKaydet(vt, { projeId, ad: 'Ana', kullaniciAdi: 'rapor.kullanici', parola: GIZLI_PAROLA });
  const ekranId = ekranKaydet(vt, { projeId, anahtar: 'basvuru', ad: 'Başvuru' });
  const senaryolar: Record<string, string> = {};
  for (const ad of ['Kayıt', 'Onay', 'Liste', 'Arama', 'Filtre', 'Rapor', 'Detay', 'Silme']) senaryolar[ad] = senaryoKaydet(vt, { projeId, ekranId, baslik: ad, icerik: {} });

  let sayac = 0;
  type Sonuc = { ad: string; durum: 'basarili' | 'basarisiz' | 'atlanan'; adim?: string; hata?: string; yakalanan?: boolean };
  const kosu = (zaman: Date, sonuclar: Sonuc[], tur: 'tam' | 'tekil' = 'tam'): void => {
    const id = `k${++sayac}`;
    kosuKaydet(vt, { id, projeId, ortamId, tur, baslangic: iso(zaman) });
    sonuclar.forEach((s, i) => {
      const bitis = new Date(zaman.getTime() + (i + 1) * 20_000);
      sonucKaydet(vt, {
        kosuId: id, projeId, senaryoId: senaryolar[s.ad], senaryoBaslik: s.ad, durum: s.durum, testKimligi: `${s.ad}-${id}`, bitis: iso(bitis),
        sureMs: 1000 + i * 100, ...(s.hata ? { hataMesaji: s.hata } : {}),
        ...(s.durum === 'basarisiz' ? { adimlar: [{ ad: 'Sayfayı aç', durum: 'basarili', sureMs: 200 }, { ad: s.adim ?? 'Adım', durum: 'basarisiz', sureMs: 400, hataMesaji: s.hata }] } : {}),
        ...(s.yakalanan ? { yakalananMesajlar: [{ kaynak: 'konsol', metin: `Beklenmeyen yanıt (${GIZLI_PAROLA}) ${EPOSTA}`, sayi: 2 }] } : {})
      });
    });
    kosuyuBitir(vt, id, { durum: 'tamamlandi', bitis: iso(new Date(zaman.getTime() + 5 * 60_000)) });
  };

  // Geriye bakış penceresi: "Rapor" 20.07'de kaldı, sonra üç kez geçti (çözüldü).
  kosu(new Date(2026, 6, 20, 9), [{ ad: 'Rapor', durum: 'basarisiz', adim: 'Raporla', hata: DOGRULAMA('Hazır') }]);
  for (const g of [21, 22, 23]) kosu(new Date(2026, 6, g, 9), [{ ad: 'Rapor', durum: 'basarili' }]);

  // Önceki dönem (01.09–14.09) ve bu dönem (15.09–28.09): günde bir tam koşu.
  const kalanGunler = {
    onceki: { Kayit: [3, 5], Onay: [1, 4], Liste: [0, 2, 4, 6, 8, 10], Rapor: [] as number[], Detay: [2, 6, 10] },
    simdi: { Kayit: [2, 6, 10], Onay: [1, 3, 5, 7, 9, 11], Liste: [4], Rapor: [8, 9], Detay: [3, 7, 11] }
  };
  for (const [donem, kaydir] of [['onceki', -14], ['simdi', 0]] as const) {
    const k = kalanGunler[donem];
    for (let g = 0; g < 14; g++) {
      const kal = (l: number[]) => l.includes(g);
      kosu(gunZamani(kaydir + g), [
        kal(k.Kayit) ? (donem === 'onceki'
          ? { ad: 'Kayıt', durum: 'basarisiz', adim: `Giriş: parola=${ADIM_GIZLISI}`, hata: GIRIS }
          : { ad: 'Kayıt', durum: 'basarisiz', adim: 'Kaydet', hata: DOGRULAMA('Kaydedildi'), yakalanan: true }) : { ad: 'Kayıt', durum: 'basarili' },
        kal(k.Onay) ? { ad: 'Onay', durum: 'basarisiz', adim: 'Onayla', hata: ZAMAN_ASIMI('Onayla') } : { ad: 'Onay', durum: 'basarili' },
        kal(k.Liste) ? { ad: 'Liste', durum: 'basarisiz', adim: 'Listele', hata: SECICI } : { ad: 'Liste', durum: 'basarili' },
        { ad: 'Arama', durum: 'atlanan' },
        kal(k.Rapor) ? { ad: 'Rapor', durum: 'basarisiz', adim: 'Raporla', hata: DOGRULAMA('Hazır') } : { ad: 'Rapor', durum: 'basarili' },
        kal(k.Detay) ? { ad: 'Detay', durum: 'basarisiz', adim: 'Detay aç', hata: DOGRULAMA('3') } : { ad: 'Detay', durum: 'basarili' }
      ]);
    }
  }
  // Kararsız: aynı gün (12. gün) altı tam koşu, "Filtre" G K G K G K.
  ['basarili', 'basarisiz', 'basarili', 'basarisiz', 'basarili', 'basarisiz'].forEach((d, i) => {
    kosu(gunZamani(12, 14, i * 5), [d === 'basarisiz'
      ? { ad: 'Filtre', durum: 'basarisiz', adim: 'Filtrele', hata: ZAMAN_ASIMI('Filtrele') } : { ad: 'Filtre', durum: 'basarili' }]);
  });
  // Tekil koşu (13. gün): sorunlara girer, başarı oranına girmez.
  kosu(gunZamani(13, 16), [{ ad: 'Kayıt', durum: 'basarisiz', adim: 'Kaydet', hata: DOGRULAMA('Kaydedildi') }], 'tekil');

  // ---- Tek servis (REST) ----
  const servisId = servisKaydet(vt, { projeId, anahtar: 'kayit-servisi', ad: 'Kayıt Servisi', tur: 'rest' });
  const servisSenaryolari: Record<string, string> = {
    olustur: servisSenaryosuKaydet(vt, { projeId, servisId, baslik: 'Kayıt oluştur', icerik: {
      operasyon: 'kayitOlustur', govde: '{}', kontroller: [{ tur: 'durumKodu', deger: '200' }], http: { metot: 'POST', yol: '/kayit?kaynak=test' } } }),
    sorgula: servisSenaryosuKaydet(vt, { projeId, servisId, baslik: 'Kayıt sorgula', icerik: {
      operasyon: 'kayitSorgula', govde: '', kontroller: [{ tur: 'jsonEsit', yol: 'veri.durum', deger: 'AKTIF' }], http: { metot: 'GET', yol: '/kayit/${id}' } } })
  };
  const cagri = (zaman: Date, senaryo: 'olustur' | 'sorgula', durum: 'basarili' | 'basarisiz' | 'hata', sureMs: number, sonuc: Record<string, unknown>): string => servisKosusuKaydet(vt, {
    projeId, servisId, senaryoId: servisSenaryolari[senaryo], ortamId, tur: 'kosu', durum, baslangic: iso(zaman), sureMs,
    baslik: senaryo === 'olustur' ? 'Kayıt oluştur' : 'Kayıt sorgula',
    sonuc: { istek: `{"parola":"${GIZLI_PAROLA}"}`, yanit: `{"sonuc":"${GOVDE_ICERIGI}"}`, ...sonuc }
  });
  const gecen = (senaryo: 'olustur' | 'sorgula') => ({ durumKodu: 200, kontroller: [senaryo === 'olustur'
    ? { tur: 'durumKodu', ad: 'HTTP durum kodu 200', gecti: true, aciklama: 'Durum kodu 200' }
    : { tur: 'jsonEsit', ad: 'JSON veri.durum = "AKTIF"', gecti: true, aciklama: '"AKTIF"' }] });
  for (let g = 0; g < 14; g++) {
    for (const t of [0, 30]) {
      // Önceki dönem: POST 200 ms; GET 300 ms, 1–3. günlerin ilk çağrısında kontrol kaldı ("Görülen" değeri rapora girmemeli).
      cagri(gunZamani(-14 + g, 10, t), 'olustur', 'basarili', 200, gecen('olustur'));
      const getKaldi = t === 0 && [1, 2, 3].includes(g);
      cagri(gunZamani(-14 + g, 10, t + 1), 'sorgula', getKaldi ? 'basarisiz' : 'basarili', 300, getKaldi
        ? { durumKodu: 200, kontroller: [{ tur: 'jsonEsit', ad: 'JSON veri.durum = "AKTIF"', gecti: false, aciklama: `Görülen: "${GOVDE_ICERIGI}"` }] } : gecen('sorgula'));
      // Bu dönem: POST 450 ms (yavaşladı); 2. ve 3. günün iki çağrısında da HTTP 500 (aynı gün değişim yok: kararsız sayılmaz).
      const postKaldi = [2, 3].includes(g);
      cagri(gunZamani(g, 10, t), 'olustur', postKaldi ? 'basarisiz' : 'basarili', 450, postKaldi
        ? { durumKodu: 500, kontroller: [{ tur: 'durumKodu', ad: 'HTTP durum kodu 200', gecti: false, aciklama: 'Durum kodu 500' }] } : gecen('olustur'));
      cagri(gunZamani(g, 10, t + 1), 'sorgula', 'basarili', 300, gecen('sorgula'));
    }
  }
  // Yanıt gelmedi (zaman aşımı; adres + gizli sorgu dizesi metinde).
  cagri(gunZamani(6, 11), 'olustur', 'hata', 30_000, { hata: `İstek zaman aşımına uğradı (30 sn): ${ORTAM_ADRESI}api/kayit?anahtar=${GIZLI_PAROLA}` });

  // Servis akışı: adımı bu servisi kullanır; adım satırları servis sayılarına karışmaz.
  const akisId = servisAkisiKaydet(vt, { projeId, baslik: 'Kayıt akışı', icerik: { adimlar: [{ ad: 'Oluştur', servisId, senaryoId: servisSenaryolari.olustur }] } });
  const akisKosusu = (zaman: Date, durum: 'basarili' | 'hata'): void => {
    const adim = cagri(new Date(zaman.getTime() + 1000), 'olustur', durum === 'basarili' ? 'basarili' : 'basarisiz', 5000, durum === 'basarili' ? gecen('olustur')
      : { durumKodu: 503, kontroller: [{ tur: 'durumKodu', ad: 'HTTP durum kodu 200', gecti: false, aciklama: 'Durum kodu 503' }] });
    servisAkisKosusuKaydet(vt, { projeId, akisId, ortamId, tur: 'kosu', durum, baslangic: iso(zaman), sureMs: 5200, baslik: 'Kayıt akışı', sonuc: {
      ortam: 'TEST', ozet: '', adimlar: [{ no: 1, ad: 'Oluştur', servis: 'Kayıt Servisi', senaryo: 'Kayıt oluştur', durum: durum === 'basarili' ? 'basarili' : 'hata', sureMs: 5000, kosuId: adim }]
    } });
  };
  akisKosusu(gunZamani(-5, 15), 'basarili');
  akisKosusu(gunZamani(-3, 15), 'basarili');
  akisKosusu(gunZamani(3, 15), 'basarili');
  akisKosusu(gunZamani(8, 15), 'hata');
  return { projeId, baskaProjeId, ortamId, ekranId, servisId, akisId, senaryolar, servisSenaryolari };
}

/** Rapor isteği gövdesi (son 14 gün, önceki dönemle karşılaştırmalı, tüm ortamlar). */
export const raporGirdisi = (f: RaporFiksturu, kapsam: 'ekran' | 'servis', ek: Record<string, unknown> = {}): Record<string, unknown> => ({
  projeId: f.projeId, kapsam, id: kapsam === 'ekran' ? f.ekranId : f.servisId, donem: { tur: 'son14' }, karsilastir: true, ortamId: null,
  secenekler: { hatalar: true, adres: false, goruntuler: false }, ...ek
});
