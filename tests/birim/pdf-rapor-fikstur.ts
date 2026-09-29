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
import { ekranKaydet, ekranModeliEkle, girisProfiliKaydet, ortamKaydet, projeKaydet, senaryoKaydet } from '../../scripts/platform/veritabani/depo.mjs';
import { kuralKaydet, tetiklemeYaz } from '../../scripts/platform/zamanlama/kurallar.mjs';
import { tabloKaydet } from '../../scripts/platform/tablolar/tablo-deposu.mjs';
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

export type CokluFikstur = RaporFiksturu & { ekran2Id: string; servis2Id: string };

/**
 * A2 (çoklu / karma rapor) eki: aynı projeye ikinci ekran ("Talep") ve ikinci servis ("Bildirim Servisi", SOAP) yazar.
 *   Talep: günde bir tam koşu × 2 senaryo; "Talep gönder" bu dönemin 2. ve 3. gününde zaman aşımıyla kalır (YENİ; önceki dönem
 *     hatasız) — "Kayıt Servisi" POST /kayit HTTP 500 ile AYNI GÜNLER: bağlantılı sorun çifti (Jaccard 1).
 *   Bildirim Servisi: günde iki çağrı, bu dönem hatasız; önceki dönemde bir kontrol hatası (ÇÖZÜLEN).
 * Beklenen toplamlar (bu dönem / önceki): ekran testi 118 / 112, başarısız 20 / 13, başarı 84/118 / 85/112; servis çağrısı 85 / 84,
 * başarısız + hata 5 / 4, başarı 80/85 / 80/84.
 */
export function cokluVeriKur(vt: Veritabani, f: RaporFiksturu): CokluFikstur {
  const { projeId, ortamId } = f;
  const ekran2Id = ekranKaydet(vt, { projeId, anahtar: 'talep', ad: 'Talep' });
  const ac = senaryoKaydet(vt, { projeId, ekranId: ekran2Id, baslik: 'Talep aç', icerik: {} });
  const gonder = senaryoKaydet(vt, { projeId, ekranId: ekran2Id, baslik: 'Talep gönder', icerik: {} });
  const hata = `TimeoutError: locator.click: Timeout 30000ms exceeded.\nCall log:\n  - waiting for getByRole('button', { name: 'Gönder' }) ${EPOSTA} ${KART}`;
  let sayac = 0;
  for (const kaydir of [-14, 0]) {
    for (let g = 0; g < 14; g++) {
      const zaman = gunZamani(kaydir + g, 11);
      const id = `t${++sayac}`;
      kosuKaydet(vt, { id, projeId, ortamId, tur: 'tam', baslangic: iso(zaman) });
      const kaldi = kaydir === 0 && (g === 2 || g === 3);
      sonucKaydet(vt, { kosuId: id, projeId, senaryoId: ac, senaryoBaslik: 'Talep aç', durum: 'basarili', testKimligi: `ac-${id}`, bitis: iso(new Date(zaman.getTime() + 10_000)), sureMs: 800 });
      sonucKaydet(vt, {
        kosuId: id, projeId, senaryoId: gonder, senaryoBaslik: 'Talep gönder', durum: kaldi ? 'basarisiz' : 'basarili', testKimligi: `gonder-${id}`,
        bitis: iso(new Date(zaman.getTime() + 20_000)), sureMs: 1200, ...(kaldi ? {
          hataMesaji: hata, adimlar: [{ ad: 'Formu doldur', durum: 'basarili', sureMs: 300 }, { ad: 'Gönder', durum: 'basarisiz', sureMs: 900, hataMesaji: hata }]
        } : {})
      });
      kosuyuBitir(vt, id, { durum: 'tamamlandi', bitis: iso(new Date(zaman.getTime() + 60_000)) });
    }
  }
  const servis2Id = servisKaydet(vt, { projeId, anahtar: 'bildirim-servisi', ad: 'Bildirim Servisi', tur: 'soap' });
  const senaryo = servisSenaryosuKaydet(vt, { projeId, servisId: servis2Id, baslik: 'Bildirim gönder', icerik: {
    operasyon: 'bildirimGonder', govde: '<istek/>', kontroller: [{ tur: 'soapHatasiYok' }] } });
  for (const kaydir of [-14, 0]) {
    for (let g = 0; g < 14; g++) {
      for (const dk of [0, 30]) {
        const kaldi = kaydir === -14 && g === 4 && dk === 0;
        servisKosusuKaydet(vt, {
          projeId, servisId: servis2Id, senaryoId: senaryo, ortamId, tur: 'kosu', durum: kaldi ? 'basarisiz' : 'basarili', baslangic: iso(gunZamani(kaydir + g, 13, dk)),
          sureMs: 100, baslik: 'Bildirim gönder', sonuc: {
            istek: `<parola>${GIZLI_PAROLA}</parola>`, yanit: `<sonuc>${GOVDE_ICERIGI}</sonuc>`, durumKodu: 200,
            kontroller: [{ tur: 'soapHatasiYok', ad: 'SOAP hatası yok', gecti: !kaldi, aciklama: kaldi ? `Görülen: ${GOVDE_ICERIGI}` : 'Fault yok' }]
          }
        });
      }
    }
  }
  return { ...f, ekran2Id, servis2Id };
}

/** Çoklu rapor isteği gövdesi (son 14 gün, karşılaştırmalı, tüm ortamlar). */
export const cokluGirdi = (f: CokluFikstur, kapsam: 'coklu-ekran' | 'coklu-servis' | 'karisik', ek: Record<string, unknown> = {}): Record<string, unknown> => ({
  projeId: f.projeId, kapsam, ekranIdleri: kapsam === 'coklu-servis' ? [] : [f.ekranId, f.ekran2Id],
  servisIdleri: kapsam === 'coklu-ekran' ? [] : [f.servisId, f.servis2Id], donem: { tur: 'son14' }, karsilastir: true, ortamId: null,
  secenekler: { hatalar: true, adres: false, goruntuler: false }, ...ek
});

/** Rapor isteği gövdesi (son 14 gün, önceki dönemle karşılaştırmalı, tüm ortamlar). */
export const raporGirdisi = (f: RaporFiksturu, kapsam: 'ekran' | 'servis', ek: Record<string, unknown> = {}): Record<string, unknown> => ({
  projeId: f.projeId, kapsam, id: kapsam === 'ekran' ? f.ekranId : f.servisId, donem: { tur: 'son14' }, karsilastir: true, ortamId: null,
  secenekler: { hatalar: true, adres: false, goruntuler: false }, ...ek
});

/** Gizli test verisi sütununun değeri (genel rapor): rapora hiç girmemelidir. */
export const KUPON_GIZLISI = 'KUPON-GIZLI-55';

export type GenelFikstur = CokluFikstur & {
  ortam2Id: string; ortakAkisId: string; arsivEkranId: string; arsivServisId: string; uctanUcaId: string; kuralId: string; kural2Id: string;
};

/**
 * A3 (genel rapor) eki: A2 fikstürünün üstüne projenin geri kalanını yazar (gerçek koşu / dış istek YOK).
 *   - "Ortak Adım": modeli ortak akış olan ekran (senaryosuz; açık sayılmaz). "Arşiv": senaryosuz ekran (açık).
 *   - "Arşiv Servisi" (REST): sözleşmede 2 operasyon, yalnız birinin senaryosu var (metot kapsamı 1 / 2); koşusu yok.
 *   - İkinci ortam "HAZIRLIK" (riskli işaretli): bu dönemin 5. günü Talep'te 2 başarılı test, Bildirim Servisi'nde 2 başarılı çağrı.
 *   - Uçtan uca akış "Uçtan uca kayıt": bu dönem 2 başarılı koşu, önceki dönem 1 hata.
 *   - Zamanlanmış kural "Gece koşusu" (her gün 02:00, 01.08'de kaydedildi; Başvuru + Kayıt akışı): önceki dönemde 07–14.09 (8 tamamlandı),
 *     bu dönemde 15–26.09 (10 tamamlandı — biri başarısız sonuçlu —, 1 atlandı, 1 yarıda); 27–28.09 kayıt yok (kaçan). Geçmiş 20
 *     kayıtla dolu: önceki dönem hesabı en eski kayıttan (07.09) başlar. İkinci kural devre dışı (beklenen yok).
 *   - Test verisi: "Kuponlar" tablosu hiç kullanılmıyor (gizli sütun değeri rapora girmemeli); Talep'te koşuya dahil olmayan bir
 *     senaryo silinmiş tabloya başvuruyor (kırık başvuru).
 * Beklenen toplamlar (bu dönem): ekran testi 120 (86 geçti), servis çağrısı 87 (82 başarılı), akış koşusu 4 (3 başarılı).
 */
export function genelVeriKur(vt: Veritabani, f: CokluFikstur): GenelFikstur {
  const { projeId, ortamId } = f;
  const ortam2Id = ortamKaydet(vt, { projeId, ad: 'HAZIRLIK', tabanUrl: 'https://hazirlik.ornek.invalid/', varsayilan: false, ayarlar: { riskli: true } });
  const ortakAkisId = ekranKaydet(vt, { projeId, anahtar: 'ortak-adim', ad: 'Ortak Adım' });
  ekranModeliEkle(vt, { ekranId: ortakAkisId, model: { tur: 'ortakAkis', adimlar: [] } });
  const arsivEkranId = ekranKaydet(vt, { projeId, anahtar: 'arsiv', ad: 'Arşiv' });
  // Talep: koşuya dahil olmayan, silinmiş tabloya başvuran senaryo (kırık başvuru).
  senaryoKaydet(vt, { projeId, ekranId: f.ekran2Id, baslik: 'Talep (eski veri)', kosuyaDahil: false, icerik: { ortamlar: { [ortamId]: { veri: { kod: '${Silinmis.Kod}' } } } } });
  tabloKaydet(vt, { projeId, ad: 'Kuponlar', sutunlar: [{ ad: 'Kod', gizli: true }, { ad: 'Tur' }], satirlar: [{ degerler: { Kod: KUPON_GIZLISI, Tur: 'indirim' } }] });

  // HAZIRLIK ortamında bir tam koşu (Talep) ve iki servis çağrısı (Bildirim Servisi).
  const talepSenaryolari = vt.tumu('SELECT id, baslik FROM senaryolar WHERE ekran_id = ? AND kosuya_dahil = 1 ORDER BY baslik', [f.ekran2Id]);
  const zaman = gunZamani(5, 16);
  kosuKaydet(vt, { id: 'hazirlik-1', projeId, ortamId: ortam2Id, tur: 'tam', baslangic: iso(zaman) });
  talepSenaryolari.forEach((s, i) => sonucKaydet(vt, {
    kosuId: 'hazirlik-1', projeId, senaryoId: String(s.id), senaryoBaslik: String(s.baslik), durum: 'basarili', testKimligi: `hz-${i}`,
    bitis: iso(new Date(zaman.getTime() + (i + 1) * 10_000)), sureMs: 900
  }));
  kosuyuBitir(vt, 'hazirlik-1', { durum: 'tamamlandi', bitis: iso(new Date(zaman.getTime() + 60_000)) });
  const bildirimSenaryosu = String(vt.tek('SELECT id FROM servis_senaryolari WHERE servis_id = ?', [f.servis2Id])?.id);
  for (const dk of [0, 30]) {
    servisKosusuKaydet(vt, {
      projeId, servisId: f.servis2Id, senaryoId: bildirimSenaryosu, ortamId: ortam2Id, tur: 'kosu', durum: 'basarili', baslangic: iso(gunZamani(5, 17, dk)), sureMs: 120,
      baslik: 'Bildirim gönder', sonuc: { durumKodu: 200, kontroller: [{ tur: 'soapHatasiYok', ad: 'SOAP hatası yok', gecti: true, aciklama: 'Fault yok' }] }
    });
  }

  // Sözleşmesi olan, bir operasyonu senaryosuz servis (koşusu yok).
  const arsivServisId = servisKaydet(vt, { projeId, anahtar: 'arsiv-servisi', ad: 'Arşiv Servisi', tur: 'rest', ayarlar: {
    operasyonlar: [{ ad: 'arsivle', metot: 'POST', yol: '/arsiv' }, { ad: 'arsivSil', metot: 'DELETE', yol: '/arsiv/{id}' }] } });
  servisSenaryosuKaydet(vt, { projeId, servisId: arsivServisId, baslik: 'Arşivle', icerik: {
    operasyon: 'arsivle', govde: '{}', kontroller: [{ tur: 'durumKodu', deger: '200' }], http: { metot: 'POST', yol: '/arsiv' } } });

  // Uçtan uca akış ve koşuları.
  const uctanUcaId = servisAkisiKaydet(vt, { projeId, baslik: 'Uçtan uca kayıt', icerik: {
    uctanUca: true, adimlar: [{ ad: 'Oluştur', servisId: f.servisId, senaryoId: f.servisSenaryolari.olustur }] } });
  const uuKosusu = (z: Date, durum: 'basarili' | 'hata'): void => {
    servisAkisKosusuKaydet(vt, { projeId, akisId: uctanUcaId, ortamId, tur: 'kosu', durum, baslangic: iso(z), sureMs: 8000, baslik: 'Uçtan uca kayıt', sonuc: {
      ortam: 'TEST', ozet: '', uctanUca: true, adimlar: [{ no: 1, ad: 'Oluştur', durum: durum === 'basarili' ? 'basarili' : 'hata', sureMs: 8000 }]
    } });
  };
  uuKosusu(gunZamani(-2, 18), 'hata');
  uuKosusu(gunZamani(4, 18), 'basarili');
  uuKosusu(gunZamani(9, 18), 'basarili');

  // Zamanlanmış kurallar ve tetikleme geçmişi (kural başına en çok 20 kayıt tutulur).
  const kural = kuralKaydet(vt, projeId, {
    ad: `Gece koşusu ${KUPON_GIZLISI}`, ortamId, kapsam: { senaryolar: 'ekranlar', ekranIdleri: [f.ekranId], servisAkisIdleri: [f.akisId] },
    zaman: { tur: 'gunluk', saat: '02:00' }
  }, { simdi: new Date(2026, 7, 1, 9) });
  const kural2 = kuralKaydet(vt, projeId, {
    ad: 'Hafta sonu uçtan uca', ortamId, kapsam: { senaryolar: 'yok', uctanUcaAkisIdleri: [uctanUcaId] }, zaman: { tur: 'haftalik', saat: '03:00', gunler: [6] }, etkin: false
  }, { simdi: new Date(2026, 7, 1, 9) });
  const durumlar: Record<number, 'basarisiz' | 'atlandi' | 'yarida'> = { 20: 'basarisiz', 25: 'atlandi', 26: 'yarida' };
  for (let gun = 7; gun <= 26; gun++) {
    const z = new Date(2026, 8, gun, 2, 0);
    tetiklemeYaz(vt, kural.id, {
      id: `t-${gun}`, zaman: iso(z), baslangic: iso(z), bitis: iso(new Date(z.getTime() + 600_000)), durum: durumlar[gun] ?? 'tamamlandi', mesaj: '',
      kosuId: null, ozet: null, akisKosulari: []
    });
  }
  return { ...f, ortam2Id, ortakAkisId, arsivEkranId, arsivServisId, uctanUcaId, kuralId: kural.id, kural2Id: kural2.id };
}

/** Genel rapor isteği gövdesi (son 14 gün, karşılaştırmalı, tüm ortamlar; seçim yok). */
export const genelGirdi = (f: RaporFiksturu, ek: Record<string, unknown> = {}): Record<string, unknown> => ({
  projeId: f.projeId, kapsam: 'genel', donem: { tur: 'son14' }, karsilastir: true, ortamId: null, secenekler: { hatalar: true, adres: false, goruntuler: false }, ...ek
});
